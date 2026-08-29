# Production deployment and operations

This is the canonical production runbook. The application is deployed manually to Cloudflare
Workers; GitHub Actions validates changes but has no deployment credentials and never publishes.

## Production topology

| Resource             | Value                                                                |
| -------------------- | -------------------------------------------------------------------- |
| Worker               | `blu-ray-collection-app`                                             |
| Access-protected URL | `https://blu-ray-collection-app.blu-ray-collection-app.workers.dev`  |
| D1 database          | `blu-ray-collection-db` through binding `DB`                         |
| Browser automation   | Cloudflare Browser Run through binding `BROWSER`                     |
| Schedule             | Cron every 15 minutes; D1 selects at most one daily Eastern-time run |
| Configuration source | `wrangler.jsonc` plus generated `worker-configuration.d.ts`          |

The six required Worker secret bindings are `ADMIN_EMAIL`, `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`,
`BLURAY_COLLECTION_URL`, `TMDB_READ_ACCESS_TOKEN`, and `SYNC_ADMIN_TOKEN`. The Access audience and
team domain are configuration rather than credentials, while `ADMIN_EMAIL` identifies the only
application administrator. Hidden bindings keep all environment-specific identity settings out of source. `SYNC_IMPORT_URL`, `CF_ACCESS_CLIENT_ID`, and
`CF_ACCESS_CLIENT_SECRET` are local importer configuration and must not be uploaded as Worker secrets.

## Authorization and safety gates

Deploying, applying remote migrations, changing secrets, starting a production import, exporting
production data, changing Access applications/policies/service tokens, or rolling back changes
external state. A human owner must explicitly authorize
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

4. Complete the Cloudflare Access provisioning section below and obtain the team domain and
   application audience tag.
5. Create a temporary `.env` or JSON secrets file **outside the repository** containing only the
   six required Worker bindings. Populate it through a secure editor or secret store; do not
   construct it with `echo` or include values in shell history.
6. Build and perform the initial upload with the bindings attached:

   ```powershell
   npm run build
   npx wrangler deploy --strict --secrets-file "<temporary-secret-file>" --tag initial-production --message "Initial production deployment"
   ```

7. Delete the temporary secrets file in a `finally`/cleanup step even if deployment fails. For an AI
   session, use a subprocess that loads local environment variables without printing them, writes
   only the six required keys to an operating-system temporary directory, invokes Wrangler with
   `shell: false`, and removes the directory before returning.
8. Confirm `npx wrangler secret list` reports the six expected names. This command does not reveal
   their values.

The first `workers.dev` hostname may resolve before its TLS certificate is ready. A handshake error
immediately after a successful first deployment can be transient; wait briefly and retry before
changing configuration.

## One-time Cloudflare Access provisioning

This is an owner-administered security boundary. Do not automate or perform it without distinct
authorization for the Cloudflare changes.

1. In Cloudflare Zero Trust, add **Google** as the identity provider. Use the standard Google
   integration, which supports consumer Google accounts without requiring Google Workspace. Do not
   enable one-time PIN or another login method for this application.
2. Create a self-hosted Access application covering the entire production hostname, with no public
   path bypass. Set its application session duration to **7 days**.
3. Add a user policy with Action **Allow**, Include selector **Emails**, and one exact email value
   per approved person. Require Login Method **Google**. Never use `Everyone`, `Emails ending in`, or
   a domain wildcard for this allowlist. Access is deny-by-default for every identity not listed.
4. Ensure only the owner retains Cloudflare account permissions capable of editing Access policies,
   identity providers, or service tokens. Set the Worker-only `ADMIN_EMAIL` binding to the owner's
   exact Google email; the application review screen does not manage Access admission or admin roles.
5. Create one dedicated service token for the owner snapshot importer. Add a separate policy with
   Action **Service Auth**, Include selector **Service Token**, and that exact token. Store its Client
   ID and Client Secret locally as `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`.
6. Copy the Access team domain as its full HTTPS origin (for example,
   `https://your-team-name.cloudflareaccess.com`) and this application's audience (`AUD`) tag into
   the Worker bindings `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`. The Worker validates signature, issuer,
   audience, expiry, token type, and user/service claim shape for defense in depth.
7. Confirm `preview_urls` remains `false` in `wrangler.jsonc`; otherwise an unprotected versioned
   `workers.dev` hostname could bypass the intended application boundary.

Changing the exact-email list, the seven-day session, Google login method, or service token is a
separate production operation. Review the resulting policy before saving and test both an approved
and an unapproved Google account.

## Routine production deployment

1. Record the currently active version for rollback:

   ```powershell
   npx wrangler deployments list
   npx wrangler versions list
   ```

2. If `ADMIN_EMAIL` is not already installed, add it interactively with
   `npx wrangler secret put ADMIN_EMAIL`. Treat this as a separately authorized secret mutation and
   never pass the email in the command line or terminal transcript.

3. If the release contains a new migration, review it as forward-only and backward-compatible. For
   risky data changes, export D1 to a private path outside the repository before applying it:

   ```powershell
   npx wrangler d1 export blu-ray-collection-db --remote --output "<private-path>\blu-ray-collection-db-before-release.sql"
   npm run db:migrate:remote
   ```

   A D1 export can briefly affect query availability. Never commit an export; it contains private
   collection data. Wrangler prints a temporary signed download URL while exporting. An AI-run
   export must suppress or redact that command output and report only the private destination and
   success/failure state.

4. Deploy the validated build. Existing Worker secrets are preserved when omitted:

   ```powershell
   npm run deploy -- --strict --tag release-YYYY-MM-DD --message "Describe the approved release"
   ```

5. Save the version ID printed by Wrangler in the release record or pull request. Do not record
   operator email addresses or account IDs.

## Smoke test

After deployment, verify the protected surface before starting an import. Use an ordinary private
browser window for interactive checks; do not paste Access cookies or JWTs into the terminal:

```powershell
npx wrangler secret list
npx wrangler deployments list
```

Expected results:

- An anonymous private-browser request is redirected to or blocked by Cloudflare Access before any
  collection HTML or JSON is returned.
- An approved Google account can load `/`, `/api/status`, and `/api/titles`; React finishes the
  session bootstrap and the header contains **Sign out**.
- An approved Google account can load `/recommendations`, search for a movie, create or endorse a
  recommendation, withdraw that endorsement, and see only email usernames rather than full addresses.
- An approved non-admin account has no **Metadata review** navigation, receives the normal 404 UI
  for `/admin/review`, receives `403` from `/api/admin/*`, and has no recommendation Delete control.
- The `ADMIN_EMAIL` account can load `/admin/review`, list unresolved/history data, and perform a
  TMDB search. It can also confirm recommendation deletion. Treat the first production mapping save
  or recommendation delete as a separate reviewed D1 mutation.
- A Google account absent from the exact-email list is denied.
- The dedicated service token passes Access only for machine requests; the Worker still rejects an
  internal request that lacks the independent sync token.
- The secret list contains exactly the six required secret names; no values are printed.
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

An AI agent may load `SYNC_ADMIN_TOKEN`, `CF_ACCESS_CLIENT_ID`, and
`CF_ACCESS_CLIENT_SECRET` into a child process with Node's `--env-file=.dev.vars` option without
reading or displaying the file. The child process should call the fixed protected URL, set all three
authorization headers in memory, emit only the safe aggregate fields, and cap the loop at 12
invocations.
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
- [Cloudflare Access Google identity provider](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/)
- [Cloudflare Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Cloudflare Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Cloudflare Access service tokens](https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/)
