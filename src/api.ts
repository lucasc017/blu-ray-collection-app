import type {
  ApiErrorBody,
  AuthenticatedUser,
  CreateMovieRecommendationRequest,
  CreateMovieRecommendationResponse,
  ListTitlesResponse,
  ListMovieRecommendationsResponse,
  MetadataReviewListResponse,
  MetadataReviewStatus,
  SaveMetadataReviewRequest,
  SaveMetadataReviewResponse,
  SetMovieRecommendationEndorsementRequest,
  SetMovieRecommendationEndorsementResponse,
  SyncStatus,
  RecommendationSearchResponse,
  TmdbReviewSearchResponse,
  TmdbReviewSeasonsResponse,
  TitleDetails,
} from "../shared/contracts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly requestId: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    signal?: AbortSignal;
    body?: unknown;
  } = {},
): Promise<T> {
  const headers = new Headers({
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  if (!response.ok) {
    const fallback: ApiErrorBody = {
      error: {
        code: "request_failed",
        message: "The collection service could not complete this request.",
        requestId: response.headers.get("x-request-id") ?? "unknown",
      },
    };
    const body = (await response.json().catch(() => fallback)) as ApiErrorBody;
    throw new ApiError(body.error.message, body.error.code, body.error.requestId, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const collectionApi = {
  list(query: URLSearchParams, signal?: AbortSignal) {
    return request<ListTitlesResponse>(`/api/titles?${query.toString()}`, { signal });
  },
  details(path: string, signal?: AbortSignal) {
    return request<TitleDetails>(path, { signal });
  },
  status(signal?: AbortSignal) {
    return request<SyncStatus>("/api/status", { signal });
  },
};

export const sessionApi = {
  bootstrap(signal?: AbortSignal) {
    return request<AuthenticatedUser>("/api/session", { method: "PUT", signal });
  },
};

export const reviewApi = {
  list(status: MetadataReviewStatus, page: number, signal?: AbortSignal) {
    const query = new URLSearchParams({ status, page: String(page), pageSize: "20" });
    return request<MetadataReviewListResponse>(`/api/admin/reviews?${query.toString()}`, {
      signal,
    });
  },
  searchTmdb(mediaType: "movie" | "tv", query: string, year: string, signal?: AbortSignal) {
    const parameters = new URLSearchParams({ mediaType, q: query });
    if (year) parameters.set("year", year);
    return request<TmdbReviewSearchResponse>(`/api/admin/tmdb/search?${parameters.toString()}`, {
      signal,
    });
  },
  seasons(tmdbId: number, signal?: AbortSignal) {
    return request<TmdbReviewSeasonsResponse>(`/api/admin/tmdb/tv/${tmdbId}/seasons`, {
      signal,
    });
  },
  save(productId: string, input: SaveMetadataReviewRequest, signal?: AbortSignal) {
    return request<SaveMetadataReviewResponse>(`/api/admin/reviews/${productId}`, {
      method: "PUT",
      body: input,
      signal,
    });
  },
};

export const recommendationApi = {
  list(query: URLSearchParams, signal?: AbortSignal) {
    return request<ListMovieRecommendationsResponse>(`/api/recommendations?${query.toString()}`, {
      signal,
    });
  },
  search(query: string, year: string, signal?: AbortSignal) {
    const parameters = new URLSearchParams({ q: query });
    if (year) parameters.set("year", year);
    return request<RecommendationSearchResponse>(
      `/api/recommendations/search?${parameters.toString()}`,
      { signal },
    );
  },
  create(input: CreateMovieRecommendationRequest, signal?: AbortSignal) {
    return request<CreateMovieRecommendationResponse>("/api/recommendations", {
      method: "POST",
      body: input,
      signal,
    });
  },
  setEndorsement(
    recommendationId: number,
    input: SetMovieRecommendationEndorsementRequest,
    signal?: AbortSignal,
  ) {
    return request<SetMovieRecommendationEndorsementResponse>(
      `/api/recommendations/${recommendationId}/endorsement`,
      { method: "PUT", body: input, signal },
    );
  },
  delete(recommendationId: number, signal?: AbortSignal) {
    return request<void>(`/api/admin/recommendations/${recommendationId}`, {
      method: "DELETE",
      signal,
    });
  },
};

export function imageUrl(path: string | null, size: "w500" | "w1280" = "w500"): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}
