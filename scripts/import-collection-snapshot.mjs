import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const MAX_FILES = 20;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_IMPORT_URL = "http://localhost:5173/api/internal/collection-snapshot";

function fail(message) {
  throw new Error(message);
}

function validatedCollectionUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("BLURAY_COLLECTION_URL is missing or invalid.");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    (hostname !== "blu-ray.com" && hostname !== "www.blu-ray.com") ||
    url.pathname !== "/community/collection.php" ||
    !/^[1-9]\d*$/.test(url.searchParams.get("u") ?? "") ||
    (url.searchParams.has("categoryid") && url.searchParams.get("categoryid") !== "7")
  ) {
    fail("BLURAY_COLLECTION_URL is missing or invalid.");
  }
  url.searchParams.set("categoryid", "7");
  return url;
}

function validatedImportUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("SYNC_IMPORT_URL is invalid.");
  }
  const localHttp =
    url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (
    (!localHttp && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/api/internal/collection-snapshot"
  ) {
    fail("SYNC_IMPORT_URL must be HTTPS (or local HTTP) and use the snapshot endpoint path.");
  }
  return url;
}

function entriesFromHtml(html, collectionUrl) {
  const document = new JSDOM(html).window.document;
  const releases = [];
  for (const anchor of document.querySelectorAll("a.hoverlink[data-productid]")) {
    const productId = anchor.getAttribute("data-productid");
    const title = anchor.getAttribute("title");
    const href = anchor.getAttribute("href");
    const categoryId = anchor.getAttribute("data-categoryid");
    if (!productId || !title || !href || (categoryId && categoryId !== "7")) continue;
    releases.push({ productId, title, href, ...(categoryId ? { categoryId } : {}) });
  }

  let highestPage = 0;
  for (const anchor of document.querySelectorAll('a[href*="page="]')) {
    try {
      const page = Number(
        new URL(anchor.getAttribute("href"), collectionUrl).searchParams.get("page"),
      );
      if (Number.isInteger(page)) highestPage = Math.max(highestPage, page);
    } catch {
      // Ignore unrelated malformed navigation links; release links are validated by the Worker.
    }
  }
  return { releases, highestPage };
}

async function main() {
  const filePaths = process.argv.slice(2);
  if (filePaths.length === 0 || filePaths.length > MAX_FILES) {
    fail(
      "Pass the saved collection HTML files in page order (base page, then page=1, page=2, ...).",
    );
  }

  const collectionUrl = validatedCollectionUrl(process.env.BLURAY_COLLECTION_URL);
  const importUrl = validatedImportUrl(process.env.SYNC_IMPORT_URL || DEFAULT_IMPORT_URL);
  const token = process.env.SYNC_ADMIN_TOKEN;
  if (!token || token.length < 32) fail("SYNC_ADMIN_TOKEN is missing or invalid.");

  const parsedPages = [];
  for (const filePath of filePaths) {
    const html = await readFile(filePath, "utf8");
    if (Buffer.byteLength(html) > MAX_FILE_BYTES) fail("A saved collection page is too large.");
    const page = entriesFromHtml(html, collectionUrl);
    if (page.releases.length === 0)
      fail("A saved page contains no recognizable collection releases.");
    parsedPages.push(page);
  }

  const expectedFiles = parsedPages[0].highestPage + 1;
  if (filePaths.length !== expectedFiles) {
    fail(
      `The first page reports ${expectedFiles} collection pages, but ${filePaths.length} files were supplied.`,
    );
  }
  if (parsedPages[0].releases.length >= 40 && parsedPages[0].highestPage === 0) {
    fail(
      "The first saved page is full but contains no pagination links; refusing a partial snapshot.",
    );
  }

  const releases = [
    ...new Map(
      parsedPages.flatMap((page) => page.releases).map((release) => [release.productId, release]),
    ).values(),
  ];
  const response = await globalThis.fetch(importUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ version: 1, pageCount: filePaths.length, releases }),
  });
  const result = await response.json();
  if (!response.ok) {
    fail(result?.error?.message || `The snapshot endpoint returned HTTP ${response.status}.`);
  }

  console.log(
    `Snapshot accepted: ${result.counts?.releasesSeen ?? releases.length} releases; sync is ${result.status} in ${result.phase}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "The collection snapshot import failed.");
  process.exitCode = 1;
});
