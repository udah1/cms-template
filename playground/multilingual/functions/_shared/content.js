import { parseCategories, categoriesToDb } from './categories.js';
import { getDefaultLocale, resolveLocale } from './i18n.js';

export async function getContentMap(db, locale = getDefaultLocale()) {
  const resolved = resolveLocale(locale);
  const { results } = await db
    .prepare('SELECT key, value FROM site_content WHERE locale = ?')
    .bind(resolved)
    .all();
  const map = {};
  for (const row of results || []) map[row.key] = row.value;
  return map;
}

export async function getSystemMessages(db, locale = getDefaultLocale()) {
  const resolved = resolveLocale(locale);
  const { results } = await db
    .prepare('SELECT key, value FROM system_messages WHERE locale = ?')
    .bind(resolved)
    .all();
  const map = {};
  for (const row of results || []) map[row.key] = row.value;
  return map;
}

export async function getServices(db, { visibleOnly = false, locale = getDefaultLocale() } = {}) {
  const resolved = resolveLocale(locale);
  const clauses = ['t.locale = ?'];
  if (visibleOnly) clauses.push('s.visible = 1');
  const sql = `
    SELECT s.id, s.sort_order, s.visible, t.title, t.description, t.locale
    FROM services s
    INNER JOIN service_translations t ON t.service_id = s.id
    WHERE ${clauses.join(' AND ')}
    ORDER BY s.sort_order ASC, s.id ASC
  `;
  const { results } = await db.prepare(sql).bind(resolved).all();
  return results || [];
}

export async function getPortfolio(
  db,
  { visibleOnly = false, featuredOnly = false, locale = getDefaultLocale() } = {}
) {
  const resolved = resolveLocale(locale);
  const clauses = ['t.locale = ?'];
  if (visibleOnly) clauses.push('p.visible = 1');
  if (featuredOnly) clauses.push('p.featured = 1');
  const sql = `
    SELECT
      p.id, p.media_type, p.media_url, p.cover_url, p.sort_order, p.visible, p.featured, p.created_at,
      t.title, t.category, t.categories, t.alt_text, t.locale
    FROM portfolio_items p
    INNER JOIN portfolio_item_translations t ON t.portfolio_item_id = p.id
    WHERE ${clauses.join(' AND ')}
    ORDER BY p.sort_order ASC, p.id ASC
  `;
  const { results } = await db.prepare(sql).bind(resolved).all();
  return (results || []).map((row) => {
    const categories = parseCategories(row, resolved);
    return { ...row, categories, category: categories[0] };
  });
}

export function publicPayload(content, services, portfolio, { locale = getDefaultLocale(), systemMessages = {} } = {}) {
  const resolved = resolveLocale(locale);
  return {
    locale: resolved,
    content,
    systemMessages,
    services: services.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      sort_order: s.sort_order,
    })),
    portfolio: portfolio.map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      categories: p.categories || parseCategories(p, resolved),
      media_type: p.media_type,
      media_url: p.media_url,
      cover_url: p.cover_url,
      alt_text: p.alt_text,
      featured: !!p.featured,
      sort_order: p.sort_order,
    })),
  };
}

export async function snapshotFromDraft(db, locale = getDefaultLocale()) {
  const resolved = resolveLocale(locale);
  const content = await getContentMap(db, resolved);
  const systemMessages = await getSystemMessages(db, resolved);
  const services = await getServices(db, { visibleOnly: true, locale: resolved });
  const portfolio = await getPortfolio(db, { visibleOnly: true, locale: resolved });
  return publicPayload(content, services, portfolio, { locale: resolved, systemMessages });
}

export async function getAdminDraftPayload(db, locale = getDefaultLocale()) {
  const resolved = resolveLocale(locale);
  const content = await getContentMap(db, resolved);
  const systemMessages = await getSystemMessages(db, resolved);
  const services = await getServices(db, { locale: resolved });
  const portfolio = await getPortfolio(db, { locale: resolved });
  return publicPayload(content, services, portfolio, { locale: resolved, systemMessages });
}

export async function getPublishedRow(db, locale = getDefaultLocale()) {
  const resolved = resolveLocale(locale);
  const state = await db
    .prepare(
      `SELECT locale, published_version_id, previous_version_id, publishing, updated_at
       FROM site_publish_state WHERE locale = ?`
    )
    .bind(resolved)
    .first();
  if (!state?.published_version_id) return null;
  const version = await db
    .prepare(
      `SELECT id, locale, created_at, status, payload_json, sitemap_xml, json_ld, meta_json, error_message
       FROM site_versions WHERE id = ?`
    )
    .bind(state.published_version_id)
    .first();
  if (!version) return null;
  return { state, version };
}

