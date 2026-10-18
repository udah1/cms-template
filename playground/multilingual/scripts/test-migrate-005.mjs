#!/usr/bin/env node
/**
 * Isolated tests for resume-safe 005 locale-ready migration.
 * Persist path: .wrangler/state-migrate-005-test (never shared .wrangler/state, never --remote).
 *
 * Speed: one wrangler bootstrap for the fixture, then sqlite3 + the migrate runner's
 * local sqlite3 fast-path (not a wrangler spawn per schema probe).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERSIST = path.join(ROOT, '.wrangler', 'state-migrate-005-test');
const FIXTURE = path.join(ROOT, 'scripts', 'fixtures', 'pre-locale-minimal.sql');
const MIGRATE = path.join(ROOT, 'scripts', 'migrate-005-locale-ready.mjs');
const TIMEOUT_MS = Number(process.env.MIGRATE_005_TEST_TIMEOUT_MS || 90_000);

let failed = 0;
let sqlitePath = null;

function pass(name) {
  console.log(`PASS  ${name}`);
}

function fail(name, detail) {
  failed += 1;
  console.error(`FAIL  ${name}: ${detail}`);
}

function findSqlite() {
  const dir = path.join(PERSIST, 'v3', 'd1', 'miniflare-D1DatabaseObject');
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

function bootstrapFixtureViaWrangler() {
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'cms-template-pg-multilingual',
      '--local',
      `--persist-to=${PERSIST}`,
      `--file=${FIXTURE}`,
    ],
    { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: 60_000 }
  );
  sqlitePath = findSqlite();
  if (!sqlitePath) throw new Error(`fixture applied but sqlite not found under ${PERSIST}`);
}

function sqlJson(commandSql) {
  const out = execFileSync('sqlite3', ['-json', sqlitePath, commandSql], {
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  }).trim();
  if (!out) return [];
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed : [];
}

function sqlExec(sql) {
  execFileSync('sqlite3', [sqlitePath], {
    encoding: 'utf8',
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function runMigrate() {
  execFileSync(process.execPath, [MIGRATE], {
    cwd: ROOT,
    env: { ...process.env, D1_PERSIST: PERSIST },
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: Math.max(30_000, TIMEOUT_MS - 5_000),
  });
}

function resetFixture() {
  rmSync(PERSIST, { recursive: true, force: true });
  bootstrapFixtureViaWrangler();
}

function assertLocaleReady() {
  const rows = sqlJson(`
SELECT
  (SELECT COUNT(*) FROM pragma_table_info('site_content') WHERE name='locale') AS has_locale_col,
  (SELECT value FROM site_content WHERE key='business_name' AND locale='he') AS biz,
  (SELECT title FROM service_translations WHERE locale='he' AND service_id=1) AS svc,
  (SELECT title FROM portfolio_item_translations WHERE locale='he' AND portfolio_item_id=1) AS port,
  (SELECT locale FROM site_publish_state LIMIT 1) AS pub_locale
`);
  const r = rows[0] || {};
  if (Number(r.has_locale_col) !== 1) throw new Error('site_content.locale missing');
  if (r.biz !== 'Resume Test Biz') throw new Error(`business_name lost: ${r.biz}`);
  if (r.svc !== 'First service') throw new Error(`service title lost: ${r.svc}`);
  if (r.port !== 'Sample project') throw new Error(`portfolio title lost: ${r.port}`);
  if (r.pub_locale !== 'he') throw new Error('site_publish_state.locale missing');
}

function testFullMigrate() {
  resetFixture();
  runMigrate();
  assertLocaleReady();
  runMigrate();
  assertLocaleReady();
  pass('full migrate + idempotent re-run keeps data');
}

function testResumeAfterDropBeforeRename() {
  resetFixture();
  sqlExec(`
CREATE TABLE site_content_mig (
  key TEXT NOT NULL,
  locale TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (key, locale)
);
INSERT INTO site_content_mig (key, locale, value)
SELECT key, 'he', value FROM site_content;
DROP TABLE site_content;
`);
  const migRows = sqlJson(`SELECT COUNT(*) AS c FROM site_content_mig`);
  if (Number(migRows[0]?.c) !== 2) {
    throw new Error(`expected 2 rows in site_content_mig, got ${migRows[0]?.c}`);
  }
  runMigrate();
  assertLocaleReady();
  const leftover = sqlJson(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='site_content_mig'`
  );
  if (leftover.length) throw new Error('site_content_mig still present after resume');
  pass('resume after DROP source before RENAME preserves rows');
}

function testDoesNotDropOnlyCopy() {
  resetFixture();
  sqlExec(`
CREATE TABLE site_content_mig (
  key TEXT NOT NULL,
  locale TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (key, locale)
);
INSERT INTO site_content_mig (key, locale, value)
SELECT key, 'he', value FROM site_content;
DROP TABLE site_content;
DELETE FROM site_content_mig;
`);

  let threw = false;
  try {
    runMigrate();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('expected migrate to abort on empty mig without source');

  const still = sqlJson(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='site_content_mig'`
  );
  if (!still.length) throw new Error('empty site_content_mig was dropped - data path destroyed');
  pass('empty mig without source aborts without DROP');
}

async function main() {
  console.log(`005 migration tests → isolated D1 at ${PERSIST}`);
  console.log(`timeout=${TIMEOUT_MS}ms (sqlite3 fast-path after one wrangler fixture bootstrap)`);

  const timer = setTimeout(() => {
    console.error(
      `FAIL  timeout: test:migrate-005 exceeded ${TIMEOUT_MS}ms. ` +
        'Set MIGRATE_005_TEST_TIMEOUT_MS to raise, or check wrangler/sqlite3.'
    );
    process.exit(1);
  }, TIMEOUT_MS);
  if (typeof timer.unref === 'function') timer.unref();

  const started = Date.now();
  try {
    testFullMigrate();
    testResumeAfterDropBeforeRename();
    testDoesNotDropOnlyCopy();
  } catch (err) {
    fail('unexpected', err?.message || err);
  } finally {
    clearTimeout(timer);
  }

  if (failed) {
    console.error(`\n${failed} failed (${Date.now() - started}ms)`);
    process.exit(1);
  }
  console.log(`\n3/3 passed (${Date.now() - started}ms)`);
}

main();
