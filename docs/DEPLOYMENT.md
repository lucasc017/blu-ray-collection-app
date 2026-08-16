# Production deployment and operations

This is the canonical production runbook. The application is deployed manually to Cloudflare
Workers; GitHub Actions validates changes but has no deployment credentials and never publishes.

## Production topology

| Resource             | Value                                                                |
| -------------------- | -------------------------------------------------------------------- |
| Worker               | `blu-ray-collection-app`                                             |
| Public URL           | `https://blu-ray-collection-app.blu-ray-collection-app.workers.dev`  |
| D1 database          | `blu-ray-collection-db` through binding `DB`                         |
| Browser automation   | Cloudflare Browser Run through binding `BROWSER`                     |
| Schedule             | Cron every 15 minutes; D1 selects at most one daily Eastern-time run |
| Configuration source | `wrangler.jsonc` plus generated `worker-configuration.d.ts`          |

The three production secrets are `BLURAY_COLLECTION_URL`, `TMDB_READ_ACCESS_TOKEN`, and
`SYNC_ADMIN_TOKEN`. Their names are public configuration; their values are not. `SYNC_IMPORT_URL` is
local tooling configuration and must not be uploaded as a Worker secret.

## Authorization and safety gates

Deploying, applying remote migrations, changing secrets, starting a production import, exporting
production data, or rolling back changes external state. A human owner must explicitly authorize
the exact action in the current task before a person or AI agent performs it.

Before any production mutation:

1. Read `AGENTS.md` and confirm the requested action is authorized.
2. Start from the intended clean commit. Normally this is an up-to-date `main` after an approved PR.
3. Confirm `npx wrangler whoami` identifies the intended Cloudflare account. Do not copy its email or
   account identifier into documentation, issues, or logs.
4. Never open, print, diff, or paste `.dev.vars`. Never put a secret value in a command argument,
   terminal transcript, issue, pull request, or AI message.
5. Never delete, recreate, reset, or replace the production D1 database as a deployment or rollback
   technique.

## Release validation

Run from the repository root:

```powershell
npm ci
npm run cf-typegen:check
npm run check:public
npm run deploy:dry-run
npx wrangler check startup
npx wrangler d1 migrations list blu-ray-collection-db --remote
git status --short --branch
```

`npm run check:public` runs formatting, linting, type checks, browser and Worker tests, a production
build, the public-safety scan, license checks, the high-severity dependency audit, and an npm package
preview. Remove the ignored `worker-startup.cpuprofile` created by startup profiling before the
final Git status check.

The Cloudflare Vite plugin redirects Wrangler to a generated configuration under `dist/`. A build
also creates `dist/blu_ray_collection_app/.dev.vars` for local Worker tooling. Do not open or copy
that file. It is excluded by the generated `.assetsignore` and is not an uploaded static asset;
still review Wrangler's asset/module list and fail the release if any secret file appears there.

## First deployment for a new Cloudflare account or fork

These steps are provisioning steps, not routine releases:

1. Authenticate with Wrangler and register the account's `workers.dev` subdomain if Cloudflare asks.
2. Create a D1 database with `npx wrangler d1 create blu-ray-collection-db` and replace the committed
   database ID in `wrangler.jsonc` with the new account's non-secret ID.
3. Regenerate bindings and apply the schema:

   ```powershell
   npm run cf-typegen
   npm run db:migrate:remote
   ```

4. Create a temporary `.env` or JSON secrets file **outside the repository** containing only the
   three required production secrets. Populate it through a secure editor or secret store; do not
   construct it with `echo` or include values in shell history.
5. Build and perform the initial upload with the secrets attached:

   ```powershell
   npm run build
   npx wrangler deploy --strict --secrets-file "<temporary-secret-file>" --tag initial-production --message "Initial production deployment"
   ```

6. Delete the temporary secrets file in a `finally`/cleanup step even if deployment fails. For an AI
   session, use a subprocess that loads local environment variables without printing them, writes
   only the three required keys to an operating-system temporary directory, invokes Wrangler with
   `shell: false`, and removes the directory before returning.
7. Confirm `npx wrangler secret list` reports the three expected names. This command does not reveal
   their values.

The first `workers.dev` hostname may resolve before its TLS certificate is ready. A handshake error
immediately after a successful first deployment can be transient; wait briefly and retry before
changing configuration.

