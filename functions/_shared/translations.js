/**
 * Translation freshness tracking.
 * Publication (draft/published) stays in site_publish_state - not stored here.
 *
 * system_message: tracked like other entities when rows exist in system_messages.
 * Admin UI for editing system_messages is not part of v1 - chrome strings stay in
 * public/admin/ui-i18n.js. When CMS editors are added, wire them through the same
 * assertExpectedSourceRevision → write → bump/mark helpers.
 */
import { getContentMap, getPortfolio, getPublishedPayload, getServices, getSystemMessages } from './content.js';
import { getDefaultLocale, getLocales, isMultilingual, matchEnabledLocale, resolveLocale } from './i18n.js';

export const ENTITY_TYPES = Object.freeze([
  'site_content',
  'system_message',
  'service',
  'portfolio_item',
]);

/** Translated fields per entity type (source bump / freshness). */
export const TRANSLATED_FIELDS = Object.freeze({
  site_content: ['value'],
  system_message: ['value'],
  service: ['title', 'description'],
  portfolio_item: ['title', 'category', 'categories', 'alt_text'],
});

/** Base / shared fields that must NOT bump source revision. */
export const NON_TRANSLATED_FIELDS = Object.freeze({
  service: ['sort_order', 'visible'],
  portfolio_item: ['media_type', 'media_url', 'cover_url', 'external_url', 'sort_order', 'visible', 'featured'],
});

export function isValidEntityType(value) {
  return ENTITY_TYPES.includes(String(value || ''));
}

function normId(entityId) {
  return String(entityId ?? '');
}

function fieldValuesEqual(a, b) {
  return String(a ?? '') === String(b ?? '');
}

/** True when any translated field differs between before/after objects. */
export function hasTranslatedDiff(entityType, before, after) {
  const fields = TRANSLATED_FIELDS[entityType];
  if (!fields || !after) return false;
  for (const field of fields) {
    const prev = before ? before[field] : undefined;
    if (!fieldValuesEqual(prev, after[field])) return true;
  }
  return false;
}

export function computeDisplayStatus({
  freshnessStatus,
  reviewStatus,
  isDraft = false,
  isPublished = false,
}) {
  if (freshnessStatus === 'missing') return 'missing';
  if (freshnessStatus === 'outdated' && reviewStatus === 'acknowledged') return 'acknowledged';
  if (freshnessStatus === 'outdated') return 'outdated';
  if (isDraft) return 'draft';
  if (isPublished) return 'published';
  return 'current';
}

export async function getSourceRevision(db, entityType, entityId, sourceLocale = getDefaultLocale()) {
  const row = await db
    .prepare(
      `SELECT revision FROM translation_source_revisions
       WHERE entity_type = ? AND entity_id = ? AND source_locale = ?`
    )
    .bind(entityType, normId(entityId), sourceLocale)
    .first();
  return row ? Number(row.revision) : null;
}

/** One query for all revisions of an entity type (admin list/load hot path). */
export async function getSourceRevisionsMap(db, entityType, sourceLocale = getDefaultLocale()) {
  const { results } = await db
    .prepare(
      `SELECT entity_id, revision FROM translation_source_revisions
       WHERE entity_type = ? AND source_locale = ?`
    )
    .bind(entityType, sourceLocale)
    .all();
  const map = {};
  for (const row of results || []) {
    map[String(row.entity_id)] = Number(row.revision) || 1;
  }
  return map;
}

async function ensureSourceRevisionRow(db, entityType, entityId, sourceLocale, initial = 1) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO translation_source_revisions
        (entity_type, entity_id, source_locale, revision, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    )
    .bind(entityType, normId(entityId), sourceLocale, initial)
    .run();
}

/**
 * Ensure status rows exist for an entity across all enabled locales.
 * missing rows are explicit (never inferred from absence).
 */
export async function ensureTranslationStatusRows(db, entityType, entityId, opts = {}) {
  if (!isValidEntityType(entityType)) return;
  const id = normId(entityId);
  if (!id) return;

  const sourceLocale = getDefaultLocale();
  const locales = getLocales();
  await ensureSourceRevisionRow(db, entityType, id, sourceLocale, opts.initialRevision || 1);
  const revision = (await getSourceRevision(db, entityType, id, sourceLocale)) || 1;

  const hasTranslation = opts.hasTranslation || {};

  for (const locale of locales) {
    const existing = await db
      .prepare(
        `SELECT freshness_status FROM translation_status
         WHERE entity_type = ? AND entity_id = ? AND locale = ?`
      )
      .bind(entityType, id, locale)
      .first();
    if (existing) continue;

    let freshness = 'missing';
    let translatedFrom = 0;
    if (hasTranslation[locale]) {
      freshness = locale === sourceLocale || opts.markCurrent ? 'current' : 'current';
      translatedFrom = revision;
    } else if (locale === sourceLocale && opts.sourceHasContent) {
      freshness = 'current';
      translatedFrom = revision;
    }

    await db
      .prepare(
        `INSERT INTO translation_status (
           entity_type, entity_id, locale, freshness_status, review_status,
           source_revision, translated_from_revision, updated_at
         ) VALUES (?, ?, ?, ?, 'normal', ?, ?, datetime('now'))`
      )
      .bind(entityType, id, locale, freshness, revision, translatedFrom)
      .run();
  }
}

