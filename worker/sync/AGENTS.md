# Synchronization Instructions

- Never add collection sources without documented permission and an explicit product decision.
- Visitors must not invoke sync code; only Cron and the protected internal endpoint may call the engine.
- A discovery crawl must complete every discovered page before any release is deactivated.
- Sync steps must be idempotent and resumable from D1. Do not rely on module memory between invocations.
- Count every external request, including retries, against `FetchBudget`. The configured maximum may not exceed 40 in V1.
- Only exact, unambiguous normalized movie/year matches may be accepted automatically. Put uncertain releases in `sync_issues`.
- Box-set and TV-season overrides are keyed by stable Blu-ray product IDs and require review plus tests.
- Retry transient transport, `429`, and `5xx` failures without discarding the last successful data. Never log provider tokens.
