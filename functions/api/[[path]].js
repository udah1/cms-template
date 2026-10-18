import {
  badRequest,
  clearSessionCookie,
  createSession,
  destroySession,
  getSessionToken,
  hashPassword,
  json,
  readJson,
  requireUser,
  sessionCookie,
  sessionDaysForRemember,
  verifyPassword,
} from '../_shared/auth.js';
import {
  diffContentMap,
  diffPortfolio,
  diffService,
  hasDiffs,
  listAuditLogs,
  logAudit,
  portfolioRowForAudit,
  serviceRowForAudit,
} from '../_shared/audit.js';
import { getContentMap, getPortfolio, getPublishedPayload, getServices } from '../_shared/content.js';
import {
  bindI18nRuntimeEnv,
  getDefaultLocale,
  getLocales,
  isMultilingual,
  matchEnabledLocale,
} from '../_shared/i18n.js';
import { categoriesToDb, portfolioCategoriesForLocale } from '../_shared/categories.js';
import { assertSameOrigin } from '../_shared/csrf.js';
import {
  assertLoginAllowed,
  clearLoginFailures,
  clientThrottleKey,
  recordLoginFailure,
} from '../_shared/login-throttle.js';
import { planUpload } from '../_shared/media.js';
import { deleteMediaUrl, deletePortfolioMedia, mediaKeyFromUrl } from '../_shared/r2.js';
import {
  createPreviewToken,
  ensurePublishedBaseline,
  getDraftPublicPayload,
  getPublishStatus,
  publishFromDraft,
  rollbackToPrevious,
  validatePreviewToken,
} from '../_shared/publish.js';
import { buildJsonLd, buildMeta, resolveSiteOrigin } from '../_shared/seo.js';
import {
  acknowledgeTranslation,
  deleteTranslationTracking,
  ensureTranslationStatusRows,
  getSourceRevision,
  getSourceRevisionsMap,
  hasTranslatedDiff,
  listNeedingAttention,
  listTranslationStatuses,
  markTranslationCurrent,
  commitDraftWritesWithSourceBumps,
} from '../_shared/translations.js';

const MAX_SERVICES = 10;
const PREVIEW_ROBOTS = { 'X-Robots-Tag': 'noindex, nofollow, noarchive' };

function siteOrigin(request) {
  return resolveSiteOrigin(request);
}

/**
 * Admin/API locale resolver: unknown/missing → default locale (soft-fallback).
 * Public HTML SSR must NOT use this for path locales; unknown path locales 404
 * via middleware / resolveSsrPath when multilingual is enabled.
 */
function requestLocale(request, body) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('locale');
  const fromBody = body && typeof body === 'object' ? body.locale : null;
  const matched = matchEnabledLocale(fromQuery || fromBody);
  return matched || getDefaultLocale();
}

function isLocalHost(request) {
  const host = new URL(request.url).hostname;
  return host === '127.0.0.1' || host === 'localhost';
}

function requireCsrf(request) {
  if (!assertSameOrigin(request)) {
    const err = new Error('בקשה לא מורשית');
    err.status = 403;
    throw err;
  }
}

