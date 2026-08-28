# The Disc Shelf

A private Blu-ray and 4K UHD collection browser for allowlisted Google accounts, with an owner-only metadata conflict review screen. Cloudflare Access owns sign-in and admission; React and Vite render the interface; a Hono Cloudflare Worker validates Access identity and serves the API and scheduled importer; D1 stores users, reviews, and the collection; TMDB supplies cached movie and TV-season metadata.

Production: [The Disc Shelf](https://blu-ray-collection-app.blu-ray-collection-app.workers.dev)

## Requirements

- Node.js 24 LTS and npm 11
- A Cloudflare account authenticated through Wrangler
- A Cloudflare Zero Trust team and Google OAuth identity-provider configuration
- A TMDB API Read Access Token
- A private Blu-ray.com collection URL and permission to import it with browser automation

## Local setup

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
npm run cf-typegen
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Edit `.dev.vars` before starting the application:

```dotenv
ADMIN_EMAIL="developer@localhost.invalid"
BLURAY_COLLECTION_URL="https://www.blu-ray.com/community/collection.php?u=your-user-id&sortby=recentlyaddedcollection"
TMDB_READ_ACCESS_TOKEN="your-read-access-token"
SYNC_ADMIN_TOKEN="a-long-random-local-token"
SYNC_IMPORT_URL="http://localhost:5173/api/internal/collection-snapshot"
ACCESS_TEAM_DOMAIN="https://your-team-name.cloudflareaccess.com"
ACCESS_AUD="your-access-application-audience-tag"
```

None of these values may use a `VITE_` prefix. They are Worker-only bindings and must never enter the browser bundle. The collection URL must use HTTPS on `blu-ray.com` or `www.blu-ray.com`, point to `/community/collection.php`, and include a numeric `u` value. The importer normalizes it to category 7 sorted by `recentlyaddedcollection`.

The Vite development server serves the SPA and Worker together. Exact HTTP loopback origins (`localhost` and `127.0.0.1`) use a synthetic development identity, so local development sets `ADMIN_EMAIL` to `developer@localhost.invalid`; all other origins fail closed without a valid Access assertion. The local D1 database is stored under ignored Wrangler state. A scheduled or protected manual sync uses Cloudflare Browser Run to scan the newest collection page. It requests the next numbered page only when every release on the current page was absent from D1, and it stops at the first page containing a known release or at the declared last page.

For an authoritative replacement that can detect removals, save every collection page in a normal browser and import the files in page order:

```powershell
npm run import:collection -- .\snapshots\base.html .\snapshots\page-1.html
```

The fallback importer verifies the pagination set, extracts only physical-release attributes, and sends a bounded manifest to the protected Worker endpoint. It never uploads the collection URL or raw HTML. Repeat `POST /api/internal/sync` with the sync token, or let Cron continue, until TMDB resolution completes.
When `SYNC_IMPORT_URL` is remote HTTPS, `.dev.vars` must also contain the dedicated importer
`CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`; local loopback imports do not require them.

## Common commands

| Command                     | Purpose                                               |
| --------------------------- | ----------------------------------------------------- |
| `npm run dev`               | Start the full local application                      |
| `npm run check`             | Format, lint, type-check, test, build, and scan       |
| `npm run check:public`      | Run release checks, dependency audit, package dry run |
| `npm run test:worker`       | Run Workerd and D1 integration tests                  |
| `npm run cf-typegen`        | Regenerate bindings after Wrangler config changes     |
| `npm run db:migrate:local`  | Apply D1 migrations locally                           |
| `npm run db:seed:local`     | Add three non-destructive sample entries locally      |
| `npm run import:collection` | Import owner-saved collection HTML                    |
| `npm run deploy:dry-run`    | Validate the production bundle without deploying      |

## Production deployment

Production deploys are manual and require explicit owner authorization. GitHub Actions validates but
does not deploy. Run the public release gates, apply any forward-only D1 migrations, deploy with
Wrangler, smoke-test the Access-protected API, and record the new Worker version. The first deployment for a
new account must attach the six required Worker bindings from a temporary file outside the repository;
routine deployments preserve the existing Worker secrets.

Before deploying this change, the owner must configure Google as the only Cloudflare Access login
method, create a self-hosted application for the production hostname, add an exact-email Allow
policy with a seven-day session, and create a Service Auth policy for the snapshot importer. The
allowlist lives only in Cloudflare and can be changed only by the Cloudflare account administrator.

Follow the complete [production deployment and operations runbook](docs/DEPLOYMENT.md). It covers
first-time provisioning, secret-safe AI operation, D1 backups, manual import batches, Cron/log
verification, and code rollback. Do not pass secret values as command-line arguments, use
`.dev.vars` as a deployment secrets file, or commit private database exports.

The committed D1 database ID is an infrastructure identifier, not a credential. Forks must create
their own D1 database and replace it before deploying. Runtime configuration rejects placeholder
secrets, an invalid Blu-ray.com collection URL, and a non-TMDB API base URL before sync state is
created.

## Security, privacy, and licensing

The browser has no password database, analytics, advertising cookies, or provider credentials.
Cloudflare Access sets essential authentication cookies, and D1 stores the signed-in account's
stable application ID, lowercased email, current Access subject, account timestamps, and administrator review history. TMDB poster
and backdrop images load from `image.tmdb.org`; those requests disclose ordinary network metadata
to TMDB. See [Privacy](docs/PRIVACY.md) and [Security](SECURITY.md).

The project source is available under the [MIT License](LICENSE). Dependencies and provider data,
images, names, and trademarks retain their own terms. The generated
[third-party license report](docs/THIRD_PARTY_LICENSES.md) is a review aid.

## Documentation

Start with [Product](docs/PRODUCT.md), [Architecture](docs/ARCHITECTURE.md), [Data sync](docs/DATA_SYNC.md), [Deployment](docs/DEPLOYMENT.md), and the [open-source release checklist](docs/OPEN_SOURCE_RELEASE.md). AI-assisted sessions should also read the [AI development guide](docs/AI_DEVELOPMENT.md), root `AGENTS.md`, and every nested instruction file that applies to the files being changed.
