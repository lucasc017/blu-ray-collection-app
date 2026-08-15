import type {
  CollectionEntry,
  Genre,
  ListTitlesResponse,
  MediaType,
  SyncStatus,
  TitleDetails,
  TitleSort,
} from "../../shared/contracts";
import { normalizeBluRayReleaseUrl } from "../../shared/security";

export interface ListTitleOptions {
  q?: string;
  type?: MediaType;
  genre?: number;
  year?: number;
  sort: TitleSort;
  page: number;
  pageSize: number;
}

interface TitleRow {
  id: number;
  media_type: MediaType;
  tmdb_id: number;
  season_number: number;
  display_title: string;
  original_title: string | null;
  overview: string;
  release_date: string | null;
  release_year: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  runtime_minutes: number | null;
  episode_count: number | null;
  vote_average: number | null;
  created_at: string;
  formats: string | null;
  genres: string | null;
}

interface CountRow {
  count: number;
}

function parseGenres(value: string | null): Genre[] {
  if (!value) return [];
  return value.split("|").flatMap((item) => {
    const separator = item.indexOf(":");
    if (separator < 1) return [];
    const id = Number(item.slice(0, separator));
    return Number.isFinite(id) ? [{ id, name: item.slice(separator + 1) }] : [];
  });
}

function mapEntry(row: TitleRow): CollectionEntry {
  return {
    key: `${row.media_type}:${row.tmdb_id}:${row.season_number}`,
    mediaType: row.media_type,
    tmdbId: row.tmdb_id,
    seasonNumber: row.media_type === "tv" ? row.season_number : null,
    title: row.display_title,
    overview: row.overview,
    releaseDate: row.release_date,
    releaseYear: row.release_year,
    posterPath: row.poster_path,
    backdropPath: row.backdrop_path,
    voteAverage: row.vote_average,
    formats: row.formats ? row.formats.split(",").filter(Boolean) : [],
    genres: parseGenres(row.genres),
    addedAt: row.created_at,
  };
}

const ownershipClause = `EXISTS (
  SELECT 1 FROM source_release_titles ownership
  JOIN source_releases owned_release ON owned_release.product_id = ownership.product_id
  WHERE ownership.title_id = t.id AND owned_release.active = 1
)`;

const selectColumns = `
  t.*,
  (SELECT GROUP_CONCAT(DISTINCT sr.format)
   FROM source_release_titles srt
   JOIN source_releases sr ON sr.product_id = srt.product_id
   WHERE srt.title_id = t.id AND sr.active = 1) AS formats,
  (SELECT GROUP_CONCAT(tg.tmdb_genre_id || ':' || tg.name, '|')
   FROM title_genres tg WHERE tg.title_id = t.id) AS genres`;

