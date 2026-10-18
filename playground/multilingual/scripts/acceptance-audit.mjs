#!/usr/bin/env node
/**
 * Local-only Audit Log acceptance checks.
 *
 * Prefer: npm run test:audit  (spins isolated D1 at .wrangler/state-audit-test)
 *
 * Direct use requires:
 *   AUDIT_ISOLATED=1
 *   AUDIT_PERSIST=<path ending with state-audit-test>
 *   BASE=<url of pages dev bound to that persist>
 *
 * Refuses shared .wrangler/state, --remote, and Production.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://127.0.0.1:8799';
const ORIGIN = BASE;
const EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const PASS = process.env.ADMIN_PASS || process.env.ADMIN_PASSWORD || 'ChangeMe123!';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERSIST = path.resolve(ROOT, process.env.AUDIT_PERSIST || '.wrangler/state-audit-test');

function assertIsolatedLocal() {
  if (process.env.AUDIT_ISOLATED !== '1') {
    throw new Error(
      'Refusing to run: set AUDIT_ISOLATED=1 or use `npm run test:audit` (isolated local D1 only).'
    );
  }
  const normalized = PERSIST.replace(/\\/g, '/');
  if (!normalized.endsWith('/state-audit-test') && !normalized.endsWith('state-audit-test')) {
    throw new Error(`Refusing persist path (must be isolated state-audit-test): ${PERSIST}`);
  }
  if (normalized.includes('/state/') && !normalized.includes('state-audit-test')) {
    throw new Error(`Refusing shared local D1 persist: ${PERSIST}`);
  }
  if (String(process.env.CLOUDFLARE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Refusing to run against Production.');
  }
}

let cookie = '';
const results = [];

function pass(id, msg) {
  results.push({ id, ok: true, msg });
  console.log(`PASS ${id}: ${msg}`);
}
function fail(id, msg) {
  results.push({ id, ok: false, msg });
  console.error(`FAIL ${id}: ${msg}`);
}

async function req(pathName, opts = {}) {
  const headers = {
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...(opts.origin ? { Origin: ORIGIN } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...opts.headers,
  };
  const res = await fetch(`${BASE}${pathName}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  for (const c of setCookie) {
    const part = c.split(';')[0];
    if (part.startsWith('cms_session=')) cookie = part;
  }
  const raw = res.headers.get('set-cookie');
  if (raw && raw.includes('cms_session=')) {
    cookie = raw.split(';')[0];
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { res, data };
}

function d1Local(sql) {
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'cms-template-pg-multilingual',
      '--local',
      `--persist-to=${PERSIST}`,
      '--command',
      sql,
    ],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
  );
}

async function main() {
  assertIsolatedLocal();
  console.log(`Using isolated local D1: ${PERSIST}`);
  console.log(`Against server: ${BASE}`);

  const unauth = await req('/api/admin/audit');
  if (unauth.res.status === 401) pass('A1', 'unauthenticated GET /api/admin/audit → 401');
  else fail('A1', `expected 401 got ${unauth.res.status}`);

  const login = await req('/api/auth/login', {
    method: 'POST',
    origin: true,
    body: { email: EMAIL, password: PASS },
  });
  if (!login.res.ok) throw new Error('login failed: ' + JSON.stringify(login.data));

  const marker = `audit-test-${Date.now()}`;
  const saved = await req('/api/admin/content', {
    method: 'PUT',
    origin: true,
    body: { content: { hero_title: marker } },
  });
  if (saved.res.ok && saved.data?.draftSaved) pass('A2', 'content update ok');
  else fail('A2', JSON.stringify(saved.data));

  const list1 = await req('/api/admin/audit?limit=10');
  if (!list1.res.ok) {
    fail('A3', `list failed ${list1.res.status} ${JSON.stringify(list1.data)}`);
  } else {
    const items = list1.data?.items || [];
    const hit = items.find(
      (row) =>
        row.action === 'content.update' &&
        row.details?.fields?.hero_title?.after === marker
    );
    if (hit && hit.details.fields.hero_title.before != null) {
      pass('A3', 'content.update with before/after returned');
    } else {
      fail('A3', 'missing content.update before/after: ' + JSON.stringify(items.slice(0, 3)));
    }
    if (items.some((row) => row.actorEmail === EMAIL || row.actorEmail)) {
      pass('A4', 'actor email present (no password_hash)');
    } else {
      fail('A4', 'actor email missing');
    }
    const blob = JSON.stringify(list1.data);
    if (/password_hash|ChangeMe123!|"token"\s*:\s*"[A-Za-z0-9]{16,}/.test(blob)) {
      fail('A5', 'sensitive material leaked in list response');
    } else {
      pass('A5', 'no password/token leak in list payload');
    }
  }

  const filtered = await req('/api/admin/audit?action=content.update&limit=5');
  if (
    filtered.res.ok &&
    (filtered.data.items || []).every((row) => row.action === 'content.update')
  ) {
    pass('A6', 'action filter works');
  } else {
    fail('A6', JSON.stringify(filtered.data));
  }

  const page1 = await req('/api/admin/audit?limit=2');
  if (page1.res.ok && page1.data?.items?.length && page1.data.hasMore && page1.data.nextCursor) {
    const page2 = await req(`/api/admin/audit?limit=2&cursor=${page1.data.nextCursor}`);
    const ids1 = new Set((page1.data.items || []).map((r) => r.id));
    const overlap = (page2.data?.items || []).some((r) => ids1.has(r.id));
    if (page2.res.ok && !overlap) pass('A7', 'cursor pagination advances without overlap');
    else fail('A7', 'pagination overlap or failure');
  } else {
    // May fail if fewer than 3 rows exist - seed a few via content updates
    await req('/api/admin/content', {
      method: 'PUT',
      origin: true,
      body: { content: { hero_description: `${marker}-p2` } },
    });
    await req('/api/admin/content', {
      method: 'PUT',
      origin: true,
      body: { content: { about_title: `${marker}-p3` } },
    });
    const again = await req('/api/admin/audit?limit=2');
    if (again.data?.hasMore && again.data?.nextCursor) {
      const page2b = await req(`/api/admin/audit?limit=2&cursor=${again.data.nextCursor}`);
      const ids = new Set((again.data.items || []).map((r) => r.id));
      const overlap = (page2b.data?.items || []).some((r) => ids.has(r.id));
      if (!overlap) pass('A7', 'cursor pagination advances without overlap');
      else fail('A7', 'pagination overlap');
    } else {
      fail('A7', 'could not exercise pagination');
    }
  }

  const del = await req('/api/admin/audit', { method: 'DELETE', origin: true });
  if (del.res.status === 404 || del.res.status === 405) {
    pass('A8', `no audit delete endpoint (${del.res.status})`);
  } else {
    fail('A8', `unexpected delete status ${del.res.status}`);
  }

  // Inject a poisoned details_json row and ensure API redacts it.
  const poison = JSON.stringify({
    token: 'SUPER_SECRET_PREVIEW_TOKEN_VALUE_12345',
    password: 'should-not-appear',
    fields: { hero_title: { before: 'a', after: 'b' } },
  }).replace(/'/g, "''");
  d1Local(
    `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, summary, details_json, success)
     VALUES (NULL, 'content.update', 'content', NULL, 'redaction probe', '${poison}', 1)`
  );
  const redacted = await req('/api/admin/audit?action=content.update&limit=20');
  const probe = (redacted.data?.items || []).find((r) => r.summary === 'redaction probe');
  if (
    probe &&
    probe.details?.token === '[redacted]' &&
    probe.details?.password === '[redacted]' &&
    !JSON.stringify(probe).includes('SUPER_SECRET_PREVIEW_TOKEN_VALUE_12345')
  ) {
    pass('A9', 'server redacts token/password keys in details');
  } else {
    fail('A9', 'redaction failed: ' + JSON.stringify(probe));
  }

  const pub = await req('/api/admin/publish', { method: 'POST', origin: true, body: {} });
  const afterPub = await req('/api/admin/audit?action=publish.succeeded&limit=5');
  if (pub.res.ok && (afterPub.data?.items || []).some((r) => r.action === 'publish.succeeded')) {
    pass('A10', 'publish.succeeded recorded');
  } else if (!pub.res.ok && (await req('/api/admin/audit?action=publish.failed&limit=5')).data?.items?.length) {
    pass('A10', 'publish.failed recorded');
  } else {
    fail('A10', `publish audit missing: ${JSON.stringify(pub.data)}`);
  }

  const svc = await req('/api/admin/services', {
    method: 'POST',
    origin: true,
    body: { title: `Audit svc ${marker}` },
  });
  const afterSvc = await req('/api/admin/audit?action=service.create&limit=5');
  if (svc.res.ok && (afterSvc.data?.items || []).some((r) => r.action === 'service.create')) {
    pass('A11', 'service.create recorded');
  } else {
    fail('A11', JSON.stringify({ svc: svc.data, audit: afterSvc.data }));
  }

  const authLogin = await req('/api/admin/audit?action=auth.login&limit=5');
  if ((authLogin.data?.items || []).some((r) => r.action === 'auth.login')) {
    pass('A12', 'auth.login recorded without credentials');
  } else {
    fail('A12', 'auth.login missing');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
