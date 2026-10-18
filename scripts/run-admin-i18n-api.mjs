#!/usr/bin/env node
/**
 * Optional API smoke for Admin content locale params.
 * Isolated D1: .wrangler/state-admin-i18n-test
 * Prefer: npm run test:admin-i18n:api
 */
import { spawn, execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERSIST = path.join(ROOT, '.wrangler', 'state-admin-i18n-test');
const PORT = String(process.env.ADMIN_I18N_PORT || '8798');
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const PASS = process.env.ADMIN_PASS || 'ChangeMe123!';

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
}

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 401 || res.status === 404) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`server did not become ready at ${url}`);
}

async function main() {
  console.log(`Admin i18n API tests → ${PERSIST}`);
  console.log(`Temporary server → ${BASE}`);
  rmSync(PERSIST, { recursive: true, force: true });
  run('npx', [
    'wrangler',
    'd1',
    'execute',
    'cms-template',
    '--local',
    `--persist-to=${PERSIST}`,
    '--file=./schema.sql',
  ]);
  run('npx', [
    'wrangler',
    'd1',
    'execute',
    'cms-template',
    '--local',
    `--persist-to=${PERSIST}`,
    '--file=./seed.sql',
  ]);

  const child = spawn(
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
    ],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } }
  );

  let cookie = '';
  const fail = (msg) => {
    console.error(`FAIL: ${msg}`);
    child.kill('SIGTERM');
    process.exitCode = 1;
  };

  try {
    await waitForServer(`${BASE}/admin/`);
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE },
      body: JSON.stringify({ email: EMAIL, password: PASS }),
    });
    const setCookie = login.headers.getSetCookie?.() || [];
    for (const c of setCookie) {
      const part = c.split(';')[0];
      if (part.startsWith('cms_session=')) cookie = part;
    }
    if (!login.ok || !cookie) {
      fail(`login failed ${login.status}`);
      return;
    }
    console.log('PASS login');

    const content = await fetch(`${BASE}/api/admin/content`, { headers: { Cookie: cookie } });
    const data = await content.json();
    if (data.locale !== 'he' || !Array.isArray(data.locales) || data.locales[0] !== 'he') {
      fail(`content GET locale payload unexpected: ${JSON.stringify({ locale: data.locale, locales: data.locales })}`);
      return;
    }
    console.log('PASS content GET returns locale + locales (single-locale)');

    const bad = await fetch(`${BASE}/api/admin/content?locale=en`, { headers: { Cookie: cookie } });
    const badData = await bad.json();
    if (badData.locale !== 'he') {
      fail(`invalid/disabled locale should fall back to default, got ${badData.locale}`);
      return;
    }
    console.log('PASS disabled locale falls back to defaultLocale');

    const status = await fetch(`${BASE}/api/admin/publish/status?locale=he`, {
      headers: { Cookie: cookie },
    });
    if (!status.ok) {
      fail(`publish status ${status.status}`);
      return;
    }
    console.log('PASS publish/status accepts locale query');

    const preview = await fetch(`${BASE}/api/admin/preview-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: cookie },
      body: JSON.stringify({ locale: 'he' }),
    });
    const previewData = await preview.json();
    if (!preview.ok || !previewData.previewUrl) {
      fail(`preview-token failed ${preview.status}`);
      return;
    }
    console.log('PASS preview-token with locale');

    console.log('All API smoke checks passed');
    process.exitCode = 0;
  } catch (err) {
    fail(err.message || String(err));
  } finally {
    child.kill('SIGTERM');
  }
}

main();
