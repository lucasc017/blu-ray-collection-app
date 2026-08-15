# Worker Instructions

- Bindings come from generated `worker-configuration.d.ts`; do not declare `Env` manually.
- Hono API routes return shared contracts and the standard request-ID error envelope.
- Use prepared D1 statements. Dynamic SQL may contain only code-controlled clauses such as a sort whitelist; user values must be bound.
- Keep secrets out of logs and responses. Protected routes use constant-time token comparison.
- Return or await all promises. Essential work must finish before the handler resolves.
- Use structured JSON logging through `logEvent` and preserve request IDs.
- Run the Workerd test suite after API, binding, D1, or scheduled-handler changes.
