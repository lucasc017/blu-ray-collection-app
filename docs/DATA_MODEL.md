# Data Model

- `titles` contains cached movie or TV-season metadata used by both owned collection entries and movie recommendations. The unique identity is `(media_type, tmdb_id, season_number)`; movies use season `-1`.
- `title_genres` stores TMDB genre IDs and names for filtering.
- `source_releases` represents physical Blu-ray.com products and their active/mapping state.
- `source_release_titles` supports duplicate editions and one-to-many box-set expansion.
- `sync_days` stores the randomly selected Eastern-time slot and the current lease.
- `sync_runs` stores phase, cursor, counters, status, and safe error summary.
- `sync_issues` records unresolved or ambiguous mapping work.
- `app_users` stores the stable local user ID, case-insensitive email, current Cloudflare Access subject, and creation/last-seen timestamps for identities already admitted by the external allowlist.
- `release_mapping_revisions` stores immutable, per-product administrator decisions, actor snapshots, originating issues, and supersession timestamps. A partial unique index permits only one active revision per product.
- `release_mapping_review_targets` stores the ordered movie or TV-season targets for each revision and supports one-to-many box-set mappings.
- `movie_recommendations` stores one unique recommended movie, its creator, creation timestamp, and permanent fulfillment timestamp.
- `movie_recommendation_endorsements` stores one endorsement per recommendation and application user. Endorsements cascade when a recommendation is deleted.

A title is displayed as owned only while at least one active source release links to it. An unfulfilled recommendation is displayed only while at least one endorsement remains. Source releases are soft-deactivated rather than deleted. Metadata is cached for 30 days and may be refreshed independently of ownership discovery. Once ownership is established, the matching recommendation receives `fulfilled_at` and never becomes active again. `app_users` is not an authorization allowlist; Cloudflare Access remains the admission authority and the `ADMIN_EMAIL` binding grants the single application administrator role. Review actor labels remain as audit snapshots if an application-user row is later removed.

All schema evolution uses ordered SQL migrations. Existing migration files are immutable after deployment.
