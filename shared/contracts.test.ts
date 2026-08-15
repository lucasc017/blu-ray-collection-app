import { describe, expect, it } from "vitest";
import { titlePath } from "./contracts";

describe("titlePath", () => {
  it("builds movie and season-aware TV paths", () => {
    expect(titlePath({ mediaType: "movie", tmdbId: 603, seasonNumber: null })).toBe(
      "/title/movie/603",
    );
    expect(titlePath({ mediaType: "tv", tmdbId: 83867, seasonNumber: 1 })).toBe(
      "/title/tv/83867/season/1",
    );
  });
});
