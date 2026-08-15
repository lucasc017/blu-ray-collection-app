import { NavLink, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <NavLink className="brand" to="/" aria-label="The Disc Shelf home">
          <span className="brand-mark" aria-hidden="true">
            ◉
          </span>
          <span>
            <strong>The Disc Shelf</strong>
            <small>A personal physical media library</small>
          </span>
        </NavLink>
        <nav aria-label="Primary navigation">
          <NavLink to="/" end>
            Collection
          </NavLink>
          <NavLink to="/about">About</NavLink>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>Built for browsing, not streaming.</span>
        <NavLink to="/about">Data credits</NavLink>
      </footer>
    </div>
  );
}
