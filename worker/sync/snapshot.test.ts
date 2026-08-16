import { describe, expect, it } from "vitest";
import { InvalidCollectionSnapshotError, parseCollectionSnapshot } from "./snapshot";

const collectionUrl = "https://www.blu-ray.com/community/collection.php?u=123456&categoryid=7";

describe("collection snapshots", () => {
  it("normalizes and deduplicates validated release entries", () => {
    const releases = parseCollectionSnapshot(
      {
        version: 1,
        pageCount: 2,
        releases: [
          {
            productId: "271695",
            title: "21 Jump Street 4K (2012)",
            href: "/movies/21-Jump-Street-4K-Blu-ray/271695/?from=collection",
            categoryId: "7",
          },
          {
            productId: "271695",
            title: "21 Jump Street 4K (2012)",
            href: "https://www.blu-ray.com/movies/21-Jump-Street-4K-Blu-ray/271695/",
          },
        ],
      },
      collectionUrl,
    );

    expect(releases).toEqual([
      expect.objectContaining({
        productId: "271695",
        normalizedTitle: "21 jump street",
        releaseYear: 2012,
        sourceUrl: "https://www.blu-ray.com/movies/21-Jump-Street-4K-Blu-ray/271695/",
      }),
    ]);
  });

  it.each([
    null,
    { version: 1, pageCount: 0, releases: [] },
    {
      version: 1,
      pageCount: 1,
      releases: [
        {
          productId: "271695",
          title: "Example Blu-ray (2020)",
          href: "https://blu-ray.com.evil.example/movies/Example-Blu-ray/271695/",
        },
      ],
    },
  ])("rejects an invalid or empty manifest", (manifest) => {
    expect(() => parseCollectionSnapshot(manifest, collectionUrl)).toThrow(
      InvalidCollectionSnapshotError,
    );
  });
});
