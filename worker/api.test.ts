import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

describe("public collection API", () => {
  beforeEach(async () => {
    const now = "2026-08-15T12:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO titles
        (media_type, tmdb_id, season_number, display_title, sort_title, overview,
         release_date, release_year, metadata_updated_at, created_at, updated_at)
        VALUES ('movie', 603, -1, 'The Matrix', 'matrix', 'A simulated reality.',
          '1999-03-31', 1999, ?, ?, ?)`,
      ).bind(now, now, now),
      env.DB.prepare(
        `INSERT INTO source_releases
        (product_id, source_title, normalized_title, source_url, format, source_fingerprint,
         mapping_revision, mapping_status, active, first_seen_at, last_seen_at, updated_at)
        VALUES ('307056', 'The Matrix 4K (1999)', 'the matrix',
          'https://www.blu-ray.com/movies/The-Matrix-4K-Blu-ray/307056/',
          '4K UHD', 'matrix', 'test', 'resolved', 1, ?, ?, ?)`,
      ).bind(now, now, now),
    ]);
    const title = await env.DB.prepare("SELECT id FROM titles WHERE tmdb_id = 603").first<{
      id: number;
    }>();
    if (!title) throw new Error("Seed title missing");
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO source_release_titles (product_id, title_id) VALUES ('307056', ?)",
      ).bind(title.id),
      env.DB.prepare(
        "INSERT INTO title_genres (title_id, tmdb_genre_id, name) VALUES (?, 878, 'Science Fiction')",
      ).bind(title.id),
    ]);
  });

  it("lists and retrieves owned titles", async () => {
    const listResponse = await SELF.fetch("https://example.com/api/titles?q=Matrix");
    expect(listResponse.status).toBe(200);
    expect(listResponse.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(listResponse.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    const list = await listResponse.json<{ total: number; items: Array<{ title: string }> }>();
    expect(list.total).toBe(1);
    expect(list.items[0]?.title).toBe("The Matrix");

    const detailResponse = await SELF.fetch("https://example.com/api/titles/movie/603");
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json<{
      releases: Array<{ format: string; sourceUrl: string }>;
    }>();
    expect(detail.releases[0]?.format).toBe("4K UHD");
    expect(detail.releases[0]?.sourceUrl).toBe(
      "https://www.blu-ray.com/movies/The-Matrix-4K-Blu-ray/307056/",
    );
  });

  it("does not return an unsafe release URL from storage", async () => {
    await env.DB.prepare(
      "UPDATE source_releases SET source_url = 'javascript:alert(1)' WHERE product_id = '307056'",
    ).run();
    const response = await SELF.fetch("https://example.com/api/titles/movie/603");
    const detail = await response.json<{ releases: unknown[] }>();
    expect(detail.releases).toEqual([]);
  });

  it("does not disclose the protected sync endpoint", async () => {
    const response = await SELF.fetch("https://example.com/api/internal/sync", { method: "POST" });
    expect(response.status).toBe(401);
    const body = await response.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("unauthorized");
  });

  it("imports a validated owner snapshot without exposing the collection URL", async () => {
    const response = await SELF.fetch("https://example.com/api/internal/collection-snapshot", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-sync-token-abcdefghijklmnopqrstuvwxyz-1234567890",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: 1,
        pageCount: 1,
        releases: [
          {
            productId: "271695",
            title: "21 Jump Street 4K (2012)",
            href: "https://www.blu-ray.com/movies/21-Jump-Street-4K-Blu-ray/271695/",
            categoryId: "7",
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json<{
      status: string;
      phase: string;
      counts: { releasesSeen: number; externalFetches: number };
    }>();
    expect(body).toMatchObject({
      status: "running",
      phase: "resolve",
      counts: { releasesSeen: 1, externalFetches: 0 },
    });
    expect(JSON.stringify(body)).not.toContain("community/collection.php");

    const release = await env.DB.prepare(
      "SELECT product_id, source_title, active FROM source_releases WHERE product_id = ?",
    )
      .bind("271695")
      .first<{ product_id: string; source_title: string; active: number }>();
    expect(release).toEqual({
      product_id: "271695",
      source_title: "21 Jump Street 4K (2012)",
      active: 1,
    });
  });

  it("rejects invalid or unauthenticated snapshot uploads", async () => {
    const unauthenticated = await SELF.fetch(
      "https://example.com/api/internal/collection-snapshot",
      { method: "POST" },
    );
    expect(unauthenticated.status).toBe(401);

    const invalid = await SELF.fetch("https://example.com/api/internal/collection-snapshot", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-sync-token-abcdefghijklmnopqrstuvwxyz-1234567890",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ version: 1, pageCount: 1, releases: [] }),
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json<{ error: { code: string } }>()).resolves.toMatchObject({
      error: { code: "invalid_snapshot" },
    });
  });
});
