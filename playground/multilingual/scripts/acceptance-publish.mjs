#!/usr/bin/env node
/**
 * Acceptance checks for Draft → Preview → Publish → Rollback.
 * Run with: node scripts/acceptance-publish.mjs
 * Requires: npm run db:reset && npm run dev
 */
const BASE = process.env.BASE || 'http://127.0.0.1:8788';
const ORIGIN = BASE;
const EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const PASS = process.env.ADMIN_PASS || process.env.ADMIN_PASSWORD || 'ChangeMe123!';


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

async function req(path, opts = {}) {
  const headers = {
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...(opts.origin ? { Origin: ORIGIN } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...opts.headers,
  };
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  for (const c of setCookie) {
    const part = c.split(';')[0];
    if (part.startsWith('cms_session=')) cookie = part;
  }
  // fallback for runtimes without getSetCookie
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
  return { res, data, headers: res.headers };
}

async function main() {
  const login = await req('/api/auth/login', {
    method: 'POST',
    origin: true,
    body: { email: EMAIL, password: PASS },
  });
  if (!login.res.ok) throw new Error('login failed: ' + JSON.stringify(login.data));

  // Ensure baseline
  await req('/api/public/site');

  const publicBefore = await req('/api/public/site');
  const heroBefore = publicBefore.data.content.hero_title;

  const adminContent = await req('/api/admin/content');
  const draftBody = {
    content: { ...adminContent.data.content, hero_title: 'טיוטה לבדיקה' },
    services: adminContent.data.services.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      visible: !!s.visible,
      sort_order: s.sort_order,
    })),
  };
  const saved = await req('/api/admin/content', { method: 'PUT', origin: true, body: draftBody });
  if (!saved.data?.draftSaved) fail(1, 'draftSaved missing');
  else pass(1, 'edit creates draft');

  const publicAfterDraft = await req('/api/public/site');
  if (publicAfterDraft.data.content.hero_title !== heroBefore) {
    fail(2, 'public changed before publish');
  } else {
    pass(2, 'public unchanged before publish');
  }

  const tokenRes = await req('/api/admin/preview-token', { method: 'POST', origin: true, body: {} });
  const preview = await req(`/api/preview/site?token=${tokenRes.data.token}`);
  if (preview.data?.content?.hero_title === 'טיוטה לבדיקה') pass(3, 'preview shows draft');
  else fail(3, 'preview mismatch');

  const robots = preview.headers.get('x-robots-tag') || '';
  if (/noindex/i.test(robots)) pass(4, 'preview noindex header');
  else fail(4, 'missing X-Robots-Tag');

  const savedForBad = cookie;
  cookie = '';
  const bad = await req('/api/preview/site?token=bad');
  cookie = savedForBad;
  if (bad.res.status === 401) pass('3b', 'bad preview token 401');
  else fail('3b', `expected 401 got ${bad.res.status}`);

  const badWithSession = await req('/api/preview/site?token=bad');
  if (badWithSession.res.status === 401) pass('3c', 'bad token rejected even with session');
  else fail('3c', `expected 401 got ${badWithSession.res.status}`);

  const pub = await req('/api/admin/publish', { method: 'POST', origin: true, body: {} });
  const publicAfterPub = await req('/api/public/site');
  if (pub.res.ok && publicAfterPub.data.content.hero_title === 'טיוטה לבדיקה') {
    pass(5, `publish ok version ${publicAfterPub.data.versionId}`);
  } else {
    fail(5, JSON.stringify(pub.data));
  }

  // Force fail
  const admin2 = await req('/api/admin/content');
  await req('/api/admin/content', {
    method: 'PUT',
    origin: true,
    body: {
      content: { ...admin2.data.content, hero_title: 'לא אמור להתפרסם' },
      services: admin2.data.services.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        visible: !!s.visible,
        sort_order: s.sort_order,
      })),
    },
  });
  const verBeforeFail = (await req('/api/public/site')).data.versionId;
  const failPub = await req('/api/admin/publish', {
    method: 'POST',
    origin: true,
    body: { forceFail: true },
  });
  const afterFail = await req('/api/public/site');
  if (
    !failPub.res.ok &&
    afterFail.data.versionId === verBeforeFail &&
    afterFail.data.content.hero_title === 'טיוטה לבדיקה'
  ) {
    pass(6, 'failed publish kept previous');
  } else {
    fail(6, JSON.stringify({ failPub: failPub.data, afterFail: afterFail.data.content.hero_title }));
  }

  // Publish the new draft so we have a previous, then rollback
  await req('/api/admin/publish', { method: 'POST', origin: true, body: {} });
  const beforeRb = await req('/api/public/site');
  const mediaUrl = beforeRb.data.portfolio[0].media_url;
  const rb = await req('/api/admin/rollback', { method: 'POST', origin: true, body: {} });
  const afterRb = await req('/api/public/site');
  if (
    rb.res.ok &&
    afterRb.data.content.hero_title === 'טיוטה לבדיקה' &&
    afterRb.data.portfolio[0].media_url === mediaUrl
  ) {
    pass(7, 'rollback restored content + media urls');
  } else {
    fail(7, JSON.stringify({ rb: rb.data, hero: afterRb.data?.content?.hero_title }));
  }

  // Unauth
  const savedCookie = cookie;
  cookie = '';
  let unauthOk = true;
  for (const path of ['/api/admin/publish', '/api/admin/rollback', '/api/admin/preview-token']) {
    const r = await req(path, { method: 'POST', origin: true, body: {} });
    if (r.res.status !== 401) unauthOk = false;
  }
  cookie = savedCookie;
  if (unauthOk) pass(8, 'unauth blocked');
  else fail(8, 'unauth not blocked');

  // Concurrent lock
  const { execSync } = await import('node:child_process');
  execSync(
    'npx wrangler d1 execute cms-template-pg-multilingual --local --persist-to=.wrangler/state --command "UPDATE site_publish_state SET publishing = 1 WHERE locale = \'he\'"',
    { stdio: 'pipe' }
  );
  const locked = await req('/api/admin/publish', { method: 'POST', origin: true, body: {} });
  if (locked.res.status === 409) pass(9, 'concurrent publish 409');
  else fail(9, `expected 409 got ${locked.res.status}`);

  const statusBusy = await req('/api/admin/publish/status');
  if (statusBusy.data.publishing && statusBusy.data.status === 'Publishing') {
    pass(10, 'status Publishing across refresh');
  } else {
    fail(10, JSON.stringify(statusBusy.data));
  }
  execSync(
    'npx wrangler d1 execute cms-template-pg-multilingual --local --persist-to=.wrangler/state --command "UPDATE site_publish_state SET publishing = 0 WHERE locale = \'he\'"',
    { stdio: 'pipe' }
  );

  const sm = await fetch(`${BASE}/sitemap.xml`);
  const smText = await sm.text();
  if (sm.ok && smText.includes('<urlset')) pass('sitemap', 'sitemap.xml ok');
  else fail('sitemap', 'sitemap missing');

  // CSRF: mutating admin routes without Origin/Referer must fail
  const csrfTargets = [
    ['/api/admin/content', 'PUT', { content: {}, services: [] }],
    ['/api/admin/services', 'POST', { title: 'x', description: '' }],
    ['/api/admin/portfolio', 'POST', { title: 'x', media_type: 'image', media_url: '/media/x.jpg' }],
    ['/api/admin/portfolio/reorder', 'PUT', { ids: [1] }],
    ['/api/admin/publish', 'POST', {}],
    ['/api/admin/rollback', 'POST', {}],
    ['/api/admin/preview-token', 'POST', {}],
  ];
  let csrfOk = true;
  for (const [path, method, body] of csrfTargets) {
    const r = await req(path, { method, body }); // no origin
    if (r.res.status !== 403) {
      csrfOk = false;
      fail('csrf', `${path} expected 403 got ${r.res.status}`);
      break;
    }
  }
  if (csrfOk) pass('csrf', 'mutating admin routes require same-origin');

  // Login throttle: many bad passwords should eventually 429
  cookie = '';
  let loginLocked = false;
  for (let i = 0; i < 8; i++) {
    const r = await req('/api/auth/login', {
      method: 'POST',
      origin: true,
      body: { email: EMAIL, password: 'wrong-password-attempt' },
    });
    if (r.res.status === 429) {
      loginLocked = true;
      break;
    }
  }
  if (loginLocked) pass('ratelimit', 'login locks after repeated failures');
  else fail('ratelimit', 'expected 429 after repeated failed logins');

  // Clear throttle and restore session for local reuse
  try {
    const { execSync: exec2 } = await import('node:child_process');
    exec2(
      `npx wrangler d1 execute cms-template-pg-multilingual --local --persist-to=.wrangler/state --command "DELETE FROM login_throttle"`,
      { stdio: 'pipe' }
    );
  } catch {
    // ignore
  }
  const relogin = await req('/api/auth/login', {
    method: 'POST',
    origin: true,
    body: { email: EMAIL, password: PASS },
  });
  if (!relogin.res.ok) fail('ratelimit-relogin', 'could not login after clearing throttle');
  else cookie = cookie || savedCookie;

  const failed = results.filter((r) => !r.ok);
  console.log('\n--- Summary ---');
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
