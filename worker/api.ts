import { Hono, type Context } from "hono";
import { z } from "zod";
import type { ApiErrorBody, MediaType } from "../shared/contracts";
import { isUsableSecret, validateSyncConfiguration } from "./config";
import { getSyncStatus, getTitleDetails, listTitles } from "./db/public-queries";
import { logEvent } from "./logging";
import { applyApiSecurityHeaders } from "./security-headers";
import { runSyncBatch } from "./sync/engine";
import { InvalidCollectionSnapshotError, parseCollectionSnapshot } from "./sync/snapshot";

type AppBindings = { Bindings: Env; Variables: { requestId: string } };
type AppContext = Context<AppBindings>;

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(["movie", "tv"]).optional(),
  genre: z.coerce.number().int().positive().optional(),
  year: z.coerce.number().int().min(1880).max(2200).optional(),
  sort: z.enum(["title", "release_date", "recently_added"]).default("title"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

const positiveIdSchema = z.coerce.number().int().positive();
const seasonSchema = z.coerce.number().int().min(0);
const MAX_SNAPSHOT_BODY_BYTES = 512 * 1024;

class SnapshotBodyTooLargeError extends Error {}

function errorBody(code: string, message: string, requestId: string): ApiErrorBody {
  return { error: { code, message, requestId } };
}

function authorized(request: Request, secret: string): boolean {
  if (!isUsableSecret(secret, 32)) return false;
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = new TextEncoder().encode(header.slice(7));
  const expected = new TextEncoder().encode(secret);
  if (supplied.byteLength !== expected.byteLength) return false;
  return crypto.subtle.timingSafeEqual(supplied, expected);
}

async function readBodyBounded(request: Request, maximumBytes: number): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new SnapshotBodyTooLargeError();
  }

  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  let bytes = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) return text + decoder.decode();
    const value: unknown = chunk.value;
    if (!(value instanceof Uint8Array)) throw new TypeError("Invalid snapshot request body.");
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel("Snapshot request exceeded the configured size limit.");
      throw new SnapshotBodyTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
}

async function titleResponse(c: AppContext, mediaType: MediaType, tmdbId: number, season: number) {
  const title = await getTitleDetails(c.env.DB, mediaType, tmdbId, season);
  if (!title) {
    return c.json(
      errorBody("not_found", "That title is not in this collection.", c.get("requestId")),
      404,
    );
  }
  return c.json(title);
}

export const api = new Hono<AppBindings>();

api.use("*", async (c, next) => {
  const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);
  c.header("Cache-Control", "no-store");
  applyApiSecurityHeaders(c.res.headers);
  await next();
  applyApiSecurityHeaders(c.res.headers);
});

api.get("/titles", async (c) => {
  const parsed = listQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(
      errorBody("invalid_query", "One or more query parameters are invalid.", c.get("requestId")),
      400,
    );
  }
  return c.json(await listTitles(c.env.DB, parsed.data));
});

api.get("/titles/movie/:tmdbId", async (c) => {
  const tmdbId = positiveIdSchema.safeParse(c.req.param("tmdbId"));
  if (!tmdbId.success) {
    return c.json(errorBody("invalid_id", "The TMDB ID is invalid.", c.get("requestId")), 400);
  }
  return titleResponse(c, "movie", tmdbId.data, -1);
});

api.get("/titles/tv/:tmdbId/season/:seasonNumber", async (c) => {
  const tmdbId = positiveIdSchema.safeParse(c.req.param("tmdbId"));
  const season = seasonSchema.safeParse(c.req.param("seasonNumber"));
  if (!tmdbId.success || !season.success) {
    return c.json(
      errorBody("invalid_id", "The TMDB ID or season number is invalid.", c.get("requestId")),
      400,
    );
  }
  return titleResponse(c, "tv", tmdbId.data, season.data);
});

api.get("/status", async (c) => c.json(await getSyncStatus(c.env.DB)));

api.post("/internal/sync", async (c) => {
  if (!authorized(c.req.raw, c.env.SYNC_ADMIN_TOKEN)) {
    return c.json(
      errorBody("unauthorized", "A valid sync token is required.", c.get("requestId")),
      401,
    );
  }
  return c.json(await runSyncBatch(c.env, { triggerType: "manual", force: true, now: new Date() }));
});

api.post("/internal/collection-snapshot", async (c) => {
  if (!authorized(c.req.raw, c.env.SYNC_ADMIN_TOKEN)) {
    return c.json(
      errorBody("unauthorized", "A valid sync token is required.", c.get("requestId")),
      401,
    );
  }
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return c.json(
      errorBody(
        "unsupported_media_type",
        "A JSON collection snapshot is required.",
        c.get("requestId"),
      ),
      415,
    );
  }

  let input: unknown;
  try {
    input = JSON.parse(await readBodyBounded(c.req.raw, MAX_SNAPSHOT_BODY_BYTES));
  } catch (error) {
    const tooLarge = error instanceof SnapshotBodyTooLargeError;
    return c.json(
      errorBody(
        tooLarge ? "payload_too_large" : "invalid_snapshot",
        tooLarge
          ? "The collection snapshot exceeds the upload limit."
          : "The collection snapshot is not valid JSON.",
        c.get("requestId"),
      ),
      tooLarge ? 413 : 400,
    );
  }

  let releases;
  try {
    const configuration = validateSyncConfiguration(c.env);
    releases = parseCollectionSnapshot(input, configuration.collectionUrl);
  } catch (error) {
    if (!(error instanceof InvalidCollectionSnapshotError)) throw error;
    return c.json(errorBody("invalid_snapshot", error.message, c.get("requestId")), 400);
  }

  const result = await runSyncBatch(c.env, {
    triggerType: "manual",
    force: true,
    now: new Date(),
    discoverySnapshot: releases,
    stopAfterDiscovery: true,
  });
  if (result.status === "busy") {
    return c.json(
      errorBody(
        "sync_in_progress",
        "Finish the active synchronization before importing another snapshot.",
        c.get("requestId"),
      ),
      409,
    );
  }
  return c.json(result);
});

api.notFound((c) =>
  c.json(errorBody("not_found", "API route not found.", c.get("requestId")), 404),
);

api.onError((error, c) => {
  const requestId = c.get("requestId") || crypto.randomUUID();
  logEvent("error", "api.unhandled_error", {
    requestId,
    path: c.req.path,
    method: c.req.method,
    error: error.message,
  });
  return c.json(errorBody("internal_error", "The request could not be completed.", requestId), 500);
});
