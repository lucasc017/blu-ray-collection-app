import { Hono } from "hono";
import { api } from "./api";
import { logEvent } from "./logging";
import { runSyncBatch } from "./sync/engine";

const app = new Hono<{ Bindings: Env }>();
app.route("/api", api);

const handler = {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(controller, env) {
    const result = await runSyncBatch(env, {
      triggerType: "scheduled",
      force: false,
      now: new Date(controller.scheduledTime),
    });
    logEvent(result.status === "failed" ? "error" : "info", "sync.scheduled_batch", {
      runId: result.runId,
      status: result.status,
      phase: result.phase,
      externalFetches: result.counts.externalFetches,
    });
  },
} satisfies ExportedHandler<Env>;

export default handler;
