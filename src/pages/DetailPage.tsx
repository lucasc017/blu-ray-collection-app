import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { TitleDetails } from "../../shared/contracts";
import { normalizeBluRayReleaseUrl } from "../../shared/security";
import { collectionApi, imageUrl } from "../api";

export function DetailPage() {
  const { tmdbId, seasonNumber } = useParams();
  const mediaType = seasonNumber === undefined ? "movie" : "tv";
  const endpoint =
    mediaType === "movie"
      ? `/api/titles/movie/${tmdbId}`
      : `/api/titles/tv/${tmdbId}/season/${seasonNumber}`;
  const [loadState, setLoadState] = useState<{
    endpoint: string | null;
    details: TitleDetails | null;
    error: string | null;
  }>({ endpoint: null, details: null, error: null });
  const loading = loadState.endpoint !== endpoint;
  const details = loading ? null : loadState.details;
  const error = loading ? null : loadState.error;

  useEffect(() => {
    const controller = new AbortController();
    void collectionApi
      .details(endpoint, controller.signal)
      .then((nextDetails) => setLoadState({ endpoint, details: nextDetails, error: null }))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setLoadState({
            endpoint,
            details: null,
            error: reason instanceof Error ? reason.message : "The title could not be loaded.",
          });
        }
      });
    return () => controller.abort();
  }, [endpoint]);

  if (error) {
    return (
      <div className="state-panel detail-state" role="alert">
        <h1>Title unavailable</h1>
        <p>{error}</p>
        <Link className="button-link" to="/">
          Return to collection
        </Link>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="detail-loading" aria-label="Loading title" aria-busy="true">
        <div className="detail-poster skeleton" />
        <div className="detail-loading-copy">
          <div className="skeleton-line skeleton" />
          <div className="skeleton-line short skeleton" />
        </div>
      </div>
    );
  }

  const poster = imageUrl(details.posterPath);
  const backdrop = imageUrl(details.backdropPath, "w1280");
  return (
    <article className="detail-page">
      {backdrop ? (
        <div className="detail-backdrop" aria-hidden="true">
          <img src={backdrop} alt="" />
        </div>
      ) : null}
      <div className="detail-content">
        <Link className="back-link" to="/">
          ← Back to collection
        </Link>
        <div className="detail-grid">
          <div className="detail-poster">
            {poster ? <img src={poster} alt="" width="500" height="750" /> : <span>◉</span>}
          </div>
          <div className="detail-copy">
            <p className="eyebrow">
              {details.mediaType === "tv" ? `Television · Season ${details.seasonNumber}` : "Movie"}
            </p>
            <h1>{details.title}</h1>
            <div className="metadata-line">
              {details.releaseYear ? <span>{details.releaseYear}</span> : null}
              {details.runtimeMinutes ? <span>{details.runtimeMinutes} min</span> : null}
              {details.episodeCount ? <span>{details.episodeCount} episodes</span> : null}
              {details.voteAverage ? <span>★ {details.voteAverage.toFixed(1)}</span> : null}
            </div>
            <div className="genre-list">
              {details.genres.map((genre) => (
                <span key={genre.id}>{genre.name}</span>
              ))}
            </div>
            <p className="overview">{details.overview || "No overview is available yet."}</p>

            <section className="owned-section" aria-labelledby="owned-heading">
              <p className="eyebrow">On the shelf</p>
              <h2 id="owned-heading">Owned physical releases</h2>
              <div className="release-list">
                {details.releases.map((release) => {
                  const sourceUrl = normalizeBluRayReleaseUrl(release.sourceUrl, release.productId);
                  const content = (
                    <span>
                      <strong>{release.label}</strong>
                      <small>Added {new Date(release.firstSeenAt).toLocaleDateString()}</small>
                    </span>
                  );
                  return sourceUrl ? (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer external"
                      key={release.productId}
                    >
                      {content}
                      <span className="release-format">{release.format}</span>
                    </a>
                  ) : (
                    <div className="release-item" key={release.productId}>
                      {content}
                      <span className="release-format">{release.format}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    </article>
  );
}
