import type {
  MetadataReviewItem,
  MetadataReviewListResponse,
  MetadataReviewRevision,
  MetadataReviewStatus,
  MetadataReviewTarget,
  SaveMetadataReviewRequest,
  SaveMetadataReviewResponse,
} from "../../shared/contracts";
import { normalizeBluRayReleaseUrl } from "../../shared/security";
import type { MappingTarget, TitleMetadata } from "../sync/types";
import { titleMetadataStatements } from "./title-metadata";

interface ReviewReleaseRow {
  product_id: string;
  source_title: string;
  release_year: number | null;
  source_url: string;
  format: string;
  issue_id: number | null;
  issue_code: string | null;
  issue_message: string | null;
  issue_details_json: string | null;
  issue_created_at: string | null;
}

interface ReviewRevisionRow {
  id: number;
  product_id: string;
  revision: number;
  actor_label: string;
  created_at: string;
  superseded_at: string | null;
  position: number | null;
  media_type: "movie" | "tv" | null;
  tmdb_id: number | null;
  season_number: number | null;
  display_title: string | null;
  release_year: number | null;
  poster_path: string | null;
}

export interface ReviewSaveContext {
  productId: string;
  issueId: number | null;
  revision: number | null;
}

export class StaleMetadataReviewError extends Error {
  constructor() {
    super("This release changed while it was being reviewed.");
    this.name = "StaleMetadataReviewError";
  }
}

