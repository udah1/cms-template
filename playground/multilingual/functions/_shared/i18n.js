/**
 * Multilingual playground: he (default, no prefix) + en (/en/...).
 * multilingual / enabled are derived from locales.length > 1.
 */

export const I18N = {
  defaultLocale: 'he',
  locales: ['he', 'en'],
  urlStrategy: 'default-root-with-prefixed-alternates',
};

/** BCP-47-ish: language lowercase, region uppercase (he, en, en-US). */
const LOCALE_RE = /^[a-z]{2,3}(?:-[A-Z][a-zA-Z]{1,7})?$/;

/** Query params safe to keep on locale redirects / switcher. */
export const REDIRECT_QUERY_ALLOWLIST = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']);

/** Set from Workers `env` (wrangler --var) at request start - see bindI18nRuntimeEnv. */
let runtimeLocalesOverride = null;
let runtimeDefaultLocaleOverride = null;

/**
 * Call once per request from middleware/API with context.env so isolated tests can
 * pass I18N_LOCALES_OVERRIDE via `wrangler pages dev --var` without rewriting i18n.js.
 */
export function bindI18nRuntimeEnv(env) {
  const raw = env && env.I18N_LOCALES_OVERRIDE != null ? String(env.I18N_LOCALES_OVERRIDE).trim() : '';
  runtimeLocalesOverride = raw || null;
  const d =
    env && env.I18N_DEFAULT_LOCALE_OVERRIDE != null
      ? String(env.I18N_DEFAULT_LOCALE_OVERRIDE).trim()
      : '';
  runtimeDefaultLocaleOverride = d || null;
}

/**
 * Active config. Override sources (first wins):
 * 1) bindI18nRuntimeEnv / Workers env (test --var)
 * 2) process.env (Node-side scripts only)
 * Separators: comma, plus, or pipe (he,en,es / he+en+es / he|en|es).
 */
export function getActiveI18n() {
  const fromProcess =
    typeof process !== 'undefined' && process.env && process.env.I18N_LOCALES_OVERRIDE
      ? String(process.env.I18N_LOCALES_OVERRIDE)
      : '';
  const raw = (runtimeLocalesOverride || fromProcess || '').trim();
  if (!raw) return I18N;
  const locales = [];
  const seen = new Set();
  for (const part of raw.split(/[,+|]/)) {
    const locale = normalizeLocale(part.trim());
    if (!locale || seen.has(locale)) continue;
    seen.add(locale);
    locales.push(locale);
  }
  if (!locales.length) return I18N;
  const defaultFromProcess =
    typeof process !== 'undefined' && process.env && process.env.I18N_DEFAULT_LOCALE_OVERRIDE
      ? normalizeLocale(process.env.I18N_DEFAULT_LOCALE_OVERRIDE)
      : null;
  const defaultOverride =
    normalizeLocale(runtimeDefaultLocaleOverride) || defaultFromProcess;
  const defaultLocale =
    (defaultOverride && locales.includes(defaultOverride) && defaultOverride) || locales[0];
  return { ...I18N, defaultLocale, locales };
}

export function isMultilingual(config = getActiveI18n()) {
  return (config.locales || []).length > 1;
}

export function isEnabled(config = getActiveI18n()) {
  return isMultilingual(config);
}

export function normalizeLocale(value) {
  if (value == null) return null;
  const raw = String(value).trim().replace(/_/g, '-');
  if (!raw) return null;
  const parts = raw.split('-').filter(Boolean);
  if (!parts.length) return null;
  const language = parts[0].toLowerCase();
  if (!/^[a-z]{2,3}$/.test(language)) return null;
  if (parts.length === 1) {
    const out = language;
    return LOCALE_RE.test(out) ? out : null;
  }
  const region = parts[1].toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(region)) return null;
  const out = `${language}-${region}`;
  return LOCALE_RE.test(out) ? out : null;
}

export function getDefaultLocale(config = getActiveI18n()) {
  return normalizeLocale(config.defaultLocale) || 'he';
}

export function getLocales(config = getActiveI18n()) {
  const list = Array.isArray(config.locales) ? config.locales : [];
  const normalized = [];
  const seen = new Set();
  for (const item of list) {
    const locale = normalizeLocale(item);
    if (!locale || seen.has(locale)) continue;
    seen.add(locale);
    normalized.push(locale);
  }
  return normalized;
}

export function validateI18n(config = getActiveI18n()) {
  const defaultLocale = normalizeLocale(config?.defaultLocale);
  const locales = getLocales(config);

  if (!defaultLocale) {
    const err = new Error('defaultLocale חסר או לא תקין');
    err.code = 'I18N_CONFIG';
    throw err;
  }
  if (!locales.length) {
    const err = new Error('locales ריק');
    err.code = 'I18N_CONFIG';
    throw err;
  }
  if (!locales.includes(defaultLocale)) {
    const err = new Error('defaultLocale חייב להופיע ב־locales');
    err.code = 'I18N_CONFIG';
    throw err;
  }
  for (const locale of locales) {
    if (!LOCALE_RE.test(locale)) {
      const err = new Error(`locale לא נתמך: ${locale}`);
      err.code = 'I18N_CONFIG';
      throw err;
    }
  }
  if (config?.enabled != null || config?.multilingual != null) {
    const err = new Error('enabled/multilingual הם ערכים נגזרים ואין להגדיר אותם ידנית');
    err.code = 'I18N_CONFIG';
    throw err;
  }

  return {
    defaultLocale,
    locales,
    urlStrategy: config.urlStrategy || 'default-root-with-prefixed-alternates',
    multilingual: locales.length > 1,
    enabled: locales.length > 1,
  };
}

