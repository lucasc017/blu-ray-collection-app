# Security Policy

## Supported versions

| Version         | Supported |
| --------------- | --------- |
| Latest `main`   | Yes       |
| Older snapshots | No        |

## Reporting a vulnerability

Use GitHub private vulnerability reporting for security concerns. If that feature is temporarily
unavailable, contact the repository owner privately through their GitHub profile. Do not open a
public issue containing exploit details, credentials, a private collection URL, or personal
information.

Include the affected route or component, expected impact, reproduction steps using synthetic data,
and any suggested mitigation. You should receive an acknowledgment within seven days. No bounty or
safe-harbor program is currently offered.

## Secret handling

Never commit or share the private collection URL, TMDB tokens, sync admin tokens, Cloudflare
credentials, `.dev.vars`, or copied authorization headers. Production values belong in encrypted
Cloudflare Worker secrets; local values belong only in ignored `.dev.vars`. If a secret is exposed,
rotate it immediately and inspect Git history, CI artifacts, logs, and deployments before release.

The public API exposes collection metadata only. Blu-ray.com credentials are neither required nor
stored. The internal sync route remains protected by a long secret Bearer token and returns no sync
details to unauthorized callers.

Production D1 exports and locally saved collection HTML are private operational data even though
individual release metadata is publicly browseable. Store them outside the repository and never
attach them to issues, pull requests, CI artifacts, or releases. Treat generated
`dist/blu_ray_collection_app/.dev.vars` as sensitive build output; do not inspect or copy it, and
verify Wrangler excludes it from deployment uploads. Follow `docs/DEPLOYMENT.md` for rotation,
backup, rollback, and incident procedures.
