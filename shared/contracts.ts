export type MediaType = "movie" | "tv";
export type TitleSort = "title" | "release_date" | "recently_added";

export interface Genre {
  id: number;
  name: string;
}

export interface CollectionEntry {
  key: string;
  mediaType: MediaType;
  tmdbId: number;
  seasonNumber: number | null;
  title: string;
  overview: string;
  releaseDate: string | null;
  releaseYear: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number | null;
  formats: string[];
  genres: Genre[];
  addedAt: string;
}

export interface OwnedRelease {
  productId: string;
  label: string;
  format: string;
  sourceUrl: string;
  firstSeenAt: string;
}

export interface TitleDetails extends CollectionEntry {
  originalTitle: string | null;
  runtimeMinutes: number | null;
  episodeCount: number | null;
  releases: OwnedRelease[];
}

export interface TitleFilters {
  genres: Genre[];
  years: number[];
  mediaTypes: MediaType[];
}

export interface ListTitlesResponse {
  items: CollectionEntry[];
  page: number;
  pageSize: number;
  total: number;
  filters: TitleFilters;
}

export interface SyncStatus {
  titleCount: number;
  activeReleaseCount: number;
  unresolvedIssueCount: number;
  state: "empty" | "ready" | "syncing" | "degraded";
  lastSuccessfulSyncAt: string | null;
}

export interface SyncBatchResult {
  runId: string | null;
  status: "not-due" | "running" | "complete" | "failed" | "busy";
  phase: "discover" | "resolve" | "refresh" | "finalize" | null;
  cursor: string | null;
  counts: {
    externalFetches: number;
    releasesSeen: number;
    releasesResolved: number;
    issuesCreated: number;
    titlesRefreshed: number;
  };
}

export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string };
}

export function titlePath(
  entry: Pick<CollectionEntry, "mediaType" | "tmdbId" | "seasonNumber">,
): string {
  return entry.mediaType === "movie"
    ? `/title/movie/${entry.tmdbId}`
    : `/title/tv/${entry.tmdbId}/season/${entry.seasonNumber ?? 0}`;
}
