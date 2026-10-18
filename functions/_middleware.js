import { getPublishedPayload } from './_shared/content.js';
import {
  ensurePublishedBaseline,
  getDraftPublicPayload,
  validatePreviewToken,
} from './_shared/publish.js';
import { buildJsonLd, buildMeta, resolveSiteOrigin } from './_shared/seo.js';
import { bindI18nRuntimeEnv } from './_shared/i18n.js';
import {
  PUBLIC_SSR_PATHS,
  buildFallbackHtml,
  cacheKey,
  fallbackCacheKey,
  loadTemplate,
  renderHtml,
  resolveSsrPath,
} from './_shared/ssr.js';

const PREVIEW_ROBOTS = 'noindex, nofollow, noarchive';
const HTML_TYPE = 'text/html; charset=utf-8';

function htmlResponse(body, { status = 200, preview = false, fallback = false, cacheControl } = {}) {
  const headers = {
    'Content-Type': HTML_TYPE,
  };
  if (preview) {
    headers['X-Robots-Tag'] = PREVIEW_ROBOTS;
    headers['Cache-Control'] = 'no-store';
  } else if (fallback) {
    headers['X-CMS-Fallback'] = '1';
    headers['Cache-Control'] = 'no-store';
  } else {
    headers['Cache-Control'] = cacheControl || 'public, max-age=60, s-maxage=300';
  }
  return new Response(body, { status, headers });
}

async function readCache(request) {
  try {
    if (typeof caches === 'undefined') return null;
    const cache = caches.default;
    if (!cache) return null;
    return cache.match(request);
  } catch {
    return null;
  }
}

async function writeCache(request, response) {
  try {
    if (typeof caches === 'undefined') return;
    const cache = caches.default;
    if (!cache) return;
    await cache.put(request, response.clone());
  } catch {
    // Cache API may be unavailable in some local runtimes.
  }
}

async function matchAnyFallback(origin, path) {
  const key = fallbackCacheKey(origin, path);
  return readCache(new Request(key));
}

async function storeFallback(origin, path, html) {
  const key = fallbackCacheKey(origin, path);
  const res = htmlResponse(html, { cacheControl: 'public, max-age=300' });
  await writeCache(new Request(key), res);
}

async function renderNotFoundPage(request, env) {
  const origin = resolveSiteOrigin(request);
  let template;
  try {
    template = await loadTemplate(env, '/404.html', request.url);
  } catch {
    return new Response('Not Found', { status: 404 });
  }

  try {
    await ensurePublishedBaseline(env.DB, origin);
    const published = await getPublishedPayload(env.DB);
    if (!published) throw new Error('no published payload');

    const { meta, jsonLd: _jsonLd, versionId: _v, publishedAt: _p, ...payload } = published;
    const html = renderHtml(
      template,
      {
        ...payload,
        meta: meta || buildMeta(payload),
        jsonLd: '',
      },
      { origin, pagePath: '/404', preview: false }
    );

    if (request.method === 'HEAD') {
      return htmlResponse('', { status: 404, cacheControl: 'no-store' });
    }
    return htmlResponse(html, { status: 404, cacheControl: 'no-store' });
  } catch {
    const html = buildFallbackHtml(template);
    return htmlResponse(html, { status: 404, fallback: true });
  }
}

export async function onRequest(context) {
  const { request, env, next } = context;
  bindI18nRuntimeEnv(env);
  const url = new URL(request.url);

  // Only intercept navigations / HTML page GETs for known public routes.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return next();
  }

  const { path, redirectTo } = resolveSsrPath(url.pathname);
  if (!path) {
    // Unknown public route: let the asset pipeline serve (incl. 404.html), then
    // re-render 404 with published CMS content so WhatsApp / business name stay live.
    if (
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/media/') ||
      url.pathname.startsWith('/admin')
    ) {
      return next();
    }
    const passthrough = await next();
    if (passthrough.status !== 404) return passthrough;
    return renderNotFoundPage(request, env);
  }

  if (redirectTo) {
    const dest = new URL(url.toString());
    dest.pathname = redirectTo;
    return Response.redirect(dest.toString(), 308);
  }

  const assetPath = PUBLIC_SSR_PATHS[path];
  if (!assetPath) return next();

  const origin = resolveSiteOrigin(request);
  const previewToken = url.searchParams.get('preview') || '';

  let template;
  try {
    template = await loadTemplate(env, assetPath, request.url);
  } catch {
    // If template load fails, fall through to static asset pipeline.
    return next();
  }

  // --- Preview: draft only with valid time-limited token ---
  if (previewToken) {
    try {
      const tokenRow = await validatePreviewToken(env.DB, previewToken);
      if (!tokenRow) {
        return new Response('טוקן תצוגה מקדימה לא תקין או שפג תוקפו', {
          status: 401,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Robots-Tag': PREVIEW_ROBOTS,
            'Cache-Control': 'no-store',
          },
        });
      }
      const draft = await getDraftPublicPayload(env.DB);
      const meta = buildMeta(draft);
      const jsonLd = path === '/faq/' ? '' : buildJsonLd(draft, origin);
      const html = renderHtml(
        template,
        { ...draft, meta, jsonLd },
        { origin, pagePath: path, preview: true }
      );
      if (request.method === 'HEAD') {
        return htmlResponse('', { preview: true });
      }
      return htmlResponse(html, { preview: true });
    } catch {
      const html = buildFallbackHtml(template);
      return htmlResponse(html, { preview: true, fallback: true });
    }
  }

  // --- Published SSR ---
  try {
    await ensurePublishedBaseline(env.DB, origin);
    const published = await getPublishedPayload(env.DB);
    if (!published) {
      throw new Error('no published payload');
    }

    const versionId = published.versionId;
    const locale = published.locale || 'he';
    const versionCacheReq = new Request(cacheKey(origin, path, versionId, locale));
    const cached = await readCache(versionCacheReq);
    if (cached) {
      return cached;
    }

    const { meta, jsonLd, versionId: _v, publishedAt: _p, ...payload } = published;
    const liveJsonLd = path === '/faq/' ? '' : buildJsonLd(payload, origin) || jsonLd || '';
    const html = renderHtml(
      template,
      {
        ...payload,
        meta: meta || buildMeta(payload),
        jsonLd: liveJsonLd,
      },
      { origin, pagePath: path, preview: false }
    );

    const response = htmlResponse(html);
    await writeCache(versionCacheReq, response);
    await storeFallback(origin, path, html);

    if (request.method === 'HEAD') {
      return htmlResponse('', {});
    }
    return response;
  } catch {
    const cachedFallback = await matchAnyFallback(origin, path);
    if (cachedFallback) {
      const body = await cachedFallback.text();
      return htmlResponse(body, { fallback: true });
    }
    const html = buildFallbackHtml(template);
    return htmlResponse(html, { fallback: true });
  }
}
