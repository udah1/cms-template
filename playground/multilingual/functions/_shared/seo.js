import { getDefaultLocale, getLocales, isMultilingual, localizePath } from './i18n.js';

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
        : 'http://127.0.0.1:3788';
  try {
    return new URL(raw).origin.replace(/\/$/, '');
  } catch {
    return 'http://127.0.0.1:3788';
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
  const origin = resolveSiteOrigin(siteOrigin || CANONICAL_ORIGIN || 'http://127.0.0.1:3788');
  const phone = content.contact_phone || '050-000-0000';
  const email = content.contact_email || 'hello@example.com';
  const instagram = String(content.instagram_url || '').trim();
  const area = content.area_label || '';
  const business = content.business_name || 'Business';
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

export function buildSitemapXml(siteOrigin, { locales } = {}) {
  const origin = resolveSiteOrigin(siteOrigin || CANONICAL_ORIGIN || 'http://127.0.0.1:3788');
  const lastmod = new Date().toISOString().slice(0, 10);
  const activeLocales = Array.isArray(locales) && locales.length ? locales : [getDefaultLocale()];
  const multilingual = isMultilingual() && activeLocales.length > 1;

  const entries = [];
  for (const { path, priority, changefreq } of PUBLIC_PATHS) {
    for (const locale of activeLocales) {
      const locPath = localizePath(path, locale);
      let block = `  <url>
    <loc>${escapeXml(origin)}${escapeXml(locPath)}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
    <changefreq>${escapeXml(changefreq)}</changefreq>
    <priority>${escapeXml(priority)}</priority>`;
      if (multilingual) {
        const alts = getLocales()
          .map(
            (loc) =>
              `    <xhtml:link rel="alternate" hreflang="${escapeXml(loc)}" href="${escapeXml(origin)}${escapeXml(localizePath(path, loc))}" />`
          )
          .join('\n');
        const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(origin)}${escapeXml(localizePath(path, getDefaultLocale()))}" />`;
        block += `\n${alts}\n${xDefault}`;
      }
      block += `\n  </url>`;
      entries.push(block);
    }
  }

  const ns = multilingual
    ? 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"'
    : 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset ${ns}>
${entries.join('\n')}
</urlset>
`;
}

export function buildSeoArtifacts(payload, siteOrigin) {
  const meta = buildMeta(payload);
  const locales = isMultilingual() ? getLocales() : [payload?.locale || getDefaultLocale()];
  return {
    meta,
    meta_json: JSON.stringify(meta),
    json_ld: buildJsonLd(payload, siteOrigin),
    sitemap_xml: buildSitemapXml(siteOrigin, { locales }),
  };
}
