import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ListTitlesResponse, SyncStatus } from "../../shared/contracts";
import { collectionApi } from "../api";
import { LoadingGrid } from "../components/LoadingGrid";
import { TitleCard } from "../components/TitleCard";

function SearchInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (draft.trim() === value) return;
    const timeout = window.setTimeout(() => onCommit(draft.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [draft, onCommit, value]);

  return (
    <input
      id="collection-search"
      type="search"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      placeholder="Movie or series title"
    />
  );
}

interface CollectionLoadState {
  query: string | null;
  collection: ListTitlesResponse | null;
  error: string | null;
}

export function CollectionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchValue = searchParams.get("q") ?? "";
  const [loadState, setLoadState] = useState<CollectionLoadState>({
    query: null,
    collection: null,
    error: null,
  });
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const queryString = searchParams.toString();
  const loading = loadState.query !== queryString;
  const collection = loading ? null : loadState.collection;
  const error = loading ? null : loadState.error;

  const setParameter = useCallback(
    (name: string, value: string) => {
      const next = new URLSearchParams(searchParams);
      if (value) next.set(name, value);
      else next.delete(name);
      if (name !== "page") next.delete("page");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(queryString);
    void collectionApi
      .list(query, controller.signal)
      .then((nextCollection) =>
        setLoadState({ query: queryString, collection: nextCollection, error: null }),
      )
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setLoadState({
            query: queryString,
            collection: null,
            error: reason instanceof Error ? reason.message : "The collection could not be loaded.",
          });
        }
      });
    return () => controller.abort();
  }, [queryString]);

  useEffect(() => {
    const controller = new AbortController();
    void collectionApi
      .status(controller.signal)
      .then(setStatus)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((collection?.total ?? 0) / (collection?.pageSize ?? 24))),
    [collection],
  );
  const currentPage = collection?.page ?? Number(searchParams.get("page") ?? 1);

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">The collection</p>
          <h1>Good movies deserve a place on the shelf.</h1>
          <p className="hero-copy">
            Browse every movie and television season in this personal physical media library.
          </p>
        </div>
        <div className={`sync-chip ${status?.state ?? "empty"}`}>
          <span aria-hidden="true" />
          {status?.state === "syncing"
            ? "Updating collection"
            : status?.activeReleaseCount
              ? `${status.activeReleaseCount} physical releases`
              : "Awaiting first import"}
        </div>
      </section>

      <section className="collection-section" aria-labelledby="browse-heading">
        <div className="toolbar">
          <div className="search-field">
            <label htmlFor="collection-search">Search the shelf</label>
            <SearchInput
              key={searchValue}
              value={searchValue}
              onCommit={(value) => setParameter("q", value)}
            />
          </div>
          <div className="filter-row">
            <label>
              <span>Type</span>
              <select
                value={searchParams.get("type") ?? ""}
                onChange={(event) => setParameter("type", event.target.value)}
              >
                <option value="">All types</option>
                <option value="movie">Movies</option>
                <option value="tv">TV seasons</option>
              </select>
            </label>
            <label>
              <span>Genre</span>
              <select
                value={searchParams.get("genre") ?? ""}
                onChange={(event) => setParameter("genre", event.target.value)}
              >
                <option value="">All genres</option>
                {collection?.filters.genres.map((genre) => (
                  <option key={genre.id} value={genre.id}>
                    {genre.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Year</span>
              <select
                value={searchParams.get("year") ?? ""}
                onChange={(event) => setParameter("year", event.target.value)}
              >
                <option value="">All years</option>
                {collection?.filters.years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select
                value={searchParams.get("sort") ?? "title"}
                onChange={(event) => setParameter("sort", event.target.value)}
              >
                <option value="title">Title A–Z</option>
                <option value="release_date">Newest release</option>
                <option value="recently_added">Recently added</option>
              </select>
            </label>
          </div>
        </div>

        <div className="results-heading">
          <div>
            <p className="eyebrow">Browse</p>
            <h2 id="browse-heading">
              {collection ? `${collection.total.toLocaleString()} owned titles` : "Owned titles"}
            </h2>
          </div>
          {status?.unresolvedIssueCount ? (
            <p className="issue-note">
              {status.unresolvedIssueCount} releases need metadata review
            </p>
          ) : null}
        </div>

        {loading ? <LoadingGrid /> : null}
        {!loading && error ? (
          <div className="state-panel" role="alert">
            <h2>The shelf is temporarily unavailable</h2>
            <p>{error}</p>
            <button type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        ) : null}
        {!loading && !error && collection?.items.length === 0 ? (
          <div className="state-panel">
            <h2>No titles found</h2>
            <p>Try a broader search or clear one of the filters.</p>
            <button
              type="button"
              onClick={() => {
                setSearchParams({}, { replace: true });
              }}
            >
              Clear filters
            </button>
          </div>
        ) : null}
        {!loading && !error && collection?.items.length ? (
          <div className="poster-grid">
            {collection.items.map((entry) => (
              <TitleCard entry={entry} key={entry.key} />
            ))}
          </div>
        ) : null}

        {!loading && !error && collection && totalPages > 1 ? (
          <nav className="pagination" aria-label="Collection pages">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setParameter("page", String(currentPage - 1))}
            >
              Previous
            </button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setParameter("page", String(currentPage + 1))}
            >
              Next
            </button>
          </nav>
        ) : null}
      </section>
    </>
  );
}
