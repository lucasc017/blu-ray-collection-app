PRAGMA foreign_keys = ON;

CREATE TABLE titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id INTEGER NOT NULL,
  season_number INTEGER NOT NULL DEFAULT -1,
  display_title TEXT NOT NULL,
  original_title TEXT,
  sort_title TEXT NOT NULL,
  overview TEXT NOT NULL DEFAULT '',
  release_date TEXT,
  release_year INTEGER,
  poster_path TEXT,
  backdrop_path TEXT,
  runtime_minutes INTEGER,
  episode_count INTEGER,
  vote_average REAL,
  metadata_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((media_type = 'movie' AND season_number = -1) OR (media_type = 'tv' AND season_number >= 0)),
  UNIQUE (media_type, tmdb_id, season_number)
);

CREATE TABLE title_genres (
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  tmdb_genre_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (title_id, tmdb_genre_id)
);

CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  local_date TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'manual')),
  phase TEXT NOT NULL CHECK (phase IN ('discover', 'resolve', 'refresh', 'finalize')),
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  cursor TEXT,
  external_fetches INTEGER NOT NULL DEFAULT 0,
  releases_seen INTEGER NOT NULL DEFAULT 0,
  releases_resolved INTEGER NOT NULL DEFAULT 0,
  issues_created INTEGER NOT NULL DEFAULT 0,
  titles_refreshed INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE source_releases (
  product_id TEXT PRIMARY KEY,
  source_title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  release_year INTEGER,
  source_url TEXT NOT NULL,
  format TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  mapping_revision TEXT NOT NULL,
  mapping_status TEXT NOT NULL DEFAULT 'pending' CHECK (mapping_status IN ('pending', 'resolved', 'issue')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  seen_sync_run_id TEXT REFERENCES sync_runs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE source_release_titles (
  product_id TEXT NOT NULL REFERENCES source_releases(product_id) ON DELETE CASCADE,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, title_id)
);

CREATE TABLE sync_days (
  local_date TEXT PRIMARY KEY,
  target_slot INTEGER NOT NULL CHECK (target_slot BETWEEN 0 AND 95),
  status TEXT NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting', 'running', 'complete', 'failed')),
  run_id TEXT REFERENCES sync_runs(id) ON DELETE SET NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sync_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id TEXT REFERENCES sync_runs(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES source_releases(product_id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  details_json TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_titles_sort_title ON titles(sort_title, id);
CREATE INDEX idx_titles_release_year ON titles(release_year);
CREATE INDEX idx_titles_media_type ON titles(media_type);
CREATE INDEX idx_title_genres_filter ON title_genres(tmdb_genre_id, title_id);
CREATE INDEX idx_source_releases_active ON source_releases(active, product_id);
CREATE INDEX idx_source_releases_pending ON source_releases(mapping_status, product_id);
CREATE INDEX idx_source_releases_seen_run ON source_releases(seen_sync_run_id);
CREATE INDEX idx_source_release_titles_title ON source_release_titles(title_id, product_id);
CREATE INDEX idx_sync_runs_status ON sync_runs(status, started_at);
CREATE INDEX idx_sync_issues_unresolved ON sync_issues(resolved_at, product_id);
