import type { MappingTarget } from "./types";

export const MAPPING_REVISION = "2026-08-15.1";

const movie = (tmdbId: number): MappingTarget => ({ mediaType: "movie", tmdbId, seasonNumber: -1 });
const tvSeason = (tmdbId: number, seasonNumber: number): MappingTarget => ({
  mediaType: "tv",
  tmdbId,
  seasonNumber,
});

export const releaseOverrides: Readonly<Record<string, readonly MappingTarget[]>> = {
  "177012": [movie(1930), movie(102382)],
  "356918": [tvSeason(83867, 1)],
  "189876": [
    movie(671),
    movie(672),
    movie(673),
    movie(674),
    movie(675),
    movie(767),
    movie(12444),
    movie(12445),
  ],
  "254855": [movie(49051), movie(57158), movie(122917)],
  "344199": [tvSeason(82856, 1)],
  "307056": [movie(603), movie(604), movie(605), movie(624860)],
  "359935": [movie(808), movie(809), movie(810), movie(10192)],
  "305733": [movie(557), movie(558), movie(559)],
  "394492": [movie(1498), movie(1497), movie(1499)],
  "367656": [
    movie(1858),
    movie(8373),
    movie(38356),
    movie(91314),
    movie(335988),
    movie(424783),
    movie(667538),
  ],
};
