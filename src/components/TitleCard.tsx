import { Link } from "react-router-dom";
import type { CollectionEntry } from "../../shared/contracts";
import { titlePath } from "../../shared/contracts";
import { imageUrl } from "../api";

export function TitleCard({ entry }: { entry: CollectionEntry }) {
  const poster = imageUrl(entry.posterPath);
  return (
    <article className="title-card">
      <Link to={titlePath(entry)} aria-label={`View ${entry.title}`}>
        <div className="poster-frame">
          {poster ? (
            <img src={poster} alt="" loading="lazy" width="500" height="750" />
          ) : (
            <div className="poster-placeholder" aria-hidden="true">
              <span>◉</span>
            </div>
          )}
          <span className="media-badge">
            {entry.mediaType === "tv" ? `Season ${entry.seasonNumber}` : "Movie"}
          </span>
          {entry.formats[0] ? <span className="format-badge">{entry.formats[0]}</span> : null}
        </div>
        <div className="card-copy">
          <h2>{entry.title}</h2>
          <p>
            {entry.releaseYear ?? "Year unknown"}
            {entry.genres[0] ? ` · ${entry.genres[0].name}` : ""}
          </p>
        </div>
      </Link>
    </article>
  );
}
