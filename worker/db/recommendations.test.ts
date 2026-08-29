import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { SyncRepository } from "../sync/repository";
import type { ParsedRelease, SourceReleaseRow, TitleMetadata } from "../sync/types";
import {
  createMovieRecommendation,
  deleteMovieRecommendation,
  getRecommendationState,
  listMovieRecommendations,
  RecommendationUnavailableError,
  setMovieRecommendationEndorsement,
} from "./recommendations";
import { upsertAppUser } from "./users";

const now = "2026-08-28T12:00:00.000Z";

function movie(tmdbId: number, title: string): TitleMetadata {
  return {
    mediaType: "movie",
    tmdbId,
    seasonNumber: -1,
    displayTitle: title,
    originalTitle: title,
    sortTitle: title.toLowerCase(),
    overview: `${title} overview`,
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

async function user(subject: string, email: string) {
  return upsertAppUser(env.DB, { subject, email }, now);
}

describe("movie recommendation persistence", () => {
  it("creates one canonical recommendation and idempotent endorsements", async () => {
    const lucas = await user("lucas-subject", "lucas@example.com");
    const friend = await user("friend-subject", "friend@example.com");
    const first = await createMovieRecommendation(
      env.DB,
      movie(101, "First Film"),
      lucas.id,
      lucas.email,
      now,
    );
    expect(first).toMatchObject({ created: true, recommendation: { endorsementCount: 1 } });
    expect(first.recommendation).toMatchObject({
      recommendedBy: "lucas",
      supporters: ["lucas"],
      endorsedByCurrentUser: true,
    });

    const second = await createMovieRecommendation(
      env.DB,
      movie(101, "First Film"),
      friend.id,
      friend.email,
      "2026-08-28T12:05:00.000Z",
    );
    expect(second.created).toBe(false);
    expect(second.recommendation).toMatchObject({
      endorsementCount: 2,
      recommendedBy: "lucas",
      supporters: ["lucas", "friend"],
      endorsedByCurrentUser: true,
    });

    await createMovieRecommendation(
      env.DB,
      movie(101, "First Film"),
      friend.id,
      friend.email,
      "2026-08-28T12:06:00.000Z",
    );
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM movie_recommendation_endorsements",
    ).first<number>("count");
    expect(count).toBe(2);
  });

  it("sorts by newest, endorsements, and title with deterministic results", async () => {
    const owner = await user("owner-subject", "owner@example.com");
    const friend = await user("friend-subject", "friend@example.com");
    const alpha = await createMovieRecommendation(
      env.DB,
      movie(201, "Alpha"),
      owner.id,
      owner.email,
      "2026-08-28T12:00:00.000Z",
    );
    await createMovieRecommendation(
      env.DB,
      movie(202, "Zulu"),
      owner.id,
      owner.email,
      "2026-08-28T12:10:00.000Z",
    );
    await setMovieRecommendationEndorsement(
      env.DB,
      alpha.recommendation.id,
      friend.id,
      friend.email,
      true,
      "2026-08-28T12:15:00.000Z",
    );

    await expect(
      listMovieRecommendations(env.DB, owner.email, "newest", 1, 24),
    ).resolves.toMatchObject({
      items: [{ title: "Zulu" }, { title: "Alpha" }],
    });
    await expect(
      listMovieRecommendations(env.DB, owner.email, "endorsements", 1, 24),
    ).resolves.toMatchObject({ items: [{ title: "Alpha" }, { title: "Zulu" }] });
    await expect(
      listMovieRecommendations(env.DB, owner.email, "title", 1, 24),
    ).resolves.toMatchObject({
      items: [{ title: "Alpha" }, { title: "Zulu" }],
    });
  });

  it("deletes the recommendation when its final endorsement is withdrawn", async () => {
    const owner = await user("owner-subject", "owner@example.com");
    const created = await createMovieRecommendation(
      env.DB,
      movie(301, "Solo Pick"),
      owner.id,
      owner.email,
      now,
    );
    const result = await setMovieRecommendationEndorsement(
      env.DB,
      created.recommendation.id,
      owner.id,
      owner.email,
      false,
      now,
    );
    expect(result).toEqual({ recommendation: null, removed: true });
    await expect(
      listMovieRecommendations(env.DB, owner.email, "newest", 1, 24),
    ).resolves.toMatchObject({
      total: 0,
    });
  });

  it("permanently fulfills a recommendation when sync establishes ownership", async () => {
    const owner = await user("owner-subject", "owner@example.com");
    await createMovieRecommendation(
      env.DB,
      movie(401, "Purchased Pick"),
      owner.id,
      owner.email,
      now,
    );
    const release: SourceReleaseRow = {
      product_id: "401401",
      source_title: "Purchased Pick 4K",
      normalized_title: "purchased pick",
      release_year: 2020,
      source_url: "https://www.blu-ray.com/movies/Purchased-Pick-4K-Blu-ray/401401/",
      format: "4K UHD",
    };
    await env.DB.prepare(
      `INSERT INTO source_releases
        (product_id, source_title, normalized_title, release_year, source_url, format,
         source_fingerprint, mapping_revision, mapping_status, active, first_seen_at,
         last_seen_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'test', 'test', 'pending', 1, ?, ?, ?)`,
    )
      .bind(
        release.product_id,
        release.source_title,
        release.normalized_title,
        release.release_year,
        release.source_url,
        release.format,
        now,
        now,
        now,
      )
      .run();

    await new SyncRepository(env.DB).resolveRelease(
      "test-run",
      release,
      [movie(401, "Purchased Pick")],
      new Date(now),
    );
    expect(await getRecommendationState(env.DB, 401)).toMatchObject({
      fulfilledAt: now,
      owned: true,
    });
    await env.DB.prepare("UPDATE source_releases SET active = 0 WHERE product_id = ?")
      .bind(release.product_id)
      .run();
    expect(await getRecommendationState(env.DB, 401)).toMatchObject({
      fulfilledAt: now,
      owned: false,
    });
    await expect(
      listMovieRecommendations(env.DB, owner.email, "newest", 1, 24),
    ).resolves.toMatchObject({
      total: 0,
    });
  });

  it("fulfills a recommendation when discovery reactivates existing ownership", async () => {
    const owner = await user("owner-subject", "owner@example.com");
    await createMovieRecommendation(
      env.DB,
      movie(402, "Returning Pick"),
      owner.id,
      owner.email,
      now,
    );
    const titleId = await env.DB.prepare(
      "SELECT id FROM titles WHERE media_type = 'movie' AND tmdb_id = 402 AND season_number = -1",
    ).first<number>("id");
    if (!titleId) throw new Error("Recommendation title was not stored.");
    const parsed: ParsedRelease = {
      productId: "402402",
      sourceTitle: "Returning Pick Blu-ray",
      normalizedTitle: "returning pick",
      releaseYear: 2020,
      sourceUrl: "https://www.blu-ray.com/movies/Returning-Pick-Blu-ray/402402/",
      format: "Blu-ray",
      fingerprint: "returning-pick",
    };
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO source_releases
          (product_id, source_title, normalized_title, release_year, source_url, format,
           source_fingerprint, mapping_revision, mapping_status, active, first_seen_at,
           last_seen_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'test', 'resolved', 0, ?, ?, ?)`,
      ).bind(
        parsed.productId,
        parsed.sourceTitle,
        parsed.normalizedTitle,
        parsed.releaseYear,
        parsed.sourceUrl,
        parsed.format,
        parsed.fingerprint,
        now,
        now,
        now,
      ),
      env.DB.prepare("INSERT INTO source_release_titles (product_id, title_id) VALUES (?, ?)").bind(
        parsed.productId,
        titleId,
      ),
    ]);
    const repository = new SyncRepository(env.DB);
    const date = new Date(now);
    await repository.ensureDay("2026-08-28", 0, date);
    const run = await repository.createRun("reactivation-run", "2026-08-28", "manual", date);
    await repository.saveIncrementalDiscovery(run.id, [parsed], date);

    expect(await getRecommendationState(env.DB, 402)).toMatchObject({
      fulfilledAt: now,
      owned: true,
    });
  });

  it("rejects an already owned movie and cascades administrator deletion", async () => {
    const owner = await user("owner-subject", "owner@example.com");
    const created = await createMovieRecommendation(
      env.DB,
      movie(501, "Admin Delete"),
      owner.id,
      owner.email,
      now,
    );
    await expect(deleteMovieRecommendation(env.DB, created.recommendation.id)).resolves.toBe(true);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM movie_recommendation_endorsements",
      ).first<number>("count"),
    ).toBe(0);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO source_releases
          (product_id, source_title, normalized_title, source_url, format, source_fingerprint,
           mapping_revision, mapping_status, active, first_seen_at, last_seen_at, updated_at)
         VALUES ('501501', 'Owned Film', 'owned film', ?, 'Blu-ray', 'test', 'test',
           'resolved', 1, ?, ?, ?)`,
      ).bind("https://www.blu-ray.com/movies/Owned-Film-Blu-ray/501501/", now, now, now),
      env.DB.prepare(
        `INSERT INTO source_release_titles (product_id, title_id)
         SELECT '501501', id FROM titles
         WHERE media_type = 'movie' AND tmdb_id = 501 AND season_number = -1`,
      ),
    ]);
    await expect(
      createMovieRecommendation(env.DB, movie(501, "Admin Delete"), owner.id, owner.email, now),
    ).rejects.toEqual(
      expect.objectContaining<Partial<RecommendationUnavailableError>>({ reason: "owned" }),
    );
  });
});
