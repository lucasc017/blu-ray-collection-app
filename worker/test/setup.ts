import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sync_issues"),
    env.DB.prepare("DELETE FROM source_release_titles"),
    env.DB.prepare("DELETE FROM title_genres"),
    env.DB.prepare("DELETE FROM sync_days"),
    env.DB.prepare("DELETE FROM source_releases"),
    env.DB.prepare("DELETE FROM titles"),
    env.DB.prepare("DELETE FROM sync_runs"),
  ]);
});
