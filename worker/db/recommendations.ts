import type {
  CreateMovieRecommendationResponse,
  ListMovieRecommendationsResponse,
  MovieRecommendation,
  RecommendationSort,
  SetMovieRecommendationEndorsementResponse,
} from "../../shared/contracts";
import type { TitleMetadata } from "../sync/types";
import { upsertTitleMetadata } from "./title-metadata";

interface RecommendationRow {
  id: number;
  tmdb_id: number;
  display_title: string;
  overview: string;
  release_date: string | null;
  release_year: number | null;
  poster_path: string | null;
  created_at: string;
  creator_email: string | null;
  endorsement_count: number;
  endorsed_by_current_user: number;
}

interface SupporterRow {
  recommendation_id: number;
  email: string;
}

export interface RecommendationState {
  recommendationId: number | null;
  fulfilledAt: string | null;
  owned: boolean;
}

export class RecommendationUnavailableError extends Error {
  constructor(readonly reason: "owned" | "fulfilled") {
    super(
      reason === "owned" ? "That movie is already owned." : "That recommendation is fulfilled.",
    );
    this.name = "RecommendationUnavailableError";
  }
}

function userLabel(email: string | null): string {
  if (!email) return "Former user";
  const separator = email.indexOf("@");
  return separator > 0 ? email.slice(0, separator) : email;
}

function itemFromRow(row: RecommendationRow, supporters: string[]): MovieRecommendation {
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    title: row.display_title,
    overview: row.overview,
    releaseDate: row.release_date,
    releaseYear: row.release_year,
    posterPath: row.poster_path,
    createdAt: row.created_at,
    recommendedBy: userLabel(row.creator_email),
    supporters,
    endorsementCount: row.endorsement_count,
    endorsedByCurrentUser: row.endorsed_by_current_user === 1,
  };
}

async function supportersForRecommendations(
  db: D1Database,
  recommendationIds: number[],
): Promise<Map<number, string[]>> {
  const byRecommendation = new Map<number, string[]>();
  if (recommendationIds.length === 0) return byRecommendation;
  const placeholders = recommendationIds.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT e.recommendation_id, u.email
       FROM movie_recommendation_endorsements e
       JOIN app_users u ON u.id = e.user_id
       WHERE e.recommendation_id IN (${placeholders})
       ORDER BY e.created_at, u.id`,
    )
    .bind(...recommendationIds)
    .all<SupporterRow>();
  for (const row of result.results) {
    const supporters = byRecommendation.get(row.recommendation_id) ?? [];
    supporters.push(userLabel(row.email));
    byRecommendation.set(row.recommendation_id, supporters);
  }
  return byRecommendation;
}

const recommendationSelect = `
  SELECT r.id, t.tmdb_id, t.display_title, t.overview, t.release_date, t.release_year,
         t.poster_path, r.created_at, creator.email AS creator_email,
         COUNT(e.user_id) AS endorsement_count,
         CASE WHEN EXISTS (
           SELECT 1 FROM movie_recommendation_endorsements mine
           JOIN app_users me ON me.id = mine.user_id
           WHERE mine.recommendation_id = r.id AND me.email = ? COLLATE NOCASE
         ) THEN 1 ELSE 0 END AS endorsed_by_current_user
  FROM movie_recommendations r
  JOIN titles t ON t.id = r.title_id
  LEFT JOIN app_users creator ON creator.id = r.created_by_user_id
  LEFT JOIN movie_recommendation_endorsements e ON e.recommendation_id = r.id`;

export async function listMovieRecommendations(
  db: D1Database,
  currentEmail: string,
  sort: RecommendationSort,
  page: number,
  pageSize: number,
): Promise<ListMovieRecommendationsResponse> {
  const orderBy = {
    newest: "r.created_at DESC, r.id DESC",
    endorsements: "endorsement_count DESC, r.created_at DESC, r.id DESC",
    title: "t.sort_title ASC, r.id ASC",
  }[sort];
  const offset = (page - 1) * pageSize;
  const [rows, total] = await db.batch([
    db
      .prepare(
        `${recommendationSelect}
         WHERE r.fulfilled_at IS NULL
         GROUP BY r.id
         ORDER BY ${orderBy}
         LIMIT ? OFFSET ?`,
      )
      .bind(currentEmail, pageSize, offset),
    db.prepare("SELECT COUNT(*) AS count FROM movie_recommendations WHERE fulfilled_at IS NULL"),
  ]);
  if (!rows || !total) throw new Error("The recommendation list could not be loaded.");
  const recommendationRows = rows.results as RecommendationRow[];
  const supporters = await supportersForRecommendations(
    db,
    recommendationRows.map((row) => row.id),
  );
  return {
    items: recommendationRows.map((row) => itemFromRow(row, supporters.get(row.id) ?? [])),
    page,
    pageSize,
    total: (total.results[0] as { count?: number } | undefined)?.count ?? 0,
  };
}

export async function getMovieRecommendation(
  db: D1Database,
  recommendationId: number,
  currentEmail: string,
): Promise<MovieRecommendation | null> {
  const row = await db
    .prepare(
      `${recommendationSelect}
       WHERE r.id = ? AND r.fulfilled_at IS NULL
       GROUP BY r.id`,
    )
    .bind(currentEmail, recommendationId)
    .first<RecommendationRow>();
  if (!row) return null;
  const supporters = await supportersForRecommendations(db, [row.id]);
  return itemFromRow(row, supporters.get(row.id) ?? []);
}

export async function getRecommendationState(
  db: D1Database,
  tmdbId: number,
): Promise<RecommendationState | null> {
  const row = await db
    .prepare(
      `SELECT r.id AS recommendationId, r.fulfilled_at AS fulfilledAt,
              CASE WHEN EXISTS (
                SELECT 1 FROM source_release_titles srt
                JOIN source_releases sr ON sr.product_id = srt.product_id
                WHERE srt.title_id = t.id AND sr.active = 1
              ) THEN 1 ELSE 0 END AS owned
       FROM titles t
       LEFT JOIN movie_recommendations r ON r.title_id = t.id
       WHERE t.media_type = 'movie' AND t.tmdb_id = ? AND t.season_number = -1`,
    )
    .bind(tmdbId)
    .first<{ recommendationId: number | null; fulfilledAt: string | null; owned: number }>();
  return row
    ? {
        recommendationId: row.recommendationId,
        fulfilledAt: row.fulfilledAt,
        owned: row.owned === 1,
      }
    : null;
}

export async function createMovieRecommendation(
  db: D1Database,
  metadata: TitleMetadata,
  actorUserId: number,
  actorEmail: string,
  now: string,
): Promise<CreateMovieRecommendationResponse> {
  const titleId = await upsertTitleMetadata(db, metadata);
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO movie_recommendations (title_id, created_by_user_id, created_at)
         SELECT ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM source_release_titles srt
           JOIN source_releases sr ON sr.product_id = srt.product_id
           WHERE srt.title_id = ? AND sr.active = 1
         )
         ON CONFLICT(title_id) DO NOTHING`,
      )
      .bind(titleId, actorUserId, now, titleId),
    db
      .prepare(
        `INSERT OR IGNORE INTO movie_recommendation_endorsements
          (recommendation_id, user_id, created_at)
         SELECT id, ?, ? FROM movie_recommendations
         WHERE title_id = ? AND fulfilled_at IS NULL`,
      )
      .bind(actorUserId, now, titleId),
  ]);
  const state = await getRecommendationState(db, metadata.tmdbId);
  if (state?.owned) throw new RecommendationUnavailableError("owned");
  if (state?.fulfilledAt) throw new RecommendationUnavailableError("fulfilled");
  if (!state?.recommendationId) throw new Error("The movie recommendation could not be saved.");
  const recommendation = await getMovieRecommendation(db, state.recommendationId, actorEmail);
  if (!recommendation) throw new Error("The movie recommendation could not be loaded.");
  return { recommendation, created: (results[0]?.meta.changes ?? 0) === 1 };
}

