import { parseCategories, categoriesToDb } from './categories.js';

export async function getContentMap(db) {
  const { results } = await db.prepare('SELECT key, value FROM site_content').all();
  const map = {};
  for (const row of results || []) map[row.key] = row.value;
  return map;
}

export async function getServices(db, { visibleOnly = false } = {}) {
  const sql = visibleOnly
    ? 'SELECT * FROM services WHERE visible = 1 ORDER BY sort_order ASC, id ASC'
    : 'SELECT * FROM services ORDER BY sort_order ASC, id ASC';
  const { results } = await db.prepare(sql).all();
  return results || [];
}

export async function getPortfolio(db, { visibleOnly = false, featuredOnly = false } = {}) {
  const clauses = [];
  if (visibleOnly) clauses.push('visible = 1');
  if (featuredOnly) clauses.push('featured = 1');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { results } = await db
    .prepare(`SELECT * FROM portfolio_items ${where} ORDER BY sort_order ASC, id ASC`)
    .all();
  return (results || []).map((row) => {
    const categories = parseCategories(row);
    return { ...row, categories, category: categories[0] };
  });
}

export function publicPayload(content, services, portfolio) {
  return {
    content,
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
      categories: p.categories || parseCategories(p),
      media_type: p.media_type,
      media_url: p.media_url,
      cover_url: p.cover_url,
      alt_text: p.alt_text,
      featured: !!p.featured,
      sort_order: p.sort_order,
    })),
  };
}

export async function snapshotFromDraft(db) {
  const content = await getContentMap(db);
  const services = await getServices(db, { visibleOnly: true });
  const portfolio = await getPortfolio(db, { visibleOnly: true });
  return publicPayload(content, services, portfolio);
}

export async function getAdminDraftPayload(db) {
  const content = await getContentMap(db);
  const services = await getServices(db);
  const portfolio = await getPortfolio(db);
  return publicPayload(content, services, portfolio);
}

export async function getPublishedRow(db) {
  const state = await db
    .prepare(
      `SELECT published_version_id, previous_version_id, publishing, updated_at
       FROM site_publish_state WHERE id = 1`
    )
    .first();
  if (!state?.published_version_id) return null;
  const version = await db
    .prepare(
      `SELECT id, created_at, status, payload_json, sitemap_xml, json_ld, meta_json, error_message
       FROM site_versions WHERE id = ?`
    )
    .bind(state.published_version_id)
    .first();
  if (!version) return null;
  return { state, version };
}

export async function getPublishedPayload(db) {
  const row = await getPublishedRow(db);
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
      meta,
      jsonLd: row.version.json_ld || '',
      versionId: row.version.id,
      publishedAt: row.version.created_at,
    };
  } catch {
    return null;
  }
}

export async function restoreDraftFromPayload(db, payload) {
  const content = payload?.content || {};
  const services = Array.isArray(payload?.services) ? payload.services : [];
  const portfolio = Array.isArray(payload?.portfolio) ? payload.portfolio : [];

  await db.batch([
    db.prepare('DELETE FROM site_content'),
    db.prepare('DELETE FROM services'),
    db.prepare('DELETE FROM portfolio_items'),
  ]);

  const stmts = [];
  for (const [key, value] of Object.entries(content)) {
    stmts.push(
      db
        .prepare('INSERT INTO site_content (key, value) VALUES (?, ?)')
        .bind(String(key), String(value ?? ''))
    );
  }

  for (let i = 0; i < services.length; i++) {
    const s = services[i];
    stmts.push(
      db
        .prepare(
          `INSERT INTO services (id, title, description, sort_order, visible)
           VALUES (?, ?, ?, ?, 1)`
        )
        .bind(
          Number(s.id) || i + 1,
          String(s.title || ''),
          String(s.description || ''),
          Number(s.sort_order != null ? s.sort_order : i + 1)
        )
    );
  }

  for (let i = 0; i < portfolio.length; i++) {
    const p = portfolio[i];
    const { category, categories } = categoriesToDb(p.categories || p.category);
    const mediaType = p.media_type === 'video' ? 'video' : 'image';
    stmts.push(
      db
        .prepare(
          `INSERT INTO portfolio_items
            (id, title, category, categories, media_type, media_url, cover_url, alt_text, sort_order, visible, featured)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
        )
        .bind(
          Number(p.id) || i + 1,
          String(p.title || ''),
          category,
          categories,
          mediaType,
          String(p.media_url || ''),
          String(p.cover_url || ''),
          String(p.alt_text || ''),
          Number(p.sort_order != null ? p.sort_order : i + 1),
          p.featured ? 1 : 0
        )
    );
  }

  if (stmts.length) await db.batch(stmts);
}
