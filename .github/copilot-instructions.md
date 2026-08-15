# Copilot Instructions

Read root and nearest nested `AGENTS.md` files before proposing code. This repository is a TypeScript React/Vite SPA and Hono Cloudflare Worker backed by D1.

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
