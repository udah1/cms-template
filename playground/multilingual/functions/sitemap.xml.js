import { ensurePublishedBaseline } from './_shared/publish.js';
import { buildSitemapXml, resolveSiteOrigin } from './_shared/seo.js';

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  if (!db) {
    return new Response('Database binding missing', { status: 500 });
  }

  // Always emit canonical host URLs - never serve a stored pages.dev sitemap.
  const origin = resolveSiteOrigin(request);
  await ensurePublishedBaseline(db, origin);
  const xml = buildSitemapXml(origin);

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
