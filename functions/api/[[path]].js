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
import { PORTFOLIO_CATEGORIES, categoriesToDb } from '../_shared/categories.js';
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

const MAX_SERVICES = 10;
const PREVIEW_ROBOTS = { 'X-Robots-Tag': 'noindex, nofollow, noarchive' };

function siteOrigin(request) {
  return resolveSiteOrigin(request);
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
  const db = env.DB;
  if (!db) return badRequest('Database binding missing', 500);

  const url = new URL(request.url);
  const parts = (context.params.path || []).filter(Boolean);
  const method = request.method.toUpperCase();
  const route = parts.join('/');

  try {
    if (route === 'public/site' && method === 'GET') {
      const origin = siteOrigin(request);
      await ensurePublishedBaseline(db, origin);
      const published = await getPublishedPayload(db);
      if (!published) return badRequest('אין גרסה מפורסמת', 503);
      const { meta, jsonLd, versionId, publishedAt, ...payload } = published;
      // Rebuild schema with canonical host so pages.dev never leaks to crawlers.
      const liveJsonLd = buildJsonLd(payload, origin) || jsonLd || '';
      return json({
        ...payload,
        meta: meta || {},
        jsonLd: liveJsonLd,
        versionId,
        publishedAt,
      });
    }

    if (route === 'preview/site' && method === 'GET') {
      const token = url.searchParams.get('token') || '';
      const sessionUser = await requireUser(db, request);
      if (token) {
        const tokenRow = await validatePreviewToken(db, token);
        if (!tokenRow) {
          return json({ error: 'טוקן תצוגה מקדימה לא תקין או שפג תוקפו' }, 401, PREVIEW_ROBOTS);
        }
      } else if (!sessionUser) {
        return json({ error: 'אין הרשאה לתצוגה מקדימה' }, 401, PREVIEW_ROBOTS);
      }
      const payload = await getDraftPublicPayload(db);
      const origin = siteOrigin(request);
      const meta = buildMeta(payload);
      const jsonLd = buildJsonLd(payload, origin);
      return json(
        {
          ...payload,
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
      const token = await createSession(db, user.id);
      // Seed demo password - never leave this on a live site after remote seed.
      const mustChangePassword = String(body.password) === 'ChangeMe123!';
      await logAudit(db, {
        actorUserId: user.id,
        action: 'auth.login',
        entityType: 'auth',
        entityId: user.id,
        summary: 'התחברות הצליחה',
        details: { email: user.email },
      });
      return json(
        { ok: true, email: user.email, mustChangePassword },
        200,
        { 'Set-Cookie': sessionCookie(token, request) }
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

    if (route === 'admin/publish/status' && method === 'GET') {
      await ensurePublishedBaseline(db, siteOrigin(request), user.id);
      return json(await getPublishStatus(db));
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
      const { token, expiresAt } = await createPreviewToken(db, user.id);
      await logAudit(db, {
        actorUserId: user.id,
        action: 'preview.create',
        entityType: 'preview',
        entityId: null,
        summary: 'נוצר טוקן תצוגה מקדימה',
        details: { expiresAt },
      });
      return json({
        token,
        expiresAt,
        previewUrl: `/?preview=${encodeURIComponent(token)}`,
      });
    }

    if (route === 'admin/publish' && method === 'POST') {
      requireCsrf(request);
      const body = await readJson(request);
      const forceFail = !!(body?.forceFail && isLocalHost(request));
      try {
        const result = await publishFromDraft({
          db,
          userId: user.id,
          siteOrigin: siteOrigin(request),
          forceFail,
        });
        await logAudit(db, {
          actorUserId: user.id,
          action: 'publish.succeeded',
          entityType: 'version',
          entityId: result.versionId,
          summary: 'פרסום הצליח',
          details: {
            versionId: result.versionId,
            previousVersionId: result.previousVersionId ?? null,
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
          summary: 'פרסום נכשל',
          details: {
            error: String(err.message || 'פרסום נכשל').slice(0, 500),
            versionId: err.versionId || null,
            conflict: status === 409,
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
      try {
        const result = await rollbackToPrevious(db, user.id, siteOrigin(request));
        await logAudit(db, {
          actorUserId: user.id,
          action: 'rollback.succeeded',
          entityType: 'version',
          entityId: result.versionId,
          summary: 'שחזור לגרסה קודמת הצליח',
          details: {
            versionId: result.versionId,
            previousVersionId: result.previousVersionId ?? null,
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
          summary: 'שחזור לגרסה קודמת נכשל',
          details: {
            error: String(err.message || 'שחזור נכשל').slice(0, 500),
            versionId: err.versionId || null,
            conflict: status === 409,
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
      return json({
        content: await getContentMap(db),
        services: await getServices(db),
      });
    }

    if (route === 'admin/content' && method === 'PUT') {
      requireCsrf(request);
      const body = await readJson(request);
      if (!body || typeof body !== 'object') return badRequest('גוף בקשה לא תקין');

      const beforeContent = await getContentMap(db);
      const beforeServices = await getServices(db);
      const beforeById = new Map(beforeServices.map((s) => [Number(s.id), s]));

      if (body.content && typeof body.content === 'object') {
        const stmts = Object.entries(body.content).map(([key, value]) =>
          db
            .prepare(
              `INSERT INTO site_content (key, value) VALUES (?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value`
            )
            .bind(key, String(value ?? ''))
        );
        if (stmts.length) await db.batch(stmts);
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
          await db
            .prepare(
              `UPDATE services
               SET title = ?, description = ?, sort_order = ?, visible = ?
               WHERE id = ?`
            )
            .bind(next.title, next.description, next.sort_order, next.visible, id)
            .run();
          if (hasDiffs(diffs)) {
            serviceChanges.push({ id, diffs });
          }
        }
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
            summary: `עודכנו ${changedKeys.length} שדות תוכן`,
            details: { fields: contentDiffs },
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
          summary: `שירות #${change.id} עודכן`,
          details: { fields: change.diffs, changedFields },
        });
      }

      return json({ ok: true, draftSaved: true });
    }

    if (route === 'admin/services' && method === 'POST') {
      requireCsrf(request);
      const countRow = await db.prepare('SELECT COUNT(*) AS c FROM services').first();
      if ((countRow?.c || 0) >= MAX_SERVICES) {
        return badRequest(`ניתן להוסיף עד ${MAX_SERVICES} שירותים`);
      }
      const body = await readJson(request);
      const max = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM services').first();
      const title = String(body?.title || 'שירות חדש');
      const description = String(body?.description || '');
      const sortOrder = (max?.m || 0) + 1;
      const result = await db
        .prepare(
          `INSERT INTO services (title, description, sort_order, visible)
           VALUES (?, ?, ?, ?)`
        )
        .bind(title, description, sortOrder, 1)
        .run();
      const id = result.meta.last_row_id;
      await logAudit(db, {
        actorUserId: user.id,
        action: 'service.create',
        entityType: 'service',
        entityId: id,
        summary: `שירות חדש נוצר (#${id})`,
        details: serviceRowForAudit({ title, description, sort_order: sortOrder, visible: 1 }),
      });
      return json({ ok: true, draftSaved: true, id });
    }

    if (parts[0] === 'admin' && parts[1] === 'services' && parts[2] && method === 'DELETE') {
      requireCsrf(request);
      const id = Number(parts[2]);
      if (!id) return badRequest('מזהה לא תקין');
      const countRow = await db.prepare('SELECT COUNT(*) AS c FROM services').first();
      if ((countRow?.c || 0) <= 1) {
        return badRequest('חייבים להשאיר לפחות שירות אחד');
      }
      const existing = await db.prepare('SELECT * FROM services WHERE id = ?').bind(id).first();
      await db.prepare('DELETE FROM services WHERE id = ?').bind(id).run();
      await logAudit(db, {
        actorUserId: user.id,
        action: 'service.delete',
        entityType: 'service',
        entityId: id,
        summary: `שירות #${id} נמחק`,
        details: { before: serviceRowForAudit(existing) },
      });
      return json({ ok: true, draftSaved: true });
    }

    if (route === 'admin/portfolio' && method === 'GET') {
      return json({
        items: await getPortfolio(db),
        categories: PORTFOLIO_CATEGORIES,
      });
    }

    if (route === 'admin/portfolio' && method === 'POST') {
      requireCsrf(request);
      const body = await readJson(request);
      if (!body) return badRequest('גוף בקשה לא תקין');
      const { category, categories } = categoriesToDb(body.categories || body.category);
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
            (title, category, categories, media_type, media_url, cover_url, alt_text, sort_order, visible, featured)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.title,
          row.category,
          row.categories,
          row.media_type,
          row.media_url,
          row.cover_url,
          row.alt_text,
          row.sort_order,
          row.visible,
          row.featured
        )
        .run();
      const id = result.meta.last_row_id;
      await logAudit(db, {
        actorUserId: user.id,
        action: 'portfolio.create',
        entityType: 'portfolio',
        entityId: id,
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
      const existing = await db.prepare('SELECT * FROM portfolio_items WHERE id = ?').bind(id).first();
      if (!existing) return badRequest('פריט לא נמצא', 404);
      const { category, categories } = categoriesToDb(body.categories || body.category);
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
      await db
        .prepare(
          `UPDATE portfolio_items SET
            title = ?, category = ?, categories = ?, media_type = ?, media_url = ?, cover_url = ?,
            alt_text = ?, sort_order = ?, visible = ?, featured = ?
           WHERE id = ?`
        )
        .bind(
          next.title,
          next.category,
          next.categories,
          next.media_type,
          next.media_url,
          next.cover_url,
          next.alt_text,
          next.sort_order,
          next.visible,
          next.featured,
          id
        )
        .run();

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

      const fields = diffPortfolio(existing, next);
      if (hasDiffs(fields)) {
        await logAudit(db, {
          actorUserId: user.id,
          action: 'portfolio.update',
          entityType: 'portfolio',
          entityId: id,
          summary: `פריט תיק עבודות #${id} עודכן`,
          details: {
            fields,
            changedFields: Object.keys(fields),
            mediaLinked: !!(fields.media_url || fields.cover_url),
            mediaDeleted: deletedMedia,
          },
        });
      }
      return json({ ok: true, draftSaved: true });
    }

    if (parts[0] === 'admin' && parts[1] === 'portfolio' && parts[2] && method === 'DELETE') {
      requireCsrf(request);
      const id = Number(parts[2]);
      if (!id) return badRequest('מזהה לא תקין');
      const existing = await db.prepare('SELECT * FROM portfolio_items WHERE id = ?').bind(id).first();
      await db.prepare('DELETE FROM portfolio_items WHERE id = ?').bind(id).run();
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
