# Data Model

- `titles` contains displayable movie or TV-season metadata. The unique identity is `(media_type, tmdb_id, season_number)`; movies use season `-1`.
- `title_genres` stores TMDB genre IDs and names for filtering.
- `source_releases` represents physical Blu-ray.com products and their active/mapping state.
- `source_release_titles` supports duplicate editions and one-to-many box-set expansion.
- `sync_days` stores the randomly selected Eastern-time slot and the current lease.
- `sync_runs` stores phase, cursor, counters, status, and safe error summary.
- `sync_issues` records unresolved or ambiguous mapping work.

A title is publicly owned only while at least one active source release links to it. Source releases are soft-deactivated rather than deleted. Metadata is cached for 30 days and may be refreshed independently of ownership discovery.

All schema evolution uses ordered SQL migrations. Existing migration files are immutable after deployment.
