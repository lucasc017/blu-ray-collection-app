import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchBudget } from "./fetch-budget";
import { TmdbClient } from "./tmdb-client";

afterEach(() => vi.unstubAllGlobals());

function client() {
  return new TmdbClient("https://api.themoviedb.org/3", "test-token", new FetchBudget(3));
}

describe("TMDB administrator review lookups", () => {
  it("converts bounded movie search results to the shared review contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [
              {
                id: 101,
                title: "Matched Movie",
                original_title: "Matched Movie",
                overview: "A result overview.",
                release_date: "2020-01-01",
                poster_path: "/poster.jpg",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(client().search("movie", "Matched Movie", 2020)).resolves.toEqual({
      items: [
        {
          mediaType: "movie",
          tmdbId: 101,
          title: "Matched Movie",
          originalTitle: "Matched Movie",
          overview: "A result overview.",
          releaseDate: "2020-01-01",
          releaseYear: 2020,
          posterPath: "/poster.jpg",
        },
      ],
    });
  });

  it("returns ordered TV seasons including specials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 202,
            name: "Selected Show",
            original_name: "Selected Show",
            overview: "",
            poster_path: null,
            backdrop_path: null,
            vote_average: 7,
            genres: [],
            seasons: [
              {
                season_number: 2,
                name: "Season 2",
                air_date: "2022-01-01",
                episode_count: 8,
                poster_path: "/season-2.jpg",
              },
              {
                season_number: 0,
                name: "Specials",
                air_date: null,
                episode_count: 2,
                poster_path: null,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(client().listSeasons(202)).resolves.toEqual({
      seriesTitle: "Selected Show",
      seasons: [
        {
          seasonNumber: 0,
          name: "Specials",
          airDate: null,
          episodeCount: 2,
          posterPath: null,
        },
        {
          seasonNumber: 2,
          name: "Season 2",
          airDate: "2022-01-01",
          episodeCount: 8,
          posterPath: "/season-2.jpg",
        },
      ],
    });
  });
});
