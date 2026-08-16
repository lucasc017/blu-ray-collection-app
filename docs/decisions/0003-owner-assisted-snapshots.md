# ADR 0003: Owner-assisted collection snapshots

Status: Superseded as the primary discovery path by ADR 0004. The snapshot workflow remains an authoritative fallback.

## Decision

Replace Worker-side Blu-ray.com collection fetching with an owner-assisted import. The owner saves every collection page in a normal browser and runs a local script. The script verifies pagination completeness, extracts only release attributes, and sends a bounded manifest to an authenticated Worker endpoint. The Worker validates every entry before updating D1; Cron only resumes active TMDB enrichment.

## Rationale

The public collection is readable in an ordinary browser, but automated HTTP clients receive either an HTTP rejection or a non-collection response. Puppeteer and Playwright can render pages and return HTML, but changing the HTTP client does not grant access or guarantee that the origin will accept a headless browser. Owner-saved HTML uses the existing parser inputs without impersonation, cookies, source credentials, or a new hosted browser service.

## Consequences

- Collection discovery is user-initiated rather than fully automatic.
- The collection URL remains an ignored local value and Worker secret and is never uploaded in the manifest.
- Raw HTML remains local; only validated public release metadata reaches the Worker.
- Partial snapshots are rejected before D1 ownership can be deactivated.
