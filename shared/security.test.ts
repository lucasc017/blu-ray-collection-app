import { describe, expect, it } from "vitest";
import { normalizeBluRayReleaseUrl } from "./security";

describe("Blu-ray release URL normalization", () => {
  it.each([
    [
      "https://www.blu-ray.com/movies/Example-Blu-ray/271695/",
      "https://www.blu-ray.com/movies/Example-Blu-ray/271695/",
    ],
    [
      "/movies/Example-Blu-ray/271695/?ref=collection#details",
      "https://www.blu-ray.com/movies/Example-Blu-ray/271695/",
    ],
  ])("accepts a matching Blu-ray.com product URL", (input, expected) => {
    expect(normalizeBluRayReleaseUrl(input, "271695")).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "http://www.blu-ray.com/movies/Example-Blu-ray/271695/",
    "https://blu-ray.com.evil.example/movies/Example-Blu-ray/271695/",
    "https://user:password@www.blu-ray.com/movies/Example-Blu-ray/271695/",
    "https://www.blu-ray.com:8443/movies/Example-Blu-ray/271695/",
    "https://www.blu-ray.com/community/collection.php?u=123456&categoryid=7",
    "https://www.blu-ray.com/movies/Example-Blu-ray/999999/",
  ])("rejects an unsafe or mismatched product URL: %s", (url) => {
    expect(normalizeBluRayReleaseUrl(url, "271695")).toBeNull();
  });

  it("rejects a non-numeric product ID", () => {
    expect(
      normalizeBluRayReleaseUrl(
        "https://www.blu-ray.com/movies/Example-Blu-ray/dev-example/",
        "dev-example",
      ),
    ).toBeNull();
  });
});
