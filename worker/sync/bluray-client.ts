import puppeteer, { type BrowserWorker, type Page } from "@cloudflare/puppeteer";
import { z } from "zod";
import { normalizeBluRayReleaseUrl } from "../../shared/security";
import { ExternalFetchError, type FetchBudget } from "./fetch-budget";
import { parseReleaseLabel } from "./normalization";
import type { ParsedRelease } from "./types";

const MAX_COLLECTION_BYTES = 2 * 1024 * 1024;
const MAX_COLLECTION_PAGES = 20;
const MAX_RELEASES_PER_PAGE = 100;
const COLLECTION_NAVIGATION_TIMEOUT_MS = 30_000;
const RELEASE_SELECTOR = "a.hoverlink[data-productid]";

export interface ParsedPage {
  releases: ParsedRelease[];
  highestPage: number;
}

export type CollectionPageLoader = (pageNumber: number) => Promise<ParsedPage>;
export type ExistingProductLookup = (productIds: string[]) => Promise<ReadonlySet<string>>;

interface BrowserAnchorLike {
  getAttribute(name: string): string | null;
}

interface BrowserDocumentLike {
  body: { innerText: string } | null;
  querySelectorAll(selector: string): ArrayLike<BrowserAnchorLike>;
}

interface BrowserContextLike {
  document: BrowserDocumentLike;
  location: { href: string };
}

const browserPageSchema = z.object({
  pageKind: z.enum(["collection", "no-index", "empty"]),
  releases: z
    .array(
      z.object({
        productId: z.string().max(20),
        sourceTitle: z.string().max(500),
        sourceUrl: z.string().max(2_048),
        categoryId: z.string().max(20).nullable(),
      }),
    )
    .max(MAX_RELEASES_PER_PAGE),
  pageNumbers: z.array(z.number().int().min(0).max(10_000)).max(100),
});

export function readBrowserPageSnapshot(
  {
    maximumReleases,
    selector,
  }: {
    maximumReleases: number;
    selector: string;
  },
  browserContext: BrowserContextLike = globalThis as unknown as BrowserContextLike,
) {
  const text = browserContext.document.body?.innerText.trim() ?? "";
  const anchors = Array.from(browserContext.document.querySelectorAll(selector)).slice(
    0,
    maximumReleases + 1,
  );
  const pageNumbers = [
    ...new Set(
      Array.from(browserContext.document.querySelectorAll('a[href*="page="]'))
        .map((anchor) =>
          Number(
            new URL(
              anchor.getAttribute("href") ?? "",
              browserContext.location.href,
            ).searchParams.get("page"),
          ),
        )
        .filter(Number.isInteger),
    ),
  ];
  return {
    pageKind: text === "No index." ? "no-index" : text.length === 0 ? "empty" : "collection",
    releases: anchors.map((anchor) => ({
      productId: anchor.getAttribute("data-productid") ?? "",
      sourceTitle: anchor.getAttribute("title") ?? "",
      sourceUrl: anchor.getAttribute("href") ?? "",
      categoryId: anchor.getAttribute("data-categoryid"),
    })),
    pageNumbers,
  };
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
    (categoryIds.length !== 0 && (categoryIds.length !== 1 || categoryIds[0] !== "7"))
  ) {
    throw new InvalidBluRayCollectionUrlError();
  }

  url.hostname = hostname;
  url.hash = "";
  url.searchParams.delete("page");
  url.searchParams.delete("action");
  url.searchParams.delete("sortby");
  url.searchParams.set("categoryid", "7");
  url.searchParams.set("sortby", "recentlyaddedcollection");
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

function parseBrowserPage(input: unknown, collectionUrl: string): ParsedPage {
  const parsed = browserPageSchema.safeParse(input);
  if (!parsed.success) {
    throw new ExternalFetchError(
      "Blu-ray.com returned an unexpected collection page structure.",
      null,
      false,
    );
  }
  if (parsed.data.pageKind === "no-index") {
    throw new ExternalFetchError("Blu-ray.com declined the browser request.", null, false);
  }

  const releases = new Map<string, ParsedRelease>();
  for (const entry of parsed.data.releases) {
    if (entry.categoryId && entry.categoryId !== "7") continue;
    if (!/^[1-9]\d*$/.test(entry.productId) || !entry.sourceTitle || !entry.sourceUrl) {
      throw new ExternalFetchError(
        "Blu-ray.com returned an invalid collection release.",
        null,
        false,
      );
    }
    const sourceUrl = normalizeBluRayReleaseUrl(entry.sourceUrl, entry.productId, collectionUrl);
    if (!sourceUrl) {
      throw new ExternalFetchError(
        "Blu-ray.com returned an invalid physical release URL.",
        null,
        false,
      );
    }
    const release = parseReleaseLabel(entry.productId, entry.sourceTitle, sourceUrl);
    const duplicate = releases.get(release.productId);
    if (duplicate && duplicate.fingerprint !== release.fingerprint) {
      throw new ExternalFetchError(
        "Blu-ray.com returned conflicting entries for one physical release.",
        null,
        false,
      );
    }
    releases.set(release.productId, release);
  }

  return {
    releases: [...releases.values()],
    highestPage: Math.max(0, ...parsed.data.pageNumbers),
  };
}

