## Summary

Describe the user-visible or operational outcome.

## Validation

- [ ] `npm run cf-typegen` was run after binding changes
- [ ] `npm run check` passes
- [ ] `npm run deploy:dry-run` passes for Worker/config changes
- [ ] New behavior has tests
- [ ] Documentation and `docs/STATUS.md` are current
- [ ] No secrets, `.dev.vars`, or provider authorization data are included

## Data and sync safety

Describe migrations, external-request behavior, permission assumptions, and how prior collection data is preserved on failure. Write “Not applicable” when appropriate.
