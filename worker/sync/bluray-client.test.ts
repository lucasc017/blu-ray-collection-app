import { describe, expect, it } from "vitest";
import {
  collectRecentlyAddedPages,
  InvalidBluRayCollectionUrlError,
  parseCollectionPage,
  readBrowserPageSnapshot,
  validateBluRayCollectionUrl,
} from "./bluray-client";
import type { ParsedRelease } from "./types";

function release(productId: string): ParsedRelease {
  return {
    productId,
    sourceTitle: `Movie ${productId} (2020)`,
    normalizedTitle: `movie ${productId}`,
    releaseYear: 2020,
    sourceUrl: `https://www.blu-ray.com/movies/Movie-${productId}-Blu-ray/${productId}/`,
    format: "Blu-ray",
    fingerprint: `fingerprint-${productId}`,
  };
}

describe("Blu-ray collection URL validation", () => {
  it.each([
    "https://www.blu-ray.com/community/collection.php?u=123456&categoryid=7",
    "https://www.blu-ray.com/community/collection.php?u=123456",
    "https://blu-ray.com/community/collection.php?categoryid=7&u=42",
  ])("accepts a supported collection URL: %s", (url) => {
    expect(validateBluRayCollectionUrl(url)).toContain("blu-ray.com/community/collection.php");
    expect(validateBluRayCollectionUrl(url)).toContain("categoryid=7");
    expect(validateBluRayCollectionUrl(url)).toContain("sortby=recentlyaddedcollection");
  });

  it.each([
    "not-a-url",
    "http://www.blu-ray.com/community/collection.php?u=123456&categoryid=7",
    "https://blu-ray.com.evil.example/community/collection.php?u=123456&categoryid=7",
    "https://www.blu-ray.com:8443/community/collection.php?u=123456&categoryid=7",
    "https://user:password@www.blu-ray.com/community/collection.php?u=123456&categoryid=7",
    "https://www.blu-ray.com/movies/?u=123456&categoryid=7",
    "https://www.blu-ray.com/community/collection.php?u=0&categoryid=7",
    "https://www.blu-ray.com/community/collection.php?u=not-numeric&categoryid=7",
    "https://www.blu-ray.com/community/collection.php?u=123456&categoryid=4",
    "https://www.blu-ray.com/community/collection.php?u=123456&u=42&categoryid=7",
    "https://www.blu-ray.com/community/collection.php?u=123456&categoryid=7&categoryid=4",
  ])("rejects an unsupported source: %s", (url) => {
    expect(() => validateBluRayCollectionUrl(url)).toThrow(InvalidBluRayCollectionUrlError);
  });

  it("selects the recently-added view and removes fragments and pagination cursors", () => {
    const url = validateBluRayCollectionUrl(
      "https://www.blu-ray.com/community/collection.php?u=123456&categoryid=7&page=3&action=owned#private",
    );
    expect(url).toBe(
      "https://www.blu-ray.com/community/collection.php?u=123456&categoryid=7&sortby=recentlyaddedcollection",
    );
  });
});

describe("recently-added collection pagination", () => {
  it("stops after importing a page that contains any existing release", async () => {
    const loadedPages: number[] = [];
    const releases = await collectRecentlyAddedPages(
      (pageNumber) => {
        loadedPages.push(pageNumber);
        return Promise.resolve({ releases: [release("1"), release("2")], highestPage: 2 });
      },
      (productIds) => Promise.resolve(new Set(productIds.filter((productId) => productId === "2"))),
    );

    expect(loadedPages).toEqual([0]);
    expect(releases.map(({ productId }) => productId)).toEqual(["1", "2"]);
  });

  it("requests each next page while every release is new and stops at the last page", async () => {
    const loadedPages: number[] = [];
    const releases = await collectRecentlyAddedPages(
      (pageNumber) => {
        loadedPages.push(pageNumber);
        return Promise.resolve({
          releases: [release(String(pageNumber + 1))],
          highestPage: 2,
        });
      },
      () => Promise.resolve(new Set()),
    );

    expect(loadedPages).toEqual([0, 1, 2]);
    expect(releases.map(({ productId }) => productId)).toEqual(["1", "2", "3"]);
  });

  it("stops on a later page as soon as that page contains a known release", async () => {
    const loadedPages: number[] = [];
    await collectRecentlyAddedPages(
      (pageNumber) => {
        loadedPages.push(pageNumber);
        return Promise.resolve({
          releases: pageNumber === 0 ? [release("1")] : [release("2"), release("3")],
          highestPage: 2,
        });
      },
      (productIds) => Promise.resolve(new Set(productIds.filter((productId) => productId === "3"))),
    );

    expect(loadedPages).toEqual([0, 1]);
  });
});

