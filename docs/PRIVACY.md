# Privacy

## Visitor data

V1 has no accounts, comments, analytics, advertising, personalized tracking, or application cookies.
The browser requests the same-origin public API and displays read-only collection metadata. The
application does not intentionally store visitor IP addresses or browser identifiers in D1.

Cloudflare may process ordinary request metadata while serving the site and Worker logs according to
the account configuration and Cloudflare terms. TMDB poster and backdrop images are loaded from
`image.tmdb.org`, so TMDB receives ordinary network request information such as the visitor IP
address, user agent, referrer behavior allowed by the site policy, and requested image path.

Clicking a Blu-ray.com release link or the TMDB credit leaves the application and is governed by that
site's privacy terms. Release links are validated and opened with protections that prevent the new
page from controlling this application.

## Operator data

The configured Blu-ray.com collection URL is treated as a secret because its numeric identifier can
identify the owner's public collection. It is never sent to browsers. TMDB and sync tokens remain
Worker-only bindings. Operational logs must contain event names, counts, phases, and request IDs—not
secret values, authorization headers, or full private source URLs.

During discovery, the secret collection URL is sent only from the Worker-controlled Cloudflare
Browser Run session to Blu-ray.com. The application extracts bounded public release metadata and
does not store collection HTML, browser recordings, source credentials, or cookies.

The owner-assisted importer processes saved HTML locally and uploads only validated release IDs,
labels, category markers, and public release-page links. Raw collection HTML and the configured
collection URL are not uploaded or stored.

Production D1 exports contain the owner's derived collection and synchronization history. They are
private operator backups, must remain outside the public repository and CI artifacts, and should be
shared or restored only through an explicitly approved operational process.
