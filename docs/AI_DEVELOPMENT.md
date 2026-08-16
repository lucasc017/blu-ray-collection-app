# AI development guide

This guide complements `AGENTS.md`. It gives future AI-assisted sessions a fast, safe path into the
repository without replacing the binding instructions in the root or nested `AGENTS.md` files.

## Start every session here

1. Read the root `AGENTS.md` and the closest nested `AGENTS.md` for every file in scope.
2. Read `docs/STATUS.md` for the current production state and known follow-up work.
3. Inspect `git status --short --branch` before editing. Preserve unrelated human changes.
4. Use `rg` and `rg --files` to locate behavior. Treat code, shared contracts, Wrangler config, and
   migrations as the executable sources of truth.
5. Do not read, print, diff, summarize, or transmit `.dev.vars`. Secret names may be discussed;
   values, the configured collection URL, authorization headers, personal account details, and
   provider payloads may not.
6. Make the smallest coherent change, update affected documentation and `docs/STATUS.md`, then run
   the proportional validation listed below.

## Repository map

| Area             | Purpose                                                 | Additional instructions |
| ---------------- | ------------------------------------------------------- | ----------------------- |
| `src/`           | React UI, routes, same-origin API client                | `src/AGENTS.md`         |
| `shared/`        | API contracts shared by browser and Worker              | Root `AGENTS.md`        |
| `worker/`        | Hono API, D1 queries, security, scheduled handler       | `worker/AGENTS.md`      |
| `worker/sync/`   | Browser Run discovery, TMDB matching, resumable engine  | `worker/sync/AGENTS.md` |
| `migrations/`    | Ordered, forward-only D1 schema changes                 | Root `AGENTS.md`        |
| `scripts/`       | Local import, license, and safety tooling               | Root `AGENTS.md`        |
| `docs/`          | Product, architecture, operations, and decisions        | Root `AGENTS.md`        |
| `wrangler.jsonc` | Production bindings, public variables, assets, and Cron | Root `AGENTS.md`        |

## Architectural invariants

- One Cloudflare Worker serves the SPA and `/api/*`.
- Visitor requests read D1 only. Blu-ray.com and TMDB calls occur only in Cron or authenticated
  operator flows.
- D1 owns durable state, leases, cursors, issues, and cached metadata. Do not rely on module memory.
- Discovery is bounded and conservative. Incremental discovery never deactivates unseen releases;
  only a validated complete snapshot can reconcile removals.
- Every external request, including retries and Browser Run navigation, consumes the maximum-40
  invocation budget.
- API wire types live in `shared/contracts.ts`. Worker bindings are generated from `wrangler.jsonc`.
- TV ownership is season-level; one physical set may map to multiple titles.
- Uncertain matches become `sync_issues`; do not loosen matching to make the status green.

## Validation by change type

| Change                                    | Minimum focused checks                                                 | Completion gate                                         |
| ----------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| React/UI                                  | Relevant browser tests                                                 | `npm run check`                                         |
| API, D1 query, scheduler, parser, or sync | Relevant test plus `npm run test:worker`                               | `npm run check`                                         |
| `wrangler.jsonc` or bindings              | `npm run cf-typegen`, inspect generated diff, `npm run deploy:dry-run` | `npm run check:public`                                  |
| Migration                                 | New forward-only SQL file, migration test, local apply                 | `npm run check:public` and remote plan review           |
| Dependency or lockfile                    | `npm run licenses:report`, license review, audit                       | `npm run check:public`                                  |
| Documentation only                        | `npm run format:check` and link/command review                         | `npm run check:public` when release instructions change |

Do not weaken tests, scanners, validation, or safety limits to make a check pass. Diagnose the cause
and preserve the intended guardrail.

## Production boundaries

Production currently uses Worker `blu-ray-collection-app`, D1 database `blu-ray-collection-db`, a
Browser Run binding, and a 15-minute Cron trigger. The public URL and complete operating procedure
are in `docs/DEPLOYMENT.md`; discover the active version at runtime with Wrangler rather than copying
a version ID from old notes.

Read-only inspection is safe when relevant. The following actions require explicit human approval in
the current task: deploy, remote migration, secret creation/update/deletion, production import,
production export, rollback, route/domain change, D1 mutation, push, PR creation, or repository
settings changes. One approval does not imply another.

When deployment is authorized:

1. Follow `docs/DEPLOYMENT.md` exactly.
2. Keep CI validation-only unless the owner separately approves an automated deployment design and
   the required GitHub/Cloudflare credentials.
3. Never inspect `.dev.vars`. A process may load it directly into its environment when the approved
   operation requires a local secret, provided the process emits only sanitized aggregate results.
4. Use operating-system temporary storage for first-deploy secret transport, pass arguments without
   a shell, and delete the temporary directory in a `finally` step.
5. Treat the generated `dist/blu_ray_collection_app/.dev.vars` as sensitive build output. Do not open
   or copy it; verify Wrangler excludes it from both modules and static assets.
6. Capture the pre-deploy version, new version, validation results, public smoke-test results, and
   aggregate sync outcome. Do not capture operator identity, account IDs, tokens, private URLs, or
   raw provider data.

## Common traps

- `npm run build` uses the Cloudflare Vite plugin and creates redirected deployment configuration.
  Inspect the generated deployment summary, not secret files.
- A brand-new `workers.dev` hostname can resolve before TLS is ready. Retry briefly before treating
  the initial handshake failure as a configuration defect.
- `state: "degraded"` means unresolved mappings exist. It can coexist with a successful deployment
  and completed sync.
- Code rollback does not roll back D1. Applied migrations are immutable, and storage recovery needs
  an explicit forward or restore plan.
- The routine browser crawl is incremental and cannot detect removals. Use only a complete,
  owner-assisted snapshot for authoritative removal reconciliation.
- A manual sync call runs one bounded batch. Initial enrichment may require several explicitly
  authorized calls; cap automation and stop on any unexpected status.

## Handoff checklist

Before ending a session, report:

- the user-visible or operational outcome;
- files changed and any schema/config implications;
- focused and full validation run, including failures or skips;
- production actions actually performed versus merely documented;
- remaining risks, unresolved mappings, or follow-up work;
- a clean or intentionally dirty Git status without exposing unrelated file contents.

Do not commit, push, deploy, open a pull request, or change external settings unless that exact action
was explicitly authorized.
