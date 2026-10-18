export const PORTFOLIO_CATEGORIES = ['כללי', 'פרויקטים', 'גלריה', 'וידאו'];

export function parseCategories(row) {
  if (row?.categories) {
    try {
      const parsed = JSON.parse(row.categories);
      if (Array.isArray(parsed)) {
        const cleaned = [...new Set(parsed.filter((c) => PORTFOLIO_CATEGORIES.includes(c)))];
        if (cleaned.length) return cleaned;
      }
    } catch {
      // fall through
    }
  }
  if (row?.category && PORTFOLIO_CATEGORIES.includes(row.category)) {
    return [row.category];
  }
  return ['כללי'];
}

export function normalizeCategories(input) {
  const list = Array.isArray(input) ? input : input ? [input] : [];
  const cleaned = [...new Set(list.map(String).filter((c) => PORTFOLIO_CATEGORIES.includes(c)))];
  return cleaned.length ? cleaned : ['כללי'];
}

export function categoriesToDb(list) {
  const normalized = normalizeCategories(list);
  return {
    category: normalized[0],
    categories: JSON.stringify(normalized),
  };
}
