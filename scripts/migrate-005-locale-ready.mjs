#!/usr/bin/env node
/**
 * Resume-safe upgrade from pre-locale schema → locale-ready (defaultLocale = he).
 *
 * Greenfield installs should use `npm run db:migrate` (schema.sql), not this script.
 *
 * Why a script (not only migrations/005_locale_ready.sql):
 * D1/SQLite DDL is not a single atomic transaction across DROP/ALTER steps.
 * This runner inspects the live schema, resumes from interrupted *_mig tables,
 * and never drops a *_mig table that may be the only copy of the data.
 *
 * Usage:
 *   npm run db:migrate:locale-ready
 *   npm run db:migrate:locale-ready -- --remote
 *   D1_PERSIST=.wrangler/state-other npm run db:migrate:locale-ready
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const remote = process.argv.includes('--remote');
const persist = process.env.D1_PERSIST || path.join(ROOT, '.wrangler', 'state');
const DB = 'cms-template';
const FORCE_WRANGLER = process.env.MIGRATE_005_FORCE_WRANGLER === '1';

/** Local fast path: talk to the miniflare sqlite file via sqlite3 (avoids npx wrangler per query). */
let localSqlitePath = null;

function wranglerBase() {
  const args = ['wrangler', 'd1', 'execute', DB];
  if (remote) args.push('--remote');
  else args.push('--local', `--persist-to=${persist}`);
  return args;
}

