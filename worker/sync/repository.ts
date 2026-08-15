import { MAPPING_REVISION } from "./overrides";
import type {
  MappingTarget,
  ParsedRelease,
  ResolutionIssue,
  SourceReleaseRow,
  SyncDayRow,
  SyncPhase,
  SyncRunRow,
  TitleMetadata,
} from "./types";

const nowIso = (date: Date): string => date.toISOString();

export class SyncRepository {
  constructor(private readonly db: D1Database) {}

  async ensureDay(localDate: string, targetSlot: number, now: Date): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO sync_days
        (local_date, target_slot, status, created_at, updated_at)
        VALUES (?, ?, 'awaiting', ?, ?)`,
      )
      .bind(localDate, targetSlot, nowIso(now), nowIso(now))
      .run();
  }

  async getDay(localDate: string): Promise<SyncDayRow | null> {
    return this.db
      .prepare("SELECT * FROM sync_days WHERE local_date = ?")
      .bind(localDate)
      .first<SyncDayRow>();
  }

  async getActiveRun(): Promise<SyncRunRow | null> {
    return this.db
      .prepare("SELECT * FROM sync_runs WHERE status = 'running' ORDER BY started_at ASC LIMIT 1")
      .first<SyncRunRow>();
  }

  async getRun(runId: string): Promise<SyncRunRow | null> {
    return this.db.prepare("SELECT * FROM sync_runs WHERE id = ?").bind(runId).first<SyncRunRow>();
  }

  async acquireLease(localDate: string, leaseToken: string, now: Date): Promise<boolean> {
    const expires = new Date(now.getTime() + 20 * 60_000).toISOString();
    const result = await this.db
      .prepare(
        `UPDATE sync_days
        SET lease_token = ?, lease_expires_at = ?, status = 'running', updated_at = ?
        WHERE local_date = ? AND status != 'complete'
          AND (lease_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at < ?)`,
      )
      .bind(leaseToken, expires, nowIso(now), localDate, nowIso(now))
      .run();
    return (result.meta.changes ?? 0) === 1;
  }

  async releaseLease(localDate: string, leaseToken: string, now: Date): Promise<void> {
    await this.db
      .prepare(
        `UPDATE sync_days SET lease_token = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE local_date = ? AND lease_token = ?`,
      )
      .bind(nowIso(now), localDate, leaseToken)
      .run();
  }

  async createRun(
    runId: string,
    localDate: string,
    triggerType: "scheduled" | "manual",
    now: Date,
  ): Promise<SyncRunRow> {
    const timestamp = nowIso(now);
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO sync_runs
          (id, local_date, trigger_type, phase, status, started_at, updated_at)
          VALUES (?, ?, ?, 'discover', 'running', ?, ?)`,
        )
        .bind(runId, localDate, triggerType, timestamp, timestamp),
      this.db
        .prepare(
          "UPDATE sync_days SET run_id = ?, status = 'running', updated_at = ? WHERE local_date = ?",
        )
        .bind(runId, timestamp, localDate),
    ]);
    const run = await this.getRun(runId);
    if (!run) throw new Error("The sync run could not be created.");
    return run;
  }

  async saveDiscovery(runId: string, releases: ParsedRelease[], now: Date): Promise<void> {
    const timestamp = nowIso(now);
    const statements = releases.map((release) =>
      this.db
        .prepare(
          `INSERT INTO source_releases
          (product_id, source_title, normalized_title, release_year, source_url, format,
           source_fingerprint, mapping_revision, mapping_status, active, first_seen_at,
           last_seen_at, seen_sync_run_id, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?, ?, ?)
          ON CONFLICT(product_id) DO UPDATE SET
            source_title = excluded.source_title,
            normalized_title = excluded.normalized_title,
            release_year = excluded.release_year,
            source_url = excluded.source_url,
            format = excluded.format,
            mapping_status = CASE
              WHEN source_releases.source_fingerprint != excluded.source_fingerprint
                OR source_releases.mapping_revision != excluded.mapping_revision
              THEN 'pending' ELSE source_releases.mapping_status END,
            source_fingerprint = excluded.source_fingerprint,
            mapping_revision = excluded.mapping_revision,
            active = 1,
            last_seen_at = excluded.last_seen_at,
            seen_sync_run_id = excluded.seen_sync_run_id,
            updated_at = excluded.updated_at`,
        )
        .bind(
          release.productId,
          release.sourceTitle,
          release.normalizedTitle,
          release.releaseYear,
          release.sourceUrl,
          release.format,
          release.fingerprint,
          MAPPING_REVISION,
          timestamp,
          timestamp,
          runId,
          timestamp,
        ),
    );

    for (let start = 0; start < statements.length; start += 75) {
      await this.db.batch(statements.slice(start, start + 75));
    }
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE source_releases SET active = 0, updated_at = ? WHERE seen_sync_run_id IS NULL OR seen_sync_run_id != ?",
        )
        .bind(timestamp, runId),
      this.db
        .prepare(
          `UPDATE sync_runs SET phase = 'resolve', cursor = NULL, releases_seen = ?, updated_at = ?
          WHERE id = ?`,
        )
        .bind(releases.length, timestamp, runId),
    ]);
  }

  async nextPendingRelease(cursor: string | null): Promise<SourceReleaseRow | null> {
    return this.db
      .prepare(
        `SELECT product_id, source_title, normalized_title, release_year, source_url, format
        FROM source_releases
        WHERE active = 1 AND mapping_status = 'pending'
          AND (? IS NULL OR CAST(product_id AS INTEGER) > CAST(? AS INTEGER))
        ORDER BY CAST(product_id AS INTEGER) ASC LIMIT 1`,
      )
      .bind(cursor, cursor)
      .first<SourceReleaseRow>();
  }

  async upsertTitle(metadata: TitleMetadata): Promise<number> {
    const result = await this.db
      .prepare(
        `INSERT INTO titles
        (media_type, tmdb_id, season_number, display_title, original_title, sort_title,
         overview, release_date, release_year, poster_path, backdrop_path, runtime_minutes,
         episode_count, vote_average, metadata_updated_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(media_type, tmdb_id, season_number) DO UPDATE SET
          display_title = excluded.display_title,
          original_title = excluded.original_title,
          sort_title = excluded.sort_title,
          overview = excluded.overview,
          release_date = excluded.release_date,
          release_year = excluded.release_year,
          poster_path = excluded.poster_path,
          backdrop_path = excluded.backdrop_path,
          runtime_minutes = excluded.runtime_minutes,
          episode_count = excluded.episode_count,
          vote_average = excluded.vote_average,
          metadata_updated_at = excluded.metadata_updated_at,
          updated_at = excluded.updated_at
        RETURNING id`,
      )
      .bind(
        metadata.mediaType,
        metadata.tmdbId,
        metadata.seasonNumber,
        metadata.displayTitle,
        metadata.originalTitle,
        metadata.sortTitle,
        metadata.overview,
        metadata.releaseDate,
        metadata.releaseYear,
        metadata.posterPath,
        metadata.backdropPath,
        metadata.runtimeMinutes,
        metadata.episodeCount,
        metadata.voteAverage,
        metadata.metadataUpdatedAt,
        metadata.metadataUpdatedAt,
      )
      .first<{ id: number }>();
    if (!result) throw new Error("TMDB metadata could not be stored.");

    const genreStatements = [
      this.db.prepare("DELETE FROM title_genres WHERE title_id = ?").bind(result.id),
      ...metadata.genres.map((genre) =>
        this.db
          .prepare("INSERT INTO title_genres (title_id, tmdb_genre_id, name) VALUES (?, ?, ?)")
          .bind(result.id, genre.id, genre.name),
      ),
    ];
    await this.db.batch(genreStatements);
    return result.id;
  }

  async resolveRelease(
    runId: string,
    release: SourceReleaseRow,
    metadata: TitleMetadata[],
    now: Date,
  ): Promise<void> {
    const titleIds: number[] = [];
    for (const title of metadata) titleIds.push(await this.upsertTitle(title));
    const timestamp = nowIso(now);
    await this.db.batch([
      this.db
        .prepare("DELETE FROM source_release_titles WHERE product_id = ?")
        .bind(release.product_id),
      ...titleIds.map((titleId) =>
        this.db
          .prepare("INSERT INTO source_release_titles (product_id, title_id) VALUES (?, ?)")
          .bind(release.product_id, titleId),
      ),
      this.db
        .prepare(
          `UPDATE source_releases SET mapping_status = 'resolved', mapping_revision = ?, updated_at = ?
          WHERE product_id = ?`,
        )
        .bind(MAPPING_REVISION, timestamp, release.product_id),
      this.db
        .prepare(
          "UPDATE sync_issues SET resolved_at = ? WHERE product_id = ? AND resolved_at IS NULL",
        )
        .bind(timestamp, release.product_id),
      this.db
        .prepare(
          `UPDATE sync_runs SET cursor = ?, releases_resolved = releases_resolved + 1, updated_at = ?
          WHERE id = ?`,
        )
        .bind(release.product_id, timestamp, runId),
    ]);
  }

  async recordIssue(
    runId: string,
    release: SourceReleaseRow,
    issue: ResolutionIssue,
    now: Date,
  ): Promise<void> {
    const timestamp = nowIso(now);
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE sync_issues SET resolved_at = ? WHERE product_id = ? AND resolved_at IS NULL",
        )
        .bind(timestamp, release.product_id),
      this.db
        .prepare("DELETE FROM source_release_titles WHERE product_id = ?")
        .bind(release.product_id),
      this.db
        .prepare(
          `INSERT INTO sync_issues
          (sync_run_id, product_id, code, message, details_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          runId,
          release.product_id,
          issue.code,
          issue.message,
          issue.details ? JSON.stringify(issue.details) : null,
          timestamp,
        ),
      this.db
        .prepare(
          "UPDATE source_releases SET mapping_status = 'issue', updated_at = ? WHERE product_id = ?",
        )
        .bind(timestamp, release.product_id),
      this.db
        .prepare(
          `UPDATE sync_runs SET cursor = ?, issues_created = issues_created + 1, updated_at = ?
          WHERE id = ?`,
        )
        .bind(release.product_id, timestamp, runId),
    ]);
  }

  async moveToPhase(runId: string, phase: SyncPhase, now: Date): Promise<void> {
    await this.db
      .prepare("UPDATE sync_runs SET phase = ?, cursor = NULL, updated_at = ? WHERE id = ?")
      .bind(phase, nowIso(now), runId)
      .run();
  }

  async nextStaleTitle(
    cursor: string | null,
    cutoff: Date,
  ): Promise<(MappingTarget & { id: number }) | null> {
    return this.db
      .prepare(
        `SELECT t.id, t.media_type AS mediaType, t.tmdb_id AS tmdbId, t.season_number AS seasonNumber
        FROM titles t
        WHERE t.metadata_updated_at < ?
          AND (? IS NULL OR t.id > CAST(? AS INTEGER))
          AND EXISTS (
            SELECT 1 FROM source_release_titles srt
            JOIN source_releases sr ON sr.product_id = srt.product_id
            WHERE srt.title_id = t.id AND sr.active = 1
          )
        ORDER BY t.id ASC LIMIT 1`,
      )
      .bind(nowIso(cutoff), cursor, cursor)
      .first<MappingTarget & { id: number }>();
  }

  async recordRefresh(runId: string, titleId: number, now: Date): Promise<void> {
    await this.db
      .prepare(
        `UPDATE sync_runs SET cursor = ?, titles_refreshed = titles_refreshed + 1, updated_at = ?
        WHERE id = ?`,
      )
      .bind(String(titleId), nowIso(now), runId)
      .run();
  }

  async addExternalFetches(
    runId: string,
    count: number,
    errorSummary: string | null,
    now: Date,
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE sync_runs SET external_fetches = external_fetches + ?, error_summary = ?, updated_at = ?
        WHERE id = ?`,
      )
      .bind(count, errorSummary, nowIso(now), runId)
      .run();
  }

  async completeRun(
    runId: string,
    localDate: string,
    leaseToken: string,
    now: Date,
  ): Promise<void> {
    const timestamp = nowIso(now);
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE sync_runs SET phase = 'finalize', status = 'complete', cursor = NULL,
          error_summary = NULL, updated_at = ?, completed_at = ? WHERE id = ?`,
        )
        .bind(timestamp, timestamp, runId),
      this.db
        .prepare(
          `UPDATE sync_days SET status = 'complete', completed_at = ?, lease_token = NULL,
          lease_expires_at = NULL, updated_at = ? WHERE local_date = ? AND lease_token = ?`,
        )
        .bind(timestamp, timestamp, localDate, leaseToken),
    ]);
  }

  async failRun(
    runId: string,
    localDate: string,
    leaseToken: string,
    message: string,
    now: Date,
  ): Promise<void> {
    const timestamp = nowIso(now);
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE sync_runs SET status = 'failed', error_summary = ?, updated_at = ?, completed_at = ?
          WHERE id = ?`,
        )
        .bind(message, timestamp, timestamp, runId),
      this.db
        .prepare(
          `UPDATE sync_days SET status = 'failed', lease_token = NULL, lease_expires_at = NULL,
          updated_at = ? WHERE local_date = ? AND lease_token = ?`,
        )
        .bind(timestamp, localDate, leaseToken),
    ]);
  }
}