/**
 * Backfill / sync status rows for all known entities and enabled locales.
 * Uses bulk SELECTs (not per-key N+1). Skip entirely when every entity already
 * has a row for every enabled locale - safe for the translations panel only.
 * Do NOT call this from admin content/portfolio GET hot paths.
 */
export async function ensureAllTranslationStatusRows(db) {
  const sourceLocale = getDefaultLocale();
  const locales = getLocales();
  const localeCount = locales.length;

  const contentKeys = await db
    .prepare('SELECT DISTINCT key FROM site_content')
    .all()
    .then((r) => (r.results || []).map((row) => String(row.key)));
  const msgKeys = await db
    .prepare('SELECT DISTINCT key FROM system_messages')
    .all()
    .then((r) => (r.results || []).map((row) => String(row.key)));
  const serviceIds = await db
    .prepare('SELECT id FROM services')
    .all()
    .then((r) => (r.results || []).map((row) => String(row.id)));
  const portfolioIds = await db
    .prepare('SELECT id FROM portfolio_items')
    .all()
    .then((r) => (r.results || []).map((row) => String(row.id)));

  const expectedEntities =
    contentKeys.length + msgKeys.length + serviceIds.length + portfolioIds.length;
  if (expectedEntities === 0) return;

  const statusCount =
    Number(
      (
        await db.prepare('SELECT COUNT(*) AS c FROM translation_status').first()
      )?.c || 0
    ) || 0;
  if (statusCount >= expectedEntities * localeCount) return;

  const contentPresent = await db
    .prepare('SELECT key, locale FROM site_content')
    .all()
    .then((r) => r.results || []);
  const contentByKey = {};
  for (const row of contentPresent) {
    const k = String(row.key);
    if (!contentByKey[k]) contentByKey[k] = {};
    contentByKey[k][row.locale] = true;
  }
  for (const key of contentKeys) {
    const present = contentByKey[key] || {};
    await ensureTranslationStatusRows(db, 'site_content', key, {
      hasTranslation: present,
      sourceHasContent: !!present[sourceLocale],
    });
  }

  const msgPresent = await db
    .prepare('SELECT key, locale FROM system_messages')
    .all()
    .then((r) => r.results || []);
  const msgByKey = {};
  for (const row of msgPresent) {
    const k = String(row.key);
    if (!msgByKey[k]) msgByKey[k] = {};
    msgByKey[k][row.locale] = true;
  }
  for (const key of msgKeys) {
    const present = msgByKey[key] || {};
    await ensureTranslationStatusRows(db, 'system_message', key, {
      hasTranslation: present,
      sourceHasContent: !!present[sourceLocale],
    });
  }

  const servicePresent = await db
    .prepare('SELECT service_id, locale FROM service_translations')
    .all()
    .then((r) => r.results || []);
  const serviceById = {};
  for (const row of servicePresent) {
    const id = String(row.service_id);
    if (!serviceById[id]) serviceById[id] = {};
    serviceById[id][row.locale] = true;
  }
  for (const sid of serviceIds) {
    const present = serviceById[sid] || {};
    await ensureTranslationStatusRows(db, 'service', sid, {
      hasTranslation: present,
      sourceHasContent: !!present[sourceLocale],
    });
  }

  const portfolioPresent = await db
    .prepare('SELECT portfolio_item_id, locale FROM portfolio_item_translations')
    .all()
    .then((r) => r.results || []);
  const portfolioById = {};
  for (const row of portfolioPresent) {
    const id = String(row.portfolio_item_id);
    if (!portfolioById[id]) portfolioById[id] = {};
    portfolioById[id][row.locale] = true;
  }
  for (const pid of portfolioIds) {
    const present = portfolioById[pid] || {};
    await ensureTranslationStatusRows(db, 'portfolio_item', pid, {
      hasTranslation: present,
      sourceHasContent: !!present[sourceLocale],
    });
  }
}

/**
 * Fail closed if the client's expected source revision does not match DB.
 * Call BEFORE mutating draft content. Returns the current revision.
 */
export async function assertExpectedSourceRevision(db, entityType, entityId, expectedRevision) {
  const sourceLocale = getDefaultLocale();
  const id = normId(entityId);
  await ensureSourceRevisionRow(db, entityType, id, sourceLocale, 1);
  const current = (await getSourceRevision(db, entityType, id, sourceLocale)) || 1;
  if (expectedRevision == null || expectedRevision === '') return current;
  const expected = Number(expectedRevision);
  if (!Number.isFinite(expected) || expected !== current) {
    const err = new Error('המקור השתנה במקביל; רעננו ושמרו שוב');
    err.status = 409;
    err.code = 'SOURCE_REVISION_CONFLICT';
    err.currentRevision = current;
    err.expectedRevision = expected;
    throw err;
  }
  return current;
}

/**
 * Mark non-source locales outdated for a new source revision.
 * Uses set-based UPDATEs (batch-friendly). No audit - bookkeeping only;
 * the source content mutation is already logged (e.g. content.update).
 */