describe("Blu-ray collection parser", () => {
  it("reads browser NodeLists without assuming array-only methods", () => {
    const releaseAttributes: Record<string, string> = {
      "data-productid": "271695",
      title: "21 Jump Street 4K (2012)",
      href: "https://www.blu-ray.com/movies/21-Jump-Street-4K-Blu-ray/271695/",
      "data-categoryid": "7",
    };
    const releaseAnchor = { getAttribute: (name: string) => releaseAttributes[name] ?? null };
    const pageAnchor = {
      getAttribute: (name: string) =>
        name === "href" ? "https://www.blu-ray.com/community/collection.php?u=123456&page=2" : null,
    };

    expect(
      readBrowserPageSnapshot(
        { maximumReleases: 100, selector: "a.hoverlink[data-productid]" },
        {
          document: {
            body: { innerText: "Collection" },
            querySelectorAll: (selector: string) =>
              selector === 'a[href*="page="]'
                ? { 0: pageAnchor, length: 1 }
                : { 0: releaseAnchor, length: 1 },
          },
          location: {
            href: "https://www.blu-ray.com/community/collection.php?u=123456",
          },
        },
      ),
    ).toEqual({
      pageKind: "collection",
      releases: [
        {
          productId: "271695",
          sourceTitle: "21 Jump Street 4K (2012)",
          sourceUrl: "https://www.blu-ray.com/movies/21-Jump-Street-4K-Blu-ray/271695/",
          categoryId: "7",
        },
      ],
      pageNumbers: [2],
    });
  });

  it("extracts stable release attributes, deduplicates later, and discovers pagination", async () => {
    const response = new Response(
      `<html><body>
        <a class="hoverlink" data-categoryid="7" data-productid="271695"
          href="https://www.blu-ray.com/movies/21-Jump-Street-4K-Blu-ray/271695/"
          title="21 Jump Street 4K (2012)"></a>
        <a href="collection.php?u=123456&amp;categoryid=7&amp;page=2">3</a>
      </body></html>`,
      { headers: { "content-type": "text/html" } },
    );
    const page = await parseCollectionPage(
      response,
      "https://www.blu-ray.com/community/collection.php?u=123456&categoryid=7",
    );
    expect(page.highestPage).toBe(2);
    expect(page.releases).toEqual([
      expect.objectContaining({
        productId: "271695",
        normalizedTitle: "21 jump street",
        releaseYear: 2012,
      }),
    ]);
  });

  it.each([
    "javascript:alert(1)",
    "https://blu-ray.com.evil.example/movies/Example-Blu-ray/271695/",
    "https://www.blu-ray.com/movies/Example-Blu-ray/999999/",
  ])("fails a page containing an unsafe physical release link: %s", async (sourceUrl) => {
    const response = new Response(
      `<a class="hoverlink" data-categoryid="7" data-productid="271695"
        href="${sourceUrl}" title="Example Blu-ray (2020)"></a>`,
      { headers: { "content-type": "text/html" } },
    );
    await expect(
      parseCollectionPage(
        response,
        "https://www.blu-ray.com/community/collection.php?u=123456&categoryid=7",
      ),
    ).rejects.toThrow("invalid physical release URL");
  });
});
