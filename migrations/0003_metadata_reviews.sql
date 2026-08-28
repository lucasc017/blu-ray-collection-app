PRAGMA foreign_keys = ON;

CREATE TABLE release_mapping_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  source_issue_id INTEGER REFERENCES sync_issues(id) ON DELETE SET NULL,
  actor_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL CHECK (length(trim(actor_label)) > 0),
  created_at TEXT NOT NULL,
  superseded_at TEXT,
  UNIQUE (product_id, revision)
);

CREATE TABLE release_mapping_review_targets (
  review_revision_id INTEGER NOT NULL REFERENCES release_mapping_revisions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 19),
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id INTEGER NOT NULL CHECK (tmdb_id > 0),
  season_number INTEGER NOT NULL,
  PRIMARY KEY (review_revision_id, position),
  UNIQUE (review_revision_id, media_type, tmdb_id, season_number),
  CHECK (
    (media_type = 'movie' AND season_number = -1)
    OR (media_type = 'tv' AND season_number >= 0)
  )
);

CREATE UNIQUE INDEX release_mapping_revisions_active_idx
  ON release_mapping_revisions(product_id)
  WHERE superseded_at IS NULL;

CREATE INDEX release_mapping_revisions_product_history_idx
  ON release_mapping_revisions(product_id, revision DESC);

INSERT INTO release_mapping_revisions
  (product_id, revision, actor_label, created_at)
VALUES
  ('177012', 1, 'system:migration', '2026-08-15T00:00:00.000Z'),
  ('356918', 1, 'system:migration', '2026-08-15T00:00:00.000Z'),
  ('189876', 1, 'system:migration', '2026-08-15T00:00:00.000Z'),
  ('254855', 1, 'system:migration', '2026-08-15T00:00:00.000Z'),
  ('344199', 1, 'system:migration', '2026-08-15T00:00:00.000Z'),
  ('307056', 1, 'system:migration', '2026-08-15T00:00:00.000Z'),
  ('359935', 1, 'system:migration', '2026-08-15T00:00:00.000Z'),
  ('305733', 1, 'system:migration', '2026-08-15T00:00:00.000Z'),
  ('394492', 1, 'system:migration', '2026-08-15T00:00:00.000Z'),
  ('367656', 1, 'system:migration', '2026-08-15T00:00:00.000Z');

INSERT INTO release_mapping_review_targets
  (review_revision_id, position, media_type, tmdb_id, season_number)
VALUES
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '177012'), 0, 'movie', 1930, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '177012'), 1, 'movie', 102382, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '356918'), 0, 'tv', 83867, 1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '189876'), 0, 'movie', 671, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '189876'), 1, 'movie', 672, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '189876'), 2, 'movie', 673, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '189876'), 3, 'movie', 674, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '189876'), 4, 'movie', 675, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '189876'), 5, 'movie', 767, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '189876'), 6, 'movie', 12444, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '189876'), 7, 'movie', 12445, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '254855'), 0, 'movie', 49051, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '254855'), 1, 'movie', 57158, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '254855'), 2, 'movie', 122917, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '344199'), 0, 'tv', 82856, 1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '307056'), 0, 'movie', 603, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '307056'), 1, 'movie', 604, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '307056'), 2, 'movie', 605, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '307056'), 3, 'movie', 624860, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '359935'), 0, 'movie', 808, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '359935'), 1, 'movie', 809, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '359935'), 2, 'movie', 810, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '359935'), 3, 'movie', 10192, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '305733'), 0, 'movie', 557, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '305733'), 1, 'movie', 558, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '305733'), 2, 'movie', 559, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '394492'), 0, 'movie', 1498, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '394492'), 1, 'movie', 1497, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '394492'), 2, 'movie', 1499, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '367656'), 0, 'movie', 1858, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '367656'), 1, 'movie', 8373, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '367656'), 2, 'movie', 38356, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '367656'), 3, 'movie', 91314, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '367656'), 4, 'movie', 335988, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '367656'), 5, 'movie', 424783, -1),
  ((SELECT id FROM release_mapping_revisions WHERE product_id = '367656'), 6, 'movie', 667538, -1);
