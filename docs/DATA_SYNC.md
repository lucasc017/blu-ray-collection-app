# Data Synchronization

## Phases

1. `discover`: fetch the collection index and all declared pages with `HTMLRewriter`; upsert the complete snapshot; only then deactivate unseen releases.
2. `resolve`: process pending releases in stable product-ID order. Reviewed overrides expand known sets and TV seasons. Other releases require one exact normalized TMDB movie/title-year match.
3. `refresh`: update owned TMDB metadata older than the configured TTL.
4. `finalize`: mark the run and Eastern day complete and release the lease.

Cron fires every 15 minutes in UTC. The engine calculates the `America/New_York` date and quarter-hour slot. Each day receives a cryptographically random slot from 0–95. D1 prevents more than one completed run per local date and prevents overlap with a 20-minute recoverable lease.

Every outbound request and retry consumes the per-invocation budget, capped at 40. A budget or transient provider failure keeps the run resumable. Unexpected internal failures mark the run failed. A protected manual request bypasses the selected time but does not duplicate an already completed day.

`BLURAY_COLLECTION_URL` is a Worker secret so an open-source repository does not disclose the owner's collection. Before any schedule, lease, or run is created, the engine requires HTTPS, an exact `blu-ray.com` or `www.blu-ray.com` host, the `/community/collection.php` path, a numeric `u` value, `categoryid=7`, no credentials, and no custom port.

The importer accepts only category 7 release links with numeric `data-productid`. Every discovered
link must use HTTPS, an exact Blu-ray.com host, no credentials or custom port, a `/movies/` path, and
a trailing product ID matching the parsed `data-productid`. Query strings and fragments are removed
before storage. Stored links are validated again at the API boundary and in the browser; invalid
legacy values are omitted rather than rendered as navigation targets.

Responses have content-type, page-count, byte-size, timeout, and pagination safety limits. Never add
source authentication or broaden the crawler without a new documented permission decision.
