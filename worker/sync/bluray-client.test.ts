import { describe, expect, it } from "vitest";
import {
  InvalidBluRayCollectionUrlError,
  parseCollectionPage,
  validateBluRayCollectionUrl,
} from "./bluray-client";

describe("Blu-ray collection URL validation", () => {
  it.each([
    "https://www.blu-ray.com/community/collection.php?u=123456&categoryid=7",
    "https://blu-ray.com/community/collection.php?categoryid=7&u=42",
  ])("accepts a supported collection URL: %s", (url) => {
    expect(validateBluRayCollectionUrl(url)).toContain("blu-ray.com/community/collection.php");
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

  it("removes fragments and a supplied pagination cursor", () => {
    const url = validateBluRayCollectionUrl(
      "https://www.blu-ray.com/community/collection.php?u=123456&categoryid=7&page=3#private",
    );
    expect(url).toBe("https://www.blu-ray.com/community/collection.php?u=123456&categoryid=7");
  });
});

describe("Blu-ray collection parser", () => {
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
