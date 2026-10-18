#!/usr/bin/env node
/**
 * Acceptance checks for public HTML SSR (SEO in first response).
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
  return { res, data, text, headers: res.headers };
}

function assertIncludes(html, needles, id, label) {
  const missing = needles.filter((n) => !html.includes(n));
  if (missing.length) fail(id, `${label} missing: ${missing.join(' | ')}`);
  else pass(id, label);
}

async function main() {
  const login = await req('/api/auth/login', {
    method: 'POST',
    origin: true,
    body: { email: EMAIL, password: PASS },
  });
  if (!login.res.ok) throw new Error('login failed: ' + JSON.stringify(login.data));

  // Ensure published baseline exists
  await req('/api/public/site');

  const home = await req('/');
  if (!home.res.ok || typeof home.text !== 'string') {
    fail('ssr-home', `home status ${home.res.status}`);
  } else {
    const html = home.text;
    assertIncludes(
      html,
      [
        'data-ssr="1"',
        'שם העסק',
        'פתרון מקצועי בהתאמה אישית',
        'og:title',
        'og:description',
        'og:image',
        'application/ld+json',
        'Organization',
        'id="servicesList"',
      ],
      'ssr-seo',
      'home HTML has SEO + SSR markers'
    );
    // Services from seed should appear in initial HTML
    if (/שירות ראשון|service-item/.test(html)) pass('ssr-services', 'services in initial HTML');
    else fail('ssr-services', 'services missing from SSR HTML');
  }

  const css = await fetch(`${BASE}/styles.css`);
  if (css.ok) pass('static-css', 'styles.css ok');
  else fail('static-css', `styles.css ${css.status}`);

  const js = await fetch(`${BASE}/js/site.js`);
  if (js.ok) pass('static-js', 'site.js ok');
  else fail('static-js', `site.js ${js.status}`);

  const publicBefore = await req('/api/public/site');
  const nameBefore = publicBefore.data.content.business_name;
  const newName = `עסק SSR ${Date.now().toString(36)}`;

  const adminContent = await req('/api/admin/content');
  const draftBody = {
    content: { ...adminContent.data.content, business_name: newName },
    services: adminContent.data.services.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      visible: !!s.visible,
      sort_order: s.sort_order,
    })),
  };
  const saved = await req('/api/admin/content', { method: 'PUT', origin: true, body: draftBody });
  if (!saved.data?.draftSaved) fail('draft', 'draft save failed');
  else pass('draft', 'draft saved with new business name');

  const tokenRes = await req('/api/admin/preview-token', { method: 'POST', origin: true, body: {} });
  const token = tokenRes.data?.token;
  if (!token) {
    fail('preview-token', 'no token');
  } else {
    const previewPage = await req(`/?preview=${encodeURIComponent(token)}`);
    const robots = previewPage.headers.get('x-robots-tag') || '';
    if (previewPage.res.ok && previewPage.text.includes(newName) && /noindex/i.test(robots)) {
      pass('preview-ssr', 'preview HTML shows draft name + noindex');
    } else {
      fail(
        'preview-ssr',
        `ok=${previewPage.res.ok} hasName=${previewPage.text?.includes(newName)} robots=${robots}`
      );
    }
  }

  const publicHtmlBefore = await req('/');
  if (publicHtmlBefore.text.includes(newName)) {
    fail('public-before', 'public HTML showed draft name before publish');
  } else if (publicHtmlBefore.text.includes(nameBefore)) {
    pass('public-before', 'public HTML still has previous business name');
  } else {
    fail('public-before', 'previous business name missing from public HTML');
  }

  const pub = await req('/api/admin/publish', { method: 'POST', origin: true, body: {} });
  const publicHtmlAfter = await req('/');
  if (pub.res.ok && publicHtmlAfter.text.includes(newName) && publicHtmlAfter.text.includes('og:title')) {
    pass('publish-ssr', 'published name appears in SSR HTML');
  } else {
    fail('publish-ssr', `publish=${pub.res.status} hasName=${publicHtmlAfter.text?.includes(newName)}`);
  }

  // Create another version then rollback to previous (with newName)
  await req('/api/admin/content', {
    method: 'PUT',
    origin: true,
    body: {
      content: { ...draftBody.content, business_name: `${newName}-next` },
      services: draftBody.services,
    },
  });
  await req('/api/admin/publish', { method: 'POST', origin: true, body: {} });
  const mid = await req('/');
  if (!mid.text.includes(`${newName}-next`)) fail('mid-publish', 'second publish name missing');
  else pass('mid-publish', 'second publish visible in HTML');

  const rb = await req('/api/admin/rollback', { method: 'POST', origin: true, body: {} });
  const afterRb = await req('/');
  if (rb.res.ok && afterRb.text.includes(newName) && !afterRb.text.includes(`${newName}-next`)) {
    pass('rollback-ssr', 'rollback restored previous name in SSR HTML');
  } else {
    fail(
      'rollback-ssr',
      `rb=${rb.res.status} hasOld=${afterRb.text?.includes(newName)} hasNext=${afterRb.text?.includes(`${newName}-next`)}`
    );
  }

  // Bad preview token must not leak draft via SSR
  const badPreview = await req('/?preview=not-a-valid-token');
  if (badPreview.res.status === 401) pass('bad-preview', 'invalid preview token 401');
  else fail('bad-preview', `expected 401 got ${badPreview.res.status}`);

  // Fallback path: pages still return HTML (non-empty) for known routes
  for (const p of ['/', '/about/', '/services/', '/portfolio/', '/faq/']) {
    const r = await req(p);
    if (r.res.ok && r.text && r.text.length > 500 && r.text.includes('<!doctype html')) {
      pass(`route-${p}`, `${p} returns HTML`);
    } else {
      fail(`route-${p}`, `${p} status=${r.res.status} len=${r.text?.length}`);
    }
  }

  // 404: no client-specific WhatsApp copy; CMS business name + wa.me from publish
  const missing = await req(`/no-such-page-${Date.now()}`);
  const missingHtml = missing.text || '';
  let decoded = missingHtml;
  try {
    decoded = decodeURIComponent(missingHtml);
  } catch {
    // keep raw html
  }
  const hasYuvalLeak = /יובל|איפור/.test(missingHtml) || /יובל|איפור/.test(decoded);
  if (missing.res.status === 404 && !hasYuvalLeak) {
    pass('404-clean', '404 has no client-specific WhatsApp copy');
  } else {
    fail('404-clean', `status=${missing.res.status} leak=${hasYuvalLeak}`);
  }
  if (
    missing.res.status === 404 &&
    missingHtml.includes('data-ssr="1"') &&
    missingHtml.includes(newName) &&
    missingHtml.includes('data-whatsapp') &&
    /wa\.me\//i.test(missingHtml)
  ) {
    pass('404-ssr', '404 SSR injects published business name + WhatsApp');
  } else {
    fail(
      '404-ssr',
      `status=${missing.res.status} ssr=${missingHtml.includes('data-ssr="1"')} name=${missingHtml.includes(newName)}`
    );
  }

  // Footer / chrome: published name should appear on home after SSR
  const homeChrome = await req('/');
  if (homeChrome.text.includes(newName) && homeChrome.text.includes('data-business')) {
    pass('chrome-business', 'published business name present with data-business');
  } else {
    fail('chrome-business', 'business chrome missing published name');
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n--- SSR Summary ---');
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
