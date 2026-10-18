import {
  getAdminDraftPayload,
  getPublishedRow,
  restoreDraftFromPayload,
  snapshotFromDraft,
} from './content.js';
import { getDefaultLocale, resolveLocale } from './i18n.js';
import { buildSeoArtifacts } from './seo.js';
import { reconcileAfterDraftRestore, snapshotTranslatedDraft } from './translations.js';

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/[+/=]/g, '');
}

export async function ensurePublishState(db, locale = getDefaultLocale()) {
  const resolved = resolveLocale(locale);
  await db
    .prepare(
      `INSERT OR IGNORE INTO site_publish_state (locale, published_version_id, previous_version_id, publishing)
       VALUES (?, NULL, NULL, 0)`
    )
    .bind(resolved)
    .run();
  return resolved;
}

export async function ensurePublishedBaseline(db, siteOrigin, userId = null, locale = getDefaultLocale()) {
  const resolved = await ensurePublishState(db, locale);
  const state = await db
    .prepare('SELECT published_version_id FROM site_publish_state WHERE locale = ?')
    .bind(resolved)
    .first();
  if (state?.published_version_id) return state.published_version_id;

  const payload = await snapshotFromDraft(db, resolved);
  const seo = buildSeoArtifacts(payload, siteOrigin);
  const insert = await db
    .prepare(
      `INSERT INTO site_versions
        (locale, created_by, status, payload_json, sitemap_xml, json_ld, meta_json, error_message)
       VALUES (?, ?, 'published', ?, ?, ?, ?, '')`
    )
    .bind(
      resolved,
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
       WHERE locale = ?`
    )
    .bind(versionId, resolved)
    .run();
  return versionId;
}

async function claimPublishLock(db, locale) {
  const result = await db
    .prepare(
      `UPDATE site_publish_state
       SET publishing = 1, updated_at = datetime('now')
       WHERE locale = ? AND publishing = 0`
    )
    .bind(locale)
    .run();
  return (result.meta?.changes || 0) > 0;
}

async function releasePublishLock(db, locale) {
  await db
    .prepare(
      `UPDATE site_publish_state
       SET publishing = 0, updated_at = datetime('now')
       WHERE locale = ?`
    )
    .bind(locale)
    .run();
}

/**
 * @param {{ db: any, userId: number|null, siteOrigin: string, forceFail?: boolean, payloadOverride?: object, locale?: string, alreadyLocked?: boolean }} opts
 */
export async function publishFromDraft(opts) {
  const {
    db,
    userId,
    siteOrigin,
    forceFail = false,
    payloadOverride = null,
    locale = getDefaultLocale(),
    alreadyLocked = false,
  } = opts;
  const resolved = await ensurePublishState(db, locale);

  if (!alreadyLocked) {
    const locked = await claimPublishLock(db, resolved);
    if (!locked) {
      const err = new Error('פרסום כבר בתהליך');
      err.status = 409;
      throw err;
    }
  }

  let versionId = null;
  try {
    const state = await db
      .prepare('SELECT published_version_id, previous_version_id FROM site_publish_state WHERE locale = ?')
      .bind(resolved)
      .first();
    const currentId = state?.published_version_id || null;

    const payload = payloadOverride || (await snapshotFromDraft(db, resolved));
    if (!payload.locale) payload.locale = resolved;
    const seo = buildSeoArtifacts(payload, siteOrigin);

    const insert = await db
      .prepare(
        `INSERT INTO site_versions
          (locale, created_by, status, payload_json, sitemap_xml, json_ld, meta_json, error_message)
         VALUES (?, ?, 'publishing', ?, ?, ?, ?, '')`
      )
      .bind(
        resolved,
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
        .prepare(
          `UPDATE site_versions SET status = 'superseded' WHERE id = ? AND status = 'published' AND locale = ?`
        )
        .bind(currentId, resolved)
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
         WHERE locale = ?`
      )
      .bind(versionId, currentId, resolved)
      .run();

    return { versionId, previousVersionId: currentId, status: 'published', locale: resolved };
  } catch (err) {
    if (versionId) {
      await db
        .prepare(
          `UPDATE site_versions SET status = 'failed', error_message = ? WHERE id = ?`
        )
        .bind(String(err.message || 'שגיאה').slice(0, 500), versionId)
        .run();
    }
    await releasePublishLock(db, resolved);
    const out = new Error(err.message || 'פרסום נכשל');
    out.status = err.status || 500;
    out.versionId = versionId;
    throw out;
  }
}

