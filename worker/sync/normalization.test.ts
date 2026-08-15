import { describe, expect, it } from "vitest";
import { normalizeTitle, parseReleaseLabel, sortTitle } from "./normalization";

describe("release title normalization", () => {
  it("removes physical format and extracts a single release year", () => {
    const release = parseReleaseLabel(
      "271695",
      "21 Jump Street 4K (2012)",
      "https://www.blu-ray.com/movies/21-Jump-Street-4K-Blu-ray/271695/",
    );
    expect(release.normalizedTitle).toBe("21 jump street");
    expect(release.releaseYear).toBe(2012);
    expect(release.format).toBe("4K UHD");
  });

  it("uses the first year for a box-set range", () => {
    const release = parseReleaseLabel(
      "1",
      "Spider-Man Trilogy 4K (2002-2007)",
      "https://example.com",
    );
    expect(release.normalizedTitle).toBe("spider man trilogy");
    expect(release.releaseYear).toBe(2002);
  });

  it("normalizes punctuation and sort articles deterministically", () => {
    expect(normalizeTitle("WALL·E & Friends")).toBe("wall e and friends");
    expect(sortTitle("The Matrix")).toBe("matrix");
  });
});