function findLocalSqlite() {
  const dir = path.join(persist, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter(
    (f) => f.endsWith('.sqlite') && !f.startsWith('metadata') && !f.includes('-shm') && !f.includes('-wal')
  );
  if (!files.length) return null;
  if (files.length === 1) return path.join(dir, files[0]);
  return files
    .map((f) => path.join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

function ensureLocalSqlite() {
  if (remote || FORCE_WRANGLER) return null;
  if (localSqlitePath && existsSync(localSqlitePath)) return localSqlitePath;
  localSqlitePath = findLocalSqlite();
  if (localSqlitePath) return localSqlitePath;
  // Bootstrap empty local D1 once via wrangler, then switch to sqlite3.
  execFileSync('npx', [...wranglerBase(), '--command', 'SELECT 1 AS ok'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  localSqlitePath = findLocalSqlite();
  if (!localSqlitePath) {
    throw new Error(`Could not locate local D1 sqlite under ${persist}`);
  }
  return localSqlitePath;
}

function useSqlite() {
  return !remote && !FORCE_WRANGLER;
}

function runJson(commandSql) {
  if (useSqlite()) {
    const db = ensureLocalSqlite();
    const out = execFileSync('sqlite3', ['-json', db, commandSql], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
    if (!out) return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [];
  }
  const out = execFileSync(
    'npx',
    [...wranglerBase(), '--json', '--command', commandSql],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  const parsed = JSON.parse(out);
  const batch = Array.isArray(parsed) ? parsed[0] : parsed;
  return batch?.results || [];
}

function runFile(sql) {
  if (useSqlite()) {
    const db = ensureLocalSqlite();
    execFileSync('sqlite3', [db], {
      encoding: 'utf8',
      input: sql,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'cms-005-'));
  const file = path.join(dir, 'step.sql');
  writeFileSync(file, sql, 'utf8');
  try {
    execFileSync('npx', [...wranglerBase(), `--file=${file}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function tableExists(name) {
  const rows = runJson(
    `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='${name.replace(/'/g, "''")}' LIMIT 1`
  );
  return rows.length > 0;
}

function columnExists(table, column) {
  if (!tableExists(table)) return false;
  const rows = runJson(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

function countRows(table) {
  if (!tableExists(table)) return 0;
  const rows = runJson(`SELECT COUNT(*) AS c FROM "${table.replace(/"/g, '""')}"`);
  return Number(rows[0]?.c || 0);
}

function log(step, msg) {
  console.log(`[005 ${step}] ${msg}`);
}

/**
 * Resolve a classic copy→drop→rename interruption.
 *
 * States:
 * - final ready, leftover empty/orphan mig + source present → drop mig only
 * - source gone, mig has rows → rename mig to final (resume)
 * - source gone, mig missing/empty → hard error (needs backup)
 * - source present (old), mig complete (≥ source rows) → drop source, rename
 * - source present (old), mig incomplete → drop mig only (source still safe), rebuild
 */
function resolveCopyDropRename({
  step,
  source,
  mig,
  isFinalReady,
  isOldSource,
  createAndFillSql,
}) {
  const hasSource = tableExists(source);
  const hasMig = tableExists(mig);

  if (isFinalReady()) {
    if (hasMig) {
      // Final table already in place - leftover mig is safe to drop.
      log(step, `final ready; dropping leftover ${mig}`);
      runFile(`DROP TABLE IF EXISTS "${mig}";`);
    } else {
      log(step, 'already locale-ready - skip');
    }
    return;
  }

  // Interrupted after DROP source, before RENAME.
  if (!hasSource && hasMig) {
    const n = countRows(mig);
    if (n <= 0) {
      throw new Error(
        `${step}: ${source} is missing and ${mig} is empty. Restore D1 from backup before retrying.`
      );
    }
    log(step, `resuming: renaming ${mig} → ${source} (${n} rows)`);
    runFile(`ALTER TABLE "${mig}" RENAME TO "${source}";`);
    return;
  }

  if (!hasSource && !hasMig) {
    throw new Error(
      `${step}: ${source} and ${mig} are both missing. Restore D1 from backup before retrying.`
    );
  }

  if (!isOldSource()) {
    throw new Error(
      `${step}: ${source} exists but is neither old-shape nor locale-ready. Inspect schema manually.`
    );
  }

  // Source (old) still present.
  if (hasMig) {
    const srcN = countRows(source);
    const migN = countRows(mig);
    if (migN > 0 && migN >= srcN) {
      log(step, `completing from filled ${mig} (drop ${source}, rename)`);
      runFile(`
PRAGMA foreign_keys = OFF;
DROP TABLE "${source}";
ALTER TABLE "${mig}" RENAME TO "${source}";
PRAGMA foreign_keys = ON;
`);
      return;
    }
    // Incomplete mig while source still exists - safe to discard mig only.
    log(step, `discarding incomplete ${mig} (source ${source} still present)`);
    runFile(`DROP TABLE "${mig}";`);
  }

  log(step, `migrating from ${source}`);
  runFile(createAndFillSql);

  const srcN = countRows(source);
  const migN = countRows(mig);
  if (migN < srcN) {
    throw new Error(`${step}: ${mig} row count ${migN} < ${source} ${srcN}; aborting before DROP`);
  }

  runFile(`
PRAGMA foreign_keys = OFF;
DROP TABLE "${source}";
ALTER TABLE "${mig}" RENAME TO "${source}";
PRAGMA foreign_keys = ON;
`);
}

function migrateSiteContent() {
  resolveCopyDropRename({
    step: 'site_content',
    source: 'site_content',
    mig: 'site_content_mig',
    isFinalReady: () => tableExists('site_content') && columnExists('site_content', 'locale'),
    isOldSource: () => tableExists('site_content') && !columnExists('site_content', 'locale'),
    createAndFillSql: `
CREATE TABLE site_content_mig (
  key TEXT NOT NULL,
  locale TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (key, locale)
);
INSERT INTO site_content_mig (key, locale, value)
SELECT key, 'he', value FROM site_content;
`,
  });
}

function migrateServices() {
  const finalReady = () =>
    tableExists('services') &&
    tableExists('service_translations') &&
    !columnExists('services', 'title');

  if (finalReady() && !tableExists('services_mig')) {
    log('services', 'already locale-ready - skip');
    return;
  }

  // Resume after DROP services, before rename services_mig.
  if (!tableExists('services') && tableExists('services_mig')) {
    const n = countRows('services_mig');
    if (n <= 0) {
      throw new Error(
        'services: services missing and services_mig empty. Restore D1 from backup before retrying.'
      );
    }
    if (!tableExists('service_translations')) {
      throw new Error(
        'services: services_mig present but service_translations missing. Restore D1 from backup.'
      );
    }
    log('services', `resuming: renaming services_mig → services (${n} rows)`);
    runFile(`ALTER TABLE services_mig RENAME TO services;`);
    return;
  }

  if (finalReady()) {
    if (tableExists('services_mig')) {
      log('services', 'final ready; dropping leftover services_mig');
      runFile(`DROP TABLE IF EXISTS services_mig;`);
    }
    return;
  }

  if (!tableExists('services')) {
    throw new Error(
      'services: services and services_mig both missing. Restore D1 from backup before retrying.'
    );
  }

  if (!columnExists('services', 'title')) {
    throw new Error(
      'services: unexpected shape (no title column, not fully migrated). Inspect schema manually.'
    );
  }

  // Old services still present. Incomplete mig is safe to drop only while source exists.
  if (tableExists('services_mig')) {
    const srcN = countRows('services');
    const migN = countRows('services_mig');
    if (migN > 0 && migN >= srcN && tableExists('service_translations')) {
      log('services', 'completing from filled services_mig');
      runFile(`
PRAGMA foreign_keys = OFF;
DROP TABLE services;
ALTER TABLE services_mig RENAME TO services;
PRAGMA foreign_keys = ON;
`);
      return;
    }
    log('services', 'discarding incomplete services_mig / service_translations (source intact)');
    runFile(`
PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS service_translations;
DROP TABLE IF EXISTS services_mig;
PRAGMA foreign_keys = ON;
`);
  } else if (tableExists('service_translations') && columnExists('services', 'title')) {
    // Orphan translations from interrupted run while old services remain.
    log('services', 'dropping orphan service_translations before rebuild');
    runFile(`DROP TABLE IF EXISTS service_translations;`);
  }

  log('services', 'splitting base + service_translations');
  runFile(`
PRAGMA foreign_keys = OFF;
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
PRAGMA foreign_keys = ON;
`);

  const srcN = countRows('services');
  const migN = countRows('services_mig');
  if (migN < srcN) {
    throw new Error(`services: services_mig row count ${migN} < services ${srcN}; aborting before DROP`);
  }

  runFile(`
PRAGMA foreign_keys = OFF;
DROP TABLE services;
ALTER TABLE services_mig RENAME TO services;
PRAGMA foreign_keys = ON;
`);
}

function migratePortfolio() {
  const finalReady = () =>
    tableExists('portfolio_items') &&
    tableExists('portfolio_item_translations') &&
    !columnExists('portfolio_items', 'title');

  if (finalReady() && !tableExists('portfolio_items_mig')) {
    log('portfolio', 'already locale-ready - skip');
    return;
  }

  if (!tableExists('portfolio_items') && tableExists('portfolio_items_mig')) {
    const n = countRows('portfolio_items_mig');
    if (n <= 0) {
      throw new Error(
        'portfolio: portfolio_items missing and portfolio_items_mig empty. Restore from backup.'
      );
    }
    if (!tableExists('portfolio_item_translations')) {
      throw new Error(
        'portfolio: portfolio_items_mig present but portfolio_item_translations missing. Restore from backup.'
      );
    }
    log('portfolio', `resuming: renaming portfolio_items_mig → portfolio_items (${n} rows)`);
    runFile(`ALTER TABLE portfolio_items_mig RENAME TO portfolio_items;`);
    return;
  }

  if (finalReady()) {
    if (tableExists('portfolio_items_mig')) {
      log('portfolio', 'final ready; dropping leftover portfolio_items_mig');
      runFile(`DROP TABLE IF EXISTS portfolio_items_mig;`);
    }
    return;
  }

  if (!tableExists('portfolio_items')) {
    throw new Error(
      'portfolio: portfolio_items and portfolio_items_mig both missing. Restore from backup.'
    );
  }

  if (!columnExists('portfolio_items', 'title')) {
    throw new Error(
      'portfolio: unexpected shape (no title column, not fully migrated). Inspect schema manually.'
    );
  }

  if (tableExists('portfolio_items_mig')) {
    const srcN = countRows('portfolio_items');
    const migN = countRows('portfolio_items_mig');
    if (migN > 0 && migN >= srcN && tableExists('portfolio_item_translations')) {
      log('portfolio', 'completing from filled portfolio_items_mig');
      runFile(`
PRAGMA foreign_keys = OFF;
DROP TABLE portfolio_items;
ALTER TABLE portfolio_items_mig RENAME TO portfolio_items;
PRAGMA foreign_keys = ON;
`);
      return;
    }
    log('portfolio', 'discarding incomplete portfolio_items_mig (source intact)');
    runFile(`
PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS portfolio_item_translations;
DROP TABLE IF EXISTS portfolio_items_mig;
PRAGMA foreign_keys = ON;
`);
  } else if (tableExists('portfolio_item_translations') && columnExists('portfolio_items', 'title')) {
    log('portfolio', 'dropping orphan portfolio_item_translations before rebuild');
    runFile(`DROP TABLE IF EXISTS portfolio_item_translations;`);
  }

  log('portfolio', 'splitting base + portfolio_item_translations');
  runFile(`
PRAGMA foreign_keys = OFF;
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
PRAGMA foreign_keys = ON;
`);

  const srcN = countRows('portfolio_items');
  const migN = countRows('portfolio_items_mig');
  if (migN < srcN) {
    throw new Error(
      `portfolio: portfolio_items_mig row count ${migN} < portfolio_items ${srcN}; aborting before DROP`
    );
  }

  runFile(`
PRAGMA foreign_keys = OFF;
DROP TABLE portfolio_items;
ALTER TABLE portfolio_items_mig RENAME TO portfolio_items;
PRAGMA foreign_keys = ON;
`);
}

function ensureSystemMessages() {
  if (tableExists('system_messages') && columnExists('system_messages', 'locale')) {
    log('system_messages', 'ok');
    return;
  }
  log('system_messages', 'creating');
  runFile(`
CREATE TABLE IF NOT EXISTS system_messages (
  key TEXT NOT NULL,
  locale TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (key, locale)
);
`);
}

function migrateSiteVersionsLocale() {
  if (columnExists('site_versions', 'locale')) {
    log('site_versions', 'locale column present - backfill');
    runFile(`UPDATE site_versions SET locale = 'he' WHERE locale IS NULL OR locale = '';`);
    return;
  }
  if (!tableExists('site_versions')) {
    log('site_versions', 'table missing - skip');
    return;
  }
  log('site_versions', 'adding locale column');
  runFile(`
ALTER TABLE site_versions ADD COLUMN locale TEXT NOT NULL DEFAULT 'he';
UPDATE site_versions SET locale = 'he' WHERE locale IS NULL OR locale = '';
`);
}

function migratePublishState() {
  resolveCopyDropRename({
    step: 'site_publish_state',
    source: 'site_publish_state',
    mig: 'site_publish_state_mig',
    isFinalReady: () =>
      tableExists('site_publish_state') &&
      columnExists('site_publish_state', 'locale') &&
      !columnExists('site_publish_state', 'id'),
    isOldSource: () =>
      tableExists('site_publish_state') && columnExists('site_publish_state', 'id'),
    createAndFillSql: `
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
`,
  });
}

function migrateAuditLocale() {
  if (!tableExists('audit_log')) {
    log('audit_log', 'table missing - skip');
    return;
  }
  if (columnExists('audit_log', 'locale')) {
    log('audit_log', 'locale column present - skip');
    return;
  }
  log('audit_log', 'adding locale column');
  runFile(`ALTER TABLE audit_log ADD COLUMN locale TEXT;`);
}

function ensureIndexes() {
  if (!tableExists('service_translations') || !tableExists('portfolio_item_translations')) {
    log('indexes', 'skip (translations not ready)');
    return;
  }
  log('indexes', 'CREATE INDEX IF NOT EXISTS');
  runFile(`
CREATE INDEX IF NOT EXISTS idx_service_translations_locale ON service_translations(locale);
CREATE INDEX IF NOT EXISTS idx_portfolio_translations_locale ON portfolio_item_translations(locale);
CREATE INDEX IF NOT EXISTS idx_site_content_locale ON site_content(locale);
CREATE INDEX IF NOT EXISTS idx_site_versions_locale ON site_versions(locale);
CREATE INDEX IF NOT EXISTS idx_audit_log_locale ON audit_log(locale);
`);
}

function assertReady() {
  const ok =
    columnExists('site_content', 'locale') &&
    tableExists('service_translations') &&
    tableExists('portfolio_item_translations') &&
    columnExists('site_publish_state', 'locale') &&
    !columnExists('site_publish_state', 'id') &&
    columnExists('site_versions', 'locale');
  if (!ok) {
    throw new Error('005 locale-ready migration finished but schema checks failed');
  }
  log('done', remote ? 'remote DB is locale-ready' : `local DB is locale-ready (${persist})`);
}

function main() {
  const mode = remote ? 'REMOTE (wrangler)' : useSqlite() ? 'local sqlite3 fast-path' : 'local wrangler';
  console.log(`Running resume-safe 005 locale-ready (${mode})…`);
  if (!remote && useSqlite()) {
    ensureLocalSqlite();
    console.log(`[005 io] sqlite=${localSqlitePath}`);
  }
  migrateSiteContent();
  migrateServices();
  migratePortfolio();
  ensureSystemMessages();
  migrateSiteVersionsLocale();
  migratePublishState();
  migrateAuditLocale();
  ensureIndexes();
  assertReady();
}

try {
  main();
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
