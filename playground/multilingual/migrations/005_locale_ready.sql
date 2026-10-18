-- Upgrade path from pre-locale schema to locale-ready (defaultLocale = he).
-- Greenfield: use schema.sql via npm run db:migrate / db:reset.
--
-- DO NOT run this file directly with `wrangler d1 execute --file=...` on a live DB
-- that may already be mid-upgrade. D1/SQLite DDL across DROP/ALTER is not one
-- atomic transaction; a mid-failure leaves a partial schema.
--
-- Supported upgrade (resume-safe, re-runnable after partial failure):
--   npm run db:migrate:locale-ready
--   npm run db:migrate:locale-ready -- --remote
--
-- The runner (scripts/migrate-005-locale-ready.mjs):
--   - inspects live schema per step and skips completed work
--   - resumes from filled *_mig tables if the source was already DROPped
--   - never drops a *_mig table that may be the only data copy
--   - re-runs safely until the DB is fully locale-ready
-- Verify: npm run test:migrate-005 (isolated D1 under .wrangler/state-migrate-005-test)
--
-- The SQL below is the logical transform for review / offline reference only.
-- Prefer the Node runner above for any real upgrade.

PRAGMA foreign_keys = OFF;

-- site_content: (key, locale)
CREATE TABLE site_content_mig (
  key TEXT NOT NULL,
  locale TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (key, locale)
);
INSERT INTO site_content_mig (key, locale, value)
SELECT key, 'he', value FROM site_content;
DROP TABLE site_content;
ALTER TABLE site_content_mig RENAME TO site_content;

-- services → base + service_translations
CREATE TABLE services_mig (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE service_translations (
  service_id INTEGER NOT NULL REFERENCES services_mig(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  PRIMARY KEY (service_id, locale)
);
INSERT INTO services_mig (id, sort_order, visible)
SELECT id, sort_order, visible FROM services;
INSERT INTO service_translations (service_id, locale, title, description)
SELECT id, 'he', title, description FROM services;
DROP TABLE services;
ALTER TABLE services_mig RENAME TO services;

-- portfolio_items → base + portfolio_item_translations
CREATE TABLE portfolio_items_mig (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  media_url TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE portfolio_item_translations (
  portfolio_item_id INTEGER NOT NULL REFERENCES portfolio_items_mig(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'כללי',
  categories TEXT NOT NULL DEFAULT '["כללי"]',
  alt_text TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (portfolio_item_id, locale)
);
INSERT INTO portfolio_items_mig (id, media_type, media_url, cover_url, sort_order, visible, featured, created_at)
SELECT id, media_type, media_url, cover_url, sort_order, visible, featured, created_at FROM portfolio_items;
INSERT INTO portfolio_item_translations (portfolio_item_id, locale, title, category, categories, alt_text)
SELECT id, 'he', title, category, categories, alt_text FROM portfolio_items;
DROP TABLE portfolio_items;
ALTER TABLE portfolio_items_mig RENAME TO portfolio_items;

CREATE TABLE IF NOT EXISTS system_messages (
  key TEXT NOT NULL,
  locale TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (key, locale)
);

ALTER TABLE site_versions ADD COLUMN locale TEXT NOT NULL DEFAULT 'he';
UPDATE site_versions SET locale = 'he' WHERE locale IS NULL OR locale = '';

CREATE TABLE site_publish_state_mig (
  locale TEXT PRIMARY KEY,
  published_version_id INTEGER REFERENCES site_versions(id) ON DELETE SET NULL,
  previous_version_id INTEGER REFERENCES site_versions(id) ON DELETE SET NULL,
  publishing INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO site_publish_state_mig (locale, published_version_id, previous_version_id, publishing, updated_at)
SELECT 'he', published_version_id, previous_version_id, publishing, updated_at
FROM site_publish_state WHERE id = 1;
INSERT OR IGNORE INTO site_publish_state_mig (locale, published_version_id, previous_version_id, publishing)
VALUES ('he', NULL, NULL, 0);
DROP TABLE site_publish_state;
ALTER TABLE site_publish_state_mig RENAME TO site_publish_state;

ALTER TABLE audit_log ADD COLUMN locale TEXT;

CREATE INDEX IF NOT EXISTS idx_service_translations_locale ON service_translations(locale);
CREATE INDEX IF NOT EXISTS idx_portfolio_translations_locale ON portfolio_item_translations(locale);
CREATE INDEX IF NOT EXISTS idx_site_content_locale ON site_content(locale);
CREATE INDEX IF NOT EXISTS idx_site_versions_locale ON site_versions(locale);
CREATE INDEX IF NOT EXISTS idx_audit_log_locale ON audit_log(locale);

PRAGMA foreign_keys = ON;
