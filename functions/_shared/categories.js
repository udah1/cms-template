/** Default (he) admin checkbox list - Stage 0. */
export const PORTFOLIO_CATEGORIES = ['כללי', 'פרויקטים', 'גלריה', 'וידאו'];

const PORTFOLIO_CATEGORIES_BY_LOCALE = {
  he: PORTFOLIO_CATEGORIES,
  en: ['General', 'Projects', 'Gallery', 'Video'],
};

export function portfolioCategoriesForLocale(locale = 'he') {
  const key = String(locale || 'he').toLowerCase().split('-')[0];
  return PORTFOLIO_CATEGORIES_BY_LOCALE[key] || PORTFOLIO_CATEGORIES;
}

function defaultCategory(locale = 'he') {
  return portfolioCategoriesForLocale(locale)[0];
}

/**
 * Read categories from a DB row. Trusts stored translation values so a
 * second language is not forced back to Hebrew defaults.
 */
export function parseCategories(row, locale = 'he') {
  if (row?.categories) {
    try {
      const parsed = JSON.parse(row.categories);
      if (Array.isArray(parsed)) {
        const fromDb = [
          ...new Set(parsed.map((c) => String(c || '').trim()).filter(Boolean)),
        ];
        if (fromDb.length) return fromDb;
      }
    } catch {
      // fall through
    }
  }
  if (row?.category && String(row.category).trim()) {
    return [String(row.category).trim()];
  }
  return [defaultCategory(locale)];
}

export function normalizeCategories(input, locale = 'he') {
  const allowed = portfolioCategoriesForLocale(locale);
  const list = Array.isArray(input) ? input : input ? [input] : [];
  const cleaned = [...new Set(list.map(String).filter((c) => allowed.includes(c)))];
  return cleaned.length ? cleaned : [defaultCategory(locale)];
}

export function categoriesToDb(list, locale = 'he') {
  const normalized = normalizeCategories(list, locale);
  return {
    category: normalized[0],
    categories: JSON.stringify(normalized),
  };
}
