PRAGMA foreign_keys = ON;

CREATE TABLE movie_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id INTEGER NOT NULL UNIQUE REFERENCES titles(id) ON DELETE CASCADE,
  created_by_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  fulfilled_at TEXT
);

CREATE TABLE movie_recommendation_endorsements (
  recommendation_id INTEGER NOT NULL REFERENCES movie_recommendations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (recommendation_id, user_id)
);

CREATE INDEX movie_recommendations_active_newest_idx
  ON movie_recommendations(fulfilled_at, created_at DESC, id DESC);

CREATE INDEX movie_recommendation_endorsements_user_idx
  ON movie_recommendation_endorsements(user_id, recommendation_id);
