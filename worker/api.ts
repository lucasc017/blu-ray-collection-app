import { Hono, type Context } from "hono";
import { z } from "zod";
import type {
  ApiErrorBody,
  CreateMovieRecommendationRequest,
  MediaType,
  SaveMetadataReviewRequest,
  SetMovieRecommendationEndorsementRequest,
} from "../shared/contracts";
import {
  AccessAuthenticationError,
  authenticateRequest,
  mayUseAdminRoutes,
  mayUseInternalRoutes,
  type AccessPrincipal,
  userIdentity,
} from "./auth";
import { isUsableSecret, validateSyncConfiguration } from "./config";
import {
  applyMetadataReview,
  getReviewSaveContext,
  listMetadataReviews,
  reviewContextMatches,
  StaleMetadataReviewError,
} from "./db/admin-reviews";
import { getSyncStatus, getTitleDetails, listTitles } from "./db/public-queries";
import {
  createMovieRecommendation,
  deleteMovieRecommendation,
  getRecommendationState,
  listMovieRecommendations,
  RecommendationUnavailableError,
  setMovieRecommendationEndorsement,
} from "./db/recommendations";
import { upsertAppUser } from "./db/users";
import { logEvent } from "./logging";
import { applyApiSecurityHeaders } from "./security-headers";
import { runSyncBatch } from "./sync/engine";
import { ExternalFetchError, FetchBudget, FetchBudgetExceededError } from "./sync/fetch-budget";
import { InvalidCollectionSnapshotError, parseCollectionSnapshot } from "./sync/snapshot";
import { TmdbClient } from "./sync/tmdb-client";
import type { MappingTarget } from "./sync/types";

type AppBindings = {
  Bindings: Env;
  Variables: { principal: AccessPrincipal; requestId: string };
};
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
const MAX_REVIEW_BODY_BYTES = 32 * 1024;
const MAX_RECOMMENDATION_BODY_BYTES = 4 * 1024;
const productIdSchema = z.string().regex(/^[1-9]\d{0,19}$/);
const reviewListQuerySchema = z.object({
  status: z.enum(["unresolved", "resolved"]).default("unresolved"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
const tmdbSearchQuerySchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  q: z.string().trim().min(2).max(100),
  year: z.coerce.number().int().min(1880).max(2200).optional(),
});
const recommendationListQuerySchema = z.object({
  sort: z.enum(["newest", "endorsements", "title"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});
const recommendationSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  year: z.coerce.number().int().min(1880).max(2200).optional(),
});
const createRecommendationSchema = z.object({ tmdbId: z.number().int().positive() });
const endorsementSchema = z.object({ endorsed: z.boolean() });
const movieReviewTargetSchema = z.object({
  mediaType: z.literal("movie"),
  tmdbId: z.number().int().positive(),
});
const tvReviewTargetSchema = z.object({
  mediaType: z.literal("tv"),
  tmdbId: z.number().int().positive(),
  seasonNumber: z.number().int().min(0),
});
const saveReviewSchema = z
  .object({
    expected: z.object({
      issueId: z.number().int().positive().nullable(),
      revision: z.number().int().positive().nullable(),
    }),
    targets: z
      .array(z.discriminatedUnion("mediaType", [movieReviewTargetSchema, tvReviewTargetSchema]))
      .min(1)
      .max(20),
  })
  .superRefine((value, context) => {
    const firstResolution = value.expected.issueId !== null && value.expected.revision === null;
    const remap = value.expected.issueId === null && value.expected.revision !== null;
    if (!firstResolution && !remap) {
      context.addIssue({
        code: "custom",
        path: ["expected"],
        message: "Expected state must identify either an unresolved issue or an active revision.",
      });
    }
    const unique = new Set(
      value.targets.map((target) =>
        target.mediaType === "movie"
          ? `movie:${target.tmdbId}`
          : `tv:${target.tmdbId}:${target.seasonNumber}`,
      ),
    );
    if (unique.size !== value.targets.length) {
      context.addIssue({
        code: "custom",
        path: ["targets"],
        message: "A reviewed title may be selected only once.",
      });
    }
  });

class SnapshotBodyTooLargeError extends Error {}

function errorBody(code: string, message: string, requestId: string): ApiErrorBody {
  return { error: { code, message, requestId } };
}

async function authorized(request: Request, secret: string): Promise<boolean> {
  const header = request.headers.get("Authorization");
  const hasBearerToken = header?.startsWith("Bearer ") ?? false;
  const supplied = new TextEncoder().encode(hasBearerToken && header ? header.slice(7) : "");
  const expected = new TextEncoder().encode(secret ?? "");
  const [suppliedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", supplied),
    crypto.subtle.digest("SHA-256", expected),
  ]);
  return Boolean(
    hasBearerToken &&
    isUsableSecret(secret, 32) &&
    crypto.subtle.timingSafeEqual(suppliedDigest, expectedDigest),
  );
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

  let principal: AccessPrincipal;
  try {
    principal = await authenticateRequest(c.req.raw, c.env);
  } catch (error) {
    if (!(error instanceof AccessAuthenticationError)) throw error;
    return c.json(
      errorBody("unauthorized", "A valid sign-in is required.", c.get("requestId")),
      401,
    );
  }

  const path = new URL(c.req.url).pathname;
  const isInternalRoute = path.startsWith("/api/internal/");
  const isAdminRoute = path.startsWith("/api/admin/");
  const allowed = isInternalRoute
    ? mayUseInternalRoutes(principal)
    : isAdminRoute
      ? await mayUseAdminRoutes(principal, c.env.ADMIN_EMAIL)
      : userIdentity(principal) !== null;
  if (!allowed) {
    return c.json(
      errorBody("forbidden", "This identity cannot use that route.", c.get("requestId")),
      403,
    );
  }
  c.set("principal", principal);
  await next();
  applyApiSecurityHeaders(c.res.headers);
});

