# Open-source release checklist

This repository is intended to begin with one reviewed root commit. Do not import predecessor
repositories, reflogs, bundles, unreachable objects, or development-only Git history into this
public repository. Future publication and repository-setting changes require explicit owner
approval.

## Prepare a clean repository

1. Complete local work without committing or pushing until the owner approves the reviewed diff.
2. Run `npm run cf-typegen`, `npm run licenses:report`, `npm run check:public`, and
   `npm run deploy:dry-run`.
3. Review `git status --short`, the complete diff, `npm pack --dry-run`, and the built browser bundle.
4. Confirm `.dev.vars`, generated bindings, Wrangler state, build output, coverage, CPU profiles,
   personal emails, local paths, real collection identifiers, and all tokens are absent.
5. For a new public release, create an empty GitHub repository only after explicit approval and build
   a clean root commit from the reviewed working tree.
6. Verify the repository has no unexpected objects or inherited history before publication.

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
- Approve the repository name, owner, and public visibility.
- Approve the initial commit and push separately.
- Keep Cloudflare secrets and deployment authorization separate from source publication.
- After publication, search the public repository and release artifacts for the three binding names,
  numeric collection URLs, personal contact data, and token-like strings; rotate any exposed value.
