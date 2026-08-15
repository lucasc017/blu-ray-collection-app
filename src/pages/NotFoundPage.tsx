import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="state-panel detail-state">
      <p className="eyebrow">404</p>
      <h1>That case is not on this shelf.</h1>
      <p>The page may have moved, or the title is no longer part of the collection.</p>
      <Link className="button-link" to="/">
        Browse the collection
      </Link>
    </div>
  );
}
