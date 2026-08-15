import type {
  ApiErrorBody,
  ListTitlesResponse,
  SyncStatus,
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

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { headers: { Accept: "application/json" }, signal });
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
  return response.json() as Promise<T>;
}

export const collectionApi = {
  list(query: URLSearchParams, signal?: AbortSignal) {
    return request<ListTitlesResponse>(`/api/titles?${query.toString()}`, signal);
  },
  details(path: string, signal?: AbortSignal) {
    return request<TitleDetails>(path, signal);
  },
  status(signal?: AbortSignal) {
    return request<SyncStatus>("/api/status", signal);
  },
};

export function imageUrl(path: string | null, size: "w500" | "w1280" = "w500"): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}
