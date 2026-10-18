/**
 * Generic CMS audit log helpers.
 *
 * Write policy: best-effort. `logAudit` never throws to callers - a failed
 * audit write is logged to the console and must not roll back Draft/Publish.
 * Documented in README and PROJECT-BOOTSTRAP.md.
 */

const SENSITIVE_KEY_RE =
  /pass(word|wd)?|passwd|pwd|token|secret|credential|authorization|api[_-]?key|cookie|session|private[_-]?key|csrf/i;

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 25;

export async function logAudit(db, opts) {
  if (!db) return;
  const {
    actorUserId = null,
    action,
    entityType,
    entityId = null,
    summary,
    details = null,
    success = true,
  } = opts || {};

  if (!action || !entityType || !summary) return;

  let detailsJson = null;
  if (details != null) {
    try {
      const safe = redactSensitive(details);
      detailsJson = typeof safe === 'string' ? safe : JSON.stringify(safe);
    } catch {
      detailsJson = null;
    }
  }

  try {
    await db
      .prepare(
        `INSERT INTO audit_log
          (actor_user_id, action, entity_type, entity_id, summary, details_json, success)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        actorUserId == null ? null : Number(actorUserId),
        String(action),
        String(entityType),
        entityId == null || entityId === '' ? null : String(entityId),
        String(summary).slice(0, 500),
        detailsJson,
        success ? 1 : 0
      )
      .run();
  } catch (err) {
    console.error('audit_log write failed', err);
  }
}

/** Recursively redact sensitive keys from objects before store or API response. */
export function redactSensitive(value, depth = 0) {
  if (depth > 24) return '[truncated]';
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = '[redacted]';
      } else {
        out[key] = redactSensitive(child, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export function parseDetailsJson(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return redactSensitive(raw);
  try {
    return redactSensitive(JSON.parse(String(raw)));
  } catch {
    return null;
  }
}

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_LIST_LIMIT);
}

function normalizeFromBound(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
  return s.slice(0, 40);
}

function normalizeToBound(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 23:59:59`;
  return s.slice(0, 40);
}

/**
 * List audit rows newest-first with cursor pagination (cursor = last seen id).
 * @param {object} query - { limit, cursor, action, entityType, actorUserId, from, to }
 */
export async function listAuditLogs(db, query = {}) {
  const limit = clampLimit(query.limit);
  const where = [];
  const binds = [];

  const cursor = query.cursor != null && query.cursor !== '' ? Number(query.cursor) : null;
  if (cursor != null && Number.isFinite(cursor) && cursor > 0) {
    where.push('a.id < ?');
    binds.push(Math.trunc(cursor));
  }

  if (query.action) {
    where.push('a.action = ?');
    binds.push(String(query.action).slice(0, 120));
  }
  if (query.entityType) {
    where.push('a.entity_type = ?');
    binds.push(String(query.entityType).slice(0, 120));
  }
  if (query.actorUserId != null && query.actorUserId !== '') {
    const actorId = Number(query.actorUserId);
    if (!Number.isFinite(actorId)) {
      const err = new Error('actor_user_id לא תקין');
      err.status = 400;
      throw err;
    }
    where.push('a.actor_user_id = ?');
    binds.push(Math.trunc(actorId));
  }

  const from = normalizeFromBound(query.from);
  if (from) {
    where.push('a.created_at >= ?');
    binds.push(from);
  }
  const to = normalizeToBound(query.to);
  if (to) {
    where.push('a.created_at <= ?');
    binds.push(to);
  }

  const sql = `
    SELECT a.id, a.actor_user_id, a.action, a.entity_type, a.entity_id,
           a.summary, a.details_json, a.success, a.created_at,
           u.email AS actor_email
    FROM audit_log a
    LEFT JOIN admin_users u ON u.id = a.actor_user_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY a.id DESC
    LIMIT ?
  `;
  binds.push(limit + 1);

  const { results } = await db.prepare(sql).bind(...binds).all();
  const rows = results || [];
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const items = slice.map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id ?? null,
    actorEmail: row.actor_email || null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id ?? null,
    summary: row.summary,
    details: parseDetailsJson(row.details_json),
    success: !!row.success,
    createdAt: row.created_at,
  }));

  const nextCursor = hasMore && items.length ? items[items.length - 1].id : null;
  return { items, nextCursor, hasMore, limit };
}

/** Shallow field diffs: { field: { before, after } } for values that changed. */
export function diffFields(before, after, fields) {
  const out = {};
  if (!before || !after || !Array.isArray(fields)) return out;
  for (const field of fields) {
    const prev = normalizeAuditValue(before[field]);
    const next = normalizeAuditValue(after[field]);
    if (prev !== next) {
      out[field] = { before: before[field] ?? null, after: after[field] ?? null };
    }
  }
  return out;
}

export function diffContentMap(beforeMap, afterMap) {
  const out = {};
  const keys = new Set([
    ...Object.keys(beforeMap || {}),
    ...Object.keys(afterMap || {}),
  ]);
  for (const key of keys) {
    const prev = String((beforeMap || {})[key] ?? '');
    const next = String((afterMap || {})[key] ?? '');
    if (prev !== next) {
      out[key] = { before: prev, after: next };
    }
  }
  return out;
}

export function hasDiffs(diffs) {
  return diffs && Object.keys(diffs).length > 0;
}

function normalizeAuditValue(value) {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

const SERVICE_AUDIT_FIELDS = ['title', 'description', 'sort_order', 'visible'];

export function serviceRowForAudit(row) {
  if (!row) return null;
  return {
    title: String(row.title || ''),
    description: String(row.description || ''),
    sort_order: Number(row.sort_order || 0),
    visible: row.visible ? 1 : 0,
  };
}

export function diffService(beforeRow, afterInput) {
  const before = serviceRowForAudit(beforeRow);
  const after = serviceRowForAudit({
    title: afterInput.title,
    description: afterInput.description,
    sort_order: afterInput.sort_order,
    visible: afterInput.visible ? 1 : 0,
  });
  return diffFields(before, after, SERVICE_AUDIT_FIELDS);
}

const PORTFOLIO_AUDIT_FIELDS = [
  'title',
  'category',
  'categories',
  'media_type',
  'media_url',
  'cover_url',
  'alt_text',
  'sort_order',
  'visible',
  'featured',
];

export function portfolioRowForAudit(row) {
  if (!row) return null;
  return {
    title: String(row.title || ''),
    category: String(row.category || ''),
    categories: String(row.categories || '[]'),
    media_type: row.media_type === 'video' ? 'video' : 'image',
    media_url: String(row.media_url || ''),
    cover_url: String(row.cover_url || ''),
    alt_text: String(row.alt_text || ''),
    sort_order: Number(row.sort_order || 0),
    visible: row.visible ? 1 : 0,
    featured: row.featured ? 1 : 0,
  };
}

export function diffPortfolio(beforeRow, afterRow) {
  return diffFields(portfolioRowForAudit(beforeRow), portfolioRowForAudit(afterRow), PORTFOLIO_AUDIT_FIELDS);
}
