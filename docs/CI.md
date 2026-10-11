# CI and code scanning

GitHub Actions validates changes; production deployment remains the separately authorized manual
operation in [DEPLOYMENT.md](DEPLOYMENT.md).

## Required checks

Pull requests targeting `main` must report these checks:

- `Application validation`: formatting, lint, TypeScript, browser and Worker tests, build, public-safety
  scan, license review, dependency audit, package preview, and deployment dry-run.
- `Secret scan`: committed-secret scanning.
- `Analyze (javascript-typescript)`: CodeQL source analysis.

The advanced workflow also reports `Analyze (actions)` for GitHub Actions workflow analysis.
Keep the JavaScript/TypeScript job name aligned with branch protection.

## Advanced CodeQL workflow

[codeql.yml](../.github/workflows/codeql.yml) scans pull requests targeting `main`, pushes to `main`,
and the default branch every Wednesday at 03:21 UTC. It also supports manual dispatch.

Both language jobs use the `none` build mode, pinned actions, ephemeral GitHub-hosted runners,
and a checkout without persisted Git credentials. Analysis reads the checked-out source; it does
not install application dependencies or run application build scripts.

Fork pull requests use the ordinary `pull_request` event. They do not receive repository secrets;
GitHub restricts their token permissions and supports CodeQL result uploads for pull-request scans.
Keep fork write-token and secret access disabled. A first-time contributor's workflow may still need
approval under the repository's Actions policy.

## One-time migration from default setup

GitHub's default CodeQL setup excludes pull requests from forks. Requiring its analysis check blocks
fork PRs because the check is never scheduled. Default setup also rejects result uploads from an
advanced workflow, so the setup must be switched as part of adopting this file.

1. Prepare and review the workflow PR, and verify application validation and the secret scan.
2. As a repository administrator, open **Settings → Advanced Security → CodeQL analysis**.
   Open the configuration menu and disable the default CodeQL setup. The advanced workflow in this
   repository becomes the source of truth; do not generate a second CodeQL workflow.
3. Rerun the advanced workflow on the workflow PR. Confirm both language analyses upload results
   successfully and `Analyze (javascript-typescript)` satisfies the existing required check.
4. Merge the validated workflow PR into `main`.
5. Update any existing fork PR, including #20, with the new `main`. The resulting
   `synchronize` event schedules CodeQL using the new workflow.
6. Verify application validation, secret scanning, and JavaScript/TypeScript analysis on the latest
   fork commit before merging it.

Do not remove the required CodeQL check to work around a missing run. Approve a contributor's Actions
run when GitHub requests it, and diagnose failed analysis or result uploads before merging.

If the workflow PR reports that advanced results cannot be processed while default setup is enabled,
complete step 2 and rerun the failed CodeQL jobs. Repeating application CI alone does not create a
missing CodeQL scan.

See GitHub's [setup types](https://docs.github.com/en/code-security/concepts/code-scanning/setup-types)
and [advanced setup guide](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configuring-advanced-setup-for-code-scanning).
