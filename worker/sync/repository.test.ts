import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SyncRepository } from "./repository";
import type { ParsedRelease } from "./types";

const now = new Date("2026-08-16T12:00:00.000Z");

function release(productId: string): ParsedRelease {
  return {
    productId,
    sourceTitle: `Movie ${productId} Blu-ray (2020)`,
    normalizedTitle: `movie ${productId}`,
    releaseYear: 2020,
    sourceUrl: `https://www.blu-ray.com/movies/Movie-${productId}-Blu-ray/${productId}/`,
    format: "Blu-ray",
    fingerprint: `fingerprint-${productId}`,
  };
}

describe("incremental collection discovery", () => {
  it("upserts the scanned releases without deactivating older rows", async () => {
    const repository = new SyncRepository(env.DB);
    await env.DB.prepare(
      `INSERT INTO source_releases
      (product_id, source_title, normalized_title, source_url, format, source_fingerprint,
       mapping_revision, mapping_status, active, first_seen_at, last_seen_at, updated_at)
      VALUES ('100', 'Existing Movie (2019)', 'existing movie',
        'https://www.blu-ray.com/movies/Existing-Movie-Blu-ray/100/', 'Blu-ray',
        'existing-fingerprint', 'test', 'resolved', 1, ?, ?, ?)`,
    )
      .bind(now.toISOString(), now.toISOString(), now.toISOString())
      .run();

    await repository.ensureDay("2026-08-16", 0, now);
    const run = await repository.createRun("incremental-run", "2026-08-16", "manual", now);
    await repository.saveIncrementalDiscovery(run.id, [release("200")], now);

    const rows = await env.DB.prepare(
      "SELECT product_id, active FROM source_releases ORDER BY CAST(product_id AS INTEGER)",
    ).all<{ product_id: string; active: number }>();
    expect(rows.results).toEqual([
      { product_id: "100", active: 1 },
      { product_id: "200", active: 1 },
    ]);

    await expect(repository.getRun(run.id)).resolves.toMatchObject({
      phase: "resolve",
      releases_seen: 1,
    });
  });

  it("does not let an automatic issue overwrite an active reviewed mapping", async () => {
    const repository = new SyncRepository(env.DB);
    await repository.ensureDay("2026-08-16", 0, now);
    const run = await repository.createRun("review-race-run", "2026-08-16", "manual", now);
    const parsed = release("307056");
    await repository.saveIncrementalDiscovery(run.id, [parsed], now);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO titles
        (media_type, tmdb_id, season_number, display_title, sort_title, overview,
         metadata_updated_at, created_at, updated_at)
        VALUES ('movie', 603, -1, 'The Matrix', 'matrix', '', ?, ?, ?)`,
      ).bind(now.toISOString(), now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `UPDATE source_releases SET mapping_status = 'resolved' WHERE product_id = '307056'`,
      ),
    ]);
    const titleId = await env.DB.prepare(
      "SELECT id FROM titles WHERE media_type = 'movie' AND tmdb_id = 603",
    ).first<number>("id");
    if (!titleId) throw new Error("Test title was not created.");
    await env.DB.prepare(
      "INSERT INTO source_release_titles (product_id, title_id) VALUES ('307056', ?)",
    )
      .bind(titleId)
      .run();

    await repository.recordIssue(
      run.id,
      {
        product_id: parsed.productId,
        source_title: parsed.sourceTitle,
        normalized_title: parsed.normalizedTitle,
        release_year: parsed.releaseYear,
        source_url: parsed.sourceUrl,
        format: parsed.format,
      },
      { code: "ambiguous_match", message: "Automatic matching was ambiguous." },
      now,
    );

    const stored = await env.DB.prepare(
      `SELECT mapping_status AS mappingStatus,
              (SELECT COUNT(*) FROM source_release_titles WHERE product_id = sr.product_id) AS titleCount,
              (SELECT COUNT(*) FROM sync_issues WHERE product_id = sr.product_id) AS issueCount
       FROM source_releases sr WHERE product_id = '307056'`,
    ).first<{ mappingStatus: string; titleCount: number; issueCount: number }>();
    expect(stored).toEqual({ mappingStatus: "resolved", titleCount: 1, issueCount: 0 });
    await expect(repository.getRun(run.id)).resolves.toMatchObject({
      cursor: "307056",
      issues_created: 0,
    });
  });

  it("keeps an active reviewed mapping resolved when discovery metadata changes", async () => {
    const repository = new SyncRepository(env.DB);
    await env.DB.prepare(
      `INSERT INTO source_releases
      (product_id, source_title, normalized_title, source_url, format, source_fingerprint,
       mapping_revision, mapping_status, active, first_seen_at, last_seen_at, updated_at)
      VALUES ('307056', 'The Matrix Collection', 'the matrix collection',
        'https://www.blu-ray.com/movies/The-Matrix-Collection-Blu-ray/307056/', '4K UHD',
        'old-fingerprint', 'review:1', 'resolved', 1, ?, ?, ?)`,
    )
      .bind(now.toISOString(), now.toISOString(), now.toISOString())
      .run();
    await repository.ensureDay("2026-08-16", 0, now);
    const run = await repository.createRun("review-discovery-run", "2026-08-16", "manual", now);
    const changed = {
      ...release("307056"),
      sourceTitle: "The Matrix Collection — Updated",
      fingerprint: "new-fingerprint",
    };
    await repository.saveIncrementalDiscovery(run.id, [changed], now);

    const stored = await env.DB.prepare(
      `SELECT mapping_status AS mappingStatus, mapping_revision AS mappingRevision,
              source_fingerprint AS fingerprint
       FROM source_releases WHERE product_id = '307056'`,
    ).first<{ mappingStatus: string; mappingRevision: string; fingerprint: string }>();
    expect(stored).toEqual({
      mappingStatus: "resolved",
      mappingRevision: "review:1",
      fingerprint: "new-fingerprint",
    });
  });
});
