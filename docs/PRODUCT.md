# Product

## Goal

Give approved friends a polished, private way to browse the owner’s physical movie and television collection and recommend future movie purchases without using Blu-ray.com as the browsing experience or maintaining a custom password system.

## V1 behavior

- Browse owned movies and exact owned TV seasons.
- Search by title and filter by media type, TMDB genre, and release year.
- Sort alphabetically, by release date, or by date added.
- Open a detail page showing synopsis, artwork, metadata, and the physical releases establishing ownership.
- Display collection freshness and unresolved metadata count without exposing operational errors.
- Discover newly added physical releases automatically through a bounded browser session, then resume metadata enrichment until complete.
- Import an owner-saved full collection snapshot through a protected local fallback when removals must be reconciled.
- Sign in through Google and admit only exact email addresses maintained by the owner in Cloudflare Access.
- Create or refresh a minimal D1 application-user record after Access admits a browser session.
- Let the one configured administrator resolve metadata conflicts through bounded live TMDB search, ordered movie/TV-season mappings, and retained revision history.
- Let signed-in users search TMDB for canonical movies, recommend one future purchase, see supporter usernames, and add or withdraw one endorsement per movie.
- Sort recommendations by newest, most endorsed, or title; permanently retire a recommendation when the movie becomes owned; let the administrator permanently delete recommendations.

## Not in V1

Passwords, email verification, account recovery, in-app allowlist or administrator management, ratings, watch history, comments, custom domains, bulk approvals, ignored/excluded releases, and raw metadata editing are deferred. Ordinary collection and recommendation reads remain D1-only; live external lookups are limited to bounded recommendation searches/validation and the administrator review workflow.

## Success criteria

The site remains usable while sync is in progress, every discovered source release is either mapped or recorded as an issue, reviewed mappings cannot be overwritten by automatic sync, partial external failures preserve prior ownership, recommendation votes stay unique per user and owned movies stay retired, non-admin users cannot read or mutate review data or delete recommendations, unapproved identities are denied before application data is served, and no provider or Access credential reaches Git, logs, APIs, or browser code.