export async function markTranslationsOutdated(db, entityType, entityId, newRevision, _actorUserId = null) {
  const sourceLocale = getDefaultLocale();
  const id = normId(entityId);

  const { results: beforeRows } = await db
    .prepare(
      `SELECT locale
       FROM translation_status
       WHERE entity_type = ? AND entity_id = ? AND locale != ?
         AND freshness_status != 'missing'
         AND translated_from_revision < ?`
    )
    .bind(entityType, id, sourceLocale, newRevision)
    .all();

  // Atomic status fan-out for this entity (D1 batch = single transaction).
  await db.batch([
    db
      .prepare(
        `UPDATE translation_status
         SET source_revision = ?, updated_at = datetime('now')
         WHERE entity_type = ? AND entity_id = ? AND locale != ?
           AND freshness_status = 'missing'`
      )
      .bind(newRevision, entityType, id, sourceLocale),
    db
      .prepare(
        `UPDATE translation_status
         SET freshness_status = 'outdated',
             review_status = 'normal',
             source_revision = ?,
             acknowledged_at = NULL,
             acknowledged_by = NULL,
             updated_at = datetime('now')
         WHERE entity_type = ? AND entity_id = ? AND locale != ?
           AND freshness_status != 'missing'
           AND translated_from_revision < ?`
      )
      .bind(newRevision, entityType, id, sourceLocale, newRevision),
    db
      .prepare(
        `UPDATE translation_status
         SET source_revision = ?, updated_at = datetime('now')
         WHERE entity_type = ? AND entity_id = ? AND locale = ?`
      )
      .bind(newRevision, entityType, id, sourceLocale),
  ]);

  return (beforeRows || []).map((row) => row.locale);
}

/**
 * Align status rows to the actual source revision (idempotent reconciliation).
 */
export async function reconcileEntityStatuses(db, entityType, entityId, actorUserId = null) {
  const sourceLocale = getDefaultLocale();
  const id = normId(entityId);
  const revision = (await getSourceRevision(db, entityType, id, sourceLocale)) || 1;
  await ensureTranslationStatusRows(db, entityType, id, {
    sourceHasContent: true,
    hasTranslation: { [sourceLocale]: true },
  });

  await db.batch(buildStatusAlignStatements(db, entityType, id, sourceLocale, revision));
  return { revision, actorUserId };
}

/** Status fan-out statements aligned to an already-committed source revision. */
function buildStatusAlignStatements(db, entityType, id, sourceLocale, revision) {
  return [
    db
      .prepare(
        `UPDATE translation_status
         SET source_revision = ?, updated_at = datetime('now')
         WHERE entity_type = ? AND entity_id = ? AND locale != ?
           AND freshness_status = 'missing'`
      )
      .bind(revision, entityType, id, sourceLocale),
    db
      .prepare(
        `UPDATE translation_status
         SET freshness_status = 'outdated',
             review_status = 'normal',
             source_revision = ?,
             acknowledged_at = NULL,
             acknowledged_by = NULL,
             updated_at = datetime('now')
         WHERE entity_type = ? AND entity_id = ? AND locale != ?
           AND freshness_status != 'missing'
           AND translated_from_revision < ?`
      )
      .bind(revision, entityType, id, sourceLocale, revision),
    db
      .prepare(
        `UPDATE translation_status
         SET freshness_status = 'current',
             review_status = 'normal',
             source_revision = ?,
             translated_from_revision = ?,
             acknowledged_at = NULL,
             acknowledged_by = NULL,
             updated_at = datetime('now')
         WHERE entity_type = ? AND entity_id = ? AND locale = ?`
      )
      .bind(revision, revision, entityType, id, sourceLocale),
  ];
}

/**
 * CAS bump + status fan-out as prepared statements for one D1 batch.
 * Status UPDATEs are gated on EXISTS (revision = newRevision) so a lost CAS
 * cannot mutate statuses. Include these in the same batch as draft content writes.
 */
export function buildCasBumpStatements(db, { entityType, entityId, expectedRevision, sourceLocale }) {
  const id = normId(entityId);
  const expected = Number(expectedRevision);
  const newRevision = expected + 1;
  const locale = sourceLocale || getDefaultLocale();
  const revExists = `EXISTS (
    SELECT 1 FROM translation_source_revisions r
    WHERE r.entity_type = ? AND r.entity_id = ? AND r.source_locale = ? AND r.revision = ?
  )`;

  return {
    newRevision,
    statements: [
      db
        .prepare(
          `UPDATE translation_source_revisions
           SET revision = revision + 1, updated_at = datetime('now')
           WHERE entity_type = ? AND entity_id = ? AND source_locale = ? AND revision = ?`
        )
        .bind(entityType, id, locale, expected),
      db
        .prepare(
          `UPDATE translation_status
           SET source_revision = ?, updated_at = datetime('now')
           WHERE entity_type = ? AND entity_id = ? AND locale != ?
             AND freshness_status = 'missing'
             AND ${revExists}`
        )
        .bind(newRevision, entityType, id, locale, entityType, id, locale, newRevision),
      db
        .prepare(
          `UPDATE translation_status
           SET freshness_status = 'outdated',
               review_status = 'normal',
               source_revision = ?,
               acknowledged_at = NULL,
               acknowledged_by = NULL,
               updated_at = datetime('now')
           WHERE entity_type = ? AND entity_id = ? AND locale != ?
             AND freshness_status != 'missing'
             AND translated_from_revision < ?
             AND ${revExists}`
        )
        .bind(newRevision, entityType, id, locale, newRevision, entityType, id, locale, newRevision),
      db
        .prepare(
          `UPDATE translation_status
           SET freshness_status = 'current',
               review_status = 'normal',
               source_revision = ?,
               translated_from_revision = ?,
               acknowledged_at = NULL,
               acknowledged_by = NULL,
               updated_at = datetime('now')
           WHERE entity_type = ? AND entity_id = ? AND locale = ?
             AND ${revExists}`
        )
        .bind(newRevision, newRevision, entityType, id, locale, entityType, id, locale, newRevision),
    ],
  };
}

