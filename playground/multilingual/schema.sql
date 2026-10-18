PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_throttle (
  throttle_key TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL DEFAULT (datetime('now')),
  locked_until TEXT
);

-- Locale-ready site content (Stage 0: single defaultLocale rows).
CREATE TABLE IF NOT EXISTS site_content (
  key TEXT NOT NULL,
  locale TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (key, locale)
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS service_translations (
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  PRIMARY KEY (service_id, locale)
);

CREATE TABLE IF NOT EXISTS portfolio_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  media_url TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio_item_translations (
  portfolio_item_id INTEGER NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'כללי',
  categories TEXT NOT NULL DEFAULT '["כללי"]',
  alt_text TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (portfolio_item_id, locale)
);

-- Editable site-facing messages (not Admin chrome).
CREATE TABLE IF NOT EXISTS system_messages (
  key TEXT NOT NULL,
  locale TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (key, locale)
);

CREATE TABLE IF NOT EXISTS site_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  locale TEXT NOT NULL DEFAULT 'he',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('publishing', 'published', 'failed', 'superseded')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  sitemap_xml TEXT NOT NULL DEFAULT '',
  json_ld TEXT NOT NULL DEFAULT '',
  meta_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT NOT NULL DEFAULT ''
);

-- One publish state row per locale (not a global singleton).
CREATE TABLE IF NOT EXISTS site_publish_state (
  locale TEXT PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  locale TEXT,
  summary TEXT NOT NULL,
  details_json TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Translation freshness (publication stays in site_publish_state / site_versions).
CREATE TABLE IF NOT EXISTS translation_source_revisions (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  source_locale TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (entity_type, entity_id, source_locale)
);

CREATE TABLE IF NOT EXISTS translation_status (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  freshness_status TEXT NOT NULL
    CHECK (freshness_status IN ('missing', 'current', 'outdated')),
  review_status TEXT NOT NULL DEFAULT 'normal'
    CHECK (review_status IN ('normal', 'acknowledged')),
  source_revision INTEGER NOT NULL DEFAULT 0,
  translated_from_revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_at TEXT,
  acknowledged_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  PRIMARY KEY (entity_type, entity_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_services_sort ON services(sort_order);
CREATE INDEX IF NOT EXISTS idx_service_translations_locale ON service_translations(locale);
CREATE INDEX IF NOT EXISTS idx_portfolio_sort ON portfolio_items(sort_order);
CREATE INDEX IF NOT EXISTS idx_portfolio_translations_locale ON portfolio_item_translations(locale);
CREATE INDEX IF NOT EXISTS idx_site_content_locale ON site_content(locale);
CREATE INDEX IF NOT EXISTS idx_site_versions_status ON site_versions(status);
CREATE INDEX IF NOT EXISTS idx_site_versions_locale ON site_versions(locale);
CREATE INDEX IF NOT EXISTS idx_preview_tokens_expires ON preview_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created ON audit_log(actor_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_locale ON audit_log(locale);
CREATE INDEX IF NOT EXISTS idx_translation_status_locale ON translation_status(locale);
CREATE INDEX IF NOT EXISTS idx_translation_status_freshness ON translation_status(freshness_status);
CREATE INDEX IF NOT EXISTS idx_translation_status_entity_type ON translation_status(entity_type);
CREATE INDEX IF NOT EXISTS idx_translation_status_review ON translation_status(review_status);
CREATE INDEX IF NOT EXISTS idx_translation_status_freshness_locale ON translation_status(freshness_status, locale);
CREATE INDEX IF NOT EXISTS idx_translation_source_revisions_locale ON translation_source_revisions(source_locale);

INSERT OR IGNORE INTO site_publish_state (locale, published_version_id, previous_version_id, publishing)
VALUES ('he', NULL, NULL, 0);