api.put("/session", async (c) => {
  const identity = userIdentity(c.get("principal"));
  if (!identity) {
    return c.json(errorBody("forbidden", "A signed-in user is required.", c.get("requestId")), 403);
  }
  const [user, isAdmin] = await Promise.all([
    upsertAppUser(c.env.DB, identity, new Date().toISOString()),
    mayUseAdminRoutes(c.get("principal"), c.env.ADMIN_EMAIL),
  ]);
  return c.json({ ...user, isAdmin });
});

api.get("/recommendations", async (c) => {
  const parsed = recommendationListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(
      errorBody(
        "invalid_query",
        "One or more recommendation filters are invalid.",
        c.get("requestId"),
      ),
      400,
    );
  }
  const identity = userIdentity(c.get("principal"));
  if (!identity) {
    return c.json(errorBody("forbidden", "A signed-in user is required.", c.get("requestId")), 403);
  }
  return c.json(
    await listMovieRecommendations(
      c.env.DB,
      identity.email,
      parsed.data.sort,
      parsed.data.page,
      parsed.data.pageSize,
    ),
  );
});

api.get("/recommendations/search", async (c) => {
  const parsed = recommendationSearchQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(
      errorBody("invalid_query", "The movie search parameters are invalid.", c.get("requestId")),
      400,
    );
  }
  const configuration = validateSyncConfiguration(c.env);
  const tmdb = new TmdbClient(
    configuration.tmdbApiBaseUrl,
    configuration.tmdbReadAccessToken,
    new FetchBudget(3),
  );
  try {
    return c.json(await tmdb.search("movie", parsed.data.q, parsed.data.year));
  } catch (error) {
    if (!(error instanceof ExternalFetchError || error instanceof FetchBudgetExceededError)) {
      throw error;
    }
    return c.json(
      errorBody(
        "tmdb_unavailable",
        "TMDB could not complete that movie search.",
        c.get("requestId"),
      ),
      502,
    );
  }
});