async function auditMediaDelete(db, actorUserId, url, reason) {
  const key = mediaKeyFromUrl(url);
  if (!key && !url) return;
  await logAudit(db, {
    actorUserId,
    action: 'media.delete',
    entityType: 'media',
    entityId: key || String(url),
    summary: 'מדיה נמחקה',
    details: { url: String(url || ''), key: key || null, reason: reason || null },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  bindI18nRuntimeEnv(env);
  const db = env.DB;
  if (!db) return badRequest('Database binding missing', 500);

  const url = new URL(request.url);
  const parts = (context.params.path || []).filter(Boolean);
  const method = request.method.toUpperCase();
  const route = parts.join('/');

  try {
    if (route === 'public/site' && method === 'GET') {
      const origin = siteOrigin(request);
      const locale = requestLocale(request);
      await ensurePublishedBaseline(db, origin, null, locale);
      const published = await getPublishedPayload(db, locale);
      if (!published) return badRequest('אין גרסה מפורסמת', 503);
      const { meta, jsonLd, versionId, publishedAt, ...payload } = published;
      // Rebuild schema with canonical host so pages.dev never leaks to crawlers.
      const liveJsonLd = buildJsonLd(payload, origin) || jsonLd || '';
      return json({
        ...payload,
        locale,
        meta: meta || {},
        jsonLd: liveJsonLd,
        versionId,
        publishedAt,
      });
    }

    if (route === 'preview/site' && method === 'GET') {
      const token = url.searchParams.get('token') || '';
      const locale = requestLocale(request);
      const sessionUser = await requireUser(db, request);
      if (token) {
        const tokenRow = await validatePreviewToken(db, token);
        if (!tokenRow) {
          return json({ error: 'טוקן תצוגה מקדימה לא תקין או שפג תוקפו' }, 401, PREVIEW_ROBOTS);
        }
      } else if (!sessionUser) {
        return json({ error: 'אין הרשאה לתצוגה מקדימה' }, 401, PREVIEW_ROBOTS);
      }
      const payload = await getDraftPublicPayload(db, locale);
      const origin = siteOrigin(request);
      const meta = buildMeta(payload);
      const jsonLd = buildJsonLd(payload, origin);
      return json(
        {
          ...payload,
          locale,
          meta,
          jsonLd,
          preview: true,
        },
        200,
        PREVIEW_ROBOTS
      );
    }

    if (route === 'auth/login' && method === 'POST') {
      requireCsrf(request);
      const body = await readJson(request);
      if (!body?.email || !body?.password) return badRequest('נא למלא אימייל וסיסמה');
      const email = String(body.email).trim().toLowerCase();
      const throttleKey = clientThrottleKey(request, email);
      try {
        await assertLoginAllowed(db, throttleKey);
      } catch (err) {
        return badRequest(err.message || 'יותר מדי ניסיונות', err.status || 429);
      }
      const user = await db
        .prepare('SELECT id, email, password_hash FROM admin_users WHERE email = ?')
        .bind(email)
        .first();
      if (!user || !(await verifyPassword(body.password, user.password_hash))) {
        await recordLoginFailure(db, throttleKey);
        return badRequest('אימייל או סיסמה שגויים', 401);
      }
      await clearLoginFailures(db, throttleKey);
      const rememberMe = body.rememberMe === true || body.remember === true;
      const days = sessionDaysForRemember(rememberMe);
      const { token, maxAgeSeconds } = await createSession(db, user.id, { days });
      // Seed demo password - never leave this on a live site after remote seed.
      const mustChangePassword = String(body.password) === 'ChangeMe123!';
      await logAudit(db, {
        actorUserId: user.id,
        action: 'auth.login',
        entityType: 'auth',
        entityId: user.id,
        summary: 'התחברות הצליחה',
        details: { email: user.email, rememberMe, sessionDays: days },
      });
      return json(
        { ok: true, email: user.email, mustChangePassword },
        200,
        { 'Set-Cookie': sessionCookie(token, request, maxAgeSeconds) }
      );
    }

    if (route === 'auth/logout' && method === 'POST') {
      requireCsrf(request);
      const sessionUser = await requireUser(db, request);
      const token = getSessionToken(request);
      await destroySession(db, token);
      if (sessionUser) {
        await logAudit(db, {
          actorUserId: sessionUser.id,
          action: 'auth.logout',
          entityType: 'auth',
          entityId: sessionUser.id,
          summary: 'התנתקות',
          details: { email: sessionUser.email },
        });
      }
      return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
    }

    if (route === 'auth/me' && method === 'GET') {
      const user = await requireUser(db, request);
      if (!user) return json({ authenticated: false }, 401);
      return json({ authenticated: true, email: user.email });
    }

    if (route === 'auth/change-password' && method === 'POST') {
      requireCsrf(request);
      const user = await requireUser(db, request);
      if (!user) return badRequest('יש להתחבר', 401);
      const body = await readJson(request);
      if (!body?.currentPassword || !body?.newPassword) {
        return badRequest('נא למלא את כל השדות');
      }
      if (String(body.newPassword).length < 8) {
        return badRequest('הסיסמה החדשה חייבת להכיל לפחות 8 תווים');
      }
      if (String(body.newPassword) === 'ChangeMe123!') {
        return badRequest('אין להשתמש בסיסמת הדמו. בחרו סיסמה ייחודית.');
      }
      if (body.newPassword !== body.confirmPassword) {
        return badRequest('אימות הסיסמה החדשה לא תואם');
      }
      const row = await db
        .prepare('SELECT password_hash FROM admin_users WHERE id = ?')
        .bind(user.id)
        .first();
      if (!row || !(await verifyPassword(body.currentPassword, row.password_hash))) {
        return badRequest('הסיסמה הנוכחית שגויה', 403);
      }
      const nextHash = await hashPassword(body.newPassword);
      await db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').bind(nextHash, user.id).run();
      await logAudit(db, {
        actorUserId: user.id,
        action: 'auth.change_password',
        entityType: 'auth',
        entityId: user.id,
        summary: 'סיסמה עודכנה',
        details: { email: user.email },
      });
      return json({ ok: true });
    }

    // --- Admin routes ---
    const user = await requireUser(db, request);
    if (!user && route.startsWith('admin/')) {
      return badRequest('יש להתחבר', 401);
    }

    if (route === 'admin/audit' && method === 'GET') {
      const params = url.searchParams;
      try {
        const result = await listAuditLogs(db, {
          limit: params.get('limit'),
          cursor: params.get('cursor'),
          action: params.get('action') || '',
          entityType: params.get('entity_type') || params.get('entityType') || '',
          actorUserId: params.get('actor_user_id') || params.get('actorUserId') || '',
          from: params.get('from') || '',
          to: params.get('to') || '',
        });
        return json(result);
      } catch (err) {
        return badRequest(err.message || 'בקשה לא תקינה', err.status || 400);
      }
    }

    if (route === 'admin/translations/status' && method === 'GET') {
      if (!isMultilingual()) {
        return json({ multilingual: false, items: [], nextCursor: null, hasMore: false });
      }
      const params = url.searchParams;
      try {
        const result = await listTranslationStatuses(db, {
          locale: params.get('locale') || '',
          entityType: params.get('entity_type') || params.get('entityType') || '',
          freshnessStatus: params.get('freshness_status') || params.get('freshnessStatus') || '',
          needingAttention:
            params.get('needing_attention') === '1' || params.get('needingAttention') === '1',
          limit: params.get('limit'),
          cursor: params.get('cursor'),
        });
        return json(result);
      } catch (err) {
        return badRequest(err.message || 'בקשה לא תקינה', err.status || 400);
      }
    }

    if (route === 'admin/translations/acknowledge' && method === 'POST') {
      requireCsrf(request);
      if (!isMultilingual()) {
        return badRequest('לא זמין בפרויקט חד־לשוני', 404);
      }
      const body = await readJson(request);
      try {
        const result = await acknowledgeTranslation(db, {
          entityType: body?.entityType || body?.entity_type,
          entityId: body?.entityId ?? body?.entity_id,
          locale: body?.locale,
          actorUserId: user.id,
        });
        return json(result);
      } catch (err) {
        return badRequest(err.message || 'בקשה לא תקינה', err.status || 400);
      }
    }

    if (route === 'admin/publish/status' && method === 'GET') {
      const locale = requestLocale(request);
      await ensurePublishedBaseline(db, siteOrigin(request), user.id, locale);
      const status = await getPublishStatus(db, locale);
      if (isMultilingual()) {
        const attention = await listNeedingAttention(db, { limit: 20 });
        status.translationWarnings = attention;
        status.hasOutdatedTranslations = attention.some((i) => i.freshnessStatus === 'outdated');
      }
      return json(status);
    }

    if (route === 'admin/upload' && method === 'POST') {
      requireCsrf(request);
      const bucket = env.MEDIA;
      if (!bucket) return badRequest('אחסון מדיה (R2) לא מוגדר', 503);

      let form;
      try {
        form = await request.formData();
      } catch {
        return badRequest('גוף הבקשה אינו תקין');
      }
      const file = form.get('file');
      if (!file || typeof file === 'string') return badRequest('יש לצרף קובץ');

      const kindRaw = String(form.get('kind') || 'auto');
      const kind = kindRaw === 'image' || kindRaw === 'video' ? kindRaw : 'auto';

      let planned;
      try {
        planned = planUpload({ file, kind });
      } catch (err) {
        return badRequest(err.message || 'העלאה נכשלה', err.status || 400);
      }

      await bucket.put(planned.key, file.stream(), {
        httpMetadata: { contentType: planned.contentType },
      });

      await logAudit(db, {
        actorUserId: user.id,
        action: 'media.upload',
        entityType: 'media',
        entityId: planned.key,
        summary: planned.isVideo ? 'סרטון הועלה' : 'תמונה הועלתה',
        details: {
          key: planned.key,
          url: planned.publicPath,
          contentType: planned.contentType,
          isVideo: !!planned.isVideo,
        },
      });

      return json({
        ok: true,
        key: planned.key,
        url: planned.publicPath,
        contentType: planned.contentType,
        isVideo: planned.isVideo,
      });
    }

    if (route === 'admin/preview-token' && method === 'POST') {
      requireCsrf(request);
      const body = await readJson(request);
      const locale = requestLocale(request, body);
      const { token, expiresAt } = await createPreviewToken(db, user.id);
      const previewPath = locale === getDefaultLocale() ? '/' : `/${locale}/`;
      await logAudit(db, {
        actorUserId: user.id,
        action: 'preview.create',
        entityType: 'preview',
        entityId: null,
        locale,
        summary: 'נוצר טוקן תצוגה מקדימה',
        details: { expiresAt, locale },
      });
      return json({
        token,
        expiresAt,
        locale,
        previewUrl: `${previewPath}?preview=${encodeURIComponent(token)}`,
      });
    }

    if (route === 'admin/publish' && method === 'POST') {
      requireCsrf(request);
      const body = await readJson(request);
      const locale = requestLocale(request, body);
      const forceFail = !!(body?.forceFail && isLocalHost(request));
      try {
        const result = await publishFromDraft({
          db,
          userId: user.id,
          siteOrigin: siteOrigin(request),
          forceFail,
          locale,
        });
        await logAudit(db, {
          actorUserId: user.id,
          action: 'publish.succeeded',
          entityType: 'version',
          entityId: result.versionId,
          locale: result.locale || locale,
          summary: 'פרסום הצליח',
          details: {
            versionId: result.versionId,
            previousVersionId: result.previousVersionId ?? null,
            locale: result.locale || locale,
          },
        });
        return json({ ok: true, ...result, status: 'Published' });
      } catch (err) {
        const status = err.status || 500;
        await logAudit(db, {
          actorUserId: user.id,
          action: 'publish.failed',
          entityType: 'version',
          entityId: err.versionId || null,
          locale,
          summary: 'פרסום נכשל',
          details: {
            error: String(err.message || 'פרסום נכשל').slice(0, 500),
            versionId: err.versionId || null,
            conflict: status === 409,
            locale,
          },
          success: false,
        });
        return json(
          {
            ok: false,
            status: status === 409 ? 'Publishing' : 'Failed',
            error: err.message || 'פרסום נכשל',
            versionId: err.versionId || null,
          },
          status
        );
      }
    }

    if (route === 'admin/rollback' && method === 'POST') {
      requireCsrf(request);
      const body = await readJson(request);
      const locale = requestLocale(request, body);
      try {
        const result = await rollbackToPrevious(db, user.id, siteOrigin(request), locale);
        await logAudit(db, {
          actorUserId: user.id,
          action: 'rollback.succeeded',
          entityType: 'version',
          entityId: result.versionId,
          locale: result.locale || locale,
          summary: 'שחזור לגרסה קודמת הצליח',
          details: {
            versionId: result.versionId,
            previousVersionId: result.previousVersionId ?? null,
            locale: result.locale || locale,
          },
        });
        return json({ ok: true, ...result, status: 'Published' });
      } catch (err) {
        const status = err.status || 500;
        await logAudit(db, {
          actorUserId: user.id,
          action: 'rollback.failed',
          entityType: 'version',
          entityId: err.versionId || null,
          locale,
          summary: 'שחזור לגרסה קודמת נכשל',
          details: {
            error: String(err.message || 'שחזור נכשל').slice(0, 500),
            versionId: err.versionId || null,
            conflict: status === 409,
            locale,
          },
          success: false,
        });
        return json(
          {
            ok: false,
            status: status === 409 ? 'Publishing' : 'Failed',
            error: err.message || 'שחזור נכשל',
            versionId: err.versionId || null,
          },
          status
        );
      }
    }

    if (route === 'admin/content' && method === 'GET') {
      const locale = requestLocale(request);
      // Do not call ensureAllTranslationStatusRows here - it is O(entities×locales)
      // sequential D1 work and blocks the admin shell for tens of seconds.
      const content = await getContentMap(db, locale);
      const services = await getServices(db, { locale });
      const sourceRevisions = {};
      if (isMultilingual()) {
        const [contentRevs, serviceRevs] = await Promise.all([
          getSourceRevisionsMap(db, 'site_content'),
          getSourceRevisionsMap(db, 'service'),
        ]);
        for (const key of Object.keys(content)) {
          sourceRevisions[`site_content:${key}`] = contentRevs[key] || 1;
        }
        for (const s of services) {
          sourceRevisions[`service:${s.id}`] = serviceRevs[String(s.id)] || 1;
        }
      }
      return json({
        locale,
        locales: getLocales(),
        defaultLocale: getDefaultLocale(),
        multilingual: isMultilingual(),
        content,
        services,
        sourceRevisions,
        needingAttention: isMultilingual() ? await listNeedingAttention(db, { limit: 30 }) : [],
      });
    }

    if (route === 'admin/content' && method === 'PUT') {
      requireCsrf(request);
      const body = await readJson(request);
      if (!body || typeof body !== 'object') return badRequest('גוף בקשה לא תקין');
      const locale = requestLocale(request, body);
      const sourceLocale = getDefaultLocale();
      const expectedMap =
        body.expectedSourceRevisions && typeof body.expectedSourceRevisions === 'object'
          ? body.expectedSourceRevisions
          : {};

      const beforeContent = await getContentMap(db, locale);
      const beforeServices = await getServices(db, { locale });
      const beforeById = new Map(beforeServices.map((s) => [Number(s.id), s]));

      // Plan changes first; revision preflight runs before any draft write.
      const contentTouches = [];
      if (body.content && typeof body.content === 'object') {
        for (const [key, value] of Object.entries(body.content)) {
          const after = { value: String(value ?? '') };
          const before = key in beforeContent ? { value: beforeContent[key] } : null;
          if (hasTranslatedDiff('site_content', before, after)) {
            contentTouches.push({
              key,
              before,
              after,
              expected: expectedMap[`site_content:${key}`] ?? expectedMap[key] ?? null,
            });
          }
        }
      }

      const serviceChanges = [];
      if (Array.isArray(body.services)) {
        for (const s of body.services) {
          if (!s.id) continue;
          const id = Number(s.id);
          const prev = beforeById.get(id);
          const next = {
            title: String(s.title || ''),
            description: String(s.description || ''),
            sort_order: Number(s.sort_order || 0),
            visible: s.visible ? 1 : 0,
          };
          const diffs = prev ? diffService(prev, next) : null;
          const beforeSlice = prev
            ? { title: prev.title, description: prev.description }
            : null;
          const afterSlice = { title: next.title, description: next.description };
          const translatedChanged = hasTranslatedDiff('service', beforeSlice, afterSlice);
          if (!prev || hasDiffs(diffs)) {
            serviceChanges.push({
              id,
              diffs: diffs || {
                title: { before: null, after: next.title },
                description: { before: null, after: next.description },
              },
              prev,
              next,
              beforeSlice,
              afterSlice,
              translatedChanged,
              expected: expectedMap[`service:${id}`] ?? null,
            });
          }
        }
      }

      const writeStatements = [];
      if (body.content && typeof body.content === 'object') {
        for (const [key, value] of Object.entries(body.content)) {
          writeStatements.push(
            db
              .prepare(
                `INSERT INTO site_content (key, locale, value) VALUES (?, ?, ?)
                 ON CONFLICT(key, locale) DO UPDATE SET value = excluded.value`
              )
              .bind(key, locale, String(value ?? ''))
          );
        }
      }
      for (const change of serviceChanges) {
        writeStatements.push(
          db
            .prepare(`UPDATE services SET sort_order = ?, visible = ? WHERE id = ?`)
            .bind(change.next.sort_order, change.next.visible, change.id)
        );
        writeStatements.push(
          db
            .prepare(
              `INSERT INTO service_translations (service_id, locale, title, description)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(service_id, locale) DO UPDATE SET
                 title = excluded.title, description = excluded.description`
            )
            .bind(change.id, locale, change.next.title, change.next.description)
        );
      }

      try {
        if (locale === sourceLocale) {
          // Optimistic locking: CAS revision/status first, then draft write.
          // Stale expected → 409 with draftSaved:false (no content overwrite).
          const sourceBumps = [
            ...contentTouches.map((touch) => ({
              entityType: 'site_content',
              entityId: touch.key,
              before: touch.before,
              after: touch.after,
              expectedRevision: touch.expected,
            })),
            ...serviceChanges
              .filter((c) => c.translatedChanged)
              .map((change) => ({
                entityType: 'service',
                entityId: change.id,
                before: change.beforeSlice,
                after: change.afterSlice,
                expectedRevision: change.expected,
              })),
          ];
          await commitDraftWritesWithSourceBumps(db, {
            writeStatements,
            sourceBumps,
            actorUserId: user.id,
          });
          for (const change of serviceChanges) {
            if (!change.translatedChanged) {
              await ensureTranslationStatusRows(db, 'service', change.id, {
                hasTranslation: { [locale]: true },
                sourceHasContent: true,
              });
            }
          }
        } else {
          if (writeStatements.length) await db.batch(writeStatements);
          for (const touch of contentTouches) {
            await markTranslationCurrent(db, {
              entityType: 'site_content',
              entityId: touch.key,
              locale,
              expectedSourceRevision: touch.expected,
              actorUserId: user.id,
            });
          }
          for (const change of serviceChanges) {
            if (change.translatedChanged) {
              await markTranslationCurrent(db, {
                entityType: 'service',
                entityId: change.id,
                locale,
                expectedSourceRevision: change.expected,
                actorUserId: user.id,
              });
            }
          }
        }
      } catch (err) {
        if (err.status === 409) {
          // Source path asserts before write → draftSaved false.
          // Translation mark-current after write → draftSaved true.
          const draftSaved = locale !== sourceLocale;
          return json(
            {
              ok: false,
              draftSaved,
              conflict: true,
              code: err.code || (draftSaved ? 'TRANSLATION_STALE_SOURCE' : 'SOURCE_REVISION_CONFLICT'),
              error: err.message,
              currentRevision: err.currentRevision ?? null,
              needingAttention: isMultilingual()
                ? await listNeedingAttention(db, { limit: 30 })
                : [],
            },
            409
          );
        }
        throw err;
      }

      if (body.content && typeof body.content === 'object') {
        const proposed = {};
        for (const [key, value] of Object.entries(body.content)) {
          proposed[key] = String(value ?? '');
        }
        const contentDiffs = diffContentMap(beforeContent, { ...beforeContent, ...proposed });
        if (hasDiffs(contentDiffs)) {
          const changedKeys = Object.keys(contentDiffs);
          await logAudit(db, {
            actorUserId: user.id,
            action: 'content.update',
            entityType: 'content',
            entityId: null,
            locale,
            summary: `עודכנו ${changedKeys.length} שדות תוכן`,
            details: { fields: contentDiffs, locale },
          });
        }
      }

      for (const change of serviceChanges) {
        const changedFields = Object.keys(change.diffs);
        await logAudit(db, {
          actorUserId: user.id,
          action: 'service.update',
          entityType: 'service',
          entityId: change.id,
          locale,
          summary: `שירות #${change.id} עודכן`,
          details: { fields: change.diffs, changedFields, locale },
        });
      }

      return json({
        ok: true,
        draftSaved: true,
        needingAttention: isMultilingual() ? await listNeedingAttention(db, { limit: 30 }) : [],
      });
    }

    if (route === 'admin/services' && method === 'POST') {
      requireCsrf(request);
      const countRow = await db.prepare('SELECT COUNT(*) AS c FROM services').first();
      if ((countRow?.c || 0) >= MAX_SERVICES) {
        return badRequest(`ניתן להוסיף עד ${MAX_SERVICES} שירותים`);
      }
      const body = await readJson(request);
      const locale = requestLocale(request, body);
      const max = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM services').first();
      const title = String(body?.title || (locale === 'en' ? 'New service' : 'שירות חדש'));
      const description = String(body?.description || '');
      const sortOrder = (max?.m || 0) + 1;
      const result = await db
        .prepare(`INSERT INTO services (sort_order, visible) VALUES (?, ?)`)
        .bind(sortOrder, 1)
        .run();
      const id = result.meta.last_row_id;
      await db
        .prepare(
          `INSERT INTO service_translations (service_id, locale, title, description)
           VALUES (?, ?, ?, ?)`
        )
        .bind(id, locale, title, description)
        .run();
      const hasTranslation = { [locale]: true };
      await ensureTranslationStatusRows(db, 'service', id, {
        hasTranslation,
        sourceHasContent: locale === getDefaultLocale(),
        markCurrent: true,
      });
      if (locale === getDefaultLocale()) {
        // Source create: other locales stay missing (ensure created them).
      } else {
        try {
          await markTranslationCurrent(db, {
            entityType: 'service',
            entityId: id,
            locale,
            expectedSourceRevision: (await getSourceRevision(db, 'service', id)) || 1,
            actorUserId: user.id,
          });
        } catch {
          // stale mark is non-fatal on create
        }
      }
      await logAudit(db, {
        actorUserId: user.id,
        action: 'service.create',
        entityType: 'service',
        entityId: id,
        locale,
        summary: `שירות חדש נוצר (#${id})`,
        details: serviceRowForAudit({ title, description, sort_order: sortOrder, visible: 1 }),
      });
      return json({ ok: true, draftSaved: true, id });
    }

    if (parts[0] === 'admin' && parts[1] === 'services' && parts[2] && method === 'DELETE') {
      requireCsrf(request);
      const id = Number(parts[2]);
      if (!id) return badRequest('מזהה לא תקין');
      const locale = requestLocale(request);
      const countRow = await db.prepare('SELECT COUNT(*) AS c FROM services').first();
      if ((countRow?.c || 0) <= 1) {
        return badRequest('חייבים להשאיר לפחות שירות אחד');
      }
      const services = await getServices(db, { locale });
      const existing = services.find((s) => Number(s.id) === id) || null;
      await db.prepare('DELETE FROM services WHERE id = ?').bind(id).run();
      await deleteTranslationTracking(db, 'service', id);
      await logAudit(db, {
        actorUserId: user.id,
        action: 'service.delete',
        entityType: 'service',
        entityId: id,
        locale,
        summary: `שירות #${id} נמחק`,
        details: { before: serviceRowForAudit(existing) },
      });
      return json({ ok: true, draftSaved: true });
    }

    if (route === 'admin/portfolio' && method === 'GET') {
      const locale = requestLocale(request);
      const items = await getPortfolio(db, { locale });
      const sourceRevisions = {};
      if (isMultilingual()) {
        const portfolioRevs = await getSourceRevisionsMap(db, 'portfolio_item');
        for (const item of items) {
          sourceRevisions[`portfolio_item:${item.id}`] =
            portfolioRevs[String(item.id)] || 1;
        }
      }
      return json({
        locale,
        items,
        categories: portfolioCategoriesForLocale(locale),
        sourceRevisions,
      });
    }

    if (route === 'admin/portfolio' && method === 'POST') {
      requireCsrf(request);
      const body = await readJson(request);
      if (!body) return badRequest('גוף בקשה לא תקין');
      const locale = requestLocale(request, body);
      const { category, categories } = categoriesToDb(body.categories || body.category, locale);
      const mediaType = body.media_type === 'video' ? 'video' : 'image';
      const max = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM portfolio_items').first();
      const sortOrder = (max?.m || 0) + 1;
      const row = {
        title: String(body.title || ''),
        category,
        categories,
        media_type: mediaType,
        media_url: String(body.media_url || ''),
        cover_url: String(body.cover_url || ''),
        alt_text: String(body.alt_text || ''),
        sort_order: sortOrder,
        visible: body.visible === false ? 0 : 1,
        featured: body.featured ? 1 : 0,
      };
      const result = await db
        .prepare(
          `INSERT INTO portfolio_items
            (media_type, media_url, cover_url, sort_order, visible, featured)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.media_type,
          row.media_url,
          row.cover_url,
          row.sort_order,
          row.visible,
          row.featured
        )
        .run();
      const id = result.meta.last_row_id;
      await db
        .prepare(
          `INSERT INTO portfolio_item_translations
            (portfolio_item_id, locale, title, category, categories, alt_text)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(id, locale, row.title, row.category, row.categories, row.alt_text)
        .run();
      await ensureTranslationStatusRows(db, 'portfolio_item', id, {
        hasTranslation: { [locale]: true },
        sourceHasContent: locale === getDefaultLocale(),
        markCurrent: true,
      });
      if (locale !== getDefaultLocale()) {
        try {
          await markTranslationCurrent(db, {
            entityType: 'portfolio_item',
            entityId: id,
            locale,
            expectedSourceRevision: (await getSourceRevision(db, 'portfolio_item', id)) || 1,
            actorUserId: user.id,
          });
        } catch {
          // non-fatal on create
        }
      }
      await logAudit(db, {
        actorUserId: user.id,
        action: 'portfolio.create',
        entityType: 'portfolio',
        entityId: id,
        locale,
        summary: `פריט תיק עבודות נוצר (#${id})`,
        details: {
          after: portfolioRowForAudit(row),
          mediaLinked: !!(row.media_url || row.cover_url),
        },
      });
      return json({ ok: true, draftSaved: true, id });
    }

    if (route === 'admin/portfolio/reorder' && method === 'PUT') {
      requireCsrf(request);
      const body = await readJson(request);
      if (!Array.isArray(body?.ids)) return badRequest('רשימת מזהים חסרה');
      const ids = body.ids.map((id) => Number(id)).filter(Boolean);
      const stmts = ids.map((id, index) =>
        db.prepare('UPDATE portfolio_items SET sort_order = ? WHERE id = ?').bind(index + 1, id)
      );
      if (stmts.length) await db.batch(stmts);
      await logAudit(db, {
        actorUserId: user.id,
        action: 'portfolio.reorder',
        entityType: 'portfolio',
        entityId: null,
        summary: 'סדר תיק העבודות עודכן',
        details: { ids },
      });
      return json({ ok: true, draftSaved: true });
    }

    if (parts[0] === 'admin' && parts[1] === 'portfolio' && parts[2] && method === 'PUT') {
      requireCsrf(request);
      const id = Number(parts[2]);
      if (!id) return badRequest('מזהה לא תקין');
      const body = await readJson(request);
      if (!body) return badRequest('גוף בקשה לא תקין');
      const locale = requestLocale(request, body);
      const items = await getPortfolio(db, { locale });
      const existing = items.find((p) => Number(p.id) === id) || null;
      if (!existing) return badRequest('פריט לא נמצא', 404);
      const { category, categories } = categoriesToDb(body.categories || body.category, locale);
      const mediaType = body.media_type === 'video' ? 'video' : 'image';
      const next = {
        title: String(body.title || ''),
        category,
        categories,
        media_type: mediaType,
        media_url: String(body.media_url || ''),
        cover_url: String(body.cover_url || ''),
        alt_text: String(body.alt_text || ''),
        sort_order: Number(body.sort_order || 0),
        visible: body.visible ? 1 : 0,
        featured: body.featured ? 1 : 0,
      };
      const fields = diffPortfolio(existing, next);
      const beforeSlice = existing
        ? {
            title: existing.title,
            category: existing.category,
            categories:
              typeof existing.categories === 'string'
                ? existing.categories
                : JSON.stringify(existing.categories || []),
            alt_text: existing.alt_text,
          }
        : null;
      const afterSlice = {
        title: next.title,
        category: next.category,
        categories: next.categories,
        alt_text: next.alt_text,
      };
      const expectedMap =
        body.expectedSourceRevisions && typeof body.expectedSourceRevisions === 'object'
          ? body.expectedSourceRevisions
          : {};
      const expected =
        expectedMap[`portfolio_item:${id}`] ?? body.expectedSourceRevision ?? null;
      const translatedChanged = hasTranslatedDiff('portfolio_item', beforeSlice, afterSlice);

      const writeStatements = [
        db
          .prepare(
            `UPDATE portfolio_items SET
              media_type = ?, media_url = ?, cover_url = ?,
              sort_order = ?, visible = ?, featured = ?
             WHERE id = ?`
          )
          .bind(
            next.media_type,
            next.media_url,
            next.cover_url,
            next.sort_order,
            next.visible,
            next.featured,
            id
          ),
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
          .bind(id, locale, next.title, next.category, next.categories, next.alt_text),
      ];

      try {
        if (locale === getDefaultLocale()) {
          await commitDraftWritesWithSourceBumps(db, {
            writeStatements,
            sourceBumps: translatedChanged
              ? [
                  {
                    entityType: 'portfolio_item',
                    entityId: id,
                    before: beforeSlice,
                    after: afterSlice,
                    expectedRevision: expected,
                  },
                ]
              : [],
            actorUserId: user.id,
          });
        } else {
          await db.batch(writeStatements);
          if (translatedChanged) {
            await markTranslationCurrent(db, {
              entityType: 'portfolio_item',
              entityId: id,
              locale,
              expectedSourceRevision: expected,
              actorUserId: user.id,
            });
          }
        }
      } catch (err) {
        if (err.status === 409) {
          const draftSaved = locale !== getDefaultLocale();
          return json(
            {
              ok: false,
              draftSaved,
              conflict: true,
              code: err.code || (draftSaved ? 'TRANSLATION_STALE_SOURCE' : 'SOURCE_REVISION_CONFLICT'),
              error: err.message,
              currentRevision: err.currentRevision ?? null,
            },
            409
          );
        }
        throw err;
      }

      // Media deletion only after draft write succeeded (avoids orphaning on 409).
      const deletedMedia = [];
      if (env.MEDIA && existing) {
        if (existing.media_url && existing.media_url !== next.media_url && existing.media_url !== next.cover_url) {
          await deleteMediaUrl(env.MEDIA, existing.media_url);
          deletedMedia.push(existing.media_url);
          await auditMediaDelete(db, user.id, existing.media_url, `portfolio.update:${id}`);
        }
        if (
          existing.cover_url &&
          existing.cover_url !== next.cover_url &&
          existing.cover_url !== next.media_url &&
          existing.cover_url !== existing.media_url
        ) {
          await deleteMediaUrl(env.MEDIA, existing.cover_url);
          deletedMedia.push(existing.cover_url);
          await auditMediaDelete(db, user.id, existing.cover_url, `portfolio.update:${id}`);
        }
      }

      if (hasDiffs(fields)) {
        await logAudit(db, {
          actorUserId: user.id,
          action: 'portfolio.update',
          entityType: 'portfolio',
          entityId: id,
          locale,
          summary: `פריט תיק עבודות #${id} עודכן`,
          details: {
            fields,
            changedFields: Object.keys(fields),
            mediaLinked: !!(fields.media_url || fields.cover_url),
            mediaDeleted: deletedMedia,
          },
        });
      }
      return json({
        ok: true,
        draftSaved: true,
        needingAttention: isMultilingual() ? await listNeedingAttention(db, { limit: 30 }) : [],
      });
    }

    if (parts[0] === 'admin' && parts[1] === 'portfolio' && parts[2] && method === 'DELETE') {
      requireCsrf(request);
      const id = Number(parts[2]);
      if (!id) return badRequest('מזהה לא תקין');
      const locale = requestLocale(request);
      const items = await getPortfolio(db, { locale });
      const existing = items.find((p) => Number(p.id) === id) || null;
      await db.prepare('DELETE FROM portfolio_items WHERE id = ?').bind(id).run();
      await deleteTranslationTracking(db, 'portfolio_item', id);
      if (env.MEDIA && existing) {
        await deletePortfolioMedia(env.MEDIA, existing);
        if (existing.media_url) {
          await auditMediaDelete(db, user.id, existing.media_url, `portfolio.delete:${id}`);
        }
        if (existing.cover_url && existing.cover_url !== existing.media_url) {
          await auditMediaDelete(db, user.id, existing.cover_url, `portfolio.delete:${id}`);
        }
      }
      await logAudit(db, {
        actorUserId: user.id,
        action: 'portfolio.delete',
        entityType: 'portfolio',
        entityId: id,
        locale,
        summary: `פריט תיק עבודות #${id} נמחק`,
        details: { before: portfolioRowForAudit(existing) },
      });
      return json({ ok: true, draftSaved: true });
    }

    return badRequest('לא נמצא', 404);
  } catch (err) {
    if (err?.status === 403 && err.message === 'בקשה לא מורשית') {
      return badRequest(err.message, 403);
    }
    console.error(err);
    return badRequest(err.message || 'שגיאת שרת', err.status || 500);
  }
}
