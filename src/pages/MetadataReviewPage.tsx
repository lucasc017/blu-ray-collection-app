import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  MetadataReviewItem,
  MetadataReviewListResponse,
  MetadataReviewStatus,
  MetadataReviewTarget,
  TmdbReviewSearchResult,
  TmdbReviewSeasonsResponse,
} from "../../shared/contracts";
import { ApiError, imageUrl, reviewApi } from "../api";

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "ready"; data: MetadataReviewListResponse };

function targetKey(target: Pick<MetadataReviewTarget, "mediaType" | "tmdbId" | "seasonNumber">) {
  return `${target.mediaType}:${target.tmdbId}:${target.seasonNumber ?? -1}`;
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function MetadataReviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status: MetadataReviewStatus =
    searchParams.get("status") === "resolved" ? "resolved" : "unresolved";
  const requestedPage = Number(searchParams.get("page") ?? 1);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const selectedProductRef = useRef<string | null>(null);
  const [targets, setTargets] = useState<MetadataReviewTarget[]>([]);
  const [mediaType, setMediaType] = useState<"movie" | "tv">("movie");
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [searchResults, setSearchResults] = useState<TmdbReviewSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [seasonChoice, setSeasonChoice] = useState<{
    result: TmdbReviewSearchResult;
    response: TmdbReviewSeasonsResponse;
  } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cancelConfirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void reviewApi
      .list(status, page, controller.signal)
      .then((data) => {
        setLoadState({ status: "ready", data });
        const nextItem =
          data.items.find((item) => item.productId === selectedProductRef.current) ?? data.items[0];
        const nextProductId = nextItem?.productId ?? null;
        selectedProductRef.current = nextProductId;
        setSelectedProductId(nextProductId);
        setTargets(nextItem?.activeRevision?.targets ?? []);
        setSearchResults([]);
        setSeasonChoice(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadState({
          status: "error",
          error:
            error instanceof Error ? error : new Error("The review queue could not be loaded."),
        });
      });
    return () => controller.abort();
  }, [page, reloadToken, status]);

  const items = loadState.status === "ready" ? loadState.data.items : [];
  const selected = items.find((item) => item.productId === selectedProductId) ?? null;

  useEffect(() => {
    if (!confirmOpen) return;
    cancelConfirmRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setConfirmOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmOpen, saving]);

  function setStatus(nextStatus: MetadataReviewStatus) {
    setLoadState({ status: "loading" });
    setSearchParams(nextStatus === "unresolved" ? {} : { status: nextStatus });
    selectedProductRef.current = null;
    setSelectedProductId(null);
  }

  function selectItem(item: MetadataReviewItem) {
    selectedProductRef.current = item.productId;
    setSelectedProductId(item.productId);
    setTargets(item.activeRevision?.targets ?? []);
    setSearchResults([]);
    setSeasonChoice(null);
  }

  function goToPage(nextPage: number) {
    setLoadState({ status: "loading" });
    selectedProductRef.current = null;
    setSearchParams({ status, page: String(nextPage) });
  }

  function addTarget(target: MetadataReviewTarget) {
    setTargets((current) =>
      current.some((item) => targetKey(item) === targetKey(target))
        ? current
        : [...current, target],
    );
    setSeasonChoice(null);
  }

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    setSeasonChoice(null);
    try {
      const response = await reviewApi.searchTmdb(mediaType, query.trim(), year);
      setSearchResults(response.items);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "TMDB search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function chooseResult(result: TmdbReviewSearchResult) {
    if (result.mediaType === "movie") {
      addTarget({
        mediaType: "movie",
        tmdbId: result.tmdbId,
        seasonNumber: null,
        title: result.title,
        releaseYear: result.releaseYear,
        posterPath: result.posterPath,
      });
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const response = await reviewApi.seasons(result.tmdbId);
      setSeasonChoice({ result, response });
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "TV seasons could not be loaded.");
    } finally {
      setSearching(false);
    }
  }

  function moveTarget(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= targets.length) return;
    setTargets((current) => {
      const next = [...current];
      const item = next[index];
      const other = next[nextIndex];
      if (!item || !other) return current;
      next[index] = other;
      next[nextIndex] = item;
      return next;
    });
  }

  async function saveReview() {
    if (!selected || targets.length === 0) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await reviewApi.save(selected.productId, {
        expected: {
          issueId: selected.activeRevision ? null : (selected.issue?.id ?? null),
          revision: selected.activeRevision?.revision ?? null,
        },
        targets: targets.map((target) =>
          target.mediaType === "movie"
            ? { mediaType: "movie", tmdbId: target.tmdbId }
            : {
                mediaType: "tv",
                tmdbId: target.tmdbId,
                seasonNumber: target.seasonNumber ?? 0,
              },
        ),
      });
      setNotice(`Saved revision ${response.revision} for ${selected.sourceTitle}.`);
      setConfirmOpen(false);
      setLoadState({ status: "loading" });
      setReloadToken((value) => value + 1);
    } catch (error) {
      const stale = error instanceof ApiError && error.status === 409;
      setNotice(
        stale
          ? "This release changed while it was open. The latest review data has been loaded."
          : error instanceof Error
            ? error.message
            : "The mapping could not be saved.",
      );
      if (stale) {
        setLoadState({ status: "loading" });
        setReloadToken((value) => value + 1);
      }
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function reviewLater() {
    const currentIndex = items.findIndex((item) => item.productId === selectedProductId);
    const next = items[currentIndex + 1] ?? items[0];
    if (next) selectItem(next);
  }

  return (
    <section className="review-page">
      <div className="page-heading review-heading">
        <div>
          <p className="eyebrow">Administrator</p>
          <h1>Metadata review</h1>
          <p>Resolve ambiguous releases against live TMDB data and retain every decision.</p>
        </div>
        <div className="review-tabs" role="tablist" aria-label="Review status">
          <button
            type="button"
            role="tab"
            aria-selected={status === "unresolved"}
            onClick={() => setStatus("unresolved")}
          >
            Unresolved
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={status === "resolved"}
            onClick={() => setStatus("resolved")}
          >
            History
          </button>
        </div>
      </div>

      {notice ? (
        <p className="review-notice" role="status">
          {notice}
        </p>
      ) : null}
      {loadState.status === "loading" ? (
        <div className="state-panel" role="status" aria-busy="true">
          <h2>Loading review queue…</h2>
        </div>
      ) : loadState.status === "error" ? (
        <div className="state-panel" role="alert">
          <h2>The review queue could not be loaded.</h2>
          <p>{loadState.error.message}</p>
          <button
            type="button"
            onClick={() => {
              setLoadState({ status: "loading" });
              setReloadToken((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : loadState.data.total === 0 ? (
        <div className="state-panel">
          <h2>
            {status === "unresolved" ? "No conflicts need review." : "No review history yet."}
          </h2>
        </div>
      ) : (
        <div className="review-workspace">
          <aside className="review-queue" aria-label="Release review queue">
            <p className="review-count">{loadState.data.total} releases</p>
            {items.map((item) => (
              <button
                type="button"
                className={
                  item.productId === selectedProductId
                    ? "review-queue-item active"
                    : "review-queue-item"
                }
                key={item.productId}
                onClick={() => selectItem(item)}
                aria-pressed={item.productId === selectedProductId}
              >
                <strong>{item.sourceTitle}</strong>
                <span>
                  {item.format}
                  {item.releaseYear ? ` · ${item.releaseYear}` : ""}
                </span>
              </button>
            ))}
            <div className="pagination review-pagination">
              <button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Previous
              </button>
              <span>Page {page}</span>
              <button
                type="button"
                disabled={page * loadState.data.pageSize >= loadState.data.total}
                onClick={() => goToPage(page + 1)}
              >
                Next
              </button>
            </div>
          </aside>

          {selected ? (
            <article className="review-detail">
              <ReviewReleaseHeader item={selected} />

              <section className="review-section" aria-labelledby="selected-mapping-heading">
                <div className="section-heading-row">
                  <h2 id="selected-mapping-heading">Selected mapping</h2>
                  <span>{targets.length}/20 titles</span>
                </div>
                {targets.length === 0 ? (
                  <p className="muted">Search TMDB and add at least one title or TV season.</p>
                ) : (
                  <ol className="selected-targets">
                    {targets.map((target, index) => (
                      <li key={targetKey(target)}>
                        <span>
                          <strong>{target.title}</strong>
                          <small>
                            {target.mediaType === "movie"
                              ? "Movie"
                              : `TV season ${target.seasonNumber}`}
                            {target.releaseYear ? ` · ${target.releaseYear}` : ""}
                          </small>
                        </span>
                        <span className="target-actions">
                          <button
                            type="button"
                            onClick={() => moveTarget(index, -1)}
                            disabled={index === 0}
                            aria-label={`Move ${target.title} up`}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTarget(index, 1)}
                            disabled={index === targets.length - 1}
                            aria-label={`Move ${target.title} down`}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setTargets((current) =>
                                current.filter((_, targetIndex) => targetIndex !== index),
                              )
                            }
                            aria-label={`Remove ${target.title}`}
                          >
                            Remove
                          </button>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="review-section" aria-labelledby="tmdb-search-heading">
                <h2 id="tmdb-search-heading">Search TMDB</h2>
                <form className="review-search" onSubmit={(event) => void submitSearch(event)}>
                  <label>
                    Type
                    <select
                      value={mediaType}
                      onChange={(event) => setMediaType(event.target.value as "movie" | "tv")}
                    >
                      <option value="movie">Movie</option>
                      <option value="tv">TV</option>
                    </select>
                  </label>
                  <label className="review-query">
                    Title
                    <input
                      value={query}
                      minLength={2}
                      maxLength={100}
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
                  <p role="alert" className="review-error">
                    {searchError}
                  </p>
                ) : null}
                {seasonChoice ? (
                  <div className="season-picker">
                    <h3>Choose a season of {seasonChoice.response.seriesTitle}</h3>
                    <div className="season-options">
                      {seasonChoice.response.seasons.map((season) => (
                        <button
                          type="button"
                          key={season.seasonNumber}
                          onClick={() =>
                            addTarget({
                              mediaType: "tv",
                              tmdbId: seasonChoice.result.tmdbId,
                              seasonNumber: season.seasonNumber,
                              title: `${seasonChoice.response.seriesTitle} — ${season.name}`,
                              releaseYear: season.airDate
                                ? Number(season.airDate.slice(0, 4)) || null
                                : null,
                              posterPath: season.posterPath ?? seasonChoice.result.posterPath,
                            })
                          }
                        >
                          <strong>{season.name}</strong>
                          <span>
                            {season.episodeCount} episodes
                            {season.airDate ? ` · ${season.airDate.slice(0, 4)}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="tmdb-results">
                  {searchResults.map((result) => (
                    <button
                      type="button"
                      className="tmdb-result"
                      key={`${result.mediaType}:${result.tmdbId}`}
                      onClick={() => void chooseResult(result)}
                    >
                      {imageUrl(result.posterPath) ? (
                        <img src={imageUrl(result.posterPath) ?? ""} alt="" loading="lazy" />
                      ) : (
                        <span className="poster-placeholder" aria-hidden="true">
                          No poster
                        </span>
                      )}
                      <span>
                        <strong>{result.title}</strong>
                        <small>
                          {result.mediaType === "movie" ? "Movie" : "TV"}
                          {result.releaseYear ? ` · ${result.releaseYear}` : ""}
                        </small>
                        <span>{result.overview || "No overview available."}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {selected.revisions.length > 0 ? <ReviewHistory item={selected} /> : null}

              <div className="review-actions">
                <button type="button" className="secondary" onClick={reviewLater}>
                  Review later
                </button>
                <button
                  type="button"
                  disabled={targets.length === 0 || saving}
                  onClick={() => setConfirmOpen(true)}
                >
                  {selected.activeRevision ? "Save corrected mapping" : "Resolve conflict"}
                </button>
              </div>
            </article>
          ) : null}
        </div>
      )}

      {confirmOpen && selected ? (
        <div className="dialog-backdrop">
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-review-title"
          >
            <h2 id="confirm-review-title">Save this mapping?</h2>
            <p>
              {selected.sourceTitle} will map to {targets.length} selected{" "}
              {targets.length === 1 ? "title" : "titles"}. The decision will be retained in review
              history.
            </p>
            <div className="review-actions">
              <button
                ref={cancelConfirmRef}
                type="button"
                className="secondary"
                disabled={saving}
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button type="button" disabled={saving} onClick={() => void saveReview()}>
                {saving ? "Saving…" : "Confirm mapping"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ReviewReleaseHeader({ item }: { item: MetadataReviewItem }) {
  return (
    <header className="review-release-header">
      <div>
        <p className="eyebrow">Product {item.productId}</p>
        <h2>{item.sourceTitle}</h2>
        <p>
          {item.format}
          {item.releaseYear ? ` · ${item.releaseYear}` : ""}
        </p>
      </div>
      {item.sourceUrl ? (
        <a href={item.sourceUrl} target="_blank" rel="noreferrer">
          View source release
        </a>
      ) : null}
      {item.issue ? (
        <div className="issue-card">
          <strong>{item.issue.code.replaceAll("_", " ")}</strong>
          <p>{item.issue.message}</p>
        </div>
      ) : null}
    </header>
  );
}

function ReviewHistory({ item }: { item: MetadataReviewItem }) {
  return (
    <section className="review-section" aria-labelledby="review-history-heading">
      <h2 id="review-history-heading">Review history</h2>
      <div className="review-history">
        {item.revisions.map((revision) => (
          <details key={revision.revision} open={revision.supersededAt === null}>
            <summary>
              Revision {revision.revision} · {revision.actorLabel} ·{" "}
              {displayDate(revision.createdAt)}
              {revision.supersededAt === null ? " · Current" : ""}
            </summary>
            <ul>
              {revision.targets.map((target) => (
                <li key={targetKey(target)}>{target.title}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
