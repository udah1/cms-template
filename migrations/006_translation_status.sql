-- Translation freshness tracking (additive, schema only).
-- Freshness is separate from draft/published (publication stays in site_publish_state).
-- Safe to re-run: CREATE IF NOT EXISTS.
--
-- No locale-hardcoded data backfill here. Rows are created from:
--   1) seed.sql (project defaultLocale content), and/or
--   2) ensureAllTranslationStatusRows() which uses I18N.defaultLocale / getLocales().
-- This keeps the Template generic for defaultLocale = he | en | ...

PRAGMA foreign_keys = ON;

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

CREATE INDEX IF NOT EXISTS idx_translation_status_locale
  ON translation_status(locale);
CREATE INDEX IF NOT EXISTS idx_translation_status_freshness
  ON translation_status(freshness_status);
CREATE INDEX IF NOT EXISTS idx_translation_status_entity_type
  ON translation_status(entity_type);
CREATE INDEX IF NOT EXISTS idx_translation_status_review
  ON translation_status(review_status);
CREATE INDEX IF NOT EXISTS idx_translation_status_freshness_locale
  ON translation_status(freshness_status, locale);
CREATE INDEX IF NOT EXISTS idx_translation_source_revisions_locale
  ON translation_source_revisions(source_locale);