async function loadBrowserPage(
  page: Page,
  collectionUrl: URL,
  pageNumber: number,
  budget: FetchBudget,
): Promise<ParsedPage> {
  budget.consume();
  const pageUrl = new URL(collectionUrl);
  if (pageNumber > 0) pageUrl.searchParams.set("page", String(pageNumber));

  try {
    const response = await page.goto(pageUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: COLLECTION_NAVIGATION_TIMEOUT_MS,
    });
    const status = response?.status() ?? null;
    if (status === null || status < 200 || status >= 300) {
      throw new ExternalFetchError(
        status === null
          ? "Blu-ray.com did not return a navigation response."
          : `Blu-ray.com returned HTTP ${status}.`,
        status,
        status === null || status === 429 || status >= 500,
      );
    }

    const snapshot = await page.evaluate(readBrowserPageSnapshot, {
      maximumReleases: MAX_RELEASES_PER_PAGE,
      selector: RELEASE_SELECTOR,
    });
    return parseBrowserPage(snapshot, pageUrl.toString());
  } catch (error) {
    if (error instanceof ExternalFetchError) throw error;
    throw new ExternalFetchError("Blu-ray.com browser navigation failed.", null, true);
  }
}

export async function collectRecentlyAddedPages(
  loadPage: CollectionPageLoader,
  findExistingProductIds: ExistingProductLookup,
): Promise<ParsedRelease[]> {
  const releases = new Map<string, ParsedRelease>();
  let pageNumber = 0;
  let highestPage = 0;

  while (true) {
    const parsed = await loadPage(pageNumber);
    if (parsed.releases.length === 0) {
      throw new ExternalFetchError(
        pageNumber === 0
          ? "No collection releases were found; the page structure may have changed."
          : `Expected collection page ${pageNumber} was empty; refusing a partial import.`,
        null,
        false,
      );
    }

    if (pageNumber === 0) {
      highestPage = parsed.highestPage;
      if (highestPage >= MAX_COLLECTION_PAGES) {
        throw new ExternalFetchError(
          "The collection reported more pages than the safety limit allows.",
          null,
          false,
        );
      }
      if (parsed.releases.length >= 40 && highestPage === 0) {
        throw new ExternalFetchError(
          "Collection pagination disappeared while the first page remained full; refusing a partial import.",
          null,
          false,
        );
      }
    }

    const existing = await findExistingProductIds(
      parsed.releases.map((release) => release.productId),
    );
    for (const release of parsed.releases) releases.set(release.productId, release);

    const everyReleaseIsNew = parsed.releases.every((release) => !existing.has(release.productId));
    if (!everyReleaseIsNew || pageNumber >= highestPage) break;
    pageNumber += 1;
  }

  return [...releases.values()];
}

export async function fetchRecentlyAddedCollection(
  sourceUrl: string,
  browserBinding: BrowserWorker,
  budget: FetchBudget,
  findExistingProductIds: ExistingProductLookup,
): Promise<ParsedRelease[]> {
  const collectionUrl = new URL(validateBluRayCollectionUrl(sourceUrl));
  try {
    const browser = await puppeteer.launch(browserBinding);
    try {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        const action =
          request.isNavigationRequest() && request.frame() === page.mainFrame()
            ? request.continue()
            : request.abort();
        void action.catch(() => undefined);
      });
      return await collectRecentlyAddedPages(
        (pageNumber) => loadBrowserPage(page, collectionUrl, pageNumber, budget),
        findExistingProductIds,
      );
    } finally {
      await browser.close();
    }
  } catch (error) {
    if (error instanceof ExternalFetchError) throw error;
    throw new ExternalFetchError(
      "Cloudflare Browser Run could not load the collection.",
      null,
      true,
    );
  }
}
