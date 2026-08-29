# Privacy

## Account and visitor data

The application uses Google sign-in through Cloudflare Access and is available only to exact email
addresses on the owner's Cloudflare allowlist. The application does not receive or store Google
passwords, OAuth access tokens, profile photos, contacts, comments, analytics, advertising IDs, or
viewing history. D1 stores a stable application-user ID, lowercased email address, current Access
subject, creation timestamp, and last-seen timestamp. The email supports account identity,
recommendation attribution, and server-side administrator attribution. Recommendation APIs and
cards show only the portion before `@` for creators and current supporters; full addresses remain
limited to the signed-in user's session response and administrator review history.

Cloudflare Access sets essential authentication cookies on the team and application domains. The
configured session duration is seven days, subject to owner revocation and Cloudflare/Google policy.
The browser requests the same-origin API and displays read-only collection metadata. The one
configured administrator can also search TMDB and save mapping decisions. Signed-in users can submit
bounded movie-title searches to TMDB through the Worker and store recommendations and endorsements;
the TMDB token remains Worker-only. D1 retains the reviewed
product, ordered TMDB targets, administrator email snapshot, and decision timestamps. The application
does not intentionally store visitor IP addresses or browser identifiers in D1.

Cloudflare and Google may process sign-in and ordinary request metadata according to their account
configuration and terms. TMDB poster and backdrop images are loaded from
`image.tmdb.org`, so TMDB receives ordinary network request information such as the visitor IP
address, user agent, referrer behavior allowed by the site policy, and requested image path.

Clicking a Blu-ray.com release link or the TMDB credit leaves the application and is governed by that
site's privacy terms. Release links are validated and opened with protections that prevent the new
page from controlling this application.

## Operator data

The configured administrator email, Blu-ray.com collection URL, TMDB token, and sync token are
Worker-only secrets. The collection URL is treated as a secret because its numeric identifier can
identify the owner's public collection. It is never sent to browsers. TMDB and sync tokens remain
Worker-only bindings. Operational logs must contain event names, counts, phases, and request IDs—not
secret values, authorization headers, or full private source URLs.

During discovery, the secret collection URL is sent only from the Worker-controlled Cloudflare
Browser Run session to Blu-ray.com. The application extracts bounded public release metadata and
does not store collection HTML, browser recordings, source credentials, or cookies.

The owner-assisted importer processes saved HTML locally and uploads only validated release IDs,
labels, category markers, and public release-page links. A remote import authenticates to Access
with a dedicated service token and then to the application with the independent sync token. Neither
credential is logged or stored in D1. Raw collection HTML and the configured collection URL are not
uploaded or stored.

Production D1 exports contain the owner's derived collection and synchronization history. They are
private operator backups, must remain outside the public repository and CI artifacts, and should be
shared or restored only through an explicitly approved operational process.
