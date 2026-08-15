import { ExternalFetchError, type FetchBudget } from "./fetch-budget";
import { normalizeBluRayReleaseUrl } from "../../shared/security";
import { parseReleaseLabel } from "./normalization";
import type { ParsedRelease } from "./types";

const MAX_COLLECTION_BYTES = 2 * 1024 * 1024;
const MAX_COLLECTION_PAGES = 20;

interface ParsedPage {
  releases: ParsedRelease[];
  highestPage: number;
}

export class InvalidBluRayCollectionUrlError extends Error {
  constructor() {
    super("BLURAY_COLLECTION_URL must be a valid Blu-ray.com Blu-ray collection URL.");
    this.name = "InvalidBluRayCollectionUrlError";
  }
}

export function validateBluRayCollectionUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidBluRayCollectionUrlError();
  }

  const hostname = url.hostname.toLowerCase();
  const allowedHostname = hostname === "blu-ray.com" || hostname === "www.blu-ray.com";
  const userIds = url.searchParams.getAll("u");
  const categoryIds = url.searchParams.getAll("categoryid");
  if (
    url.protocol !== "https:" ||
    !allowedHostname ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/community/collection.php" ||
    userIds.length !== 1 ||
    !/^[1-9]\d*$/.test(userIds[0] ?? "") ||
    categoryIds.length !== 1 ||
    categoryIds[0] !== "7"
  ) {
    throw new InvalidBluRayCollectionUrlError();
  }

  url.hostname = hostname;
  url.hash = "";
  url.searchParams.delete("page");
  return url.toString();
}

async function drainBounded(response: Response, maximumBytes: number): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) return;
    const value: unknown = chunk.value;
    if (!(value instanceof Uint8Array)) {
      throw new ExternalFetchError("Blu-ray.com returned an invalid response stream.", null, false);
    }
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel("Response exceeded the configured size limit.");
      throw new ExternalFetchError("Blu-ray.com returned an unexpectedly large page.", null, false);
    }
  }
}

export async function parseCollectionPage(
  response: Response,
  collectionUrl = response.url,
): Promise<ParsedPage> {
  const releases: ParsedRelease[] = [];
  let invalidReleaseUrl = false;
  let highestPage = 0;
  const transformed = new HTMLRewriter()
    .on("a.hoverlink[data-productid]", {
      element(element) {
        const productId = element.getAttribute("data-productid");
        const sourceTitle = element.getAttribute("title");
        const sourceUrl = element.getAttribute("href");
        const categoryId = element.getAttribute("data-categoryid");
        if (productId && sourceTitle && sourceUrl && (!categoryId || categoryId === "7")) {
          const normalizedUrl = normalizeBluRayReleaseUrl(sourceUrl, productId, collectionUrl);
          if (!normalizedUrl) {
            invalidReleaseUrl = true;
            return;
          }
          releases.push(parseReleaseLabel(productId, sourceTitle, normalizedUrl));
        }
      },
    })
    .on('a[href*="page="]', {
      element(element) {
        const href = element.getAttribute("href") ?? "";
        const page = Number(href.match(/[?&](?:amp;)?page=(\d+)/)?.[1] ?? 0);
        if (Number.isInteger(page)) highestPage = Math.max(highestPage, page);
      },
    })
    .transform(response);

  await drainBounded(transformed, MAX_COLLECTION_BYTES);
  if (invalidReleaseUrl) {
    throw new ExternalFetchError(
      "Blu-ray.com returned an invalid physical release URL.",
      null,
      false,
    );
  }
  return { releases, highestPage };
}

async function fetchPage(url: URL, budget: FetchBudget): Promise<ParsedPage> {
  const response = await budget.fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) {
    throw new ExternalFetchError(
      `Blu-ray.com returned HTTP ${response.status}.`,
      response.status,
      response.status === 429 || response.status >= 500,
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new ExternalFetchError("Blu-ray.com returned an unexpected content type.", null, false);
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_COLLECTION_BYTES) {
    throw new ExternalFetchError("Blu-ray.com returned an unexpectedly large page.", null, false);
  }
  return parseCollectionPage(response, url.toString());
}

export async function fetchCollection(
  sourceUrl: string,
  budget: FetchBudget,
): Promise<ParsedRelease[]> {
  const baseUrl = new URL(validateBluRayCollectionUrl(sourceUrl));
  const firstPage = await fetchPage(baseUrl, budget);
  if (firstPage.releases.length === 0) {
    throw new ExternalFetchError(
      "No collection releases were found; the page structure may have changed.",
      null,
      false,
    );
  }
  if (firstPage.releases.length >= 40 && firstPage.highestPage === 0) {
    throw new ExternalFetchError(
      "Collection pagination disappeared while the first page remained full; refusing a partial snapshot.",
      null,
      false,
    );
  }
  if (firstPage.highestPage >= MAX_COLLECTION_PAGES) {
    throw new ExternalFetchError(
      "The collection reported more pages than the safety limit allows.",
      null,
      false,
    );
  }

  const releases = [...firstPage.releases];
  for (let page = 1; page <= firstPage.highestPage; page += 1) {
    const pageUrl = new URL(baseUrl);
    pageUrl.searchParams.set("page", String(page));
    const parsed = await fetchPage(pageUrl, budget);
    if (parsed.releases.length === 0) {
      throw new ExternalFetchError(
        `Expected collection page ${page} was empty; refusing a partial snapshot.`,
        null,
        false,
      );
    }
    releases.push(...parsed.releases);
  }

  return [...new Map(releases.map((release) => [release.productId, release])).values()];
}
