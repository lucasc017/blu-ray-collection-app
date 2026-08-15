# API

All routes are same-origin under `/api`, return JSON, disable caching, and include `X-Request-Id`.

## Public routes

- `GET /titles`: accepts `q` (100 characters), `type=movie|tv`, numeric `genre`, numeric `year`, `sort=title|release_date|recently_added`, `page`, and `pageSize` (maximum 60). Returns items, pagination, and available filters.
- `GET /titles/movie/:tmdbId`: returns one owned movie and its active releases.
- `GET /titles/tv/:tmdbId/season/:seasonNumber`: returns one owned TV season and its active releases.
- `GET /status`: returns public counts, state, unresolved issue count, and last successful sync time.

## Internal route

- `POST /internal/sync`: requires `Authorization: Bearer <SYNC_ADMIN_TOKEN>` and performs one bounded sync batch. It returns run identity, phase, cursor, status, and counters. The token is compared in constant time.

Errors use `{ "error": { "code", "message", "requestId" } }`. Provider responses, stack traces, and operational details are never returned publicly.
