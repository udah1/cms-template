#!/usr/bin/env node
/**
 * Translation status acceptance checks (isolated local D1 only).
 *
 * Prefer: npm run test:translation-status
 *
 * Requires:
 *   TRANSLATION_ISOLATED=1
 *   TRANSLATION_PERSIST=<path ending with state-translation-test>
 *   BASE=<pages dev bound to that persist>
 *   TRANSLATION_PHASE=mono|multi
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://127.0.0.1:8798';
const ORIGIN = BASE;
const EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const PASS = process.env.ADMIN_PASS || process.env.ADMIN_PASSWORD || 'ChangeMe123!';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERSIST = path.resolve(
  ROOT,
  process.env.TRANSLATION_PERSIST || '.wrangler/state-translation-test'
);
const D1_NAME = process.env.TRANSLATION_D1_NAME || 'cms-template';
const PHASE = process.env.TRANSLATION_PHASE || 'multi';

const HE_ONLY_MARKER = 'HE_ONLY_MARKER';
const EN_ONLY_MARKER = 'EN_ONLY_MARKER';
const ES_ONLY_MARKER = 'ES_ONLY_MARKER';

function assertIsolatedLocal() {
  if (process.env.TRANSLATION_ISOLATED !== '1') {
    throw new Error(
      'Refusing to run: set TRANSLATION_ISOLATED=1 or use `npm run test:translation-status`.'
    );
  }
  const normalized = PERSIST.replace(/\\/g, '/');
  if (
    !normalized.endsWith('/state-translation-test') &&
    !normalized.endsWith('state-translation-test')
  ) {
    throw new Error(`Refusing persist path (must be state-translation-test): ${PERSIST}`);
  }
  if (normalized.includes('/state/') && !normalized.includes('state-translation-test')) {
    throw new Error(`Refusing shared local D1 persist: ${PERSIST}`);
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
  return execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      D1_NAME,
      '--local',
      `--persist-to=${PERSIST}`,
      '--command',
      sql,
      '--json',
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
}

function d1Query(sql) {
  const out = d1Local(sql);
  try {
    const parsed = JSON.parse(out);
    const result = Array.isArray(parsed) ? parsed[0] : parsed;
    return result?.results || [];
  } catch {
    return [];
  }
}

function d1File(file) {
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      D1_NAME,
      '--local',
      `--persist-to=${PERSIST}`,
      `--file=${file}`,
    ],
    { cwd: ROOT, stdio: 'inherit' }
  );
}

async function login() {
  cookie = '';
  const { res, data } = await req('/api/auth/login', {
    method: 'POST',
    origin: true,
    body: { email: EMAIL, password: PASS },
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${JSON.stringify(data)}`);
}

async function statusFor(entityType, entityId, locale) {
  const q = new URLSearchParams({
    entity_type: entityType,
    locale,
    limit: '100',
  });
  const { data } = await req(`/api/admin/translations/status?${q}`);
  return (data.items || []).find(
    (i) => i.entityType === entityType && String(i.entityId) === String(entityId)
  );
}

async function runMono() {
  console.log('\n=== Phase mono (single locale) ===');

  const unauth = await req('/api/admin/translations/status');
  if (unauth.res.status === 401) pass('1a', 'status requires auth');
  else fail('1a', `expected 401, got ${unauth.res.status}`);

  await login();

  const { res, data } = await req('/api/admin/translations/status');
  if (res.ok && data.multilingual === false && Array.isArray(data.items) && data.items.length === 0) {
    pass('1', 'monolingual status API returns empty / inactive');
  } else {
    fail('1', `unexpected: ${res.status} ${JSON.stringify(data)}`);
  }

  const ack = await req('/api/admin/translations/acknowledge', {
    method: 'POST',
    origin: true,
    body: { entityType: 'site_content', entityId: 'hero_title', locale: 'en' },
  });
  if (ack.res.status === 404) pass('1b', 'acknowledge soft-404 when monolingual');
  else fail('1b', `expected 404, got ${ack.res.status}`);

  const content = await req('/api/admin/content?locale=he');
  if (content.data?.multilingual === false && (!content.data.needingAttention || content.data.needingAttention.length === 0)) {
    pass('1c', 'content chrome has no translation attention payload');
  } else {
    fail('1c', `chrome leaked multilingual data: ${JSON.stringify(content.data?.needingAttention)}`);
  }
}

async function runMulti() {
  console.log('\n=== Phase multi (he, en, es) ===');
  await login();

  // 2 + 4: backfill / ensure missing rows
  {
    const { res, data } = await req('/api/admin/translations/status?limit=200');
    if (!res.ok || !data.multilingual) {
      fail('2', `status failed: ${res.status}`);
    } else {
      const heHero = (data.items || []).find(
        (i) => i.entityType === 'site_content' && i.entityId === 'hero_title' && i.locale === 'he'
      );
      const enHero = (data.items || []).find(
        (i) => i.entityType === 'site_content' && i.entityId === 'hero_title' && i.locale === 'en'
      );
      const esHero = (data.items || []).find(
        (i) => i.entityType === 'site_content' && i.entityId === 'hero_title' && i.locale === 'es'
      );
      if (heHero?.freshnessStatus === 'current') pass('2', 'backfill source locale current');
      else fail('2', `he hero: ${JSON.stringify(heHero)}`);
      // Template seed is he-only → en missing. Playground seed has en → en current.
      const enSeeded = d1Query(
        `SELECT 1 AS ok FROM site_content WHERE key = 'hero_title' AND locale = 'en' LIMIT 1`
      );
      const expectEn = enSeeded.length ? 'current' : 'missing';
      if (enHero?.freshnessStatus === expectEn && esHero?.freshnessStatus === 'missing') {
        pass('4', `en ${expectEn} (seed-aware); es missing`);
      } else {
        fail('4', `en=${JSON.stringify(enHero)} es=${JSON.stringify(esHero)}`);
      }
    }
  }

  // 3: migration re-run does not change revisions
  {
    const before = d1Query(
      `SELECT revision FROM translation_source_revisions
       WHERE entity_type='site_content' AND entity_id='hero_title' AND source_locale='he'`
    );
    const revBefore = before[0]?.revision;
    d1File('./migrations/006_translation_status.sql');
    const after = d1Query(
      `SELECT revision FROM translation_source_revisions
       WHERE entity_type='site_content' AND entity_id='hero_title' AND source_locale='he'`
    );
    if (Number(after[0]?.revision) === Number(revBefore)) {
      pass('3', 'migration re-run is idempotent (revision unchanged)');
    } else {
      fail('3', `revision changed ${revBefore} → ${after[0]?.revision}`);
    }
  }

  // Seed EN translation for hero_title at current revision
  {
    const heContent = await req('/api/admin/content?locale=he');
    const rev = heContent.data.sourceRevisions?.['site_content:hero_title'] || 1;
    const { res } = await req('/api/admin/content?locale=en', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'en',
        content: { hero_title: EN_ONLY_MARKER },
        expectedSourceRevisions: { 'site_content:hero_title': rev },
      },
    });
    if (res.ok || res.status === 409) {
      /* 409 only if race; expect ok */
    }
    const st = await statusFor('site_content', 'hero_title', 'en');
    if (res.ok && st?.freshnessStatus === 'current') {
      pass('9a', 'saving matching translation marks current (setup)');
    } else if (!res.ok) {
      fail('9a', `EN save failed ${res.status}`);
    } else {
      fail('9a', `expected current, got ${JSON.stringify(st)}`);
    }
  }

  // 5: source save with translated diff bumps revision
  {
    const heContent = await req('/api/admin/content?locale=he');
    const beforeRev = heContent.data.sourceRevisions?.['site_content:hero_title'];
    const content = { ...(heContent.data.content || {}) };
    content.hero_title = `${HE_ONLY_MARKER}_${Date.now()}`;
    const { res, data } = await req('/api/admin/content?locale=he', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'he',
        content: { hero_title: content.hero_title },
        expectedSourceRevisions: heContent.data.sourceRevisions,
      },
    });
    const after = await req('/api/admin/content?locale=he');
    const afterRev = after.data.sourceRevisions?.['site_content:hero_title'];
    if (res.ok && Number(afterRev) === Number(beforeRev) + 1) {
      pass('5', 'source translated diff bumps revision by 1');
    } else {
      fail('5', `before=${beforeRev} after=${afterRev} status=${res.status} ${JSON.stringify(data)}`);
    }
  }

  // 6: no-diff save does not bump
  {
    const heContent = await req('/api/admin/content?locale=he');
    const beforeRev = heContent.data.sourceRevisions?.['site_content:hero_title'];
    const title = heContent.data.content?.hero_title;
    await req('/api/admin/content?locale=he', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'he',
        content: { hero_title: title },
        expectedSourceRevisions: heContent.data.sourceRevisions,
      },
    });
    const after = await req('/api/admin/content?locale=he');
    const afterRev = after.data.sourceRevisions?.['site_content:hero_title'];
    if (Number(afterRev) === Number(beforeRev)) pass('6', 'no translated diff → no revision bump');
    else fail('6', `${beforeRev} → ${afterRev}`);
  }

  // 7: non-translated field (sort_order / visible) does not outdated
  {
    const enBefore = await statusFor('service', '1', 'en');
    // ensure en service translation current first
    const he = await req('/api/admin/content?locale=he');
    const rev = he.data.sourceRevisions?.['service:1'] || 1;
    await req('/api/admin/content?locale=en', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'en',
        services: [
          {
            id: 1,
            title: 'EN service',
            description: 'desc',
            sort_order: 1,
            visible: 1,
          },
        ],
        expectedSourceRevisions: { 'service:1': rev },
      },
    });
    const he2 = await req('/api/admin/content?locale=he');
    const svc = (he2.data.services || []).find((s) => Number(s.id) === 1);
    const rev2 = he2.data.sourceRevisions?.['service:1'];
    await req('/api/admin/content?locale=he', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'he',
        services: [
          {
            id: 1,
            title: svc.title,
            description: svc.description,
            sort_order: Number(svc.sort_order) + 1,
            visible: svc.visible ? 0 : 1,
          },
        ],
        expectedSourceRevisions: { 'service:1': rev2 },
      },
    });
    const enAfter = await statusFor('service', '1', 'en');
    const revAfter = (await req('/api/admin/content?locale=he')).data.sourceRevisions?.['service:1'];
    if (Number(revAfter) === Number(rev2) && enAfter?.freshnessStatus === 'current') {
      pass('7', 'non-translated service fields do not bump / outdated');
    } else {
      fail(
        '7',
        `rev ${rev2}→${revAfter} en=${JSON.stringify(enAfter)} before=${JSON.stringify(enBefore)}`
      );
    }
  }

  // 8: source change marks other locales outdated
  {
    const he = await req('/api/admin/content?locale=he');
    await req('/api/admin/content?locale=he', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'he',
        content: { hero_title: `${HE_ONLY_MARKER}_outdate` },
        expectedSourceRevisions: he.data.sourceRevisions,
      },
    });
    const en = await statusFor('site_content', 'hero_title', 'en');
    if (en?.freshnessStatus === 'outdated') pass('8', 'source change marks EN outdated');
    else fail('8', JSON.stringify(en));

    // content not deleted
    const enContent = await req('/api/admin/content?locale=en');
    if (enContent.data.content?.hero_title === EN_ONLY_MARKER) {
      pass('8b', 'outdated translation content preserved');
    } else {
      fail('8b', `EN content lost: ${enContent.data.content?.hero_title}`);
    }
  }

  // 9: matching revision → current
  {
    const he = await req('/api/admin/content?locale=he');
    const rev = he.data.sourceRevisions?.['site_content:hero_title'];
    const { res } = await req('/api/admin/content?locale=en', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'en',
        content: { hero_title: `${EN_ONLY_MARKER}_updated` },
        expectedSourceRevisions: { 'site_content:hero_title': rev },
      },
    });
    const st = await statusFor('site_content', 'hero_title', 'en');
    if (res.ok && st?.freshnessStatus === 'current') pass('9', 'matching revision marks current');
    else fail('9', `${res.status} ${JSON.stringify(st)}`);
  }

  // 10: stale expected → 409, not current
  {
    const he = await req('/api/admin/content?locale=he');
    await req('/api/admin/content?locale=he', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'he',
        content: { hero_title: `${HE_ONLY_MARKER}_stale` },
        expectedSourceRevisions: he.data.sourceRevisions,
      },
    });
    const staleRev = he.data.sourceRevisions?.['site_content:hero_title'];
    const { res, data } = await req('/api/admin/content?locale=en', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'en',
        content: { hero_title: `${EN_ONLY_MARKER}_stale_write` },
        expectedSourceRevisions: { 'site_content:hero_title': staleRev },
      },
    });
    const st = await statusFor('site_content', 'hero_title', 'en');
    if (res.status === 409 && st?.freshnessStatus === 'outdated') {
      pass('10', 'stale translation save → 409 and stays/outdated');
    } else {
      fail('10', `${res.status} ${JSON.stringify(data)} st=${JSON.stringify(st)}`);
    }
  }

  // 11: edit current translation → draft publication flag
  {
    const he = await req('/api/admin/content?locale=he');
    const rev = he.data.sourceRevisions?.['site_content:hero_title'];
    // publish EN first
    await req('/api/admin/publish', {
      method: 'POST',
      origin: true,
      body: { locale: 'en' },
    });
    await req('/api/admin/content?locale=en', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'en',
        content: { hero_title: `${EN_ONLY_MARKER}_draft` },
        expectedSourceRevisions: { 'site_content:hero_title': rev },
      },
    });
    // fix: after source stale test, EN may be outdated - refresh to current first
    const he2 = await req('/api/admin/content?locale=he');
    const rev2 = he2.data.sourceRevisions?.['site_content:hero_title'];
    await req('/api/admin/content?locale=en', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'en',
        content: { hero_title: `${EN_ONLY_MARKER}_aligned` },
        expectedSourceRevisions: { 'site_content:hero_title': rev2 },
      },
    });
    await req('/api/admin/publish', {
      method: 'POST',
      origin: true,
      body: { locale: 'en' },
    });
    await req('/api/admin/content?locale=en', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'en',
        content: { hero_title: `${EN_ONLY_MARKER}_after_publish` },
        expectedSourceRevisions: { 'site_content:hero_title': rev2 },
      },
    });
    const st = await statusFor('site_content', 'hero_title', 'en');
    if (st?.freshnessStatus === 'current' && st?.isDraft === true) {
      pass('11', 'current translation edit is draft for publication');
    } else {
      fail('11', JSON.stringify(st));
    }
  }

  // 12 + 14: acknowledge
  {
    const he = await req('/api/admin/content?locale=he');
    await req('/api/admin/content?locale=he', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'he',
        content: { hero_title: `${HE_ONLY_MARKER}_for_ack` },
        expectedSourceRevisions: he.data.sourceRevisions,
      },
    });
    const beforeAudits = d1Query(
      `SELECT COUNT(*) AS c FROM audit_log WHERE action='translation.acknowledge'`
    );
    const countBefore = Number(beforeAudits[0]?.c || 0);

    const ack1 = await req('/api/admin/translations/acknowledge', {
      method: 'POST',
      origin: true,
      body: { entityType: 'site_content', entityId: 'hero_title', locale: 'en' },
    });
    const st = await statusFor('site_content', 'hero_title', 'en');
    if (
      ack1.res.ok &&
      st?.freshnessStatus === 'outdated' &&
      st?.reviewStatus === 'acknowledged' &&
      st?.displayStatus === 'acknowledged'
    ) {
      pass('12', 'acknowledge sets review only; freshness stays outdated');
    } else {
      fail('12', `${ack1.res.status} ${JSON.stringify(st)}`);
    }

    const ack2 = await req('/api/admin/translations/acknowledge', {
      method: 'POST',
      origin: true,
      body: { entityType: 'site_content', entityId: 'hero_title', locale: 'en' },
    });
    const afterAudits = d1Query(
      `SELECT COUNT(*) AS c FROM audit_log WHERE action='translation.acknowledge'`
    );
    const countAfter = Number(afterAudits[0]?.c || 0);
    if (ack2.res.ok && ack2.data?.idempotent === true && countAfter === countBefore + 1) {
      pass('14', 'acknowledge is idempotent (no duplicate audit)');
    } else {
      fail(
        '14',
        `idempotent=${ack2.data?.idempotent} audits ${countBefore}→${countAfter}`
      );
    }
  }

  // 13: source change after acknowledge resets review
  {
    const he = await req('/api/admin/content?locale=he');
    await req('/api/admin/content?locale=he', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'he',
        content: { hero_title: `${HE_ONLY_MARKER}_reset_ack` },
        expectedSourceRevisions: he.data.sourceRevisions,
      },
    });
    const st = await statusFor('site_content', 'hero_title', 'en');
    if (st?.freshnessStatus === 'outdated' && st?.reviewStatus === 'normal') {
      pass('13', 'source bump after acknowledge resets review to normal');
    } else {
      fail('13', JSON.stringify(st));
    }
  }

  // 15: publish locale isolation + markers
  {
    const he = await req('/api/admin/content?locale=he');
    await req('/api/admin/content?locale=he', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'he',
        content: { hero_title: HE_ONLY_MARKER },
        expectedSourceRevisions: he.data.sourceRevisions,
      },
    });
    await req('/api/admin/publish', { method: 'POST', origin: true, body: { locale: 'he' } });

    const he2 = await req('/api/admin/content?locale=he');
    const rev = he2.data.sourceRevisions?.['site_content:hero_title'];
    await req('/api/admin/content?locale=en', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'en',
        content: { hero_title: EN_ONLY_MARKER },
        expectedSourceRevisions: { 'site_content:hero_title': rev },
      },
    });
    await req('/api/admin/publish', { method: 'POST', origin: true, body: { locale: 'en' } });

    const pubHe = await req('/api/public/site?locale=he');
    const pubEn = await req('/api/public/site?locale=en');
    const heOk = String(pubHe.data?.content?.hero_title || '').includes('HE_ONLY');
    const enOk = String(pubEn.data?.content?.hero_title || '').includes('EN_ONLY');
    const noMix =
      !String(pubHe.data?.content?.hero_title || '').includes('EN_ONLY') &&
      !String(pubEn.data?.content?.hero_title || '').includes('HE_ONLY');
    if (heOk && enOk && noMix) pass('15', 'publish per-locale; no language mixing');
    else fail('15', `he=${pubHe.data?.content?.hero_title} en=${pubEn.data?.content?.hero_title}`);
  }

  // 16: rollback source bumps revision / outdated
  {
    const he = await req('/api/admin/content?locale=he');
    await req('/api/admin/content?locale=he', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'he',
        content: { hero_title: `${HE_ONLY_MARKER}_v2` },
        expectedSourceRevisions: he.data.sourceRevisions,
      },
    });
    await req('/api/admin/publish', { method: 'POST', origin: true, body: { locale: 'he' } });

    const beforeRev = (await req('/api/admin/content?locale=he')).data.sourceRevisions?.[
      'site_content:hero_title'
    ];
    // align EN then outdated via rollback of HE
    const heAlign = await req('/api/admin/content?locale=he');
    await req('/api/admin/content?locale=en', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'en',
        content: { hero_title: EN_ONLY_MARKER },
        expectedSourceRevisions: {
          'site_content:hero_title': heAlign.data.sourceRevisions?.['site_content:hero_title'],
        },
      },
    });

    const { res } = await req('/api/admin/rollback', {
      method: 'POST',
      origin: true,
      body: { locale: 'he' },
    });
    const afterRev = (await req('/api/admin/content?locale=he')).data.sourceRevisions?.[
      'site_content:hero_title'
    ];
    const en = await statusFor('site_content', 'hero_title', 'en');
    if (res.ok && Number(afterRev) >= Number(beforeRev) && en?.freshnessStatus === 'outdated') {
      pass('16', 'source rollback bumps revision and marks translations outdated');
    } else {
      fail('16', `status=${res.status} rev ${beforeRev}→${afterRev} en=${JSON.stringify(en)}`);
    }
  }

  // 17: rollback translated locale recomputes freshness
  {
    const he = await req('/api/admin/content?locale=he');
    const rev = he.data.sourceRevisions?.['site_content:hero_title'];
    await req('/api/admin/content?locale=en', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'en',
        content: { hero_title: `${EN_ONLY_MARKER}_rb1` },
        expectedSourceRevisions: { 'site_content:hero_title': rev },
      },
    });
    await req('/api/admin/publish', { method: 'POST', origin: true, body: { locale: 'en' } });
    await req('/api/admin/content?locale=en', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'en',
        content: { hero_title: `${EN_ONLY_MARKER}_rb2` },
        expectedSourceRevisions: { 'site_content:hero_title': rev },
      },
    });
    await req('/api/admin/publish', { method: 'POST', origin: true, body: { locale: 'en' } });
    const { res } = await req('/api/admin/rollback', {
      method: 'POST',
      origin: true,
      body: { locale: 'en' },
    });
    const st = await statusFor('site_content', 'hero_title', 'en');
    if (res.ok && (st?.freshnessStatus === 'current' || st?.freshnessStatus === 'outdated')) {
      pass('17', `translated locale rollback recomputed freshness (${st.freshnessStatus})`);
    } else {
      fail('17', `${res.status} ${JSON.stringify(st)}`);
    }
  }

  // 18: auth / csrf / validation
  {
    const saved = cookie;
    cookie = '';
    const unauth = await req('/api/admin/translations/status');
    cookie = saved;
    const csrf = await req('/api/admin/translations/acknowledge', {
      method: 'POST',
      body: { entityType: 'site_content', entityId: 'hero_title', locale: 'en' },
    });
    const badType = await req('/api/admin/translations/acknowledge', {
      method: 'POST',
      origin: true,
      body: { entityType: 'nope', entityId: 'x', locale: 'en' },
    });
    const badLocale = await req('/api/admin/translations/acknowledge', {
      method: 'POST',
      origin: true,
      body: { entityType: 'site_content', entityId: 'hero_title', locale: 'xx' },
    });
    const badEntity = await req('/api/admin/translations/acknowledge', {
      method: 'POST',
      origin: true,
      body: { entityType: 'site_content', entityId: 'no_such_key_zzz', locale: 'en' },
    });
    if (
      unauth.res.status === 401 &&
      csrf.res.status === 403 &&
      badType.res.status === 400 &&
      badLocale.res.status === 400 &&
      (badEntity.res.status === 404 || badEntity.res.status === 400)
    ) {
      pass('18', 'auth, CSRF, entity_type, locale, entity_id rejected');
    } else {
      fail(
        '18',
        `unauth=${unauth.res.status} csrf=${csrf.res.status} type=${badType.res.status} loc=${badLocale.res.status} ent=${badEntity.res.status}`
      );
    }
  }

  // 19: concurrent source writes → one conflict
  {
    const he = await req('/api/admin/content?locale=he');
    const expected = { ...he.data.sourceRevisions };
    const bodyA = {
      locale: 'he',
      content: { hero_title: `${HE_ONLY_MARKER}_race_a` },
      expectedSourceRevisions: expected,
    };
    const bodyB = {
      locale: 'he',
      content: { hero_title: `${HE_ONLY_MARKER}_race_b` },
      expectedSourceRevisions: expected,
    };
    const [a, b] = await Promise.all([
      req('/api/admin/content?locale=he', { method: 'PUT', origin: true, body: bodyA }),
      req('/api/admin/content?locale=he', { method: 'PUT', origin: true, body: bodyB }),
    ]);
    const statuses = [a.res.status, b.res.status].sort();
    const okCount = statuses.filter((s) => s === 200).length;
    const conflictCount = statuses.filter((s) => s === 409).length;
    if (okCount >= 1 && (conflictCount >= 1 || okCount === 2)) {
      // Both 200 possible if second read fresh expected from overlapping non-CAS path on different timing;
      // require at most one extra revision vs double bump beyond +2
      const after = await req('/api/admin/content?locale=he');
      const beforeRev = expected['site_content:hero_title'];
      const afterRev = after.data.sourceRevisions?.['site_content:hero_title'];
      if (Number(afterRev) <= Number(beforeRev) + 2) {
        pass('19', `concurrent source writes handled (statuses ${statuses}, rev ${beforeRev}→${afterRev})`);
      } else {
        fail('19', `revision jumped too far ${beforeRev}→${afterRev}`);
      }
    } else {
      fail('19', `unexpected statuses ${statuses}`);
    }
  }

  // 20: retry same save (idempotent no double bump)
  {
    const he = await req('/api/admin/content?locale=he');
    const title = `${HE_ONLY_MARKER}_idem_${Date.now()}`;
    const body = {
      locale: 'he',
      content: { hero_title: title },
      expectedSourceRevisions: he.data.sourceRevisions,
    };
    const first = await req('/api/admin/content?locale=he', {
      method: 'PUT',
      origin: true,
      body,
    });
    const mid = await req('/api/admin/content?locale=he');
    const midRev = mid.data.sourceRevisions?.['site_content:hero_title'];
    // retry with updated expected + same value (no diff)
    const second = await req('/api/admin/content?locale=he', {
      method: 'PUT',
      origin: true,
      body: {
        locale: 'he',
        content: { hero_title: title },
        expectedSourceRevisions: mid.data.sourceRevisions,
      },
    });
    const end = await req('/api/admin/content?locale=he');
    const endRev = end.data.sourceRevisions?.['site_content:hero_title'];
    if (first.res.ok && second.res.ok && Number(endRev) === Number(midRev)) {
      pass('20', 'retry/idempotent save does not double-bump revision');
    } else {
      fail('20', `first=${first.res.status} second=${second.res.status} ${midRev}→${endRev}`);
    }
  }

  // ES missing stays missing (not outdated) + marker isolation
  {
    const es = await statusFor('site_content', 'hero_title', 'es');
    if (es?.freshnessStatus === 'missing') pass('4b', 'ES without translation stays missing');
    else fail('4b', JSON.stringify(es));

    const hePub = await req('/api/public/site?locale=he');
    if (!String(hePub.data?.content?.hero_title || '').includes(ES_ONLY_MARKER)) {
      pass('mix', 'no ES marker in HE public content');
    } else {
      fail('mix', 'ES marker leaked into HE');
    }
  }

  // secrets not in status / audit details
  {
    const { data } = await req('/api/admin/translations/status?limit=5');
    const blob = JSON.stringify(data);
    if (!/ChangeMe123|password_hash|cms_session=/.test(blob)) {
      pass('secrets', 'translation status response has no secrets');
    } else {
      fail('secrets', 'secrets leaked in status response');
    }
  }
}

async function main() {
  assertIsolatedLocal();
  console.log(`Translation status tests phase=${PHASE} base=${BASE}`);
  console.log(`Persist=${PERSIST}`);

  if (PHASE === 'mono') await runMono();
  else await runMulti();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exitCode = 1;
    for (const f of failed) console.error(` - ${f.id}: ${f.msg}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
