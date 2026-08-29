import type { TitleMetadata } from "../sync/types";

export function titleMetadataStatements(
  db: D1Database,
  metadata: TitleMetadata,
): D1PreparedStatement[] {
  const identity = [metadata.mediaType, metadata.tmdbId, metadata.seasonNumber] as const;
  return [
    db
      .prepare(
        `INSERT INTO titles
        (media_type, tmdb_id, season_number, display_title, original_title, sort_title,
         overview, release_date, release_year, poster_path, backdrop_path, runtime_minutes,
         episode_count, vote_average, metadata_updated_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(media_type, tmdb_id, season_number) DO UPDATE SET
          display_title = excluded.display_title,
          original_title = excluded.original_title,
          sort_title = excluded.sort_title,
          overview = excluded.overview,
          release_date = excluded.release_date,
          release_year = excluded.release_year,
          poster_path = excluded.poster_path,
          backdrop_path = excluded.backdrop_path,
          runtime_minutes = excluded.runtime_minutes,
          episode_count = excluded.episode_count,
          vote_average = excluded.vote_average,
          metadata_updated_at = excluded.metadata_updated_at,
          updated_at = excluded.updated_at`,
      )
      .bind(
        metadata.mediaType,
        metadata.tmdbId,
        metadata.seasonNumber,
        metadata.displayTitle,
        metadata.originalTitle,
        metadata.sortTitle,
        metadata.overview,
        metadata.releaseDate,
        metadata.releaseYear,
        metadata.posterPath,
        metadata.backdropPath,
        metadata.runtimeMinutes,
        metadata.episodeCount,
        metadata.voteAverage,
        metadata.metadataUpdatedAt,
        metadata.metadataUpdatedAt,
      ),
    db
      .prepare(
        `DELETE FROM title_genres WHERE title_id = (
          SELECT id FROM titles
          WHERE media_type = ? AND tmdb_id = ? AND season_number = ?
        )`,
      )
      .bind(...identity),
    ...metadata.genres.map((genre) =>
      db
        .prepare(
          `INSERT INTO title_genres (title_id, tmdb_genre_id, name)
           SELECT id, ?, ? FROM titles
           WHERE media_type = ? AND tmdb_id = ? AND season_number = ?`,
        )
        .bind(genre.id, genre.name, ...identity),
    ),
  ];
}

export async function upsertTitleMetadata(
  db: D1Database,
  metadata: TitleMetadata,
): Promise<number> {
  await db.batch(titleMetadataStatements(db, metadata));
  const id = await db
    .prepare(`SELECT id FROM titles WHERE media_type = ? AND tmdb_id = ? AND season_number = ?`)
    .bind(metadata.mediaType, metadata.tmdbId, metadata.seasonNumber)
    .first<number>("id");
  if (!id) throw new Error("TMDB metadata could not be stored.");
  return id;
}
