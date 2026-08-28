# Status

Last updated: 2026-08-27

## Implemented

- React/Vite SPA and Hono Worker foundation with generated Cloudflare bindings.
- D1 schema for titles, releases, ownership, schedules, runs, and issues.
- Bounded Browser Run discovery, owner-snapshot fallback, reviewed product mappings, conservative TMDB client, and resumable sync engine.
- Public list/detail/status APIs and protected manual sync route.
- Responsive collection, movie/TV-season detail, error states, and TMDB credits.
- Browser and Workerd/D1 test foundations plus GitHub CI.
- Production D1 database provisioned in Eastern North America with the initial migration applied.
- Collection source stored as a Worker-only secret with strict Blu-ray.com URL validation before sync state changes.
- Owner-assisted HTML importer with pagination completeness checks and a protected, bounded manifest endpoint.
- Recently-added incremental pagination that continues only across entirely new pages and preserves all older D1 releases.
- Source-release links validated during import, API reads, and browser rendering.
- Static and API security headers, a restrictive CSP, local fonts, and a locally bundled TMDB credit logo.
- MIT project license, dependency-license review, public-safety scans, npm audit gate, pinned CI actions, and Dependabot configuration.
- Public security, privacy, deployment, and clean-repository release guidance for open-source publication.
- Clean public GitHub source history designed to begin with one reviewed root commit.
- Production Worker deployed at `https://blu-ray-collection-app.blu-ray-collection-app.workers.dev`
  with the D1, Browser Run, static-assets, observability, and 15-minute Cron bindings active.
- Three required production secrets installed as hidden Worker bindings; local-only
  `SYNC_IMPORT_URL` is not a production binding.
- Initial production Browser Run import completed across six bounded invocations: 106 active source
  releases, 87 resolved releases, 19 unresolved issues, and 113 public title entries.
- Production homepage, authenticated status/list APIs, security headers, structured completion logs,
  deployment/version metadata, and a private post-import D1 export verified.
- Canonical production runbook and AI development/deployment guidance added for repeatable future
  sessions.
- Whole-host Cloudflare Access deployed with Google exact-email admission, seven-day sessions,
  rotating-JWKS Worker verification, strict user/service principal separation, and disabled preview URLs.
- Migration `0002_access_users.sql`, session bootstrap, Access sign-out, and the remote importer
  service-token path deployed and verified; remote D1 reports no earlier pending migrations.

## Implemented locally, pending production rollout

- `ADMIN_EMAIL` authorization layered on the existing verified Access user identity; ordinary users
  and service principals cannot read or mutate `/api/admin/*`.
- Administrator-only `/admin/review` UI with unresolved/history queues, live movie/TV TMDB search,
  TV season selection, ordered box-set mappings, confirmation, defer, and remapping.
- Forward migration `0003_metadata_reviews.sql` with immutable audit revisions, ordered targets,
  one-active-revision enforcement, and migration of the ten reviewed code overrides into D1.
- Atomic metadata/mapping saves with expected-state conflict detection, actor attribution, retained
  history, and `409` stale-review handling.
- Sync precedence and write-time guards that preserve active reviewed mappings across discovery
  changes and prevent automatic resolution/issues from clobbering an administrator decision.
- Browser, Worker, D1, migration, authorization, remap, stale-write, and sync-race coverage.

This implementation did not install `ADMIN_EMAIL`, apply migration `0003`, deploy a Worker version,
or mutate production review data. Those remain distinct owner-authorized production actions.

## Remaining operational work

- Install `ADMIN_EMAIL`, privately back up D1 if desired, apply migration `0003`, deploy the validated
  build, and run admin/non-admin/service-principal smoke tests as distinct authorized operations.
- Review the unresolved mappings through the new administrator screen after rollout.
- Observe a completed Cron-initiated daily run on `workers.dev` and record measured CPU/fetch behavior.
- Keep GitHub secret scanning, push protection, CodeQL, Dependabot, private vulnerability reporting, CI, and protected-branch settings enabled.
- Obtain explicit owner approval before future pushes, deployments, or repository-setting changes.