function parseDetails(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function targetFromRow(row: ReviewRevisionRow): MetadataReviewTarget | null {
  if (!row.media_type || !row.tmdb_id || row.season_number === null) return null;
  const seasonNumber = row.media_type === "movie" ? null : row.season_number;
  const fallback =
    row.media_type === "movie"
      ? `TMDB movie #${row.tmdb_id}`
      : `TMDB series #${row.tmdb_id}, season ${row.season_number}`;
  return {
    mediaType: row.media_type,
    tmdbId: row.tmdb_id,
    seasonNumber,
    title: row.display_title ?? fallback,
    releaseYear: row.release_year,
    posterPath: row.poster_path,
  };
}

async function revisionsForProducts(
  db: D1Database,
  productIds: string[],
): Promise<Map<string, MetadataReviewRevision[]>> {
  const byProduct = new Map<string, MetadataReviewRevision[]>();
  if (productIds.length === 0) return byProduct;

  const placeholders = productIds.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT r.id, r.product_id, r.revision, r.actor_label, r.created_at, r.superseded_at,
              rt.position, rt.media_type, rt.tmdb_id, rt.season_number,
              t.display_title, t.release_year, t.poster_path
       FROM release_mapping_revisions r
       LEFT JOIN release_mapping_review_targets rt ON rt.review_revision_id = r.id
       LEFT JOIN titles t
         ON t.media_type = rt.media_type
        AND t.tmdb_id = rt.tmdb_id
        AND t.season_number = rt.season_number
       WHERE r.product_id IN (${placeholders})
       ORDER BY r.product_id, r.revision DESC, rt.position`,
    )
    .bind(...productIds)
    .all<ReviewRevisionRow>();

  const revisions = new Map<number, MetadataReviewRevision>();
  for (const row of result.results) {
    let revision = revisions.get(row.id);
    if (!revision) {
      revision = {
        revision: row.revision,
        actorLabel: row.actor_label,
        createdAt: row.created_at,
        supersededAt: row.superseded_at,
        targets: [],
      };
      revisions.set(row.id, revision);
      const productRevisions = byProduct.get(row.product_id) ?? [];
      productRevisions.push(revision);
      byProduct.set(row.product_id, productRevisions);
    }
    const target = targetFromRow(row);
    if (target) revision.targets.push(target);
  }
  return byProduct;
}

export async function listMetadataReviews(
  db: D1Database,
  status: MetadataReviewStatus,
  page: number,
  pageSize: number,
): Promise<MetadataReviewListResponse> {
  const where =
    status === "unresolved"
      ? "sr.active = 1 AND sr.mapping_status = 'issue' AND si.id IS NOT NULL"
      : "sr.active = 1 AND ar.id IS NOT NULL";
  const joins = `
    LEFT JOIN sync_issues si ON si.id = (
      SELECT MAX(issue.id) FROM sync_issues issue
      WHERE issue.product_id = sr.product_id AND issue.resolved_at IS NULL
    )
    LEFT JOIN release_mapping_revisions ar
      ON ar.product_id = sr.product_id AND ar.superseded_at IS NULL`;
  const offset = (page - 1) * pageSize;
  const [rows, total] = await db.batch([
    db
      .prepare(
        `SELECT sr.product_id, sr.source_title, sr.release_year, sr.source_url, sr.format,
                si.id AS issue_id, si.code AS issue_code, si.message AS issue_message,
                si.details_json AS issue_details_json, si.created_at AS issue_created_at
         FROM source_releases sr
         ${joins}
         WHERE ${where}
         ORDER BY COALESCE(si.created_at, ar.created_at) DESC, sr.product_id
         LIMIT ? OFFSET ?`,
      )
      .bind(pageSize, offset),
    db.prepare(`SELECT COUNT(*) AS count FROM source_releases sr ${joins} WHERE ${where}`),
  ]);
  if (!rows || !total) throw new Error("The metadata review list could not be loaded.");
  const releases = rows.results as unknown as ReviewReleaseRow[];
  const revisionMap = await revisionsForProducts(
    db,
    releases.map((release) => release.product_id),
  );

  const items: MetadataReviewItem[] = releases.map((release) => {
    const revisions = revisionMap.get(release.product_id) ?? [];
    return {
      productId: release.product_id,
      sourceTitle: release.source_title,
      releaseYear: release.release_year,
      sourceUrl: normalizeBluRayReleaseUrl(release.source_url, release.product_id),
      format: release.format,
      issue:
        release.issue_id && release.issue_code && release.issue_message && release.issue_created_at
          ? {
              id: release.issue_id,
              code: release.issue_code,
              message: release.issue_message,
              details: parseDetails(release.issue_details_json),
              createdAt: release.issue_created_at,
            }
          : null,
      activeRevision: revisions.find((revision) => revision.supersededAt === null) ?? null,
      revisions,
    };
  });
  const totalValue = (total.results[0] as { count?: number } | undefined)?.count ?? 0;
  return { items, page, pageSize, total: totalValue };
}

export async function getReviewSaveContext(
  db: D1Database,
  productId: string,
): Promise<ReviewSaveContext | null> {
  return db
    .prepare(
      `SELECT sr.product_id AS productId,
              (SELECT MAX(id) FROM sync_issues
               WHERE product_id = sr.product_id AND resolved_at IS NULL) AS issueId,
              (SELECT revision FROM release_mapping_revisions
               WHERE product_id = sr.product_id AND superseded_at IS NULL) AS revision
       FROM source_releases sr
       WHERE sr.product_id = ? AND sr.active = 1`,
    )
    .bind(productId)
    .first<ReviewSaveContext>();
}

export function reviewContextMatches(
  context: ReviewSaveContext,
  expected: SaveMetadataReviewRequest["expected"],
): boolean {
  return context.issueId === expected.issueId && context.revision === expected.revision;
}

function mappingTarget(metadata: TitleMetadata): MetadataReviewTarget {
  return {
    mediaType: metadata.mediaType,
    tmdbId: metadata.tmdbId,
    seasonNumber: metadata.mediaType === "movie" ? null : metadata.seasonNumber,
    title: metadata.displayTitle,
    releaseYear: metadata.releaseYear,
    posterPath: metadata.posterPath,
  };
}

export async function applyMetadataReview(
  db: D1Database,
  input: {
    productId: string;
    expected: SaveMetadataReviewRequest["expected"];
    metadata: TitleMetadata[];
    actorUserId: number;
    actorLabel: string;
    now: string;
  },
): Promise<SaveMetadataReviewResponse> {
  const nextRevision = (input.expected.revision ?? 0) + 1;
  const statements: D1PreparedStatement[] = [];

  if (input.expected.revision !== null) {
    statements.push(
      db
        .prepare(
          `UPDATE release_mapping_revisions SET superseded_at = ?
           WHERE product_id = ? AND revision = ? AND superseded_at IS NULL`,
        )
        .bind(input.now, input.productId, input.expected.revision),
    );
  }

  const firstResolution = input.expected.revision === null;
  statements.push(
    db
      .prepare(
        `INSERT INTO release_mapping_revisions
          (product_id, revision, source_issue_id, actor_user_id, actor_label, created_at)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM source_releases WHERE product_id = ? AND active = 1
         )
         AND ${
           firstResolution
             ? `NOT EXISTS (
                  SELECT 1 FROM release_mapping_revisions
                  WHERE product_id = ? AND superseded_at IS NULL
                )
                AND EXISTS (
                  SELECT 1 FROM sync_issues
                  WHERE id = ? AND product_id = ? AND resolved_at IS NULL
                )`
             : `EXISTS (
                  SELECT 1 FROM release_mapping_revisions
                  WHERE product_id = ? AND revision = ? AND superseded_at = ?
                )`
         }`,
      )
      .bind(
        input.productId,
        nextRevision,
        input.expected.issueId,
        input.actorUserId,
        input.actorLabel,
        input.now,
        input.productId,
        ...(firstResolution
          ? [input.productId, input.expected.issueId, input.productId]
          : [input.productId, input.expected.revision, input.now]),
      ),
  );

  for (const metadata of input.metadata) statements.push(...titleMetadataStatements(db, metadata));

  const [first, ...remaining] = input.metadata;
  if (!first) throw new Error("At least one reviewed title is required.");
  statements.push(
    db
      .prepare(
        `INSERT INTO release_mapping_review_targets
          (review_revision_id, position, media_type, tmdb_id, season_number)
         VALUES (
           (SELECT id FROM release_mapping_revisions WHERE product_id = ? AND revision = ?),
           0, ?, ?, ?
         )`,
      )
      .bind(input.productId, nextRevision, first.mediaType, first.tmdbId, first.seasonNumber),
  );
  if (remaining.length > 0) {
    const seed = remaining
      .map((_, index) =>
        index === 0
          ? "SELECT ? AS position, ? AS media_type, ? AS tmdb_id, ? AS season_number"
          : "UNION ALL SELECT ?, ?, ?, ?",
      )
      .join(" ");
    statements.push(
      db
        .prepare(
          `INSERT INTO release_mapping_review_targets
            (review_revision_id, position, media_type, tmdb_id, season_number)
           SELECT review.id, seed.position, seed.media_type, seed.tmdb_id, seed.season_number
           FROM release_mapping_revisions review
           CROSS JOIN (${seed}) seed
           WHERE review.product_id = ? AND review.revision = ?`,
        )
        .bind(
          ...remaining.flatMap((metadata, index) => [
            index + 1,
            metadata.mediaType,
            metadata.tmdbId,
            metadata.seasonNumber,
          ]),
          input.productId,
          nextRevision,
        ),
    );
  }

  statements.push(
    db.prepare("DELETE FROM source_release_titles WHERE product_id = ?").bind(input.productId),
  );
  const ownershipWhere = input.metadata
    .map(() => "(media_type = ? AND tmdb_id = ? AND season_number = ?)")
    .join(" OR ");
  statements.push(
    db
      .prepare(
        `INSERT INTO source_release_titles (product_id, title_id)
         SELECT ?, id FROM titles WHERE ${ownershipWhere}`,
      )
      .bind(
        input.productId,
        ...input.metadata.flatMap((metadata) => [
          metadata.mediaType,
          metadata.tmdbId,
          metadata.seasonNumber,
        ]),
      ),
    db
      .prepare(
        `UPDATE source_releases
         SET mapping_status = 'resolved', mapping_revision = ?, updated_at = ?
         WHERE product_id = ?`,
      )
      .bind(`review:${nextRevision}`, input.now, input.productId),
    db
      .prepare(
        "UPDATE sync_issues SET resolved_at = ? WHERE product_id = ? AND resolved_at IS NULL",
      )
      .bind(input.now, input.productId),
  );
  const fulfillmentWhere = input.metadata
    .map(() => "(media_type = ? AND tmdb_id = ? AND season_number = ?)")
    .join(" OR ");
  statements.push(
    db
      .prepare(
        `UPDATE movie_recommendations SET fulfilled_at = ?
         WHERE fulfilled_at IS NULL AND title_id IN (
           SELECT id FROM titles WHERE ${fulfillmentWhere}
         ) AND EXISTS (
           SELECT 1 FROM source_release_titles srt
           JOIN source_releases sr ON sr.product_id = srt.product_id
           WHERE srt.title_id = movie_recommendations.title_id AND sr.active = 1
         )`,
      )
      .bind(
        input.now,
        ...input.metadata.flatMap((metadata) => [
          metadata.mediaType,
          metadata.tmdbId,
          metadata.seasonNumber,
        ]),
      ),
  );

  try {
    await db.batch(statements);
  } catch (error) {
    const current = await getReviewSaveContext(db, input.productId);
    if (!current || !reviewContextMatches(current, input.expected)) {
      throw new StaleMetadataReviewError();
    }
    throw error;
  }

  return {
    productId: input.productId,
    revision: nextRevision,
    resolvedAt: input.now,
    targets: input.metadata.map(mappingTarget),
  };
}

export async function getActiveReviewTargets(
  db: D1Database,
  productId: string,
): Promise<MappingTarget[] | null> {
  const result = await db
    .prepare(
      `SELECT rt.media_type AS mediaType, rt.tmdb_id AS tmdbId, rt.season_number AS seasonNumber
       FROM release_mapping_revisions r
       JOIN release_mapping_review_targets rt ON rt.review_revision_id = r.id
       WHERE r.product_id = ? AND r.superseded_at IS NULL
       ORDER BY rt.position`,
    )
    .bind(productId)
    .all<MappingTarget>();
  return result.results.length > 0 ? result.results : null;
}
