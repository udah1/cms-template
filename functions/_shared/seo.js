function escapeXml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** Canonical public paths included in the sitemap (trailing slash). */
export const PUBLIC_PATHS = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/services/', priority: '0.9', changefreq: 'weekly' },
  { path: '/portfolio/', priority: '0.8', changefreq: 'weekly' },
  { path: '/about/', priority: '0.8', changefreq: 'monthly' },
  { path: '/faq/', priority: '0.7', changefreq: 'monthly' },
];

/** Override after you attach a custom domain. Empty = derive from the request. */
export const CANONICAL_ORIGIN = '';

/**
 * Prefer a configured public origin when set.
 * Localhost keeps request origin; *.pages.dev is allowed until a custom domain is configured.
 */
export function resolveSiteOrigin(requestOrOrigin) {
  if (CANONICAL_ORIGIN) return CANONICAL_ORIGIN.replace(/\/$/, '');
  const raw =
    typeof requestOrOrigin === 'string'
      ? requestOrOrigin
      : requestOrOrigin?.url
        ? new URL(requestOrOrigin.url).origin
        : 'http://127.0.0.1:8788';
  try {
    return new URL(raw).origin.replace(/\/$/, '');
  } catch {
    return 'http://127.0.0.1:8788';
  }
}

export function buildMeta(payload) {
  const content = payload?.content || {};
  const area = content.area_label || '';
  const business = content.business_name || 'שם העסק';
  const title =
    content.seo_title ||
    [content.hero_title, content.hero_title_em].filter(Boolean).join(' ').trim() ||
    business;
  const description =
    content.seo_description ||
    content.hero_description ||
    content.portfolio_lead ||
    'תיאור כללי של העסק.';
  return {
    title: String(title).replace(/\s+/g, ' ').trim().slice(0, 120),
    description: String(description).replace(/\s+/g, ' ').trim().slice(0, 300),
    area,
    ogImage: content.og_image || '/assets/brand-logo.png',
  };
}

export function buildJsonLd(payload, siteOrigin) {
  const content = payload?.content || {};
  const meta = buildMeta(payload);
  const origin = resolveSiteOrigin(siteOrigin || CANONICAL_ORIGIN || 'http://127.0.0.1:8788');
  const phone = content.contact_phone || '050-000-0000';
  const email = content.contact_email || 'hello@example.com';
  const instagram = content.instagram_url || '';
  const area = content.area_label || '';
  const business = content.business_name || 'שם העסק';
  const logo = `${origin}${meta.ogImage.startsWith('/') ? meta.ogImage : `/${meta.ogImage}`}`;

  const businessId = `${origin}/#business`;
  const websiteId = `${origin}/#website`;

  const sameAs = instagram ? [instagram] : [];

  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': businessId,
        name: business,
        description: meta.description,
        url: origin,
        image: logo,
        email,
        telephone: phone,
        areaServed: area || undefined,
        sameAs: sameAs.length ? sameAs : undefined,
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: business,
        url: origin,
        inLanguage: payload?.locale || 'he',
        publisher: { '@id': businessId },
      },
    ],
  };
  return JSON.stringify(data);
}

export function buildSitemapXml(siteOrigin) {
  const origin = resolveSiteOrigin(siteOrigin || CANONICAL_ORIGIN || 'http://127.0.0.1:8788');
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = PUBLIC_PATHS.map(
    ({ path, priority, changefreq }) => `  <url>
    <loc>${escapeXml(origin)}${escapeXml(path === '/' ? '/' : path)}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
    <changefreq>${escapeXml(changefreq)}</changefreq>
    <priority>${escapeXml(priority)}</priority>
  </url>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function buildSeoArtifacts(payload, siteOrigin) {
  const meta = buildMeta(payload);
  return {
    meta,
    meta_json: JSON.stringify(meta),
    json_ld: buildJsonLd(payload, siteOrigin),
    sitemap_xml: buildSitemapXml(siteOrigin),
  };
}