/**
 * Compare-and-set bump of source revision. Never decreases.
 * CAS UPDATE and status fan-out run in the same D1 batch (not sequential).
 * Freshness fan-out is not audited - source content mutations already are.
 * @returns {{ revision: number, markedLocales: string[], bumped: boolean }}
 */
export async function bumpSourceRevision(db, opts) {
  const {
    entityType,
    entityId,
    expectedRevision = null,
    actorUserId = null,
  } = opts || {};
  if (!isValidEntityType(entityType)) {
    const err = new Error('entity_type לא תקין');
    err.status = 400;
    throw err;
  }
  const sourceLocale = getDefaultLocale();
  const id = normId(entityId);
  const expected = await assertExpectedSourceRevision(db, entityType, id, expectedRevision);
  const newRevision = expected + 1;

  const { results: beforeRows } = await db
    .prepare(
      `SELECT locale
       FROM translation_status
       WHERE entity_type = ? AND entity_id = ? AND locale != ?
         AND freshness_status != 'missing'
         AND translated_from_revision < ?`
    )
    .bind(entityType, id, sourceLocale, newRevision)
    .all();

  const { statements } = buildCasBumpStatements(db, {
    entityType,
    entityId: id,
    expectedRevision: expected,
    sourceLocale,
  });
  await db.batch(statements);

  const actual = await getSourceRevision(db, entityType, id, sourceLocale);
  if (Number(actual) !== newRevision) {
    await reconcileEntityStatuses(db, entityType, id, actorUserId);
    const err = new Error('המקור השתנה במקביל; רעננו ושמרו שוב');
    err.status = 409;
    err.code = 'SOURCE_REVISION_CONFLICT';
    err.currentRevision = actual;
    throw err;
  }

  await reconcileEntityStatuses(db, entityType, id, actorUserId);

  return {
    revision: newRevision,
    markedLocales: (beforeRows || []).map((r) => r.locale),
    bumped: true,
  };
}

/**
 * Optimistic locking for source draft saves (not last-write-wins).
 *
 * Order: CAS bump + status fan-out first; only then persist draft content.
 * Stale expectedSourceRevision → 409 before any content write, so a concurrent
 * newer save is never overwritten by an older client payload.
 *
 * writeStatements: content/service/portfolio SQL statements.
 * sourceBumps: [{ entityType, entityId, expectedRevision, before, after }]
 */
export async function commitDraftWritesWithSourceBumps(db, opts) {
  const {
    writeStatements = [],
    sourceBumps = [],
    actorUserId = null,
  } = opts || {};

  const bumpMeta = [];
  const bumpStatements = [];

  for (const bump of sourceBumps) {
    if (!hasTranslatedDiff(bump.entityType, bump.before, bump.after)) continue;
    const sourceLocale = getDefaultLocale();
    const id = normId(bump.entityId);
    await ensureTranslationStatusRows(db, bump.entityType, id, {
      hasTranslation: { [sourceLocale]: true },
      sourceHasContent: true,
    });
    const expected = await assertExpectedSourceRevision(
      db,
      bump.entityType,
      id,
      bump.expectedRevision
    );
    const built = buildCasBumpStatements(db, {
      entityType: bump.entityType,
      entityId: id,
      expectedRevision: expected,
      sourceLocale,
    });
    bumpMeta.push({
      entityType: bump.entityType,
      entityId: id,
      expected,
      newRevision: built.newRevision,
      sourceLocale,
    });
    bumpStatements.push(...built.statements);
  }

  // 1) Win CAS (and fan-out statuses) before touching draft content.
  if (bumpStatements.length) {
    await db.batch(bumpStatements);
    for (const meta of bumpMeta) {
      const actual = await getSourceRevision(
        db,
        meta.entityType,
        meta.entityId,
        meta.sourceLocale
      );
      if (Number(actual) !== meta.newRevision) {
        await reconcileEntityStatuses(db, meta.entityType, meta.entityId, actorUserId);
        const err = new Error('המקור השתנה במקביל; רעננו ושמרו שוב');
        err.status = 409;
        err.code = 'SOURCE_REVISION_CONFLICT';
        err.currentRevision = actual;
        throw err;
      }
      await reconcileEntityStatuses(db, meta.entityType, meta.entityId, actorUserId);
    }
  }

  // 2) Persist draft only after CAS succeeded (or when no source bump needed).
  if (writeStatements.length) await db.batch(writeStatements);

  return {
    results: bumpMeta.map((meta) => ({
      entityType: meta.entityType,
      entityId: meta.entityId,
      revision: meta.newRevision,
      bumped: true,
      forced: false,
    })),
  };
}

/**
 * Mark translation current only if source revision still matches (CAS).
 * Call only AFTER draft content for that locale was written, or after preflight.
 * Stale expected → 409; does not force current.
 */
