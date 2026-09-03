import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  ListMovieRecommendationsResponse,
  MovieRecommendation,
  RecommendationSort,
  TmdbReviewSearchResult,
} from "../../shared/contracts";
import { useSession } from "../auth/session-context";
import { ApiError, imageUrl, recommendationApi } from "../api";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: ListMovieRecommendationsResponse }
  | { status: "error"; error: Error };

function pageFrom(value: string | null): number {
  const page = Number(value ?? "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function sortFrom(value: string | null): RecommendationSort {
  return value === "endorsements" || value === "title" ? value : "newest";
}

export function RecommendationsPage() {
  const session = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = sortFrom(searchParams.get("sort"));
  const page = pageFrom(searchParams.get("page"));
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [searchResults, setSearchResults] = useState<TmdbReviewSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MovieRecommendation | null>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({
      sort,
      page: String(page),
      pageSize: "24",
    });
    void recommendationApi
      .list(parameters, controller.signal)
      .then((data) => {
        if (data.items.length === 0 && data.total > 0 && page > 1) {
          const next = new URLSearchParams();
          if (sort !== "newest") next.set("sort", sort);
          next.set("page", String(page - 1));
          setSearchParams(next);
          return;
        }
        setLoadState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadState({
          status: "error",
          error: error instanceof Error ? error : new Error("Recommendations could not be loaded."),
        });
      });
    return () => controller.abort();
  }, [page, reloadToken, setSearchParams, sort]);

  useEffect(() => {
    if (!deleteTarget) return;
    cancelDeleteRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && busyId === null) setDeleteTarget(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busyId, deleteTarget]);

  function reload() {
    setLoadState({ status: "loading" });
    setReloadToken((value) => value + 1);
  }

  function updateLocation(nextSort: RecommendationSort, nextPage = 1) {
    const next = new URLSearchParams();
    if (nextSort !== "newest") next.set("sort", nextSort);
    if (nextPage > 1) next.set("page", String(nextPage));
    setLoadState({ status: "loading" });
    setSearchParams(next);
  }

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    setNotice(null);
    try {
      const response = await recommendationApi.search(query.trim(), year);
      setSearchResults(response.items.filter((item) => item.mediaType === "movie"));
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "The movie search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function recommend(result: TmdbReviewSearchResult) {
    setBusyId(-result.tmdbId);
    setNotice(null);
    setSearchError(null);
    try {
      const response = await recommendationApi.create({ tmdbId: result.tmdbId });
      setNotice(
        response.created
          ? `${response.recommendation.title} was added and endorsed.`
          : `${response.recommendation.title} was already recommended; your endorsement was added.`,
      );
      setSearchResults([]);
      setQuery("");
      setYear("");
      updateLocation(sort, 1);
      setReloadToken((value) => value + 1);
    } catch (error) {
      setSearchError(
        error instanceof ApiError && error.status === 409
          ? error.message
          : error instanceof Error
            ? error.message
            : "The recommendation could not be saved.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function setEndorsement(item: MovieRecommendation) {
    setBusyId(item.id);
    setNotice(null);
    try {
      const response = await recommendationApi.setEndorsement(item.id, {
        endorsed: !item.endorsedByCurrentUser,
      });
      setNotice(
        response.removed
          ? `${item.title} was removed because it had no remaining support.`
          : item.endorsedByCurrentUser
            ? `Your endorsement of ${item.title} was withdrawn.`
            : `You endorsed ${item.title}.`,
      );
      reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The endorsement could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRecommendation() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setNotice(null);
    try {
      await recommendationApi.delete(deleteTarget.id);
      setNotice(`${deleteTarget.title} and all of its endorsements were deleted.`);
      setDeleteTarget(null);
      reload();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The recommendation could not be deleted.",
      );
      setDeleteTarget(null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="recommendations-page">
      <div className="page-heading recommendations-heading">
        <div>
          <p className="eyebrow">Community picks</p>
          <h1>Movie recommendations</h1>
          <p>Suggest the next movie for the shelf or support a pick from someone else.</p>
        </div>
        <label className="recommendation-sort">
          Sort by
          <select
            value={sort}
            onChange={(event) => updateLocation(event.target.value as RecommendationSort)}
          >
            <option value="newest">Newest</option>
            <option value="endorsements">Most endorsed</option>
            <option value="title">Title</option>
          </select>
        </label>
      </div>

      <section className="recommendation-search-panel" aria-labelledby="recommend-movie-heading">
        <div>
          <p className="eyebrow">Add a movie</p>
          <h2 id="recommend-movie-heading">Search TMDB</h2>
        </div>
        <form
          className="recommendation-search"
          role="search"
          onSubmit={(event) => void submitSearch(event)}
        >
          <label>
            Movie title
            <input
              value={query}
              minLength={2}
              maxLength={100}
              enterKeyHint="search"
              required
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            Year
            <input
              value={year}
              inputMode="numeric"
              pattern="[0-9]{4}"
              placeholder="Optional"
              onChange={(event) => setYear(event.target.value)}
            />
          </label>
          <button type="submit" disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </button>
        </form>
        {searchError ? (
          <p className="review-error" role="alert">
            {searchError}
          </p>
        ) : null}
        {searchResults.length > 0 ? (
          <div className="recommendation-search-results" aria-label="Movie search results">
            {searchResults.map((result) => (
              <article key={result.tmdbId} className="recommendation-search-result">
                {imageUrl(result.posterPath) ? (
                  <img src={imageUrl(result.posterPath) ?? ""} alt="" loading="lazy" />
                ) : (
                  <span className="poster-placeholder" aria-hidden="true">
                    No poster
                  </span>
                )}
                <div>
                  <h3>{result.title}</h3>
                  <p className="muted">{result.releaseYear ?? "Year unavailable"}</p>
                  <p>{result.overview || "No overview available."}</p>
                  <button
                    type="button"
                    disabled={busyId === -result.tmdbId}
                    onClick={() => void recommend(result)}
                  >
                    {busyId === -result.tmdbId ? "Adding…" : `Recommend ${result.title}`}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      {notice ? (
        <p className="review-notice" role="status">
          {notice}
        </p>
      ) : null}

      {loadState.status === "loading" ? (
        <div className="state-panel" role="status" aria-busy="true">
          <h2>Loading recommendations…</h2>
        </div>
      ) : loadState.status === "error" ? (
        <div className="state-panel" role="alert">
          <h2>Recommendations could not be loaded.</h2>
          <p>{loadState.error.message}</p>
          <button type="button" onClick={reload}>
            Try again
          </button>
        </div>
      ) : loadState.data.total === 0 ? (
        <div className="state-panel">
          <h2>No movies have been recommended yet.</h2>
          <p>Search above to make the first pick.</p>
        </div>
      ) : (
        <>
          <div className="recommendation-grid">
            {loadState.data.items.map((item) => (
              <article className="recommendation-card" key={item.id}>
                <div className="recommendation-poster">
                  {imageUrl(item.posterPath) ? (
                    <img src={imageUrl(item.posterPath) ?? ""} alt="" loading="lazy" />
                  ) : (
                    <span className="poster-placeholder" aria-hidden="true">
                      No poster
                    </span>
                  )}
                </div>
                <div className="recommendation-card-body">
                  <div>
                    <p className="eyebrow">
                      {item.endorsementCount}{" "}
                      {item.endorsementCount === 1 ? "endorsement" : "endorsements"}
                    </p>
                    <h2>{item.title}</h2>
                    <p className="muted">{item.releaseYear ?? "Year unavailable"}</p>
                  </div>
                  <p className="recommendation-overview">
                    {item.overview || "No overview available."}
                  </p>
                  <dl className="recommendation-people">
                    <div>
                      <dt>Recommended by</dt>
                      <dd>{item.recommendedBy}</dd>
                    </div>
                    <div>
                      <dt>Supported by</dt>
                      <dd>{item.supporters.join(", ")}</dd>
                    </div>
                  </dl>
                  <div className="recommendation-actions">
                    <button
                      type="button"
                      aria-pressed={item.endorsedByCurrentUser}
                      disabled={busyId === item.id}
                      onClick={() => void setEndorsement(item)}
                    >
                      {busyId === item.id
                        ? "Updating…"
                        : item.endorsedByCurrentUser
                          ? "Withdraw endorsement"
                          : "Endorse"}
                    </button>
                    {session.isAdmin ? (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => setDeleteTarget(item)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="pagination recommendation-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => updateLocation(sort, page - 1)}
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              type="button"
              disabled={page * loadState.data.pageSize >= loadState.data.total}
              onClick={() => updateLocation(sort, page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}

      {deleteTarget ? (
        <div className="dialog-backdrop">
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-recommendation-title"
          >
            <h2 id="delete-recommendation-title">Delete this recommendation?</h2>
            <p>
              {deleteTarget.title} and all {deleteTarget.endorsementCount} of its current
              endorsements will be permanently deleted.
            </p>
            <div className="review-actions">
              <button
                ref={cancelDeleteRef}
                type="button"
                className="secondary"
                disabled={busyId !== null}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                disabled={busyId !== null}
                onClick={() => void deleteRecommendation()}
              >
                {busyId === deleteTarget.id ? "Deleting…" : "Delete recommendation"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
