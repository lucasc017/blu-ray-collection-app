# API

All routes are same-origin under `/api`, return JSON, disable caching, and include `X-Request-Id`.
Production requests require a valid Cloudflare Access application assertion for the configured issuer
and audience. Browser routes accept only user assertions; internal routes accept only service-token
assertions. Exact local HTTP loopback requests use a development identity.

## Signed-in user routes

- `PUT /session`: idempotently creates or refreshes the D1 application-user record derived from the verified Access subject and email. Returns `{ id, email, createdAt, lastSeenAt }`.

- `GET /titles`: accepts `q` (100 characters), `type=movie|tv`, numeric `genre`, numeric `year`, `sort=title|release_date|recently_added`, `page`, and `pageSize` (maximum 60). Returns items, pagination, and available filters.
- `GET /titles/movie/:tmdbId`: returns one owned movie and its active releases.
- `GET /titles/tv/:tmdbId/season/:seasonNumber`: returns one owned TV season and its active releases.
- `GET /status`: returns collection counts, state, unresolved issue count, and last successful sync time.

## Internal route

- `POST /internal/sync`: requires an Access service principal plus `Authorization: Bearer <SYNC_ADMIN_TOKEN>` and performs one bounded sync batch. It returns run identity, phase, cursor, status, and counters. The token is compared as fixed-size SHA-256 digests in constant time.
- `POST /internal/collection-snapshot`: requires the same dual authorization and a bounded JSON manifest produced by `npm run import:collection`. It validates and stores release discovery data without accepting the collection URL or raw HTML.

Missing or invalid Access assertions return `401`; a valid principal used on the wrong route class returns `403`. Other errors use `{ "error": { "code", "message", "requestId" } }`. Provider responses, stack traces, identity claims, and operational details are never returned.
