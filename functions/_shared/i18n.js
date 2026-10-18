/**
 * Locale-ready i18n config for the CMS Template.
 * Stage 0: single default locale. multilingual is derived from locales.length > 1.
 */

export const I18N = {
  defaultLocale: 'he',
  locales: ['he'],
  urlStrategy: 'default-root-with-prefixed-alternates',
};

/** BCP-47-ish: language lowercase, region uppercase (he, en, en-US). */
const LOCALE_RE = /^[a-z]{2,3}(?:-[A-Z][a-zA-Z]{1,7})?$/;

export function isMultilingual(config = I18N) {
  return (config.locales || []).length > 1;
}

/** Derived alias — never store as independent config. */
export function isEnabled(config = I18N) {
  return isMultilingual(config);
}

/**
 * Normalize to canonical form: language lowercase, region uppercase.
 * Invalid input returns null.
 */
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

export function getDefaultLocale(config = I18N) {
  return normalizeLocale(config.defaultLocale) || 'he';
}

export function getLocales(config = I18N) {
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

/**
 * Validate I18N config. Throws Error with .code = 'I18N_CONFIG' on failure.
 */
export function validateI18n(config = I18N) {
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

/** Resolve a requested locale; falls back to default when missing/invalid for Stage 0 callers. */
export function resolveLocale(requested, config = I18N) {
  const validated = validateI18n(config);
  const locale = normalizeLocale(requested);
  if (locale && validated.locales.includes(locale)) return locale;
  return validated.defaultLocale;
}

/** HTML dir for a locale (he* → rtl, else ltr). */
export function localeDir(locale) {
  const normalized = normalizeLocale(locale) || getDefaultLocale();
  return normalized === 'he' || normalized.startsWith('he-') ? 'rtl' : 'ltr';
}

// Fail fast if template config is broken.
validateI18n(I18N);
