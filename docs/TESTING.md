# Testing

`npm run check` is the required local and CI gate. It checks formatting, typed ESLint rules,
TypeScript project references, browser tests, Workerd tests, the production build, source and browser
bundle safety, and dependency-license metadata. `npm run check:public` additionally runs the npm
high-severity vulnerability audit and previews the files that `npm pack` would include.

The browser suite covers shared routes and React behavior in jsdom. The Worker suite uses Cloudflare’s Vitest pool with isolated D1 and real migrations. It covers parsing, normalization, Eastern scheduling/DST, API reads, and protected-route behavior.

Sync changes should additionally test pagination bounds, duplicate products, override expansion, exact/ambiguous/no-match behavior, fetch exhaustion, retryable failure, lease recovery, idempotence, and non-deactivation after partial discovery. Database changes require a migration test and both local and dry-run production validation.

CI pins third-party actions to reviewed commit SHAs, checks the complete Git history with Gitleaks,
uses only synthetic configuration, and never receives deployment secrets. Run
`npm run licenses:report` whenever `package-lock.json` changes and review any newly introduced license
before adding it to the allowlist.

Before an authorized production deployment, additionally run `npm run cf-typegen:check`,
`npm run deploy:dry-run`, and `npx wrangler check startup`, then remove the ignored CPU profile that
the startup check creates. Follow `docs/DEPLOYMENT.md` for remote migration inspection, public smoke
tests, bounded log observation, and post-deploy verification. CI passing never authorizes deployment.
