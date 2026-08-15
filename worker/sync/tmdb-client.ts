import { ExternalFetchError, type FetchBudget } from "./fetch-budget";
import { normalizeTitle, sortTitle } from "./normalization";
import type { MappingTarget, ReleaseResolution, SourceReleaseRow, TitleMetadata } from "./types";

const MAX_TMDB_BYTES = 1024 * 1024;

interface TmdbGenre {
  id: number;
  name: string;
}

interface TmdbMovieSearchResult {
  id: number;
  title: string;
  original_title: string;
  release_date?: string;
}

interface TmdbSearchResponse {
  results: TmdbMovieSearchResult[];
}

interface TmdbMovieDetails {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  runtime: number | null;
  vote_average: number | null;
  genres: TmdbGenre[];
}

interface TmdbSeriesDetails {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number | null;
  genres: TmdbGenre[];
}

interface TmdbSeasonDetails {
  season_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  poster_path: string | null;
  vote_average: number | null;
  episodes: Array<{ runtime: number | null }>;
}

async function readJsonBounded<T>(response: Response): Promise<T> {
  const reader = response.body?.getReader();
  if (!reader) throw new ExternalFetchError("TMDB returned an empty response.", null, true);
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    const value: unknown = chunk.value;
    if (!(value instanceof Uint8Array)) {
      throw new ExternalFetchError("TMDB returned an invalid response stream.", null, true);
    }
    bytes += value.byteLength;
    if (bytes > MAX_TMDB_BYTES) {
      await reader.cancel("Response exceeded the configured size limit.");
      throw new ExternalFetchError("TMDB returned an unexpectedly large response.", null, false);
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new ExternalFetchError("TMDB returned malformed JSON.", null, true);
  }
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export class TmdbClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly budget: FetchBudget,
  ) {}

  private async getJson<T>(path: string, parameters: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.budget.fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.token}`,
        },
      });
      if (response.ok) return readJsonBounded<T>(response);

      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retryAfterSeconds = Number(response.headers.get("retry-after") ?? 0);
        await response.body?.cancel();
        await wait(Math.min(Math.max(retryAfterSeconds * 1000, 150 * 2 ** attempt), 1500));
        continue;
      }
      await response.body?.cancel();
      throw new ExternalFetchError(
        `TMDB returned HTTP ${response.status}.`,
        response.status,
        response.status === 429 || response.status >= 500,
      );
    }
    throw new ExternalFetchError("TMDB did not return a successful response.", null, true);
  }

  async resolveMovie(release: SourceReleaseRow): Promise<ReleaseResolution> {
    const parameters: Record<string, string> = {
      query: release.normalized_title,
      include_adult: "false",
    };
    if (release.release_year) parameters.year = String(release.release_year);
    const search = await this.getJson<TmdbSearchResponse>("/search/movie", parameters);
    const matches = search.results.filter((candidate) => {
      const titleMatches =
        normalizeTitle(candidate.title) === release.normalized_title ||
        normalizeTitle(candidate.original_title) === release.normalized_title;
      const candidateYear = Number(candidate.release_date?.slice(0, 4) ?? 0);
      const yearMatches = !release.release_year || candidateYear === release.release_year;
      return titleMatches && yearMatches;
    });

    if (matches.length === 0) {
      return {
        ok: false,
        issue: {
          code: "no_match",
          message: `No exact TMDB movie match was found for “${release.source_title}”.`,
          details: { candidateIds: search.results.slice(0, 5).map((candidate) => candidate.id) },
        },
      };
    }
    if (matches.length > 1) {
      return {
        ok: false,
        issue: {
          code: "ambiguous_match",
          message: `More than one exact TMDB match was found for “${release.source_title}”.`,
          details: { candidateIds: matches.map((candidate) => candidate.id) },
        },
      };
    }
    const match = matches[0];
    if (!match) throw new ExternalFetchError("TMDB matching produced an invalid result.");
    return {
      ok: true,
      metadata: [
        await this.fetchMetadata({ mediaType: "movie", tmdbId: match.id, seasonNumber: -1 }),
      ],
    };
  }

  async fetchMetadata(target: MappingTarget): Promise<TitleMetadata> {
    const now = new Date().toISOString();
    if (target.mediaType === "movie") {
      const movie = await this.getJson<TmdbMovieDetails>(`/movie/${target.tmdbId}`);
      return {
        ...target,
        displayTitle: movie.title,
        originalTitle: movie.original_title,
        sortTitle: sortTitle(movie.title),
        overview: movie.overview || "",
        releaseDate: movie.release_date || null,
        releaseYear: movie.release_date ? Number(movie.release_date.slice(0, 4)) : null,
        posterPath: movie.poster_path,
        backdropPath: movie.backdrop_path,
        runtimeMinutes: movie.runtime,
        episodeCount: null,
        voteAverage: movie.vote_average,
        genres: movie.genres,
        metadataUpdatedAt: now,
      };
    }

    const series = await this.getJson<TmdbSeriesDetails>(`/tv/${target.tmdbId}`);
    const season = await this.getJson<TmdbSeasonDetails>(
      `/tv/${target.tmdbId}/season/${target.seasonNumber}`,
    );
    const runtimes = season.episodes.flatMap((episode) =>
      episode.runtime && episode.runtime > 0 ? [episode.runtime] : [],
    );
    const averageRuntime = runtimes.length
      ? Math.round(runtimes.reduce((sum, runtime) => sum + runtime, 0) / runtimes.length)
      : null;
    const displayTitle = `${series.name} — ${season.name}`;
    return {
      ...target,
      displayTitle,
      originalTitle: `${series.original_name} — ${season.name}`,
      sortTitle: sortTitle(displayTitle),
      overview: season.overview || series.overview || "",
      releaseDate: season.air_date,
      releaseYear: season.air_date ? Number(season.air_date.slice(0, 4)) : null,
      posterPath: season.poster_path ?? series.poster_path,
      backdropPath: series.backdrop_path,
      runtimeMinutes: averageRuntime,
      episodeCount: season.episodes.length,
      voteAverage: season.vote_average ?? series.vote_average,
      genres: series.genres,
      metadataUpdatedAt: now,
    };
  }
}
