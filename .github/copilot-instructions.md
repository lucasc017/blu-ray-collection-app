# Copilot Instructions

Read root and nearest nested `AGENTS.md` files plus `docs/AI_DEVELOPMENT.md` before proposing code. This repository is a TypeScript React/Vite SPA and Hono Cloudflare Worker backed by D1. Read `docs/STATUS.md` before assuming whether a milestone is complete.

- D1 is the source of truth; public requests never call external providers.
- Use shared contracts instead of duplicating API types.
- Never hand-write Worker bindings or expose secrets through `VITE_` variables.
- Use prepared D1 statements and validate request parameters.
- Preserve resumable, bounded sync behavior and the last successful snapshot on partial failure.
- TV entries are season-specific and box sets may map one source release to many titles.
- Add tests and update docs/status with behavior changes.
- Treat `npm run check` as the required completion gate; it includes public-safety and dependency-license checks.
- Never commit, push, deploy, change repository visibility, or modify remote settings unless the human explicitly authorizes that exact action.
- Do not add personal email addresses, local filesystem paths, secrets, or real collection identifiers to source, tests, fixtures, docs, logs, or bundles.
- Production deploys are manual; CI is validation-only. Remote migrations, imports/exports, secret changes, rollbacks, routes, and domains each require explicit authorization.
- Follow `docs/DEPLOYMENT.md` for any authorized production action. Never inspect `.dev.vars`, use it directly as a deployment secrets file, expose a temporary D1 export URL, or assume code rollback restores D1.
- Treat generated `dist/blu_ray_collection_app/.dev.vars` as sensitive build output and verify it is absent from Wrangler's uploaded modules and assets.