api.post("/recommendations", async (c) => {
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return c.json(
      errorBody("unsupported_media_type", "A JSON body is required.", c.get("requestId")),
      415,
    );
  }
  let input: CreateMovieRecommendationRequest;
  try {
    const parsed = createRecommendationSchema.safeParse(
      JSON.parse(await readBodyBounded(c.req.raw, MAX_RECOMMENDATION_BODY_BYTES)),
    );
    if (!parsed.success) {
      return c.json(
        errorBody(
          "invalid_recommendation",
          "The movie recommendation is invalid.",
          c.get("requestId"),
        ),
        400,
      );
    }
    input = parsed.data;
  } catch (error) {
    const tooLarge = error instanceof SnapshotBodyTooLargeError;
    return c.json(
      errorBody(
        tooLarge ? "payload_too_large" : "invalid_recommendation",
        tooLarge
          ? "The recommendation body is too large."
          : "The recommendation body is not valid JSON.",
        c.get("requestId"),
      ),
      tooLarge ? 413 : 400,
    );
  }

  const identity = userIdentity(c.get("principal"));
  if (!identity) {
    return c.json(errorBody("forbidden", "A signed-in user is required.", c.get("requestId")), 403);
  }
  const now = new Date().toISOString();
  const actor = await upsertAppUser(c.env.DB, identity, now);
  const existing = await getRecommendationState(c.env.DB, input.tmdbId);
  if (existing?.owned) {
    return c.json(
      errorBody("already_owned", "That movie is already in the collection.", c.get("requestId")),
      409,
    );
  }
  if (existing?.fulfilledAt) {
    return c.json(
      errorBody(
        "recommendation_fulfilled",
        "That movie recommendation was already fulfilled.",
        c.get("requestId"),
      ),
      409,
    );
  }
  if (existing?.recommendationId) {
    const result = await setMovieRecommendationEndorsement(
      c.env.DB,
      existing.recommendationId,
      actor.id,
      actor.email,
      true,
      now,
    );
    if (!result?.recommendation)
      throw new Error("The existing recommendation could not be endorsed.");
    return c.json({ recommendation: result.recommendation, created: false });
  }

  const configuration = validateSyncConfiguration(c.env);
  const tmdb = new TmdbClient(
    configuration.tmdbApiBaseUrl,
    configuration.tmdbReadAccessToken,
    new FetchBudget(3),
  );
  try {
    const metadata = await tmdb.fetchMetadata({
      mediaType: "movie",
      tmdbId: input.tmdbId,
      seasonNumber: -1,
    });
    const result = await createMovieRecommendation(c.env.DB, metadata, actor.id, actor.email, now);
    return c.json(result, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof RecommendationUnavailableError) {
      const fulfilled = error.reason === "fulfilled";
      return c.json(
        errorBody(
          fulfilled ? "recommendation_fulfilled" : "already_owned",
          fulfilled
            ? "That movie recommendation was already fulfilled."
            : "That movie is already in the collection.",
          c.get("requestId"),
        ),
        409,
      );
    }
    if (error instanceof ExternalFetchError || error instanceof FetchBudgetExceededError) {
      return c.json(
        errorBody("tmdb_unavailable", "TMDB could not validate that movie.", c.get("requestId")),
        502,
      );
    }
    throw error;
  }
});

