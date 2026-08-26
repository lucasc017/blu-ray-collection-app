# Product

## Goal

Give approved friends a polished, private way to browse the owner’s physical movie and television collection without using Blu-ray.com as the browsing experience or maintaining a custom password system.

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

## Not in V1

Passwords, email verification, account recovery, in-app allowlist management, suggestions, ratings, watch history, comments, admin screens, custom domains, and live external lookups during user requests are deferred.

## Success criteria

The site remains usable while sync is in progress, every discovered source release is either mapped or recorded as an issue, partial external failures preserve prior ownership, unapproved identities are denied before application data is served, and no provider or Access credential reaches Git, logs, APIs, or browser code.
