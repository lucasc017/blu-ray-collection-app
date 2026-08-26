# Delivery Plan

1. **Complete — Foundation:** toolchain, Cloudflare/Vite configuration, generated bindings,
   documentation, and validation-only CI.
2. **Complete — Data:** D1 schema, public repositories, permitted parser, TMDB matching, overrides,
   scheduler, and resumable sync.
3. **Complete — Product:** signed-in API, poster-grid collection browser, season-aware details, credits,
   and resilient states.
4. **Complete locally — Access:** Google identity via Cloudflare Access, exact-email admission design,
   user persistence, session bootstrap, sign-out, service-token importer support, and tests.
5. **In operation — Verification:** local migrations, Workerd/D1 tests, production build and deploy,
   live permitted bootstrap, private baseline export, and ongoing Cron observation.

The existing production application is deployed and every discovered source release is mapped or
visible as an issue. Access rollout is intentionally pending separate authorization for Cloudflare
configuration, new Worker bindings, migration, deployment, and smoke tests. The remaining sync
milestone is observing a Cron-initiated daily Eastern-date run complete without secret exposure or
destructive partial-failure behavior.
