# Agent Instructions

## Mission

Maintain a public, read-only physical media collection. D1 is the application source of truth; visitors must never trigger Blu-ray.com or TMDB calls. V1 has no accounts, suggestions, admin UI, or client-side secrets.

## Sources of truth

1. Executable behavior and shared contracts in `shared/`, `worker/`, and `src/`.
2. `wrangler.jsonc` for bindings, schedules, and non-secret configuration.
3. SQL files in `migrations/` for the database.
4. `docs/` for product intent and architectural rationale.
5. `docs/STATUS.md` for current progress and known gaps.

If documentation and code disagree, verify behavior with tests, then update both in the same change.

## Required workflow

- Read the closest nested `AGENTS.md` before changing that area.
- Keep API wire shapes in `shared/contracts.ts` and update callers together.
- After `wrangler.jsonc` changes, run `npm run cf-typegen`; never hand-write `Env`.
- Add forward-only D1 migrations. Never edit an applied migration to change production state.
- Run `npm run check` before handoff. Use `npm run test:worker` for Worker, D1, parser, scheduler, or API changes.
- Keep commits scoped and update `docs/STATUS.md` for completed milestones or new blockers.
- Do not commit, push, deploy, create or publish a repository, change repository visibility, or alter remote settings unless the human explicitly authorizes that exact action in the current task.

## Security and reliability

- Never read, print, commit, or expose `.dev.vars`, collection source URLs, TMDB tokens, sync tokens, Cloudflare credentials, or authorization headers.
- Keep personal email addresses and local filesystem paths out of source and documentation. Use the configured GitHub no-reply identity for any later approved commits.
- Secrets are Worker bindings only. Never add a `VITE_` secret.
- Run `npm run security:scan` and `npm run license:check` as part of the completion gate. Do not weaken a scanner to make a finding disappear; remove the sensitive data or document a narrowly reviewed exception.
- Use prepared D1 statements and validated query parameters.
- Await every promise; do not use floating background work for essential synchronization.
- Do not keep request-specific mutable state at module scope.
- Bound external payload sizes, timeouts, retries, pagination, and fetch counts.
- Preserve the last successful collection on partial source failure. Only a complete discovery crawl may deactivate missing releases.
- The collection importer is permitted for this configured source. Do not broaden crawling scope or add login credentials.

## Architecture guardrails

- One Cloudflare Worker deployment serves both the Vite SPA and `/api/*`.
- D1 stores ownership, cached metadata, scheduling, leases, cursors, and issues.
- Scheduled work is resumable and stays within a 40-request invocation budget.
- TV ownership is season-level. Movie box sets expand to individual movies.
- Keep the browser thin: React Router, native fetch, URL-backed filters, and no global state library unless a demonstrated need is documented.
