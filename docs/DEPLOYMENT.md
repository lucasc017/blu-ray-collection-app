# Deployment

## Local

1. Copy `.dev.vars.example` to ignored `.dev.vars` and provide all three Worker-only secrets. `BLURAY_COLLECTION_URL` must be a valid HTTPS Blu-ray.com category 7 collection URL.
2. Run `npm run cf-typegen` and `npm run db:migrate:local`.
3. Run `npm run dev`; use the protected route or scheduled test handler for imports.

## Production

1. Confirm `npx wrangler whoami` shows the intended Cloudflare account.
2. Create `blu-ray-collection-db` once and commit only its non-secret ID in `wrangler.jsonc`. Every fork must replace the example project ID with the ID returned for its own account.
3. Apply remote migrations before serving traffic.
4. Set `BLURAY_COLLECTION_URL`, `TMDB_READ_ACCESS_TOKEN`, and `SYNC_ADMIN_TOKEN` with separate interactive `wrangler secret put` prompts.
5. Run `npm run check:public` and `npm run deploy:dry-run`, then deploy.
6. Run one protected batch, inspect `/api/status`, and use `wrangler tail` to confirm structured logs.
7. Allow later Cron invocations to resume bootstrap until the run completes.

Rollback application code with Wrangler versions. Before risky schema work, export D1. Never delete or recreate the production database as a rollback strategy.

GitHub Actions validates only; it has no Cloudflare or provider secrets and does not deploy V1.

Runtime startup treats the configured collection URL and both tokens as required. The sync engine
rejects placeholders, short tokens, credentials embedded in URLs, non-HTTPS source URLs, custom
ports, and unexpected source or TMDB hosts before writing scheduling state. Never echo secret values
in a terminal recording, CI output, issue, or pull request.

Publishing the source and deploying the Worker are separate approvals. Follow
`docs/OPEN_SOURCE_RELEASE.md` before changing repository visibility or creating the public remote.