export async function rollbackToPrevious(db, userId, siteOrigin, locale = getDefaultLocale()) {
  const resolved = await ensurePublishState(db, locale);

  // Claim the publish lock before mutating draft so a concurrent publish
  // cannot interleave between restore and publishFromDraft.
  const locked = await claimPublishLock(db, resolved);
  if (!locked) {
    const err = new Error('פרסום כבר בתהליך');
    err.status = 409;
    throw err;
  }

  try {
    const state = await db
      .prepare(
        'SELECT published_version_id, previous_version_id, publishing FROM site_publish_state WHERE locale = ?'
      )
      .bind(resolved)
      .first();
    if (!state?.previous_version_id) {
      const err = new Error('אין גרסה קודמת לשחזור');
      err.status = 400;
      throw err;
    }

    const prev = await db
      .prepare(`SELECT id, locale, payload_json, status FROM site_versions WHERE id = ?`)
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
    if (!payload.locale) payload.locale = prev.locale || resolved;

    const beforeSnapshot = await snapshotTranslatedDraft(db, resolved);

    // Restore draft workspace for this locale only (media URLs kept as-is).
    await restoreDraftFromPayload(db, payload);

    await reconcileAfterDraftRestore(db, {
      locale: resolved,
      beforeSnapshot,
      actorUserId: userId,
    });

    // Keep the same lock through publish so nothing interleaves after restore.
    return await publishFromDraft({
      db,
      userId,
      siteOrigin,
      payloadOverride: payload,
      locale: resolved,
      alreadyLocked: true,
    });
  } catch (err) {
    await releasePublishLock(db, resolved);
    throw err;
  }
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
    locale: payload?.locale || getDefaultLocale(),
    content: payload?.content || {},
    systemMessages: payload?.systemMessages || {},
    services: Array.isArray(payload?.services) ? payload.services : [],
    portfolio: Array.isArray(payload?.portfolio) ? payload.portfolio : [],
  };
  return JSON.stringify(stableSort(slice));
}

export async function getPublishStatus(db, locale = getDefaultLocale()) {
  const resolved = await ensurePublishState(db, locale);
  const state = await db
    .prepare(
      `SELECT locale, published_version_id, previous_version_id, publishing, updated_at
       FROM site_publish_state WHERE locale = ?`
    )
    .bind(resolved)
    .first();

  let published = null;
  let previous = null;
  let lastFailed = null;
  let publishedPayload = null;

  if (state?.published_version_id) {
    published = await db
      .prepare(
        `SELECT id, locale, created_at, status, error_message, payload_json FROM site_versions WHERE id = ?`
      )
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
      .prepare(`SELECT id, locale, created_at, status, error_message FROM site_versions WHERE id = ?`)
      .bind(state.previous_version_id)
      .first();
  }

  lastFailed = await db
    .prepare(
      `SELECT id, locale, created_at, status, error_message FROM site_versions
       WHERE status = 'failed' AND locale = ? ORDER BY id DESC LIMIT 1`
    )
    .bind(resolved)
    .first();

  let statusLabel = 'Published';
  if (state?.publishing) statusLabel = 'Publishing';
  else if (lastFailed && published && lastFailed.id > published.id) statusLabel = 'Failed';

  const draftPayload = await snapshotFromDraft(db, resolved);
  const hasUnpublishedChanges =
    !publishedPayload || fingerprintPayload(draftPayload) !== fingerprintPayload(publishedPayload);

  return {
    locale: resolved,
    publishing: !!state?.publishing,
    status: statusLabel,
    hasUnpublishedChanges,
    publishedVersion: published
      ? { id: published.id, createdAt: published.created_at, status: published.status, locale: published.locale }
      : null,
    previousVersion: previous
      ? { id: previous.id, createdAt: previous.created_at, status: previous.status, locale: previous.locale }
      : null,
    lastFailed: lastFailed
      ? {
          id: lastFailed.id,
          createdAt: lastFailed.created_at,
          error: lastFailed.error_message,
          locale: lastFailed.locale,
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

export async function getDraftPublicPayload(db, locale = getDefaultLocale()) {
  return snapshotFromDraft(db, locale);
}

export { getAdminDraftPayload, getPublishedRow };
