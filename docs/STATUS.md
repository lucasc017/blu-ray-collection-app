# Status

Last updated: 2026-08-15

## Implemented

- React/Vite SPA and Hono Worker foundation with generated Cloudflare bindings.
- D1 schema for titles, releases, ownership, schedules, runs, and issues.
- Bounded public collection parser, reviewed set overrides, conservative TMDB client, and resumable daily sync engine.
- Public list/detail/status APIs and protected manual sync route.
- Responsive collection, movie/TV-season detail, error states, and TMDB credits.
- Browser and Workerd/D1 test foundations plus GitHub CI.
- Production D1 database provisioned in Eastern North America with the initial migration applied.
- Collection source stored as a Worker-only secret with strict Blu-ray.com URL validation before sync state changes.
- Source-release links validated during import, API reads, and browser rendering.
- Static and API security headers, a restrictive CSP, local fonts, and a locally bundled TMDB credit logo.
- MIT project license, dependency-license review, public-safety scans, npm audit gate, pinned CI actions, and Dependabot configuration.
- Public security, privacy, deployment, and clean-repository release guidance for open-source publication.
- Clean public GitHub source history designed to begin with one reviewed root commit.

## Remaining deployment work

- Add all three real values, including `BLURAY_COLLECTION_URL`, to local `.dev.vars` and run a live local bootstrap.
- Set production secrets and deploy.
- Review actual unresolved mappings and add verified product-ID overrides where appropriate.
- Observe a completed scheduled run on `workers.dev` and record measured CPU/fetch behavior.
- Keep GitHub secret scanning, push protection, CodeQL, Dependabot, private vulnerability reporting, CI, and protected-branch settings enabled.
- Obtain explicit owner approval before future pushes, deployments, or repository-setting changes.