export async function setMovieRecommendationEndorsement(
  db: D1Database,
  recommendationId: number,
  actorUserId: number,
  actorEmail: string,
  endorsed: boolean,
  now: string,
): Promise<SetMovieRecommendationEndorsementResponse | null> {
  const state = await db
    .prepare(
      `SELECT r.fulfilled_at AS fulfilledAt,
              CASE WHEN EXISTS (
                SELECT 1 FROM source_release_titles srt
                JOIN source_releases sr ON sr.product_id = srt.product_id
                WHERE srt.title_id = r.title_id AND sr.active = 1
              ) THEN 1 ELSE 0 END AS owned
       FROM movie_recommendations r WHERE r.id = ?`,
    )
    .bind(recommendationId)
    .first<{ fulfilledAt: string | null; owned: number }>();
  if (!state) return null;
  if (state.owned === 1) throw new RecommendationUnavailableError("owned");
  if (state.fulfilledAt) throw new RecommendationUnavailableError("fulfilled");

  if (endorsed) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO movie_recommendation_endorsements
          (recommendation_id, user_id, created_at) VALUES (?, ?, ?)`,
      )
      .bind(recommendationId, actorUserId, now)
      .run();
  } else {
    await db.batch([
      db
        .prepare(
          "DELETE FROM movie_recommendation_endorsements WHERE recommendation_id = ? AND user_id = ?",
        )
        .bind(recommendationId, actorUserId),
      db
        .prepare(
          `DELETE FROM movie_recommendations
           WHERE id = ? AND fulfilled_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM movie_recommendation_endorsements
               WHERE recommendation_id = ?
             )`,
        )
        .bind(recommendationId, recommendationId),
    ]);
  }

  const recommendation = await getMovieRecommendation(db, recommendationId, actorEmail);
  return { recommendation, removed: recommendation === null };
}

export async function deleteMovieRecommendation(
  db: D1Database,
  recommendationId: number,
): Promise<boolean> {
  const deletedId = await db
    .prepare("DELETE FROM movie_recommendations WHERE id = ? AND fulfilled_at IS NULL RETURNING id")
    .bind(recommendationId)
    .first<number>("id");
  return deletedId !== null;
}

export function recommendationFulfillmentStatement(
  db: D1Database,
  now: string,
  titleIds?: number[],
): D1PreparedStatement | null {
  if (titleIds?.length === 0) return null;
  const titleFilter = titleIds ? `AND title_id IN (${titleIds.map(() => "?").join(", ")})` : "";
  return db
    .prepare(
      `UPDATE movie_recommendations SET fulfilled_at = ?
       WHERE fulfilled_at IS NULL ${titleFilter}
         AND EXISTS (
           SELECT 1 FROM source_release_titles srt
           JOIN source_releases sr ON sr.product_id = srt.product_id
           WHERE srt.title_id = movie_recommendations.title_id AND sr.active = 1
         )`,
    )
    .bind(now, ...(titleIds ?? []));
}
