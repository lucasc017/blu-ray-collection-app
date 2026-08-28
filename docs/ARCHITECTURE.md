# Architecture

```text
Google account ──► Cloudflare Access exact-email policy
                               │
                               ▼
Browser
  ├─ static React/Vite assets ───────────┐
  ├─ same-origin collection API ──────┐  │
  └─ owner-only review API ───────────┤  │
                                      ▼  ▼
                     Access JWT validation + Hono Worker
                                      │
                                      ▼
                                D1 source of truth
                                      ▲
                    Cron/manual sync coordinator
                    ▲          │              │
                    │          ▼              ▼
            owner snapshot  Browser Run      TMDB
```

The Vite Cloudflare plugin builds one Worker deployment that serves both the SPA and API. A Cloudflare Access self-hosted application protects the entire production hostname before either surface is served. Static-asset SPA fallback handles React routes while `/api/*` runs the Worker first.

Every API request independently verifies the `Cf-Access-Jwt-Assertion` signature, issuer, audience, expiry, and application-token type against Cloudflare's rotating JWKS. User principals may call collection and session routes; service-token principals may call only `/api/internal/*`. `/api/admin/*` additionally requires the normalized verified user email to match the `ADMIN_EMAIL` Worker secret, and service principals are always denied. Exact HTTP loopback development requests use a synthetic principal, while every non-loopback request without a valid assertion fails closed. `PUT /api/session` upserts a stable application-user row and returns the server-computed administrator flag before React renders the application.

Ordinary signed-in reads query D1 only. The administrator review route may perform bounded live TMDB search and target validation; the token never enters the browser. Cron and the protected route use a Browser Run binding to inspect the configured collection in recently-added order, then resume the same bounded enrichment engine. The remote owner importer must pass both its dedicated Access service token and the independent `SYNC_ADMIN_TOKEN`. Discovery stops after the first page containing an existing product ID; its incremental upsert cannot deactivate older rows. A local script can still convert owner-saved HTML into a complete manifest for the protected internal route when an authoritative replacement is needed. D1 persists users, review revisions, review targets, daily schedules, leases, phase cursors, release metadata, title metadata, ownership links, and issues, allowing any invocation to resume without request-specific process memory.

Shared TypeScript contracts define the API boundary. Provider-specific objects remain inside `worker/sync` and are converted before storage.
