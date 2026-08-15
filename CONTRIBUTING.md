# Contributing

Use a focused branch, read all applicable `AGENTS.md` files, and keep changes within the documented V1 architecture. New behavior needs tests and relevant documentation updates.

Before opening a pull request:

```powershell
npm install
npm run cf-typegen
npm run check:public
npm run deploy:dry-run
```

Do not include local Wrangler state, generated bundles, `.dev.vars`, credentials, provider responses containing tokens, or unrelated formatting changes. Database changes require a new forward-only migration and a migration test.

Do not commit, push, deploy, publish, or change repository settings on behalf of the owner without
explicit authorization for that action. Keep examples synthetic. New dependencies must pass the
license allowlist and high-severity npm audit; update the generated license report when the lockfile
changes.
