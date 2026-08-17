# Open-source release and maintenance checklist

This public repository began from a reviewed clean history. Do not import predecessor repositories,
reflogs, bundles, unreachable objects, private backups, or development-only Git history. Future
pushes, releases, publication changes, and repository-setting changes require explicit owner
approval for that action.

## Prepare a clean repository

1. Complete local work without committing or pushing until the owner approves the reviewed diff.
2. Run `npm run cf-typegen`, `npm run licenses:report`, `npm run check:public`, and
   `npm run deploy:dry-run`.
3. Review `git status --short`, the complete diff, `npm pack --dry-run`, and the built browser bundle.
4. Confirm `.dev.vars`, generated bindings, Wrangler state, build output, coverage, CPU profiles,
   personal emails, local paths, real collection identifiers, and all tokens are absent.
5. Keep every public commit scoped to the reviewed working tree. If the repository is ever replaced,
   create the replacement only after explicit approval and use a clean reviewed history.
6. Verify release artifacts and Git objects contain no unexpected files or inherited private history.

## Configure GitHub before publication

- Enable secret scanning and push protection.
- Enable Dependabot alerts and security updates.
- Enable CodeQL default setup for JavaScript/TypeScript.
- Enable private vulnerability reporting.
- Protect `main`: require pull requests, CI, conversation resolution, and no force pushes or deletion.
- Restrict Actions permissions to read-only by default and allow only required actions.
- Confirm issue and pull-request templates contain synthetic examples only.

## Final human gates

- Approve the exact files and MIT copyright holder.
- Approve any repository name, ownership, or visibility change separately.
- Approve each commit/push or release action requested from an automated agent.
- Keep Cloudflare secrets and deployment authorization separate from source publication.
- After publication, search the public repository and release artifacts for the three binding names,
  numeric collection URLs, personal contact data, and token-like strings; rotate any exposed value.
