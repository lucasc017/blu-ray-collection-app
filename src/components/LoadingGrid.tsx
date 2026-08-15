export function LoadingGrid() {
  return (
    <div className="poster-grid" aria-label="Loading collection" aria-busy="true">
      {Array.from({ length: 12 }, (_, index) => (
        <div className="title-card skeleton-card" key={index} aria-hidden="true">
          <div className="poster-frame skeleton" />
          <div className="skeleton-line skeleton" />
          <div className="skeleton-line short skeleton" />
        </div>
      ))}
    </div>
  );
}
