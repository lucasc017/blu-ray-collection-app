import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  applyMetadataReview,
  getActiveReviewTargets,
  getReviewSaveContext,
  listMetadataReviews,
  StaleMetadataReviewError,
} from "./admin-reviews";
import { upsertAppUser } from "./users";
import { createMovieRecommendation, getRecommendationState } from "./recommendations";
import type { TitleMetadata } from "../sync/types";

const now = "2026-08-27T12:00:00.000Z";

function movie(tmdbId: number, title: string): TitleMetadata {
  return {
    mediaType: "movie",
    tmdbId,
    seasonNumber: -1,
    displayTitle: title,
    originalTitle: title,
    sortTitle: title.toLowerCase(),
    overview: "Overview",
    releaseDate: "2020-01-01",
    releaseYear: 2020,
    posterPath: "/poster.jpg",
    backdropPath: null,
    runtimeMinutes: 100,
    episodeCount: null,
    voteAverage: 7.5,
    genres: [{ id: 18, name: "Drama" }],
    metadataUpdatedAt: now,
  };
}

function tvSeason(tmdbId: number, seasonNumber: number, title: string): TitleMetadata {
  return {
    ...movie(tmdbId, title),
    mediaType: "tv",
    seasonNumber,
    releaseDate: "2021-01-01",
    releaseYear: 2021,
    runtimeMinutes: 45,
    episodeCount: 10,
  };
}

async function seedConflict(productId = "271695") {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO source_releases
        (product_id, source_title, normalized_title, source_url, format, source_fingerprint,
         mapping_revision, mapping_status, active, first_seen_at, last_seen_at, updated_at)
        VALUES (?, 'A Conflicted Release', 'a conflicted release', ?, '4K UHD', 'fingerprint',
          'test', 'issue', 1, ?, ?, ?)`,
    ).bind(
      productId,
      `https://www.blu-ray.com/movies/A-Conflicted-Release-Blu-ray/${productId}/`,
      now,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO sync_issues (product_id, code, message, created_at)
         VALUES (?, 'ambiguous_match', 'Choose the correct title.', ?)`,
    ).bind(productId, now),
  ]);
  const context = await getReviewSaveContext(env.DB, productId);
  if (!context?.issueId) throw new Error("Conflict was not seeded.");
  return context;
}

describe("metadata review persistence", () => {
  it("seeds the existing code overrides as active reviewed mappings", async () => {
    await expect(getActiveReviewTargets(env.DB, "307056")).resolves.toEqual([
      { mediaType: "movie", tmdbId: 603, seasonNumber: -1 },
      { mediaType: "movie", tmdbId: 604, seasonNumber: -1 },
      { mediaType: "movie", tmdbId: 605, seasonNumber: -1 },
      { mediaType: "movie", tmdbId: 624860, seasonNumber: -1 },
    ]);
  });

  it("atomically resolves a conflict and records its actor and targets", async () => {
    const context = await seedConflict();
    const actor = await upsertAppUser(
      env.DB,
      { subject: "admin-subject", email: "admin@example.com" },
      now,
    );
    await createMovieRecommendation(env.DB, movie(101, "First Film"), actor.id, actor.email, now);
    const result = await applyMetadataReview(env.DB, {
      productId: context.productId,
      expected: { issueId: context.issueId, revision: null },
      metadata: [movie(101, "First Film"), tvSeason(102, 1, "Selected Show — Season 1")],
      actorUserId: actor.id,
      actorLabel: actor.email,
      now,
    });

    expect(result).toMatchObject({ productId: "271695", revision: 1 });
    const saved = await getReviewSaveContext(env.DB, "271695");
    expect(saved).toEqual({ productId: "271695", issueId: null, revision: 1 });
    const ownership = await env.DB.prepare(
      `SELECT t.tmdb_id FROM source_release_titles ownership
       JOIN titles t ON t.id = ownership.title_id
       WHERE ownership.product_id = ? ORDER BY t.tmdb_id`,
    )
      .bind("271695")
      .all<{ tmdb_id: number }>();
    expect(ownership.results.map((row) => row.tmdb_id)).toEqual([101, 102]);
    expect(await getRecommendationState(env.DB, 101)).toMatchObject({ fulfilledAt: now });

    const history = await listMetadataReviews(env.DB, "resolved", 1, 20);
    const item = history.items.find((candidate) => candidate.productId === "271695");
    expect(item?.activeRevision).toMatchObject({
      revision: 1,
      actorLabel: "admin@example.com",
    });
    expect(item?.activeRevision?.targets.map((target) => target.title)).toEqual([
      "First Film",
      "Selected Show — Season 1",
    ]);
    expect(item?.activeRevision?.targets[1]).toMatchObject({
      mediaType: "tv",
      seasonNumber: 1,
    });
  });

  it("keeps prior revisions and rejects a stale second save", async () => {
    const context = await seedConflict("271696");
    const actor = await upsertAppUser(
      env.DB,
      { subject: "admin-subject", email: "admin@example.com" },
      now,
    );
    await applyMetadataReview(env.DB, {
      productId: context.productId,
      expected: { issueId: context.issueId, revision: null },
      metadata: [movie(201, "Original Choice")],
      actorUserId: actor.id,
      actorLabel: actor.email,
      now,
    });
    await applyMetadataReview(env.DB, {
      productId: context.productId,
      expected: { issueId: null, revision: 1 },
      metadata: [movie(202, "Corrected Choice")],
      actorUserId: actor.id,
      actorLabel: actor.email,
      now: "2026-08-27T12:05:00.000Z",
    });

    const revisions = await env.DB.prepare(
      `SELECT revision, superseded_at FROM release_mapping_revisions
       WHERE product_id = ? ORDER BY revision`,
    )
      .bind(context.productId)
      .all<{ revision: number; superseded_at: string | null }>();
    expect(revisions.results).toEqual([
      { revision: 1, superseded_at: "2026-08-27T12:05:00.000Z" },
      { revision: 2, superseded_at: null },
    ]);

    await expect(
      applyMetadataReview(env.DB, {
        productId: context.productId,
        expected: { issueId: null, revision: 1 },
        metadata: [movie(203, "Stale Choice")],
        actorUserId: actor.id,
        actorLabel: actor.email,
        now: "2026-08-27T12:10:00.000Z",
      }),
    ).rejects.toBeInstanceOf(StaleMetadataReviewError);
  });
});