api.put("/recommendations/:recommendationId/endorsement", async (c) => {
  const recommendationId = positiveIdSchema.safeParse(c.req.param("recommendationId"));
  if (!recommendationId.success) {
    return c.json(
      errorBody("invalid_id", "The recommendation ID is invalid.", c.get("requestId")),
      400,
    );
  }
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return c.json(
      errorBody("unsupported_media_type", "A JSON body is required.", c.get("requestId")),
      415,
    );
  }
  let input: SetMovieRecommendationEndorsementRequest;
  try {
    const parsed = endorsementSchema.safeParse(
      JSON.parse(await readBodyBounded(c.req.raw, MAX_RECOMMENDATION_BODY_BYTES)),
    );
    if (!parsed.success) {
      return c.json(
        errorBody("invalid_endorsement", "The endorsement state is invalid.", c.get("requestId")),
        400,
      );
    }
    input = parsed.data;
  } catch (error) {
    const tooLarge = error instanceof SnapshotBodyTooLargeError;
    return c.json(
      errorBody(
        tooLarge ? "payload_too_large" : "invalid_endorsement",
        tooLarge ? "The endorsement body is too large." : "The endorsement body is not valid JSON.",
        c.get("requestId"),
      ),
      tooLarge ? 413 : 400,
    );
  }
  const identity = userIdentity(c.get("principal"));
  if (!identity) {
    return c.json(errorBody("forbidden", "A signed-in user is required.", c.get("requestId")), 403);
  }
  const now = new Date().toISOString();
  const actor = await upsertAppUser(c.env.DB, identity, now);
  try {
    const result = await setMovieRecommendationEndorsement(
      c.env.DB,
      recommendationId.data,
      actor.id,
      actor.email,
      input.endorsed,
      now,
    );
    if (!result) {
      return c.json(
        errorBody("not_found", "That recommendation was not found.", c.get("requestId")),
        404,
      );
    }
    return c.json(result);
  } catch (error) {
    if (!(error instanceof RecommendationUnavailableError)) throw error;
    return c.json(
      errorBody(
        error.reason === "owned" ? "already_owned" : "recommendation_fulfilled",
        "That recommendation is no longer active.",
        c.get("requestId"),
      ),
      409,
    );
  }
});

api.delete("/admin/recommendations/:recommendationId", async (c) => {
  const recommendationId = positiveIdSchema.safeParse(c.req.param("recommendationId"));
  if (!recommendationId.success) {
    return c.json(
      errorBody("invalid_id", "The recommendation ID is invalid.", c.get("requestId")),
      400,
    );
  }
  if (!(await deleteMovieRecommendation(c.env.DB, recommendationId.data))) {
    return c.json(
      errorBody("not_found", "That recommendation was not found.", c.get("requestId")),
      404,
    );
  }
  return c.body(null, 204);
});

api.get("/admin/reviews", async (c) => {
  const parsed = reviewListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(
      errorBody("invalid_query", "One or more review filters are invalid.", c.get("requestId")),
      400,
    );
  }
  return c.json(
    await listMetadataReviews(c.env.DB, parsed.data.status, parsed.data.page, parsed.data.pageSize),
  );
});

api.get("/admin/tmdb/search", async (c) => {
  const parsed = tmdbSearchQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(
      errorBody("invalid_query", "The TMDB search parameters are invalid.", c.get("requestId")),
      400,
    );
  }
  const configuration = validateSyncConfiguration(c.env);
  const tmdb = new TmdbClient(
    configuration.tmdbApiBaseUrl,
    configuration.tmdbReadAccessToken,
    new FetchBudget(3),
  );
  try {
    return c.json(await tmdb.search(parsed.data.mediaType, parsed.data.q, parsed.data.year));
  } catch (error) {
    if (!(error instanceof ExternalFetchError || error instanceof FetchBudgetExceededError)) {
      throw error;
    }
    return c.json(
      errorBody("tmdb_unavailable", "TMDB could not complete that search.", c.get("requestId")),
      502,
    );
  }
});

api.get("/admin/tmdb/tv/:tmdbId/seasons", async (c) => {
  const tmdbId = positiveIdSchema.safeParse(c.req.param("tmdbId"));
  if (!tmdbId.success) {
    return c.json(errorBody("invalid_id", "The TMDB ID is invalid.", c.get("requestId")), 400);
  }
  const configuration = validateSyncConfiguration(c.env);
  const tmdb = new TmdbClient(
    configuration.tmdbApiBaseUrl,
    configuration.tmdbReadAccessToken,
    new FetchBudget(3),
  );
  try {
    return c.json(await tmdb.listSeasons(tmdbId.data));
  } catch (error) {
    if (!(error instanceof ExternalFetchError || error instanceof FetchBudgetExceededError)) {
      throw error;
    }
    return c.json(
      errorBody("tmdb_unavailable", "TMDB seasons could not be loaded.", c.get("requestId")),
      502,
    );
  }
});

