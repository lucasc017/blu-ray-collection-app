# Delivery Plan

1. Foundation: toolchain, Cloudflare/Vite configuration, generated bindings, documentation, and CI.
2. Data: D1 schema, public repositories, permitted parser, TMDB matching, overrides, scheduler, and resumable sync.
3. Product: public API, poster-grid collection browser, season-aware details, credits, and resilient states.
4. Verification: local migrations, Workerd/D1 tests, production build, live permitted bootstrap, and cron observation.

V1 completion means production is deployed, all source releases are mapped or visible as issues, and one daily Eastern-date run is observed completing without secrets or destructive partial-failure behavior.