export async function listTitles(
  db: D1Database,
  options: ListTitleOptions,
): Promise<ListTitlesResponse> {
  const where: string[] = [ownershipClause];
  const bindings: Array<string | number> = [];

  if (options.q) {
    where.push("(t.display_title LIKE ? ESCAPE '\\' OR t.original_title LIKE ? ESCAPE '\\')");
    const escaped = options.q
      .replaceAll("\\", "\\\\")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_");
    bindings.push(`%${escaped}%`, `%${escaped}%`);
  }
  if (options.type) {
    where.push("t.media_type = ?");
    bindings.push(options.type);
  }
  if (options.genre !== undefined) {
    where.push(
      "EXISTS (SELECT 1 FROM title_genres selected_genre WHERE selected_genre.title_id = t.id AND selected_genre.tmdb_genre_id = ?)",
    );
    bindings.push(options.genre);
  }
  if (options.year !== undefined) {
    where.push("t.release_year = ?");
    bindings.push(options.year);
  }

  const orderBy = {
    title: "t.sort_title ASC, t.id ASC",
    release_date: "t.release_date DESC, t.sort_title ASC",
    recently_added: "t.created_at DESC, t.id DESC",
  }[options.sort];
  const whereSql = where.join(" AND ");
  const offset = (options.page - 1) * options.pageSize;

  const statements = [
    db.prepare(`SELECT COUNT(*) AS count FROM titles t WHERE ${whereSql}`).bind(...bindings),
    db
      .prepare(
        `SELECT ${selectColumns} FROM titles t WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, options.pageSize, offset),
    db.prepare(`SELECT DISTINCT tg.tmdb_genre_id AS id, tg.name
      FROM title_genres tg JOIN titles t ON t.id = tg.title_id
      WHERE ${ownershipClause} ORDER BY tg.name`),
    db.prepare(`SELECT DISTINCT t.release_year AS year FROM titles t
      WHERE ${ownershipClause} AND t.release_year IS NOT NULL ORDER BY t.release_year DESC`),
    db.prepare(`SELECT DISTINCT t.media_type AS media_type FROM titles t
      WHERE ${ownershipClause} ORDER BY t.media_type`),
  ];
  const results = await db.batch(statements);
  const [countResult, itemResult, genreResult, yearResult, typeResult] = results;
  if (!countResult || !itemResult || !genreResult || !yearResult || !typeResult) {
    throw new Error("The collection query returned an incomplete result set.");
  }

  return {
    items: (itemResult.results as unknown as TitleRow[]).map(mapEntry),
    page: options.page,
    pageSize: options.pageSize,
    total: (countResult.results[0] as CountRow | undefined)?.count ?? 0,
    filters: {
      genres: genreResult.results as unknown as Genre[],
      years: (yearResult.results as unknown as Array<{ year: number }>).map((row) => row.year),
      mediaTypes: (typeResult.results as unknown as Array<{ media_type: MediaType }>).map(
        (row) => row.media_type,
      ),
    },
  };
}

export async function getTitleDetails(
  db: D1Database,
  mediaType: MediaType,
  tmdbId: number,
  seasonNumber: number,
): Promise<TitleDetails | null> {
  const row = await db
    .prepare(
      `SELECT ${selectColumns} FROM titles t
      WHERE t.media_type = ? AND t.tmdb_id = ? AND t.season_number = ? AND ${ownershipClause}`,
    )
    .bind(mediaType, tmdbId, seasonNumber)
    .first<TitleRow>();
  if (!row) return null;

  const releases = await db
    .prepare(
      `SELECT sr.product_id, sr.source_title, sr.format, sr.source_url, sr.first_seen_at
      FROM source_releases sr
      JOIN source_release_titles srt ON srt.product_id = sr.product_id
      WHERE srt.title_id = ? AND sr.active = 1 ORDER BY sr.source_title`,
    )
    .bind(row.id)
    .all<{
      product_id: string;
      source_title: string;
      format: string;
      source_url: string;
      first_seen_at: string;
    }>();

  return {
    ...mapEntry(row),
    originalTitle: row.original_title,
    runtimeMinutes: row.runtime_minutes,
    episodeCount: row.episode_count,
    releases: releases.results.flatMap((release) => {
      const sourceUrl = normalizeBluRayReleaseUrl(release.source_url, release.product_id);
      return sourceUrl
        ? [
            {
              productId: release.product_id,
              label: release.source_title,
              format: release.format,
              sourceUrl,
              firstSeenAt: release.first_seen_at,
            },
          ]
        : [];
    }),
  };
}

export async function getSyncStatus(db: D1Database): Promise<SyncStatus> {
  const results = await db.batch([
    db.prepare(`SELECT COUNT(DISTINCT t.id) AS count FROM titles t WHERE ${ownershipClause}`),
    db.prepare("SELECT COUNT(*) AS count FROM source_releases WHERE active = 1"),
    db.prepare("SELECT COUNT(*) AS count FROM sync_issues WHERE resolved_at IS NULL"),
    db.prepare("SELECT COUNT(*) AS count FROM sync_runs WHERE status = 'running'"),
    db.prepare(
      "SELECT completed_at FROM sync_runs WHERE status = 'complete' ORDER BY completed_at DESC LIMIT 1",
    ),
  ]);
  const [titleResult, releaseResult, issueResult, runningResult, successResult] = results;
  if (!titleResult || !releaseResult || !issueResult || !runningResult || !successResult) {
    throw new Error("The synchronization status query returned an incomplete result set.");
  }
  const count = (result: D1Result<unknown>): number =>
    (result.results[0] as CountRow | undefined)?.count ?? 0;
  const titleCount = count(titleResult);
  const unresolvedIssueCount = count(issueResult);
  const lastSuccess = successResult.results[0] as { completed_at: string } | undefined;

  return {
    titleCount,
    activeReleaseCount: count(releaseResult),
    unresolvedIssueCount,
    state:
      count(runningResult) > 0
        ? "syncing"
        : titleCount === 0
          ? "empty"
          : unresolvedIssueCount > 0
            ? "degraded"
            : "ready",
    lastSuccessfulSyncAt: lastSuccess?.completed_at ?? null,
  };
}
