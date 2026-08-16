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
});
