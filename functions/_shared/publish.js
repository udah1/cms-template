import {
  getAdminDraftPayload,
  getPublishedRow,
  restoreDraftFromPayload,
  snapshotFromDraft,
} from './content.js';
import { buildSeoArtifacts } from './seo.js';

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/[+/=]/g, '');
}

export async function ensurePublishState(db) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO site_publish_state (id, published_version_id, previous_version_id, publishing)
       VALUES (1, NULL, NULL, 0)`
    )
    .run();
}

export async function ensurePublishedBaseline(db, siteOrigin, userId = null) {
  await ensurePublishState(db);
  const state = await db
    .prepare('SELECT published_version_id FROM site_publish_state WHERE id = 1')
    .first();
  if (state?.published_version_id) return state.published_version_id;

  const payload = await snapshotFromDraft(db);
  const seo = buildSeoArtifacts(payload, siteOrigin);
  const insert = await db
    .prepare(
      `INSERT INTO site_versions
        (created_by, status, payload_json, sitemap_xml, json_ld, meta_json, error_message)
       VALUES (?, 'published', ?, ?, ?, ?, '')`
    )
    .bind(
      userId,
      JSON.stringify(payload),
      seo.sitemap_xml,
      seo.json_ld,
      seo.meta_json
    )
    .run();
  const versionId = insert.meta.last_row_id;
  await db
    .prepare(
      `UPDATE site_publish_state
       SET published_version_id = ?, previous_version_id = NULL, publishing = 0, updated_at = datetime('now')
       WHERE id = 1`
    )
    .bind(versionId)
    .run();
  return versionId;
}

async function claimPublishLock(db) {
  const result = await db
    .prepare(
      `UPDATE site_publish_state
       SET publishing = 1, updated_at = datetime('now')
       WHERE id = 1 AND publishing = 0`
    )
    .run();
  return (result.meta?.changes || 0) > 0;
}

async function releasePublishLock(db) {
  await db
    .prepare(
      `UPDATE site_publish_state
       SET publishing = 0, updated_at = datetime('now')
       WHERE id = 1`
    )
    .run();
}

/**
 * @param {{ db: any, userId: number|null, siteOrigin: string, forceFail?: boolean, payloadOverride?: object }} opts
 */
export async function publishFromDraft(opts) {
  const { db, userId, siteOrigin, forceFail = false, payloadOverride = null } = opts;
  await ensurePublishState(db);

  const locked = await claimPublishLock(db);
  if (!locked) {
    const err = new Error('פרסום כבר בתהליך');
    err.status = 409;
    throw err;
  }

  let versionId = null;
  try {
    const state = await db
      .prepare('SELECT published_version_id, previous_version_id FROM site_publish_state WHERE id = 1')
      .first();
    const currentId = state?.published_version_id || null;

    const payload = payloadOverride || (await snapshotFromDraft(db));
    const seo = buildSeoArtifacts(payload, siteOrigin);

    const insert = await db
      .prepare(
        `INSERT INTO site_versions
          (created_by, status, payload_json, sitemap_xml, json_ld, meta_json, error_message)
         VALUES (?, 'publishing', ?, ?, ?, ?, '')`
      )
      .bind(
        userId,
        JSON.stringify(payload),
        seo.sitemap_xml,
        seo.json_ld,
        seo.meta_json
      )
      .run();
    versionId = insert.meta.last_row_id;

    if (forceFail) {
      throw new Error('כשל פרסום מכוון (בדיקה)');
    }

    if (currentId) {
      await db
        .prepare(`UPDATE site_versions SET status = 'superseded' WHERE id = ? AND status = 'published'`)
        .bind(currentId)
        .run();
    }

    await db
      .prepare(`UPDATE site_versions SET status = 'published', error_message = '' WHERE id = ?`)
      .bind(versionId)
      .run();

    await db
      .prepare(
        `UPDATE site_publish_state
         SET published_version_id = ?,
             previous_version_id = ?,
             publishing = 0,
             updated_at = datetime('now')
         WHERE id = 1`
      )
      .bind(versionId, currentId)
      .run();

    return { versionId, previousVersionId: currentId, status: 'published' };
  } catch (err) {
    if (versionId) {
      await db
        .prepare(
          `UPDATE site_versions SET status = 'failed', error_message = ? WHERE id = ?`
        )
        .bind(String(err.message || 'שגיאה').slice(0, 500), versionId)
        .run();
    }
    await releasePublishLock(db);
    const out = new Error(err.message || 'פרסום נכשל');
    out.status = err.status || 500;
    out.versionId = versionId;
    throw out;
  }
}

export async function rollbackToPrevious(db, userId, siteOrigin) {
  await ensurePublishState(db);
  const state = await db
    .prepare('SELECT published_version_id, previous_version_id, publishing FROM site_publish_state WHERE id = 1')
    .first();
  if (state?.publishing) {
    const err = new Error('פרסום כבר בתהליך');
    err.status = 409;
    throw err;
  }
  if (!state?.previous_version_id) {
    const err = new Error('אין גרסה קודמת לשחזור');
    err.status = 400;
    throw err;
  }

  const prev = await db
    .prepare(`SELECT id, payload_json, status FROM site_versions WHERE id = ?`)
    .bind(state.previous_version_id)
    .first();
  if (!prev?.payload_json) {
    const err = new Error('הגרסה הקודמת לא נמצאה');
    err.status = 404;
    throw err;
  }

  let payload;
  try {
    payload = JSON.parse(prev.payload_json);
  } catch {
    const err = new Error('הגרסה הקודמת פגומה');
    err.status = 500;
    throw err;
  }

  // Restore draft workspace to match previous published content (media URLs kept as-is).
  await restoreDraftFromPayload(db, payload);
  return publishFromDraft({ db, userId, siteOrigin, payloadOverride: payload });
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = stableSort(value[key]);
    }
    return out;
  }
  return value;
}

function fingerprintPayload(payload) {
  const slice = {
    content: payload?.content || {},
    services: Array.isArray(payload?.services) ? payload.services : [],
    portfolio: Array.isArray(payload?.portfolio) ? payload.portfolio : [],
  };
  return JSON.stringify(stableSort(slice));
}

export async function getPublishStatus(db) {
  await ensurePublishState(db);
  const state = await db
    .prepare(
      `SELECT published_version_id, previous_version_id, publishing, updated_at
       FROM site_publish_state WHERE id = 1`
    )
    .first();

  let published = null;
  let previous = null;
  let lastFailed = null;
  let publishedPayload = null;

  if (state?.published_version_id) {
    published = await db
      .prepare(`SELECT id, created_at, status, error_message, payload_json FROM site_versions WHERE id = ?`)
      .bind(state.published_version_id)
      .first();
    if (published?.payload_json) {
      try {
        publishedPayload = JSON.parse(published.payload_json);
      } catch {
        publishedPayload = null;
      }
    }
  }
  if (state?.previous_version_id) {
    previous = await db
      .prepare(`SELECT id, created_at, status, error_message FROM site_versions WHERE id = ?`)
      .bind(state.previous_version_id)
      .first();
  }

  lastFailed = await db
    .prepare(
      `SELECT id, created_at, status, error_message FROM site_versions
       WHERE status = 'failed' ORDER BY id DESC LIMIT 1`
    )
    .first();

  let statusLabel = 'Published';
  if (state?.publishing) statusLabel = 'Publishing';
  else if (lastFailed && published && lastFailed.id > published.id) statusLabel = 'Failed';

  const draftPayload = await snapshotFromDraft(db);
  const hasUnpublishedChanges =
    !publishedPayload || fingerprintPayload(draftPayload) !== fingerprintPayload(publishedPayload);

  return {
    publishing: !!state?.publishing,
    status: statusLabel,
    hasUnpublishedChanges,
    publishedVersion: published
      ? { id: published.id, createdAt: published.created_at, status: published.status }
      : null,
    previousVersion: previous
      ? { id: previous.id, createdAt: previous.created_at, status: previous.status }
      : null,
    lastFailed: lastFailed
      ? {
          id: lastFailed.id,
          createdAt: lastFailed.created_at,
          error: lastFailed.error_message,
        }
      : null,
    updatedAt: state?.updated_at || null,
  };
}

export async function createPreviewToken(db, userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await db
    .prepare(`INSERT INTO preview_tokens (token, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(token, userId, expires)
    .run();
  return { token, expiresAt: expires };
}

export async function validatePreviewToken(db, token) {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT token, user_id, expires_at FROM preview_tokens WHERE token = ?`
    )
    .bind(String(token))
    .first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.prepare('DELETE FROM preview_tokens WHERE token = ?').bind(token).run();
    return null;
  }
  return row;
}

export async function getDraftPublicPayload(db) {
  return snapshotFromDraft(db);
}

export { getAdminDraftPayload, getPublishedRow };
