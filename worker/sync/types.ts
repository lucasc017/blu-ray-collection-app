import type { Genre, MediaType } from "../../shared/contracts";

export type SyncPhase = "discover" | "resolve" | "refresh" | "finalize";

export interface ParsedRelease {
  productId: string;
  sourceTitle: string;
  normalizedTitle: string;
  releaseYear: number | null;
  sourceUrl: string;
  format: string;
  fingerprint: string;
}

export interface SourceReleaseRow {
  product_id: string;
  source_title: string;
  normalized_title: string;
  release_year: number | null;
  source_url: string;
  format: string;
}

export interface MappingTarget {
  mediaType: MediaType;
  tmdbId: number;
  seasonNumber: number;
}

export interface TitleMetadata extends MappingTarget {
  displayTitle: string;
  originalTitle: string | null;
  sortTitle: string;
  overview: string;
  releaseDate: string | null;
  releaseYear: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  runtimeMinutes: number | null;
  episodeCount: number | null;
  voteAverage: number | null;
  genres: Genre[];
  metadataUpdatedAt: string;
}

export interface SyncRunRow {
  id: string;
  local_date: string;
  trigger_type: "scheduled" | "manual";
  phase: SyncPhase;
  status: "running" | "complete" | "failed";
  cursor: string | null;
  external_fetches: number;
  releases_seen: number;
  releases_resolved: number;
  issues_created: number;
  titles_refreshed: number;
}

export interface SyncDayRow {
  local_date: string;
  target_slot: number;
  status: "awaiting" | "running" | "complete" | "failed";
  run_id: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
}

export interface ResolutionIssue {
  code: "no_match" | "ambiguous_match" | "unsupported_release";
  message: string;
  details?: Record<string, unknown>;
}

export type ReleaseResolution =
  { ok: true; metadata: TitleMetadata[] } | { ok: false; issue: ResolutionIssue };
