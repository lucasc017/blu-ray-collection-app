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
                           │                    │
                           ▼                    ▼
                 permitted collection         TMDB
```

The Vite Cloudflare plugin builds one Worker deployment that serves both the SPA and API. Static-asset SPA fallback handles React routes while `/api/*` runs the Worker first.

Visitor reads query D1 only. Cron and the protected internal route execute the same bounded sync engine. D1 persists daily schedules, leases, phase cursors, source snapshots, title metadata, ownership links, and issues, allowing any invocation to resume without process memory.

Shared TypeScript contracts define the API boundary. Provider-specific objects remain inside `worker/sync` and are converted before storage.
