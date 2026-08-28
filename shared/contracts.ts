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

export interface AuthenticatedUser {
  id: number;
  email: string;
  createdAt: string;
  lastSeenAt: string;
  isAdmin: boolean;
}

export type MetadataReviewStatus = "unresolved" | "resolved";

export type MetadataReviewTargetInput =
  | { mediaType: "movie"; tmdbId: number }
  | { mediaType: "tv"; tmdbId: number; seasonNumber: number };

export interface MetadataReviewTarget {
  mediaType: MediaType;
  tmdbId: number;
  seasonNumber: number | null;
  title: string;
  releaseYear: number | null;
  posterPath: string | null;
}

export interface MetadataReviewRevision {
  revision: number;
  actorLabel: string;
  createdAt: string;
  supersededAt: string | null;
  targets: MetadataReviewTarget[];
}

export interface MetadataReviewIssue {
  id: number;
  code: string;
  message: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface MetadataReviewItem {
  productId: string;
  sourceTitle: string;
  releaseYear: number | null;
  sourceUrl: string | null;
  format: string;
  issue: MetadataReviewIssue | null;
  activeRevision: MetadataReviewRevision | null;
  revisions: MetadataReviewRevision[];
}

export interface MetadataReviewListResponse {
  items: MetadataReviewItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface TmdbReviewSearchResult {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  originalTitle: string;
  overview: string;
  releaseDate: string | null;
  releaseYear: number | null;
  posterPath: string | null;
}

export interface TmdbReviewSearchResponse {
  items: TmdbReviewSearchResult[];
}

export interface TmdbReviewSeason {
  seasonNumber: number;
  name: string;
  airDate: string | null;
  episodeCount: number;
  posterPath: string | null;
}

export interface TmdbReviewSeasonsResponse {
  seriesTitle: string;
  seasons: TmdbReviewSeason[];
}

export interface SaveMetadataReviewRequest {
  expected: {
    issueId: number | null;
    revision: number | null;
  };
  targets: MetadataReviewTargetInput[];
}

export interface SaveMetadataReviewResponse {
  productId: string;
  revision: number;
  resolvedAt: string;
  targets: MetadataReviewTarget[];
}

export function titlePath(
  entry: Pick<CollectionEntry, "mediaType" | "tmdbId" | "seasonNumber">,
): string {
  return entry.mediaType === "movie"
    ? `/title/movie/${entry.tmdbId}`
    : `/title/tv/${entry.tmdbId}/season/${entry.seasonNumber ?? 0}`;
}
