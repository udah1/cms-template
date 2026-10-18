import { getPublishedPayload } from './_shared/content.js';
import {
  filterAllowedSearchParams,
  getDefaultLocale,
  getLocales,
  isLocaleContentComplete,
  isMultilingual,
} from './_shared/i18n.js';
import {
  ensurePublishedBaseline,
  getDraftPublicPayload,
  validatePreviewToken,
} from './_shared/publish.js';
import { buildJsonLd, buildMeta, resolveSiteOrigin } from './_shared/seo.js';
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

async function matchAnyFallback(origin, path, locale) {
  const key = fallbackCacheKey(origin, path, locale);
  return readCache(new Request(key));
}

async function storeFallback(origin, path, html, locale) {
  const key = fallbackCacheKey(origin, path, locale);
  const res = htmlResponse(html, { cacheControl: 'public, max-age=300' });
  await writeCache(new Request(key), res);
}

async function localesWithPublishedContent(db, origin) {
  const available = new Set();
  for (const locale of getLocales()) {
    try {
      await ensurePublishedBaseline(db, origin, null, locale);
      const published = await getPublishedPayload(db, locale);
      if (published && isLocaleContentComplete(published.content)) {
        available.add(locale);
      }
    } catch {
      // skip
    }
  }
  return available;
}

async function renderNotFoundPage(request, env, locale = getDefaultLocale()) {
  const origin = resolveSiteOrigin(request);
  let template;
  try {
    template = await loadTemplate(env, '/404.html', request.url);
  } catch {
    return new Response('Not Found', { status: 404 });
  }

  try {
    await ensurePublishedBaseline(env.DB, origin, null, locale);
    const published = await getPublishedPayload(env.DB, locale);
    if (!published) throw new Error('no published payload');

    const availableLocales = await localesWithPublishedContent(env.DB, origin);
    const { meta, jsonLd: _jsonLd, versionId: _v, publishedAt: _p, ...payload } = published;
    const html = renderHtml(
      template,
      {
        ...payload,
        meta: meta || buildMeta(payload),
        jsonLd: '',
      },
      { origin, pagePath: '/404', preview: false, locale, availableLocales }
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
  const url = new URL(request.url);

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return next();
  }

  const { path, locale, redirectTo, invalidLocale } = resolveSsrPath(url.pathname);

  if (invalidLocale) {
    return renderNotFoundPage(request, env, getDefaultLocale());
  }

  if (!path) {
    if (
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/media/') ||
      url.pathname.startsWith('/admin')
    ) {
      return next();
    }
    const passthrough = await next();
    if (passthrough.status !== 404) return passthrough;
    // Prefer locale from path prefix when present (e.g. /en/missing/)
    const pathLocale = locale || getDefaultLocale();
    return renderNotFoundPage(request, env, pathLocale);
  }

  if (redirectTo) {
    const dest = filterAllowedSearchParams(url);
    dest.pathname = redirectTo;
    return Response.redirect(dest.toString(), 308);
  }

  const assetPath = PUBLIC_SSR_PATHS[path];
  if (!assetPath) return next();

  const activeLocale = locale || getDefaultLocale();
  const origin = resolveSiteOrigin(request);
  const previewToken = url.searchParams.get('preview') || '';

  let template;
  try {
    template = await loadTemplate(env, assetPath, request.url);
  } catch {
    return next();
  }

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
      const draft = await getDraftPublicPayload(env.DB, activeLocale);
      const availableLocales = new Set(getLocales());
      const meta = buildMeta(draft);
      const jsonLd = path === '/faq/' ? '' : buildJsonLd(draft, origin);
      const html = renderHtml(
        template,
        { ...draft, meta, jsonLd },
        { origin, pagePath: path, preview: true, locale: activeLocale, availableLocales }
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

  try {
    await ensurePublishedBaseline(env.DB, origin, null, activeLocale);
    const published = await getPublishedPayload(env.DB, activeLocale);
    if (!published) {
      throw new Error('no published payload');
    }

    // Incomplete translation → 404 for that locale (no silent fallback).
    if (isMultilingual() && !isLocaleContentComplete(published.content)) {
      return renderNotFoundPage(request, env, activeLocale);
    }

    const availableLocales = await localesWithPublishedContent(env.DB, origin);
    const versionId = published.versionId;
    const versionCacheReq = new Request(cacheKey(origin, path, versionId, activeLocale));
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
      { origin, pagePath: path, preview: false, locale: activeLocale, availableLocales }
    );

    const response = htmlResponse(html);
    await writeCache(versionCacheReq, response);
    await storeFallback(origin, path, html, activeLocale);

    if (request.method === 'HEAD') {
      return htmlResponse('', {});
    }
    return response;
  } catch {
    const cachedFallback = await matchAnyFallback(origin, path, activeLocale);
    if (cachedFallback) {
      const body = await cachedFallback.text();
      return htmlResponse(body, { fallback: true });
    }
    const html = buildFallbackHtml(template);
    return htmlResponse(html, { fallback: true });
  }
}
