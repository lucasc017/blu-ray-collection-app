export function AboutPage() {
  return (
    <article className="prose-page">
      <p className="eyebrow">About this shelf</p>
      <h1>A small home for a carefully collected library.</h1>
      <p className="lede">
        The Disc Shelf is a private, read-only way for approved friends to browse a personal
        collection of movies and television seasons on Blu-ray and 4K UHD.
      </p>

      <section>
        <h2>How the collection works</h2>
        <p>
          Physical release ownership is synchronized from the collector&apos;s permitted public
          Blu-ray.com collection. Movie and television metadata is then matched and cached from The
          Movie Database. Browsing this site never starts an external import.
        </p>
      </section>

      <section className="tmdb-credit">
        <h2>Data and image credits</h2>
        <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer external">
          <img src="/tmdb-logo.svg" alt="The Movie Database (TMDB)" />
        </a>
        <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      </section>

      <section>
        <h2>Privacy</h2>
        <p>
          Google sign-in and the owner&apos;s exact-email allowlist are managed by Cloudflare
          Access; this application never handles passwords. It stores your email and Access identity
          with account timestamps, but has no comments, suggestions, personal viewing history,
          analytics, or advertising cookies. Poster and backdrop images are loaded from TMDB&apos;s
          image service, so that service receives ordinary network request information such as your
          IP address and browser headers.
        </p>
      </section>
    </article>
  );
}