/** Strict: returns locale only if enabled; otherwise null (no silent fallback). */
export function matchEnabledLocale(requested, config = getActiveI18n()) {
  const validated = validateI18n(config);
  const locale = normalizeLocale(requested);
  if (locale && validated.locales.includes(locale)) return locale;
  return null;
}

/** Soft resolve for Stage-0 callers that need a default. */
export function resolveLocale(requested, config = getActiveI18n()) {
  return matchEnabledLocale(requested, config) || getDefaultLocale(config);
}

export function localeDir(locale) {
  const normalized = normalizeLocale(locale) || getDefaultLocale();
  return normalized === 'he' || normalized.startsWith('he-') ? 'rtl' : 'ltr';
}

export function localeOg(locale) {
  const normalized = normalizeLocale(locale) || getDefaultLocale();
  if (normalized === 'he' || normalized.startsWith('he-')) return 'he_IL';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en_US';
  return normalized.replace('-', '_');
}

/**
 * Parse pathname into { locale, pagePath, redirectTo, invalidLocale }.
 * - /about/ → he, /about/
 * - /en/about/ → en, /about/
 * - /he/about/ → redirectTo /about/
 * - /xx/about/ when xx looks like locale but not enabled → invalidLocale
 */
export function parsePathLocale(pathname, config = I18N) {
  const validated = validateI18n(config);
  let path = pathname || '/';
  if (!path.startsWith('/')) path = `/${path}`;

  const segments = path.split('/').filter(Boolean);
  if (!segments.length) {
    return { locale: validated.defaultLocale, pagePath: '/', redirectTo: null, invalidLocale: false };
  }

  const maybeLocale = normalizeLocale(segments[0]);
  if (maybeLocale && validated.locales.includes(maybeLocale)) {
    if (maybeLocale === validated.defaultLocale) {
      const rest = segments.slice(1);
      const pagePath = rest.length ? `/${rest.join('/')}${path.endsWith('/') ? '/' : ''}` : '/';
      const normalizedPage = pagePath === '/' ? '/' : pagePath.endsWith('/') ? pagePath : `${pagePath}/`;
      return {
        locale: validated.defaultLocale,
        pagePath: normalizedPage,
        redirectTo: normalizedPage,
        invalidLocale: false,
      };
    }
    const rest = segments.slice(1);
    let pagePath = rest.length ? `/${rest.join('/')}` : '/';
    if (pagePath !== '/' && !pagePath.endsWith('/')) pagePath = `${pagePath}/`;
    if (path.endsWith('/') && pagePath !== '/' && !pagePath.endsWith('/')) pagePath = `${pagePath}/`;
    return { locale: maybeLocale, pagePath: pagePath === '//' ? '/' : pagePath, redirectTo: null, invalidLocale: false };
  }

  // Unknown locale-shaped prefix only when it looks like a site page (/xx/ or /xx/about/),
  // not app routes like /api/... or /admin/...
  const unknownLocale = normalizeLocale(segments[0]);
  if (
    unknownLocale &&
    !validated.locales.includes(unknownLocale) &&
    /^[a-z]{2,3}(?:-[a-zA-Z0-9]+)?$/i.test(segments[0])
  ) {
    const rest = segments.slice(1);
    const KNOWN_PAGE_SLUGS = new Set(['about', 'services', 'portfolio', 'faq']);
    if (rest.length === 0 || KNOWN_PAGE_SLUGS.has(rest[0])) {
      return { locale: null, pagePath: null, redirectTo: null, invalidLocale: true };
    }
  }

  return { locale: validated.defaultLocale, pagePath: path, redirectTo: null, invalidLocale: false };
}

/** Build public URL path for a logical pagePath in a locale. */
export function localizePath(pagePath, locale, config = I18N) {
  const validated = validateI18n(config);
  const loc = matchEnabledLocale(locale, config) || validated.defaultLocale;
  let path = pagePath || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path !== '/' && !path.endsWith('/')) path = `${path}/`;

  if (loc === validated.defaultLocale) return path;
  if (path === '/') return `/${loc}/`;
  return `/${loc}${path}`;
}

export function filterAllowedSearchParams(url) {
  const next = new URL(url.toString());
  for (const key of [...next.searchParams.keys()]) {
    if (!REDIRECT_QUERY_ALLOWLIST.has(key)) next.searchParams.delete(key);
  }
  return next;
}

/** Required site_content keys before a locale may be considered publishable. */
export const REQUIRED_CONTENT_KEYS = [
  'business_name',
  'hero_title',
  'seo_title',
  'seo_description',
];

export function isLocaleContentComplete(content) {
  const map = content || {};
  return REQUIRED_CONTENT_KEYS.every((key) => String(map[key] || '').trim().length > 0);
}

validateI18n(I18N);
