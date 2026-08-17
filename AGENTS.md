# Agent Instructions

## Mission

Maintain a public, read-only physical media collection. D1 is the application source of truth; visitors must never trigger Blu-ray.com or TMDB calls. V1 has no accounts, suggestions, admin UI, or client-side secrets.

## Sources of truth

1. Executable behavior and shared contracts in `shared/`, `worker/`, and `src/`.
2. `wrangler.jsonc` for bindings, schedules, and non-secret configuration.
3. SQL files in `migrations/` for the database.
4. `docs/` for product intent and architectural rationale.
5. `docs/STATUS.md` for current progress and known gaps.
6. `docs/DEPLOYMENT.md` for the production release, import, verification, and rollback runbook.
7. `docs/AI_DEVELOPMENT.md` for session orientation and task-specific validation guidance.

If documentation and code disagree, verify behavior with tests, then update both in the same change.

## Required workflow

- Read the closest nested `AGENTS.md` before changing that area.
- Keep API wire shapes in `shared/contracts.ts` and update callers together.
- After `wrangler.jsonc` changes, run `npm run cf-typegen`; never hand-write `Env`.
- Add forward-only D1 migrations. Never edit an applied migration to change production state.
- Run `npm run check` before handoff. Use `npm run test:worker` for Worker, D1, parser, scheduler, or API changes.
- Keep commits scoped and update `docs/STATUS.md` for completed milestones or new blockers.
- Do not commit, push, deploy, create or publish a repository, change repository visibility, or alter remote settings unless the human explicitly authorizes that exact action in the current task.

## Production operations

- Production is a manually deployed Cloudflare Worker. GitHub Actions validates only and must not be given deployment secrets without a separately approved design change.
- Treat deploys, remote migrations, production imports/exports, secret changes, rollbacks, D1 mutations, routes, and domains as distinct external actions requiring explicit authorization in the current task.
- When authorized, follow `docs/DEPLOYMENT.md`; record the active version before deployment and smoke-test the public URL and API afterward.
- Routine deploys preserve existing Worker secrets. First-deploy secret transport must use an operating-system temporary file outside the repository, contain only the three required keys, and be deleted in a guaranteed cleanup step.
- Never use `.dev.vars` directly as a deployment secrets file because it also contains local tooling configuration. A subprocess may load it without printing values for an explicitly authorized operation.
- Treat D1 exports as private collection data. Store them outside the repository, never commit them, and never expose temporary download URLs.
- Code rollback does not roll back D1. Never edit an applied migration or reset production storage; use a reviewed forward migration or explicit restore plan.

## Security and reliability

- Never read, print, commit, or expose `.dev.vars`, collection source URLs, TMDB tokens, sync tokens, Cloudflare credentials, or authorization headers.
- Do not open or copy the generated `dist/blu_ray_collection_app/.dev.vars`; verify the generated `.assetsignore` and Wrangler upload summary exclude secret files.
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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