## Routine production deployment

1. Record the currently active version for rollback:

   ```powershell
   npx wrangler deployments list
   npx wrangler versions list
   ```

2. If the release contains a new migration, review it as forward-only and backward-compatible. For
   risky data changes, export D1 to a private path outside the repository before applying it:

   ```powershell
   npx wrangler d1 export blu-ray-collection-db --remote --output "<private-path>\blu-ray-collection-db-before-release.sql"
   npm run db:migrate:remote
   ```

   A D1 export can briefly affect query availability. Never commit an export; it contains private
   collection data. Wrangler prints a temporary signed download URL while exporting. An AI-run
   export must suppress or redact that command output and report only the private destination and
   success/failure state.

3. Deploy the validated build. Existing Worker secrets are preserved when omitted:

   ```powershell
   npm run deploy -- --strict --tag release-YYYY-MM-DD --message "Describe the approved release"
   ```

4. Save the version ID printed by Wrangler in the release record or pull request. Do not record
   operator email addresses or account IDs.

## Smoke test

After deployment, verify the public surface before starting an import:

```powershell
$productionUrl = "https://blu-ray-collection-app.blu-ray-collection-app.workers.dev"
Invoke-WebRequest $productionUrl -Method Head
Invoke-RestMethod "$productionUrl/api/status"
Invoke-RestMethod "$productionUrl/api/titles?page=1&pageSize=1"
npx wrangler secret list
npx wrangler deployments list
```

Expected results:

- `/` returns HTML with the configured security headers.
- `/api/status` and `/api/titles` return JSON and HTTP 200.
- The internal sync route returns 401 when called without authorization.
- The secret list contains exactly the required secret names; no values are printed.
- Deployment output lists `DB`, `BROWSER`, the public variables, the `workers.dev` URL, and the
  `*/15 * * * *` trigger.

Use `npx wrangler tail blu-ray-collection-app --format pretty` only for a bounded observation window,
then stop it. Logs may contain request IDs and run IDs, but must never contain source URLs, tokens,
authorization headers, or provider response bodies.

## Initial import or manual continuation

`POST /api/internal/sync` performs one bounded batch. The initial empty-database import normally
requires several calls because each invocation permits at most 40 external requests. Continue only
while the response is HTTP 200 with `status: "running"`; stop on `complete`, `failed`, `busy`, or a
non-2xx response. Report only HTTP status, phase, status, and aggregate counters. Do not print the
Bearer token, source URL, cursor, raw response errors, or authorization header.

An AI agent may load `SYNC_ADMIN_TOKEN` into a child process with Node's `--env-file=.dev.vars`
option without reading or displaying the file. The child process should call the fixed public URL,
set the header in memory, emit only the safe aggregate fields, and cap the loop at 12 invocations.
Starting this loop requires explicit production-import authorization.

After completion, verify:

- `/api/status` has a non-null `lastSuccessfulSyncAt` and non-zero title/release counts.
- `/api/titles?page=1&pageSize=3&sort=recently_added` returns displayable entries.
- D1 has one completed run and no running run.
- `state: "degraded"` is acceptable when unresolved mappings exist; it is not a deployment failure.
- A later Cron event resumes or starts work without a visitor request invoking either provider.

The owner-assisted HTML importer is only for a complete authoritative replacement that needs removal
detection. Follow `docs/DATA_SYNC.md`; never use a partial snapshot for that purpose.

## Rollback and incident handling

Application versions include code, assets, bindings, and compatibility configuration. They do not
version D1 data. To roll back code:

```powershell
npx wrangler deployments list
npx wrangler versions list
npx wrangler rollback <KNOWN_GOOD_VERSION_ID> --message "Reason for approved rollback"
```

Smoke-test again after rollback. Do not assume old code is compatible with a schema changed by a
newer deployment. Fix database problems with a reviewed forward migration or restore plan; never
edit an applied migration or reset production D1.

If a secret may have been exposed, stop, rotate it with `npx wrangler secret put <NAME>`, inspect Git
history, CI output, terminal recordings, logs, and deployments, then redeploy and retest. Do not paste
the compromised value into an issue or incident document.

## References

- [Cloudflare Wrangler deploy command](https://developers.cloudflare.com/workers/wrangler/commands/workers/#deploy)
- [Cloudflare Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare Workers versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Cloudflare Workers rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
