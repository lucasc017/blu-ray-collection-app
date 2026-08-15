import { describe, expect, it } from "vitest";
import {
  InvalidWorkerConfigurationError,
  isUsableSecret,
  validateSyncConfiguration,
} from "./config";

const validEnv = {
  BLURAY_COLLECTION_URL: "https://www.blu-ray.com/community/collection.php?u=123456&categoryid=7",
  TMDB_API_BASE_URL: "https://api.themoviedb.org/3",
  TMDB_READ_ACCESS_TOKEN:
    "test-tmdb-read-token-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789",
};

describe("Worker configuration validation", () => {
  it("accepts valid sync configuration without returning unrelated bindings", () => {
    expect(validateSyncConfiguration(validEnv)).toEqual({
      collectionUrl: "https://www.blu-ray.com/community/collection.php?u=123456&categoryid=7",
      tmdbApiBaseUrl: "https://api.themoviedb.org/3",
      tmdbReadAccessToken: validEnv.TMDB_READ_ACCESS_TOKEN,
    });
  });

  it.each([
    { ...validEnv, BLURAY_COLLECTION_URL: "https://example.com/collection" },
    { ...validEnv, TMDB_API_BASE_URL: "https://evil.example/3" },
    { ...validEnv, TMDB_READ_ACCESS_TOKEN: "replace-with-your-tmdb-read-access-token" },
    { ...validEnv, TMDB_READ_ACCESS_TOKEN: "too-short" },
  ])("rejects invalid configuration without including values in the error", (env) => {
    expect(() => validateSyncConfiguration(env)).toThrow(InvalidWorkerConfigurationError);
    expect(() => validateSyncConfiguration(env)).toThrow(
      "One or more required Worker settings are missing or invalid.",
    );
  });

  it("rejects placeholder, short, and whitespace-padded secrets", () => {
    expect(isUsableSecret("replace-with-a-long-random-token", 32)).toBe(false);
    expect(isUsableSecret("short", 32)).toBe(false);
    expect(isUsableSecret(` ${"a".repeat(32)}`, 32)).toBe(false);
    expect(isUsableSecret("a".repeat(32), 32)).toBe(true);
  });
});
