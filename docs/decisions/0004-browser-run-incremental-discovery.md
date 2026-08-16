# ADR 0004: Browser Run incremental discovery

## Decision

Use the configured Cloudflare Browser Run binding for automatic collection discovery. Normalize the secret collection URL to the category 7 `recentlyaddedcollection` view. Starting at page 0, request the next numbered page only when every physical release on the current page is absent from D1. Stop when any release is already known or when the declared last page is reached.

Keep the owner-assisted full-snapshot endpoint as a fallback for authoritative replacements. Browser discovery performs incremental upserts and never deactivates releases that were not scanned; only a validated complete snapshot may deactivate missing releases.

## Rationale

A hosted Chromium smoke test loaded the collection successfully and exposed the server-rendered `data-productid`, title, category, release URL, and pagination attributes. Recently-added ordering makes the newest prefix sufficient for routine additions. Checking D1 before deciding whether to continue avoids scanning the full collection after the initial bootstrap.

## Consequences

- The first import of an empty database traverses every declared page, subject to the 20-page and external-fetch limits.
- Routine imports usually load one page and include every newly discovered release on that page.
- If an entire page is new, discovery continues because older known releases may have moved to the next page.
- Incremental discovery cannot infer removals; the complete owner-snapshot workflow remains available for that operation.
- Browser sessions are closed in all success and failure paths, subresources are aborted, and no source credentials or cookies are supplied.
- The package install overrides Cloudflare Puppeteer's unused local-browser download helper to `@puppeteer/browsers` 3.0.4, removing its vulnerable `extract-zip` dependency. The Worker uses Cloudflare's binding-backed launcher and never downloads Chromium; remove the override after Cloudflare updates its pin.
