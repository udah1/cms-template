-- Minimal pre-locale schema for resume-safe 005 migration tests only.
PRAGMA foreign_keys = ON;

CREATE TABLE site_content (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO site_content (key, value) VALUES
  ('business_name', 'Resume Test Biz'),
  ('hero_title', 'Hello');

CREATE TABLE services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  description TEXT NOT NULL
);
INSERT INTO services (id, sort_order, visible, title, description) VALUES
  (1, 1, 1, 'First service', 'Desc one');

CREATE TABLE portfolio_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'כללי',
  categories TEXT NOT NULL DEFAULT '["כללי"]',
  media_type TEXT NOT NULL DEFAULT 'image',
  media_url TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  alt_text TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO portfolio_items (id, title, category, categories, media_url, sort_order, visible, featured)
VALUES (1, 'Sample project', 'כללי', '["כללי"]', '/assets/placeholder-1.svg', 1, 1, 1);

CREATE TABLE site_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER,
  status TEXT NOT NULL CHECK (status IN ('publishing', 'published', 'failed', 'superseded')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  sitemap_xml TEXT NOT NULL DEFAULT '',
  json_ld TEXT NOT NULL DEFAULT '',
  meta_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT NOT NULL DEFAULT ''
);

CREATE TABLE site_publish_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  published_version_id INTEGER,
  previous_version_id INTEGER,
  publishing INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO site_publish_state (id, published_version_id, previous_version_id, publishing)
VALUES (1, NULL, NULL, 0);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL,
  details_json TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
