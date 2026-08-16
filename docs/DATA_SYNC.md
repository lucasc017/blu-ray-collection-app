# Data Synchronization

## Phases

1. `discover`: open the collection through Cloudflare Browser Run in recently-added order and upsert an incremental prefix without deactivating older releases. An owner-generated full snapshot remains available for authoritative replacement and removal detection.
2. `resolve`: process pending releases in stable product-ID order. Reviewed overrides expand known sets and TV seasons. Other releases require one exact normalized TMDB movie/title-year match.
3. `refresh`: update owned TMDB metadata older than the configured TTL.
4. `finalize`: mark the run and Eastern day complete and release the lease.

Cron fires every 15 minutes in UTC. The engine calculates the `America/New_York` date and quarter-hour slot, and a new daily run starts at its selected slot. D1 prevents more than one completed run per local date and prevents overlap with a 20-minute recoverable lease.

Every outbound request and retry consumes the per-invocation budget, capped at 40. A budget or transient provider failure keeps the run resumable. Unexpected internal failures mark the run failed. A protected manual request bypasses the selected time but does not duplicate an already completed day.

`BLURAY_COLLECTION_URL` is a Worker secret so an open-source repository does not disclose the owner's collection. Validation requires the exact HTTPS collection path, an allowed Blu-ray.com host, and one numeric user ID. The Worker removes pagination and alternate-view parameters, enforces category 7, and selects `sortby=recentlyaddedcollection` without logging the resulting URL.

Browser discovery starts at page 0. For each page it extracts and validates the physical releases, asks D1 which product IDs already exist, and keeps the results in memory until the crawl reaches a safe stopping point. It requests the next page only when every release on the current page is new and the declared last page has not been reached. If any release is already known, it includes new releases from that page and stops. The final incremental upsert never deactivates an existing row, so a retry or an early stop cannot erase ownership. Browser subresources are aborted; each top-level navigation and every TMDB request consumes the bounded external-fetch budget.

The importer accepts only category 7 release links with numeric `data-productid`. Every discovered
link must use HTTPS, an exact Blu-ray.com host, no credentials or custom port, a `/movies/` path, and
a trailing product ID matching the parsed `data-productid`. Query strings and fragments are removed
before storage. Stored links are validated again at the API boundary and in the browser; invalid
legacy values are omitted rather than rendered as navigation targets.

Browser discovery rejects empty pages, missing pagination on a full first page, unsafe release links, and collections exceeding the 20-page safety limit. It never supplies source credentials or cookies. The fallback local importer still requires the base page and every declared numbered page, rejects empty or oversized files, and uploads at most 20 pages and 2,000 releases. The protected endpoint bounds the JSON body, validates every field and release URL, and never stores the raw HTML.