export async function markTranslationCurrent(db, opts) {
  const {
    entityType,
    entityId,
    locale,
    expectedSourceRevision,
  } = opts || {};
  const resolved = matchEnabledLocale(locale);
  if (!resolved) {
    const err = new Error('locale לא מופעל');
    err.status = 400;
    throw err;
  }
  const sourceLocale = getDefaultLocale();
  const id = normId(entityId);
  await ensureTranslationStatusRows(db, entityType, id, {
    hasTranslation: { [resolved]: true },
    sourceHasContent: resolved === sourceLocale,
  });

  const expected = Number(expectedSourceRevision);
  if (!Number.isFinite(expected)) {
    const current = (await getSourceRevision(db, entityType, id, sourceLocale)) || 1;
    const err = new Error('גרסת המקור השתנתה; התרגום אינו מסומן כ־current');
    err.status = 409;
    err.code = 'TRANSLATION_STALE_SOURCE';
    err.currentRevision = current;
    err.expectedRevision = expected;
    throw err;
  }

  // CAS: only mark current while source revision is still the expected value.
  const result = await db
    .prepare(
      `UPDATE translation_status
       SET freshness_status = 'current',
           review_status = 'normal',
           source_revision = ?,
           translated_from_revision = ?,
           acknowledged_at = NULL,
           acknowledged_by = NULL,
           updated_at = datetime('now')
       WHERE entity_type = ? AND entity_id = ? AND locale = ?
         AND EXISTS (
           SELECT 1 FROM translation_source_revisions r
           WHERE r.entity_type = translation_status.entity_type
             AND r.entity_id = translation_status.entity_id
             AND r.source_locale = ?
             AND r.revision = ?
         )`
    )
    .bind(expected, expected, entityType, id, resolved, sourceLocale, expected)
    .run();

  if ((result.meta?.changes || 0) === 0) {
    const sourceRev = (await getSourceRevision(db, entityType, id, sourceLocale)) || 1;
    await db
      .prepare(
        `UPDATE translation_status
         SET freshness_status = 'outdated',
             source_revision = ?,
             updated_at = datetime('now')
         WHERE entity_type = ? AND entity_id = ? AND locale = ?
           AND freshness_status != 'missing'`
      )
      .bind(sourceRev, entityType, id, resolved)
      .run();

    const err = new Error('גרסת המקור השתנתה; התרגום אינו מסומן כ־current');
    err.status = 409;
    err.code = 'TRANSLATION_STALE_SOURCE';
    err.currentRevision = sourceRev;
    err.expectedRevision = expected;
    throw err;
  }

  return { freshnessStatus: 'current', sourceRevision: expected };
}

export async function acknowledgeTranslation(db, opts) {
  const { entityType, entityId, locale, actorUserId } = opts || {};
  if (!isMultilingual()) {
    const err = new Error('לא זמין בפרויקט חד־לשוני');
    err.status = 404;
    throw err;
  }
  if (!isValidEntityType(entityType)) {
    const err = new Error('entity_type לא תקין');
    err.status = 400;
    throw err;
  }
  const resolved = matchEnabledLocale(locale);
  if (!resolved) {
    const err = new Error('locale לא מופעל');
    err.status = 400;
    throw err;
  }
  if (resolved === getDefaultLocale()) {
    const err = new Error('לא ניתן לסמן את שפת המקור כ־acknowledged');
    err.status = 400;
    throw err;
  }

  const id = normId(entityId);
  const exists = await entityExists(db, entityType, id);
  if (!exists) {
    const err = new Error('הישות לא נמצאה');
    err.status = 404;
    throw err;
  }

  await ensureTranslationStatusRows(db, entityType, id, {});
  const row = await db
    .prepare(
      `SELECT freshness_status, review_status, acknowledged_at
       FROM translation_status
       WHERE entity_type = ? AND entity_id = ? AND locale = ?`
    )
    .bind(entityType, id, resolved)
    .first();

  if (!row) {
    const err = new Error('סטטוס תרגום לא נמצא');
    err.status = 404;
    throw err;
  }
  if (row.freshness_status === 'missing') {
    const err = new Error('לא ניתן לסמן missing כ־acknowledged');
    err.status = 400;
    throw err;
  }
  if (row.freshness_status !== 'outdated') {
    const err = new Error('acknowledge מותר רק עבור outdated');
    err.status = 400;
    throw err;
  }

  if (row.review_status === 'acknowledged') {
    return {
      ok: true,
      idempotent: true,
      freshnessStatus: 'outdated',
      reviewStatus: 'acknowledged',
      acknowledgedAt: row.acknowledged_at,
    };
  }

  await db
    .prepare(
      `UPDATE translation_status
       SET review_status = 'acknowledged',
           acknowledged_at = datetime('now'),
           acknowledged_by = ?,
           updated_at = datetime('now')
       WHERE entity_type = ? AND entity_id = ? AND locale = ?
         AND freshness_status = 'outdated'
         AND review_status = 'normal'`
    )
    .bind(actorUserId ?? null, entityType, id, resolved)
    .run();

  const after = await db
    .prepare(
      `SELECT freshness_status, review_status, acknowledged_at, acknowledged_by
       FROM translation_status
       WHERE entity_type = ? AND entity_id = ? AND locale = ?`
    )
    .bind(entityType, id, resolved)
    .first();

  return {
    ok: true,
    idempotent: false,
    freshnessStatus: after.freshness_status,
    reviewStatus: after.review_status,
    acknowledgedAt: after.acknowledged_at,
  };
}

