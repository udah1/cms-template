#!/usr/bin/env node
/**
 * Runs translation-status acceptance tests against an isolated local D1.
 *
 * Persist path: .wrangler/state-translation-test (never .wrangler/state, never --remote).
 * Spins up a temporary pages dev server on TRANSLATION_PORT (default 8797).
 *
 * Locales for each phase are passed via I18N_LOCALES_OVERRIDE on the test server
 * only - i18n.js on disk is never rewritten (safe while playground npm run dev on 3788
 * watches the same file).
 */
import { spawn, execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERSIST = path.join(ROOT, '.wrangler', 'state-translation-test');
// Avoid 8788/8798 (Template pages dev / Template translation tests).
const PORT = String(process.env.TRANSLATION_PORT || '8797');
const BASE = `http://127.0.0.1:${PORT}`;
const D1_NAME = 'cms-template-pg-multilingual';

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    ...opts,
  });
}

function d1File(file) {
  run('npx', [
    'wrangler',
    'd1',
    'execute',
    D1_NAME,
    '--local',
    `--persist-to=${PERSIST}`,
    `--file=${file}`,
  ]);
}

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 401 || res.status === 404) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`server did not become ready at ${url}`);
}

function startServer(locales) {
  const localesVar = locales.join('+');
  const defaultVar = locales[0] || 'he';
  return spawn(
    'npx',
    [
      'wrangler',
      'pages',
      'dev',
      'public',
      `--persist-to=${PERSIST}`,
      '--ip',
      '127.0.0.1',
      '--port',
      PORT,
      '--show-interactive-dev-session=false',
      // Workers env bindings (not process.env) - safe for live pages dev on same files.
      '--binding',
      `I18N_LOCALES_OVERRIDE=${localesVar}`,
      '--binding',
      `I18N_DEFAULT_LOCALE_OVERRIDE=${defaultVar}`,
    ],
    {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    }
  );
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const t = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      resolve();
    }, 4000);
    child.on('exit', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function runAcceptance(phase) {
  run('node', [path.join(ROOT, 'scripts', 'test-translation-status.mjs')], {
    env: {
      ...process.env,
      TRANSLATION_ISOLATED: '1',
      TRANSLATION_PERSIST: PERSIST,
      TRANSLATION_D1_NAME: D1_NAME,
      TRANSLATION_PHASE: phase,
      BASE,
    },
    stdio: 'inherit',
  });
}

async function runPhase(phase, locales) {
  rmSync(PERSIST, { recursive: true, force: true });
  d1File('./schema.sql');
  d1File('./seed.sql');
  if (phase === 'multi') {
    d1File('./migrations/006_translation_status.sql');
  }

  const child = startServer(locales);
  child.stderr.on('data', (buf) => {
    const s = String(buf);
    if (process.env.TRANSLATION_TEST_VERBOSE) process.stderr.write(s);
  });
  try {
    await waitForServer(`${BASE}/api/auth/me`);
    await runAcceptance(phase);
  } finally {
    await stopServer(child);
  }
}

async function main() {
  console.log(`Translation tests → isolated D1 at ${PERSIST}`);
  console.log(`Temporary server → ${BASE}`);
  console.log('Locales via I18N_LOCALES_OVERRIDE (i18n.js on disk untouched)');

  try {
    await runPhase('mono', ['he']);
    await runPhase('multi', ['he', 'en', 'es']);
    console.log('\nAll translation-status phases passed.');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}

main();
