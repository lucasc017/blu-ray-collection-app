# Product

## Goal

Give friends a polished, public way to browse the owner’s physical movie and television collection without using Blu-ray.com as the browsing experience.

## V1 behavior

- Browse owned movies and exact owned TV seasons.
- Search by title and filter by media type, TMDB genre, and release year.
- Sort alphabetically, by release date, or by date added.
- Open a detail page showing synopsis, artwork, metadata, and the physical releases establishing ownership.
- Display collection freshness and unresolved metadata count without exposing operational errors.
- Discover newly added physical releases automatically through a bounded browser session, then resume metadata enrichment until complete.
- Import an owner-saved full collection snapshot through a protected local fallback when removals must be reconciled.

## Not in V1

Accounts, suggestions, ratings, watch history, comments, admin screens, custom domains, and live external lookups during visitor requests are deferred.

## Success criteria

The site remains usable while sync is in progress, every discovered source release is either mapped or recorded as an issue, partial external failures preserve prior ownership, and no provider credential reaches Git, logs, APIs, or browser code.