export async function getPublishedPayload(db, locale = getDefaultLocale()) {
  const resolved = resolveLocale(locale);
  const row = await getPublishedRow(db, resolved);
  if (!row) return null;
  try {
    const payload = JSON.parse(row.version.payload_json || '{}');
    let meta = {};
    try {
      meta = JSON.parse(row.version.meta_json || '{}');
    } catch {
      meta = {};
    }
    return {
      ...payload,
      locale: payload.locale || row.version.locale || resolved,
      meta,
      jsonLd: row.version.json_ld || '',
      versionId: row.version.id,
      publishedAt: row.version.created_at,
    };
  } catch {
    return null;
  }
}

/**
 * Restore draft tables for one locale from a published/draft payload.
 * Stage 0: only defaultLocale exists; still scoped by locale for future multilingual.
 */
export async function restoreDraftFromPayload(db, payload) {
  const locale = resolveLocale(payload?.locale);
  const content = payload?.content || {};
  const systemMessages = payload?.systemMessages || {};
  const services = Array.isArray(payload?.services) ? payload.services : [];
  const portfolio = Array.isArray(payload?.portfolio) ? payload.portfolio : [];

  await db.batch([
    db.prepare('DELETE FROM site_content WHERE locale = ?').bind(locale),
    db.prepare('DELETE FROM system_messages WHERE locale = ?').bind(locale),
    db.prepare('DELETE FROM service_translations WHERE locale = ?').bind(locale),
    db.prepare('DELETE FROM portfolio_item_translations WHERE locale = ?').bind(locale),
  ]);

  // Drop base rows that no longer have any translation (other locales keep their bases).
  await db
    .prepare(
      `DELETE FROM services WHERE id NOT IN (SELECT service_id FROM service_translations)`
    )
    .run();
  await db
    .prepare(
      `DELETE FROM portfolio_items WHERE id NOT IN (SELECT portfolio_item_id FROM portfolio_item_translations)`
    )
    .run();

  const stmts = [];
  for (const [key, value] of Object.entries(content)) {
    stmts.push(
      db
        .prepare('INSERT INTO site_content (key, locale, value) VALUES (?, ?, ?)')
        .bind(String(key), locale, String(value ?? ''))
    );
  }
  for (const [key, value] of Object.entries(systemMessages)) {
    stmts.push(
      db
        .prepare('INSERT INTO system_messages (key, locale, value) VALUES (?, ?, ?)')
        .bind(String(key), locale, String(value ?? ''))
    );
  }

  for (let i = 0; i < services.length; i++) {
    const s = services[i];
    const id = Number(s.id) || i + 1;
    const sortOrder = Number(s.sort_order != null ? s.sort_order : i + 1);
    stmts.push(
      db
        .prepare(
          `INSERT INTO services (id, sort_order, visible)
           VALUES (?, ?, 1)
           ON CONFLICT(id) DO UPDATE SET sort_order = excluded.sort_order, visible = 1`
        )
        .bind(id, sortOrder)
    );
    stmts.push(
      db
        .prepare(
          `INSERT INTO service_translations (service_id, locale, title, description)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(service_id, locale) DO UPDATE SET
             title = excluded.title, description = excluded.description`
        )
        .bind(id, locale, String(s.title || ''), String(s.description || ''))
    );
  }

  for (let i = 0; i < portfolio.length; i++) {
    const p = portfolio[i];
    const id = Number(p.id) || i + 1;
    const { category, categories } = categoriesToDb(p.categories || p.category, locale);
    const mediaType = p.media_type === 'video' ? 'video' : 'image';
    const sortOrder = Number(p.sort_order != null ? p.sort_order : i + 1);
    stmts.push(
      db
        .prepare(
          `INSERT INTO portfolio_items
            (id, media_type, media_url, cover_url, sort_order, visible, featured)
           VALUES (?, ?, ?, ?, ?, 1, ?)
           ON CONFLICT(id) DO UPDATE SET
             media_type = excluded.media_type,
             media_url = excluded.media_url,
             cover_url = excluded.cover_url,
             sort_order = excluded.sort_order,
             visible = 1,
             featured = excluded.featured`
        )
        .bind(
          id,
          mediaType,
          String(p.media_url || ''),
          String(p.cover_url || ''),
          sortOrder,
          p.featured ? 1 : 0
        )
    );
    stmts.push(
      db
        .prepare(
          `INSERT INTO portfolio_item_translations
            (portfolio_item_id, locale, title, category, categories, alt_text)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(portfolio_item_id, locale) DO UPDATE SET
             title = excluded.title,
             category = excluded.category,
             categories = excluded.categories,
             alt_text = excluded.alt_text`
        )
        .bind(id, locale, String(p.title || ''), category, categories, String(p.alt_text || ''))
    );
  }

  if (stmts.length) await db.batch(stmts);
}
