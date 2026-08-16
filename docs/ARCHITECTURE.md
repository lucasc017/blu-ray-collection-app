# Architecture

```text
Browser
  ├─ static React/Vite assets ───────────┐
  └─ same-origin /api requests ───────┐  │
                                      ▼  ▼
                           Cloudflare Worker + Hono
                                      │
                                      ▼
                                D1 source of truth
                                      ▲
                    Cron/manual sync coordinator
                    ▲          │              │
                    │          ▼              ▼
            owner snapshot  Browser Run      TMDB
```

The Vite Cloudflare plugin builds one Worker deployment that serves both the SPA and API. Static-asset SPA fallback handles React routes while `/api/*` runs the Worker first.

Visitor reads query D1 only. Cron and the protected route use a Browser Run binding to inspect the configured collection in recently-added order, then resume the same bounded enrichment engine. Discovery stops after the first page containing an existing product ID; its incremental upsert cannot deactivate older rows. A local script can still convert owner-saved HTML into a complete manifest for the protected internal route when an authoritative replacement is needed. D1 persists daily schedules, leases, phase cursors, release metadata, title metadata, ownership links, and issues, allowing any invocation to resume without process memory.

Shared TypeScript contracts define the API boundary. Provider-specific objects remain inside `worker/sync` and are converted before storage.
