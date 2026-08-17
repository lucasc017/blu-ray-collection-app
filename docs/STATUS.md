# Status

Last updated: 2026-08-16

## Implemented

- React/Vite SPA and Hono Worker foundation with generated Cloudflare bindings.
- D1 schema for titles, releases, ownership, schedules, runs, and issues.
- Bounded Browser Run discovery, owner-snapshot fallback, reviewed set overrides, conservative TMDB client, and resumable sync engine.
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
- Production homepage, public status/list APIs, security headers, structured completion logs,
  deployment/version metadata, and a private post-import D1 export verified.
- Canonical production runbook and AI development/deployment guidance added for repeatable future
  sessions.

## Remaining operational work

- Review the 19 initial unresolved mappings and add verified product-ID overrides where appropriate.
- Observe a completed Cron-initiated daily run on `workers.dev` and record measured CPU/fetch behavior.
- Keep GitHub secret scanning, push protection, CodeQL, Dependabot, private vulnerability reporting, CI, and protected-branch settings enabled.
- Obtain explicit owner approval before future pushes, deployments, or repository-setting changes.
