PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS site_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('publishing', 'published', 'failed', 'superseded')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  sitemap_xml TEXT NOT NULL DEFAULT '',
  json_ld TEXT NOT NULL DEFAULT '',
  meta_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS site_publish_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  published_version_id INTEGER REFERENCES site_versions(id) ON DELETE SET NULL,
  previous_version_id INTEGER REFERENCES site_versions(id) ON DELETE SET NULL,
  publishing INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS preview_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_site_versions_status ON site_versions(status);
CREATE INDEX IF NOT EXISTS idx_preview_tokens_expires ON preview_tokens(expires_at);

INSERT OR IGNORE INTO site_publish_state (id, published_version_id, previous_version_id, publishing)
VALUES (1, NULL, NULL, 0);
