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

## Production impact

- [ ] Deployment is not part of this pull request and requires separate owner authorization
- [ ] Any forward-only migration and code compatibility order are documented
- [ ] Smoke-test and rollback steps follow `docs/DEPLOYMENT.md`
- [ ] No production export, operator identity, account ID, private URL, or deployment secret is attached

State the expected Worker/D1/Cron impact, or write “Not applicable.”