export async function entityExists(db, entityType, entityId) {
  const id = normId(entityId);
  if (entityType === 'site_content') {
    const row = await db.prepare('SELECT 1 AS ok FROM site_content WHERE key = ? LIMIT 1').bind(id).first();
    return !!row;
  }
  if (entityType === 'system_message') {
    const row = await db.prepare('SELECT 1 AS ok FROM system_messages WHERE key = ? LIMIT 1').bind(id).first();
    return !!row;
  }
  if (entityType === 'service') {
    const row = await db.prepare('SELECT 1 AS ok FROM services WHERE id = ?').bind(Number(id)).first();
    return !!row;
  }
  if (entityType === 'portfolio_item') {
    const row = await db.prepare('SELECT 1 AS ok FROM portfolio_items WHERE id = ?').bind(Number(id)).first();
    return !!row;
  }
  return false;
}

export async function deleteTranslationTracking(db, entityType, entityId) {
  const id = normId(entityId);
  await db
    .prepare('DELETE FROM translation_status WHERE entity_type = ? AND entity_id = ?')
    .bind(entityType, id)
    .run();
  await db
    .prepare('DELETE FROM translation_source_revisions WHERE entity_type = ? AND entity_id = ?')
    .bind(entityType, id)
    .run();
}

async function entityDraftSlice(db, entityType, entityId, locale) {
  const id = normId(entityId);
  const loc = resolveLocale(locale);
  if (entityType === 'site_content') {
    const map = await getContentMap(db, loc);
    if (!(id in map)) return null;
    return { value: map[id] };
  }
  if (entityType === 'system_message') {
    const map = await getSystemMessages(db, loc);
    if (!(id in map)) return null;
    return { value: map[id] };
  }
  if (entityType === 'service') {
    const services = await getServices(db, { locale: loc });
    const row = services.find((s) => String(s.id) === id);
    if (!row) return null;
    return { title: row.title, description: row.description };
  }
  if (entityType === 'portfolio_item') {
    const items = await getPortfolio(db, { locale: loc });
    const row = items.find((p) => String(p.id) === id);
    if (!row) return null;
    return {
      title: row.title,
      category: row.category,
      categories: typeof row.categories === 'string' ? row.categories : JSON.stringify(row.categories || []),
      alt_text: row.alt_text,
    };
  }
  return null;
}

function entityPublishedSlice(published, entityType, entityId) {
  if (!published) return null;
  const id = normId(entityId);
  if (entityType === 'site_content') {
    const content = published.content || {};
    if (!(id in content)) return null;
    return { value: content[id] };
  }
  if (entityType === 'system_message') {
    const msgs = published.systemMessages || {};
    if (!(id in msgs)) return null;
    return { value: msgs[id] };
  }
  if (entityType === 'service') {
    const row = (published.services || []).find((s) => String(s.id) === id);
    if (!row) return null;
    return { title: row.title, description: row.description };
  }
  if (entityType === 'portfolio_item') {
    const row = (published.portfolio || []).find((p) => String(p.id) === id);
    if (!row) return null;
    return {
      title: row.title,
      category: row.category,
      categories: typeof row.categories === 'string' ? row.categories : JSON.stringify(row.categories || []),
      alt_text: row.alt_text,
    };
  }
  return null;
}

export async function getPublicationFlags(db, entityType, entityId, locale) {
  const loc = resolveLocale(locale);
  const draft = await entityDraftSlice(db, entityType, entityId, loc);
  const published = await getPublishedPayload(db, loc);
  const pubSlice = entityPublishedSlice(published, entityType, entityId);

  if (!draft) {
    return { isDraft: false, isPublished: !!pubSlice };
  }
  if (!pubSlice) {
    return { isDraft: true, isPublished: false };
  }
  const same = !hasTranslatedDiff(entityType, draft, pubSlice) && !hasTranslatedDiff(entityType, pubSlice, draft);
  return { isDraft: !same, isPublished: same };
}

function mapStatusRow(row, flags) {
  const freshnessStatus = row.freshness_status;
  const reviewStatus = row.review_status;
  const displayStatus = computeDisplayStatus({
    freshnessStatus,
    reviewStatus,
    isDraft: flags.isDraft,
    isPublished: flags.isPublished,
  });
  return {
    entityType: row.entity_type,
    entityId: row.entity_id,
    locale: row.locale,
    freshnessStatus,
    reviewStatus,
    isDraft: flags.isDraft,
    isPublished: flags.isPublished,
    displayStatus,
    sourceRevision: Number(row.source_revision) || 0,
    translatedFromRevision: Number(row.translated_from_revision) || 0,
    acknowledgedAt: row.acknowledged_at || null,
    updatedAt: row.updated_at || null,
  };
}

/**
 * List translation statuses. When monolingual: { multilingual: false, items: [] }.
 * Pass ensure: false on hot paths (content/status GET) - backfill only from the
 * translations panel (default ensure: true).
 */
