# Testing

`npm run check` is the required local and CI gate. It checks formatting, typed ESLint rules,
TypeScript project references, browser tests, Workerd tests, the production build, source and browser
bundle safety, and dependency-license metadata. `npm run check:public` additionally runs the npm
high-severity vulnerability audit and previews the files that `npm pack` would include.

The browser suite covers shared routes, Access-aware request headers, session bootstrap, expired-session recovery, administrator navigation/route denial, the conflict search/confirmation/save workflow, and React behavior in jsdom. The Node suite also checks that remote imports require both Access service-token headers while loopback imports do not. The Worker suite uses Cloudflare’s Vitest pool with isolated D1 and real migrations. It covers JWT signature/issuer/audience and principal parsing, exact administrator-email matching, the exact loopback bypass, user upsert idempotence, review migration seeding, audited resolution/remapping, stale-write rejection, sync precedence, parsing, normalization, Eastern scheduling/DST, API reads, and protected-route behavior.

Sync changes should additionally test pagination bounds, duplicate products, override expansion, exact/ambiguous/no-match behavior, fetch exhaustion, retryable failure, lease recovery, idempotence, and non-deactivation after partial discovery. Authentication changes should cover invalid signature metadata, wrong route-class principals, local fail-closed behavior, and importer credential requirements. Database changes require a migration test and both local and dry-run production validation.

CI pins third-party actions to reviewed commit SHAs, checks the complete Git history with Gitleaks,
uses only synthetic configuration, and never receives deployment secrets. Run
`npm run licenses:report` whenever `package-lock.json` changes and review any newly introduced license
before adding it to the allowlist.

Before an authorized production deployment, additionally run `npm run cf-typegen:check`,
`npm run deploy:dry-run`, and `npx wrangler check startup`, then remove the ignored CPU profile that
the startup check creates. Follow `docs/DEPLOYMENT.md` for remote migration inspection, public smoke
Access policy checks, bounded log observation, and post-deploy verification. CI passing never authorizes deployment.
