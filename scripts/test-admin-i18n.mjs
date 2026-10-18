#!/usr/bin/env node
/**
 * Deterministic Admin Chrome i18n checks (no shared D1, no browser).
 * Run: npm run test:admin-i18n
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

function pass(id, msg) {
  results.push({ id, ok: true, msg });
  console.log(`PASS ${id}: ${msg}`);
}
function fail(id, msg) {
  results.push({ id, ok: false, msg });
  console.error(`FAIL ${id}: ${msg}`);
}

function hasHebrew(str) {
  return /[\u0590-\u05FF]/.test(String(str || ''));
}

function makeRoot(nodesBySel) {
  return {
    documentElement: { lang: '', dir: '' },
    title: '',
    querySelector(sel) {
      if (sel === 'title') return { textContent: '' };
      return null;
    },
    querySelectorAll(sel) {
      return nodesBySel[sel] || [];
    },
  };
}

function el(attrName, key) {
  const attrs = { [attrName]: key };
  return {
    textContent: '',
    getAttribute(name) {
      return attrs[name];
    },
    setAttribute(name, value) {
      attrs[name] = value;
    },
  };
}

async function main() {
  const i18nUrl = pathToFileURL(path.join(ROOT, 'public/admin/ui-i18n.js')).href;
  const {
    UI_STRINGS,
    FIELD_LABELS,
    assertUiI18nComplete,
    t,
    fieldLabel,
    localeDir,
    applyAdminChrome,
    applyStaticI18n,
    normalizeUiLocale,
  } = await import(i18nUrl);

  try {
    assertUiI18nComplete();
    pass(29, 'assertUiI18nComplete: he/en keys complete');
  } catch (err) {
    fail(29, err.message);
  }

  if (localeDir('he') === 'rtl' && localeDir('en') === 'ltr') {
    pass(3, 'localeDir he=rtl en=ltr');
  } else {
    fail(3, `localeDir unexpected: he=${localeDir('he')} en=${localeDir('en')}`);
  }

  const heHeading = t('he', 'login.heading');
  const enHeading = t('en', 'login.heading');
  if (hasHebrew(heHeading) && !hasHebrew(enHeading) && enHeading === 'Site admin') {
    pass(6, 'login.heading he/en');
  } else {
    fail(6, `login.heading he=${heHeading} en=${enHeading}`);
  }

  if (normalizeUiLocale('xx') === 'he' && t('xx', 'header.logout') === t('he', 'header.logout')) {
    pass(14, 'unknown locale falls back to defaultLocale');
  } else {
    fail(14, 'unknown locale fallback failed');
  }

  const missingKey = t('en', 'does.not.exist.ever');
  if (missingKey === '') {
    pass(15, 'missing key does not leak key name');
  } else {
    fail(15, `missing key returned ${missingKey}`);
  }

  if (fieldLabel('en', 'business_name') === 'Business name' && fieldLabel('he', 'business_name') === 'שם העסק') {
    pass(7, 'fieldLabel overlay he/en');
  } else {
    fail(7, 'fieldLabel overlay mismatch');
  }

  const i18nNode = el('data-i18n', 'tab.content');
  const ariaNode = el('data-i18n-aria', 'nav.tabsAria');
  const phNode = el('data-i18n-placeholder', 'ph.altExample');
  const root = makeRoot({
    '[data-i18n]': [i18nNode],
    '[data-i18n-aria]': [ariaNode],
    '[data-i18n-placeholder]': [phNode],
    '[data-i18n-title]': [],
    '[data-i18n-alt]': [],
  });
  applyAdminChrome('en', { root });
  if (
    root.documentElement.lang === 'en' &&
    root.documentElement.dir === 'ltr' &&
    i18nNode.textContent === 'Content' &&
    ariaNode.getAttribute('aria-label') === 'Admin navigation' &&
    phNode.getAttribute('placeholder') === 'e.g. short description of the image'
  ) {
    pass(4, 'applyAdminChrome en sets lang/dir + data-i18n*');
  } else {
    fail(
      4,
      `chrome en unexpected lang=${root.documentElement.lang} dir=${root.documentElement.dir} text=${i18nNode.textContent}`
    );
  }

  applyAdminChrome('he', { root });
  if (root.documentElement.lang === 'he' && root.documentElement.dir === 'rtl' && i18nNode.textContent === 'תוכן') {
    pass(5, 'applyAdminChrome he sets lang/dir + labels');
  } else {
    fail(5, `chrome he unexpected lang=${root.documentElement.lang} dir=${root.documentElement.dir}`);
  }

  const titleEl = { textContent: '' };
  const subtitleEl = el('data-i18n', 'login.subtitle');
  const brandRoot = makeRoot({
    '[data-i18n]': [subtitleEl],
    '[data-i18n-aria]': [],
    '[data-i18n-placeholder]': [],
    '[data-i18n-title]': [],
    '[data-i18n-alt]': [],
    '[data-i18n="login.subtitle"]': [subtitleEl],
  });
  brandRoot.querySelector = (sel) => (sel === 'title' ? titleEl : null);
  applyAdminChrome('he', { root: brandRoot, businessName: 'MYK Studio' });
  if (titleEl.textContent === 'MYK Studio | ניהול' && subtitleEl.textContent === 'MYK Studio') {
    pass(31, 'applyAdminChrome interpolates business name into title/subtitle');
  } else {
    fail(31, `brand chrome unexpected title=${titleEl.textContent} sub=${subtitleEl.textContent}`);
  }

  const enChromeKeys = Object.keys(UI_STRINGS.en).filter(
    (k) => !k.startsWith('locale.') && k !== 'locale.he'
  );
  const heInEn = enChromeKeys.filter((k) => hasHebrew(UI_STRINGS.en[k]));
  // locale.he value is intentionally Hebrew in both tables
  if (heInEn.length === 0 && hasHebrew(UI_STRINGS.en['locale.he'])) {
    pass(30, 'EN chrome strings have no Hebrew (except locale.he label)');
  } else {
    fail(30, `Hebrew in EN chrome: ${heInEn.join(',')}`);
  }

  const html = readFileSync(path.join(ROOT, 'public/admin/index.html'), 'utf8');
  const adminJs = readFileSync(path.join(ROOT, 'public/admin/admin.js'), 'utf8');
  const adminCss = readFileSync(path.join(ROOT, 'public/admin/admin.css'), 'utf8');

  if (html.includes('id="localePickers"') && html.includes('id="adminLocaleSelect"') && html.includes('id="contentLocaleSelect"')) {
    pass(1, 'HTML has dual locale pickers');
  } else {
    fail(1, 'HTML missing dual locale pickers');
  }

  const contentIdx = html.indexOf('id="contentLocaleSelect"');
  const adminIdx = html.indexOf('id="adminLocaleSelect"');
  if (contentIdx >= 0 && adminIdx > contentIdx) {
    pass(31, 'content locale picker appears before admin locale picker');
  } else {
    fail(31, 'content locale picker should come before admin locale picker');
  }

  if (html.includes('localePickers') && html.includes('hidden')) {
    pass(2, 'locale pickers can be hidden (single-locale)');
  } else {
    fail(2, 'locale pickers not marked hidden by default');
  }

  const dataKeys = [...html.matchAll(/data-i18n(?:-aria|-placeholder|-title|-alt)?="([^"]+)"/g)].map((m) => m[1]);
  const missingInDict = dataKeys.filter((k) => !UI_STRINGS.he[k] || !UI_STRINGS.en[k]);
  if (dataKeys.length && !missingInDict.length) {
    pass(8, `HTML data-i18n* keys (${dataKeys.length}) exist in dictionary`);
  } else {
    fail(8, `missing dict keys: ${missingInDict.join(',')}`);
  }

  const requiredSnippets = [
    'adminLocale',
    'contentLocale',
    'withContentLocale',
    'applyAdminChrome',
    'isContentDirty',
    'switchContentLocale',
    'switchAdminLocale',
    'cmsAdmin.adminLocale',
    'cmsAdmin.contentLocale',
    'cmsAdmin.adminLocaleLocked',
    'syncAdminLocaleToContent',
    'contentLoadGen',
  ];
  const missingSnip = requiredSnippets.filter((s) => !adminJs.includes(s));
  if (!missingSnip.length) {
    pass(17, 'admin.js wires adminLocale/contentLocale + dirty/race helpers');
  } else {
    fail(17, `admin.js missing: ${missingSnip.join(',')}`);
  }

  if (adminJs.includes("lang=\"${contentLocale}\"") && adminJs.includes('localeDir(contentLocale)')) {
    pass(19, 'content fields use contentLocale lang/dir');
  } else {
    fail(19, 'content field lang/dir wiring missing');
  }

  if (
    adminJs.includes("'/api/admin/publish'") === false &&
    adminJs.includes('withContentLocale') &&
    adminJs.includes('publishLocale')
  ) {
    pass(20, 'Preview/Publish/Rollback capture publish locale');
  } else if (adminJs.includes('publishLocale') && adminJs.includes('withContentLocale')) {
    pass(20, 'Preview/Publish/Rollback capture publish locale');
  } else {
    fail(20, 'publish locale capture missing');
  }

  if (adminCss.includes("html[dir='ltr']") && adminCss.includes('locale-pickers')) {
    pass(9, 'admin.css supports ltr + locale pickers');
  } else {
    fail(9, 'admin.css missing ltr/locale-picker rules');
  }

  if (adminJs.includes('!isMultilingualUi()') && adminJs.includes('siteDefaultLocale')) {
    pass(28, 'single-locale chrome locks to defaultLocale');
  } else {
    fail(28, 'single-locale lock missing');
  }

  // Confirm dirty switch keys exist for 3-way dialog
  for (const key of ['dirty.saveAndSwitch', 'dirty.discardAndSwitch', 'dirty.cancelSwitch']) {
    if (!UI_STRINGS.he[key] || !UI_STRINGS.en[key]) {
      fail(18, `missing dirty key ${key}`);
      break;
    }
  }
  if (results.every((r) => r.id !== 18 || r.ok !== false)) {
    if (UI_STRINGS.he['dirty.saveAndSwitch']) pass(18, 'dirty contentLocale switch strings present');
  }

  // Structural CONTENT_FIELD_DEFS keys must match FIELD_LABELS
  const fieldKeys = [...adminJs.matchAll(/\['([a-z_]+)'(?:,\s*'textarea')?\]/g)].map((m) => m[1]);
  const unique = [...new Set(fieldKeys)].filter((k) => FIELD_LABELS.he[k] != null || k.includes('_'));
  const contentKeys = Object.keys(FIELD_LABELS.he);
  const missingLabels = contentKeys.filter((k) => !adminJs.includes(`'${k}'`));
  if (!missingLabels.length) {
    pass(27, 'FIELD_LABELS keys covered by CONTENT_FIELD_DEFS');
  } else {
    fail(27, `CONTENT_FIELD_DEFS missing: ${missingLabels.join(',')}`);
  }

  applyStaticI18n(root, 'en');
  pass(12, 'applyStaticI18n callable for placeholders/aria');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
