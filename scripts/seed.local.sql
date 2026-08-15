-- Non-destructive local-only sample data for UI development.
-- A real collection sync will deactivate these dev-prefixed releases.

INSERT INTO titles (
  media_type, tmdb_id, season_number, display_title, original_title, sort_title,
  overview, release_date, release_year, poster_path, backdrop_path, runtime_minutes,
  episode_count, vote_average, metadata_updated_at, created_at, updated_at
) VALUES
  ('movie', 603, -1, 'The Matrix', 'The Matrix', 'matrix',
   'A computer hacker learns that the world he knows is a simulated reality.',
   '1999-03-31', 1999, '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
   '/icmmSD4vTTDKOq2vvdulafOGw93.jpg', 136, NULL, 8.2,
   '2026-08-15T12:00:00.000Z', '2026-08-15T12:00:00.000Z', '2026-08-15T12:00:00.000Z'),
  ('movie', 808, -1, 'Shrek', 'Shrek', 'shrek',
   'An ogre sets out to rescue a princess and discovers an unexpected friendship.',
   '2001-05-18', 2001, '/iB64vpL3dIObOtMZgX3RqdVdQDc.jpg',
   '/2l5UHZBcp9cx1PwKLdisJ0gV9jB.jpg', 90, NULL, 7.8,
   '2026-08-15T12:00:00.000Z', '2026-08-15T12:00:00.000Z', '2026-08-15T12:00:00.000Z'),
  ('tv', 83867, 1, 'Andor — Season 1', 'Andor — Season 1', 'andor season 1',
   'A thief begins a journey that will turn him into a rebel hero.',
   '2022-09-21', 2022, '/59SVNwLfoMnZPPB6ukW6dlPxAdI.jpg',
   '/1X4h40fcB4WWUmIBK0auT4zRBAV.jpg', 43, 12, 8.2,
   '2026-08-15T12:00:00.000Z', '2026-08-15T12:00:00.000Z', '2026-08-15T12:00:00.000Z')
ON CONFLICT(media_type, tmdb_id, season_number) DO UPDATE SET
  display_title = excluded.display_title,
  overview = excluded.overview,
  poster_path = excluded.poster_path,
  backdrop_path = excluded.backdrop_path,
  updated_at = excluded.updated_at;

INSERT OR REPLACE INTO source_releases (
  product_id, source_title, normalized_title, release_year, source_url, format,
  source_fingerprint, mapping_revision, mapping_status, active, first_seen_at,
  last_seen_at, updated_at
) VALUES
  ('dev-matrix', 'The Matrix 4K (1999)', 'the matrix', 1999,
   'https://example.invalid/dev-seed/matrix', '4K UHD', 'dev-matrix', 'dev-seed',
   'resolved', 1, '2026-08-15T12:00:00.000Z', '2026-08-15T12:00:00.000Z', '2026-08-15T12:00:00.000Z'),
  ('dev-shrek', 'Shrek 4K (2001)', 'shrek', 2001,
   'https://example.invalid/dev-seed/shrek', '4K UHD', 'dev-shrek', 'dev-seed',
   'resolved', 1, '2026-08-15T12:00:00.000Z', '2026-08-15T12:00:00.000Z', '2026-08-15T12:00:00.000Z'),
  ('dev-andor', 'Andor: The Complete First Season 4K (2022)', 'andor the complete first season', 2022,
   'https://example.invalid/dev-seed/andor', '4K UHD', 'dev-andor', 'dev-seed',
   'resolved', 1, '2026-08-15T12:00:00.000Z', '2026-08-15T12:00:00.000Z', '2026-08-15T12:00:00.000Z');

INSERT OR REPLACE INTO source_release_titles (product_id, title_id)
SELECT 'dev-matrix', id FROM titles WHERE media_type = 'movie' AND tmdb_id = 603 AND season_number = -1;
INSERT OR REPLACE INTO source_release_titles (product_id, title_id)
SELECT 'dev-shrek', id FROM titles WHERE media_type = 'movie' AND tmdb_id = 808 AND season_number = -1;
INSERT OR REPLACE INTO source_release_titles (product_id, title_id)
SELECT 'dev-andor', id FROM titles WHERE media_type = 'tv' AND tmdb_id = 83867 AND season_number = 1;

INSERT OR REPLACE INTO title_genres (title_id, tmdb_genre_id, name)
SELECT id, 28, 'Action' FROM titles WHERE media_type = 'movie' AND tmdb_id = 603 AND season_number = -1;
INSERT OR REPLACE INTO title_genres (title_id, tmdb_genre_id, name)
SELECT id, 16, 'Animation' FROM titles WHERE media_type = 'movie' AND tmdb_id = 808 AND season_number = -1;
INSERT OR REPLACE INTO title_genres (title_id, tmdb_genre_id, name)
SELECT id, 10765, 'Sci-Fi & Fantasy' FROM titles WHERE media_type = 'tv' AND tmdb_id = 83867 AND season_number = 1;