api.put("/admin/reviews/:productId", async (c) => {
  const productId = productIdSchema.safeParse(c.req.param("productId"));
  if (!productId.success) {
    return c.json(errorBody("invalid_id", "The product ID is invalid.", c.get("requestId")), 400);
  }
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return c.json(
      errorBody("unsupported_media_type", "A JSON body is required.", c.get("requestId")),
      415,
    );
  }

  let input: SaveMetadataReviewRequest;
  try {
    const parsed = saveReviewSchema.safeParse(
      JSON.parse(await readBodyBounded(c.req.raw, MAX_REVIEW_BODY_BYTES)),
    );
    if (!parsed.success) {
      return c.json(
        errorBody("invalid_review", "The reviewed mapping is invalid.", c.get("requestId")),
        400,
      );
    }
    input = parsed.data;
  } catch (error) {
    const tooLarge = error instanceof SnapshotBodyTooLargeError;
    return c.json(
      errorBody(
        tooLarge ? "payload_too_large" : "invalid_review",
        tooLarge ? "The reviewed mapping is too large." : "The review body is not valid JSON.",
        c.get("requestId"),
      ),
      tooLarge ? 413 : 400,
    );
  }

  const context = await getReviewSaveContext(c.env.DB, productId.data);
  if (!context) {
    return c.json(errorBody("not_found", "That release is not active.", c.get("requestId")), 404);
  }
  if (!reviewContextMatches(context, input.expected)) {
    return c.json(
      errorBody("stale_review", "This release changed while it was open.", c.get("requestId")),
      409,
    );
  }

  const identity = userIdentity(c.get("principal"));
  if (!identity) {
    return c.json(errorBody("forbidden", "An administrator is required.", c.get("requestId")), 403);
  }
  const now = new Date().toISOString();
  const actor = await upsertAppUser(c.env.DB, identity, now);
  const configuration = validateSyncConfiguration(c.env);
  const tmdb = new TmdbClient(
    configuration.tmdbApiBaseUrl,
    configuration.tmdbReadAccessToken,
    new FetchBudget(40),
  );

  try {
    const metadata = [];
    for (const target of input.targets) {
      const mappingTarget: MappingTarget =
        target.mediaType === "movie"
          ? { mediaType: "movie", tmdbId: target.tmdbId, seasonNumber: -1 }
          : target;
      metadata.push(await tmdb.fetchMetadata(mappingTarget));
    }
    return c.json(
      await applyMetadataReview(c.env.DB, {
        productId: productId.data,
        expected: input.expected,
        metadata,
        actorUserId: actor.id,
        actorLabel: actor.email,
        now,
      }),
    );
  } catch (error) {
    if (error instanceof StaleMetadataReviewError) {
      return c.json(
        errorBody("stale_review", "This release changed while it was open.", c.get("requestId")),
        409,
      );
    }
    if (error instanceof ExternalFetchError || error instanceof FetchBudgetExceededError) {
      return c.json(
        errorBody(
          "tmdb_unavailable",
          "TMDB could not validate every selected title.",
          c.get("requestId"),
        ),
        502,
      );
    }
    throw error;
  }
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
  if (!(await authorized(c.req.raw, c.env.SYNC_ADMIN_TOKEN))) {
    return c.json(
      errorBody("unauthorized", "A valid sync token is required.", c.get("requestId")),
      401,
    );
  }
  return c.json(await runSyncBatch(c.env, { triggerType: "manual", force: true, now: new Date() }));
});

api.post("/internal/collection-snapshot", async (c) => {
  if (!(await authorized(c.req.raw, c.env.SYNC_ADMIN_TOKEN))) {
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