export async function listTranslationStatuses(db, query = {}) {
  if (!isMultilingual()) {
    return { multilingual: false, items: [], nextCursor: null, hasMore: false };
  }

  if (query.ensure !== false) {
    await ensureAllTranslationStatusRows(db);
  }

  const where = [];
  const binds = [];
  if (query.locale) {
    const loc = matchEnabledLocale(query.locale);
    if (!loc) {
      const err = new Error('locale לא מופעל');
      err.status = 400;
      throw err;
    }
    where.push('locale = ?');
    binds.push(loc);
  }
  if (query.entityType) {
    if (!isValidEntityType(query.entityType)) {
      const err = new Error('entity_type לא תקין');
      err.status = 400;
      throw err;
    }
    where.push('entity_type = ?');
    binds.push(query.entityType);
  }
  if (query.freshnessStatus) {
    const f = String(query.freshnessStatus);
    if (!['missing', 'current', 'outdated'].includes(f)) {
      const err = new Error('freshness_status לא תקין');
      err.status = 400;
      throw err;
    }
    where.push('freshness_status = ?');
    binds.push(f);
  }
  if (query.needingAttention) {
    where.push(`(freshness_status IN ('missing', 'outdated'))`);
  }

  const limitRaw = Number(query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 50;
  const cursor = query.cursor != null && query.cursor !== '' ? String(query.cursor) : null;
  if (cursor) {
    where.push(`(entity_type || ':' || entity_id || ':' || locale) > ?`);
    binds.push(cursor);
  }

  const sql = `
    SELECT entity_type, entity_id, locale, freshness_status, review_status,
           source_revision, translated_from_revision, updated_at, acknowledged_at, acknowledged_by
    FROM translation_status
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY entity_type ASC, entity_id ASC, locale ASC
    LIMIT ?
  `;
  binds.push(limit + 1);

  const { results } = await db.prepare(sql).bind(...binds).all();
  const rows = results || [];
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;

  const items = [];
  for (const row of slice) {
    const flags = await getPublicationFlags(db, row.entity_type, row.entity_id, row.locale);
    items.push(mapStatusRow(row, flags));
  }

  const nextCursor =
    hasMore && items.length
      ? `${items[items.length - 1].entityType}:${items[items.length - 1].entityId}:${items[items.length - 1].locale}`
      : null;

  return { multilingual: true, items, nextCursor, hasMore, limit };
}

export async function getTranslationStatus(db, entityType, entityId, locale) {
  if (!isMultilingual()) return null;
  const resolved = matchEnabledLocale(locale) || getDefaultLocale();
  await ensureTranslationStatusRows(db, entityType, entityId, {});
  const row = await db
    .prepare(
      `SELECT entity_type, entity_id, locale, freshness_status, review_status,
              source_revision, translated_from_revision, updated_at, acknowledged_at, acknowledged_by
       FROM translation_status
       WHERE entity_type = ? AND entity_id = ? AND locale = ?`
    )
    .bind(entityType, normId(entityId), resolved)
    .first();
  if (!row) return null;
  const flags = await getPublicationFlags(db, entityType, entityId, resolved);
  return mapStatusRow(row, flags);
}

/**
 * After source-locale draft content was written: bump if translated diff.
 * Prefer commitDraftWritesWithSourceBumps (CAS before write). This helper is for
 * paths that already persisted content (e.g. rollback reconcile) and uses a
 * single CAS attempt - stale expected → 409 (no force / last-write-wins).
 */
export async function onSourceTranslatedFieldsChanged(db, opts) {
  const { entityType, entityId, before, after, expectedRevision = null, actorUserId = null } = opts || {};
  if (!hasTranslatedDiff(entityType, before, after)) {
    return { bumped: false, revision: await getSourceRevision(db, entityType, entityId) };
  }
  await ensureTranslationStatusRows(db, entityType, entityId, {
    hasTranslation: { [getDefaultLocale()]: true },
    sourceHasContent: true,
  });
  return bumpSourceRevision(db, {
    entityType,
    entityId,
    expectedRevision,
    actorUserId,
  });
}

/**
 * Reconcile freshness after draft restore (rollback).
 * - default locale: bump when translated fields changed vs pre-restore snapshot
 * - other locales: recompute current/outdated vs source revision (never bump source)
 */
export async function reconcileAfterDraftRestore(db, opts) {
  const { locale, beforeSnapshot, actorUserId = null } = opts || {};
  const resolved = resolveLocale(locale);
  const sourceLocale = getDefaultLocale();

  if (resolved === sourceLocale) {
    const afterContent = await getContentMap(db, resolved);
    const beforeContent = beforeSnapshot?.content || {};
    const keys = new Set([...Object.keys(beforeContent), ...Object.keys(afterContent)]);
    for (const key of keys) {
      const before = key in beforeContent ? { value: beforeContent[key] } : null;
      const after = key in afterContent ? { value: afterContent[key] } : null;
      if (!after) continue;
      await ensureTranslationStatusRows(db, 'site_content', key, {
        hasTranslation: { [resolved]: true },
        sourceHasContent: true,
      });
      if (hasTranslatedDiff('site_content', before, after)) {
        await bumpSourceRevision(db, {
          entityType: 'site_content',
          entityId: key,
          actorUserId,
        });
      }
    }

    const afterServices = await getServices(db, { locale: resolved });
    const beforeById = new Map((beforeSnapshot?.services || []).map((s) => [String(s.id), s]));
    for (const s of afterServices) {
      const before = beforeById.get(String(s.id)) || null;
      const after = { title: s.title, description: s.description };
      const beforeSlice = before ? { title: before.title, description: before.description } : null;
      await ensureTranslationStatusRows(db, 'service', s.id, {
        hasTranslation: { [resolved]: true },
        sourceHasContent: true,
      });
      if (hasTranslatedDiff('service', beforeSlice, after)) {
        await bumpSourceRevision(db, { entityType: 'service', entityId: s.id, actorUserId });
      }
    }

    const afterPortfolio = await getPortfolio(db, { locale: resolved });
    const beforePort = new Map((beforeSnapshot?.portfolio || []).map((p) => [String(p.id), p]));
    for (const p of afterPortfolio) {
      const before = beforePort.get(String(p.id)) || null;
      const after = {
        title: p.title,
        category: p.category,
        categories: typeof p.categories === 'string' ? p.categories : JSON.stringify(p.categories || []),
        alt_text: p.alt_text,
      };
      const beforeSlice = before
        ? {
            title: before.title,
            category: before.category,
            categories:
              typeof before.categories === 'string'
                ? before.categories
                : JSON.stringify(before.categories || []),
            alt_text: before.alt_text,
          }
        : null;
      await ensureTranslationStatusRows(db, 'portfolio_item', p.id, {
        hasTranslation: { [resolved]: true },
        sourceHasContent: true,
      });
      if (hasTranslatedDiff('portfolio_item', beforeSlice, after)) {
        await bumpSourceRevision(db, {
          entityType: 'portfolio_item',
          entityId: p.id,
          actorUserId,
        });
      }
    }

    const afterMsgs = await getSystemMessages(db, resolved);
    const beforeMsgs = beforeSnapshot?.systemMessages || {};
    const msgKeys = new Set([...Object.keys(beforeMsgs), ...Object.keys(afterMsgs)]);
    for (const key of msgKeys) {
      const before = key in beforeMsgs ? { value: beforeMsgs[key] } : null;
      const after = key in afterMsgs ? { value: afterMsgs[key] } : null;
      if (!after) continue;
      await ensureTranslationStatusRows(db, 'system_message', key, {
        hasTranslation: { [resolved]: true },
        sourceHasContent: true,
      });
      if (hasTranslatedDiff('system_message', before, after)) {
        await bumpSourceRevision(db, {
          entityType: 'system_message',
          entityId: key,
          actorUserId,
        });
      }
    }
    return;
  }

  // Non-source locale: recompute freshness against current source revisions.
  await recomputeLocaleFreshness(db, resolved, actorUserId);
}

export async function recomputeLocaleFreshness(db, locale, actorUserId = null) {
  const resolved = resolveLocale(locale);
  const sourceLocale = getDefaultLocale();
  if (resolved === sourceLocale) return;

  await ensureAllTranslationStatusRows(db);
  const { results } = await db
    .prepare(
      `SELECT entity_type, entity_id, freshness_status, translated_from_revision, source_revision
       FROM translation_status WHERE locale = ?`
    )
    .bind(resolved)
    .all();

  for (const row of results || []) {
    const draft = await entityDraftSlice(db, row.entity_type, row.entity_id, resolved);
    const sourceRev = (await getSourceRevision(db, row.entity_type, row.entity_id, sourceLocale)) || 1;

    if (!draft) {
      if (row.freshness_status !== 'missing') {
        await db
          .prepare(
            `UPDATE translation_status
             SET freshness_status = 'missing',
                 review_status = 'normal',
                 translated_from_revision = 0,
                 source_revision = ?,
                 acknowledged_at = NULL,
                 acknowledged_by = NULL,
                 updated_at = datetime('now')
             WHERE entity_type = ? AND entity_id = ? AND locale = ?`
          )
          .bind(sourceRev, row.entity_type, row.entity_id, resolved)
          .run();
      }
      continue;
    }

    const translatedFrom = Number(row.translated_from_revision) || 0;
    const nextFreshness = translatedFrom >= sourceRev ? 'current' : 'outdated';
    if (nextFreshness === row.freshness_status && Number(row.source_revision) === sourceRev) {
      continue;
    }

    await db
      .prepare(
        `UPDATE translation_status
         SET freshness_status = ?,
             review_status = CASE WHEN ? = 'outdated' THEN 'normal' ELSE review_status END,
             source_revision = ?,
             acknowledged_at = CASE WHEN ? = 'outdated' THEN NULL ELSE acknowledged_at END,
             acknowledged_by = CASE WHEN ? = 'outdated' THEN NULL ELSE acknowledged_by END,
             updated_at = datetime('now')
         WHERE entity_type = ? AND entity_id = ? AND locale = ?`
      )
      .bind(
        nextFreshness,
        nextFreshness,
        sourceRev,
        nextFreshness,
        nextFreshness,
        row.entity_type,
        row.entity_id,
        resolved
      )
      .run();
  }
}

/**
 * Snapshot of draft translated fields for rollback compare.
 */
export async function snapshotTranslatedDraft(db, locale) {
  const resolved = resolveLocale(locale);
  return {
    locale: resolved,
    content: await getContentMap(db, resolved),
    systemMessages: await getSystemMessages(db, resolved),
    services: await getServices(db, { locale: resolved }),
    portfolio: await getPortfolio(db, { locale: resolved }),
  };
}

/** Collect needing-attention summaries for admin banner. */
export async function listNeedingAttention(db, { limit = 50, ensure = false } = {}) {
  if (!isMultilingual()) return [];
  const result = await listTranslationStatuses(db, {
    needingAttention: true,
    limit,
    ensure,
  });
  return result.items.filter(
    (item) =>
      item.freshnessStatus === 'missing' ||
      (item.freshnessStatus === 'outdated' && item.reviewStatus === 'normal')
  );
}
