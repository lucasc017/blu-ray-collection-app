# The Disc Shelf

A public, read-only Blu-ray and 4K UHD collection browser. React and Vite render the interface; a Hono Cloudflare Worker serves the API and scheduled importer; D1 stores the collection; TMDB supplies cached movie and TV-season metadata.

## Requirements

- Node.js 24 LTS and npm 11
- A Cloudflare account authenticated through Wrangler
- A TMDB API Read Access Token
- A private Blu-ray.com collection URL you have permission to read automatically

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
BLURAY_COLLECTION_URL="https://www.blu-ray.com/community/collection.php?u=your-user-id&categoryid=7"
TMDB_READ_ACCESS_TOKEN="your-read-access-token"
SYNC_ADMIN_TOKEN="a-long-random-local-token"
```

None of these values may use a `VITE_` prefix. They are Worker-only bindings and must never enter the browser bundle. The collection URL must use HTTPS on `blu-ray.com` or `www.blu-ray.com`, point to `/community/collection.php`, include a numeric `u` value, and set `categoryid=7`.

The Vite development server serves the SPA and Worker together. The local D1 database is stored under ignored Wrangler state. Trigger one bounded import batch through `POST /api/internal/sync` with the sync token as a Bearer credential; repeat later or use the scheduled test handler if the first import requires more than one batch.

## Common commands

| Command                    | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `npm run dev`              | Start the full local application                      |
| `npm run check`            | Format, lint, type-check, test, build, and scan       |
| `npm run check:public`     | Run release checks, dependency audit, package dry run |
| `npm run test:worker`      | Run Workerd and D1 integration tests                  |
| `npm run cf-typegen`       | Regenerate bindings after Wrangler config changes     |
| `npm run db:migrate:local` | Apply D1 migrations locally                           |
| `npm run db:seed:local`    | Add three non-destructive sample entries locally      |
| `npm run deploy:dry-run`   | Validate the production bundle without deploying      |

## Production deployment

1. Run `npx wrangler d1 create blu-ray-collection-db` if the database has not been provisioned, then place the returned database ID in `wrangler.jsonc`.
2. Run `npm run db:migrate:remote`.
3. Set `BLURAY_COLLECTION_URL`, `TMDB_READ_ACCESS_TOKEN`, and `SYNC_ADMIN_TOKEN` using separate interactive `npx wrangler secret put <NAME>` prompts.
4. Run `npm run check`, then `npm run deploy`.
5. Trigger a protected sync batch and monitor structured logs with `npx wrangler tail`.

Do not pass secret values as command-line arguments or commit `.dev.vars`.

The committed D1 database ID is an infrastructure identifier, not a credential. Forks must create
their own D1 database and replace it before deploying. Runtime configuration rejects placeholder
secrets, an invalid Blu-ray.com collection URL, and a non-TMDB API base URL before sync state is
created.

## Security, privacy, and licensing

The browser has no accounts, analytics, advertising cookies, or provider credentials. TMDB poster
and backdrop images load from `image.tmdb.org`; those requests disclose ordinary network metadata
to TMDB. See [Privacy](docs/PRIVACY.md) and [Security](SECURITY.md).

The project source is available under the [MIT License](LICENSE). Dependencies and provider data,
images, names, and trademarks retain their own terms. The generated
[third-party license report](docs/THIRD_PARTY_LICENSES.md) is a review aid.

## Documentation

Start with [Product](docs/PRODUCT.md), [Architecture](docs/ARCHITECTURE.md), [Data sync](docs/DATA_SYNC.md), [Deployment](docs/DEPLOYMENT.md), and the [open-source release checklist](docs/OPEN_SOURCE_RELEASE.md). Agents must read `AGENTS.md` plus any nested instructions that apply to the files being changed.
