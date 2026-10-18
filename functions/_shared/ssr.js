import { buildJsonLd, buildMeta, resolveSiteOrigin } from './seo.js';

/** Public HTML routes → ASSETS template path. */
export const PUBLIC_SSR_PATHS = {
  '/': '/index.html',
  '/about/': '/about/index.html',
  '/services/': '/services/index.html',
  '/portfolio/': '/portfolio/index.html',
  '/faq/': '/faq/index.html',
};

const CONTENT_TEXT_KEYS = [
  'business_name',
  'hero_eyebrow',
  'hero_title',
  'hero_title_em',
  'hero_description',
  'brand_quote',
  'about_title',
  'about_title_em',
  'portfolio_lead',
  'contact_intro',
];

export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function escapeAttr(str) {
  return escapeHtml(str).replaceAll("'", '&#39;');
}

/**
 * Normalize request pathname to a trailing-slash SSR path, or null if not SSR.
 * Returns { path, redirectTo } when a slash redirect is needed.
 */
export function resolveSsrPath(pathname) {
  let path = pathname || '/';
  if (!path.startsWith('/')) path = `/${path}`;

  if (PUBLIC_SSR_PATHS[path]) return { path, redirectTo: null };

  // /about → /about/
  if (!path.endsWith('/') && PUBLIC_SSR_PATHS[`${path}/`]) {
    return { path: `${path}/`, redirectTo: `${path}/` };
  }

  return { path: null, redirectTo: null };
}

export async function loadTemplate(env, assetPath, requestUrl) {
  const assets = env?.ASSETS;
  if (!assets?.fetch) {
    throw new Error('ASSETS binding unavailable');
  }
  const url = new URL(assetPath, requestUrl);
  const res = await assets.fetch(new Request(url.toString(), { method: 'GET' }));
  if (!res.ok) {
    throw new Error(`template ${assetPath} returned ${res.status}`);
  }
  return res.text();
}

function replaceMetaContent(html, attrName, attrValue, content) {
  const re = new RegExp(
    `(<meta[^>]*\\s${attrName}=["']${escapeRegExp(attrValue)}["'][^>]*\\scontent=["'])([^"']*)(["'][^>]*>)`,
    'i'
  );
  if (re.test(html)) {
    return html.replace(re, `$1${escapeAttr(content)}$3`);
  }
  // content before name/property
  const re2 = new RegExp(
    `(<meta[^>]*\\scontent=["'])([^"']*)(["'][^>]*\\s${attrName}=["']${escapeRegExp(attrValue)}["'][^>]*>)`,
    'i'
  );
  if (re2.test(html)) {
    return html.replace(re2, `$1${escapeAttr(content)}$3`);
  }
  return html;
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function setTitle(html, title) {
  return html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function setCanonical(html, href) {
  const re = /(<link[^>]*\srel=["']canonical["'][^>]*\shref=["'])([^"']*)(["'][^>]*>)/i;
  if (re.test(html)) return html.replace(re, `$1${escapeAttr(href)}$3`);
  const re2 = /(<link[^>]*\shref=["'])([^"']*)(["'][^>]*\srel=["']canonical["'][^>]*>)/i;
  if (re2.test(html)) return html.replace(re2, `$1${escapeAttr(href)}$3`);
  return html;
}

function setJsonLd(html, jsonLd) {
  if (!jsonLd) return html;
  const re = /(<script\b[^>]*\bid=["']siteJsonLd["'][^>]*>)([\s\S]*?)(<\/script>)/i;
  if (re.test(html)) {
    return html.replace(re, `$1\n${jsonLd}\n    $3`);
  }
  return html;
}

function setDataContent(html, key, value) {
  if (value == null || value === '') return html;
  const re = new RegExp(
    `(<[a-zA-Z][^>]*\\sdata-content=["']${escapeRegExp(key)}["'][^>]*>)([\\s\\S]*?)(<\\/[a-zA-Z]+>)`,
    'g'
  );
  return html.replace(re, `$1${escapeHtml(value)}$3`);
}

function setDataContentHtml(html, key, value) {
  if (value == null) return html;
  const parts = String(value)
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const inner = parts.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  const re = new RegExp(
    `(<[a-zA-Z][^>]*\\sdata-content-html=["']${escapeRegExp(key)}["'][^>]*>)([\\s\\S]*?)(<\\/[a-zA-Z]+>)`,
    'i'
  );
  if (!re.test(html)) return html;
  return html.replace(re, `$1${inner}$3`);
}

function setDataAttrText(html, attr, value) {
  if (value == null || value === '') return html;
  const re = new RegExp(
    `(<[a-zA-Z][^>]*\\s${escapeRegExp(attr)}(?:=["'][^"']*["'])?[^>]*>)([\\s\\S]*?)(<\\/[a-zA-Z]+>)`,
    'g'
  );
  return html.replace(re, `$1${escapeHtml(value)}$3`);
}

function setElementInnerById(html, id, inner) {
  const re = new RegExp(
    `(<[a-zA-Z][^>]*\\sid=["']${escapeRegExp(id)}["'][^>]*>)([\\s\\S]*?)(<\\/[a-zA-Z]+>)`,
    'i'
  );
  if (!re.test(html)) return html;
  return html.replace(re, `$1${inner}$3`);
}

function servicesHtml(services, page) {
  if (!services?.length) {
    return '<p class="empty-note">השירותים יעודכנו בקרוב.</p>';
  }
  const heading = page === 'services' ? 'h2' : 'h3';
  return services
    .map(
      (s) => `
      <article class="service-item">
        <div>
          <${heading}>${escapeHtml(s.title)}</${heading}>
          <p>${escapeHtml(s.description)}</p>
        </div>
      </article>`
    )
    .join('');
}

function itemCategories(item) {
  if (Array.isArray(item.categories) && item.categories.length) return item.categories;
  if (item.category) return [item.category];
  return [];
}

function thumbUrl(item) {
  if (item.media_type === 'video') return item.cover_url || '';
  return item.media_url || '';
}

function portfolioCardHtml(item, index) {
  const tall = index % 4 === 0 ? ' tall' : '';
  const wide = index % 5 === 3 ? ' wide' : '';
  const cats = itemCategories(item);
  const isVideo = item.media_type === 'video';
  const label = isVideo ? 'VIDEO' : cats.join(' · ');
  const url = thumbUrl(item);
  const alt = escapeHtml(item.alt_text || item.title || 'עבודה');
  const media = url
    ? `<img src="${escapeAttr(url)}" alt="${alt}" loading="lazy" decoding="async" width="800" height="1000" />`
    : '';
  const play = isVideo ? '<span class="portfolio-play" aria-hidden="true"></span>' : '';
  const imageClass =
    isVideo && !url ? 'portfolio-image photo-placeholder is-video-fallback' : 'portfolio-image photo-placeholder';
  return `
    <article class="portfolio-card${tall}${wide}" data-index="${index}" data-categories="${escapeAttr(cats.join(','))}" role="button" tabindex="0" aria-label="פתיחת ${alt}">
      <div class="${imageClass}">${media}${play}</div>
      <div class="portfolio-meta">
        <span>${escapeHtml(label)}</span>
        <b>${escapeHtml(item.title || 'עבודה')}</b>
      </div>
    </article>`;
}

function portfolioHtml(items, page) {
  const list = page === 'home' ? (items || []).filter((i) => i.featured) : items || [];
  const visible = list.slice(0, 12);
  if (!visible.length) {
    return '<p class="empty-note">עבודות יופיעו כאן בקרוב.</p>';
  }
  return visible.map((item, index) => portfolioCardHtml(item, index)).join('');
}

function injectBusinessChrome(html, business) {
  if (!business) return html;
  const safe = escapeHtml(business);
  // Brand copy <b> (may include data-business)
  html = html.replace(
    /(<span class="brand-copy"><b\b[^>]*>)([^<]*)(<\/b>)/g,
    `$1${safe}$3`
  );
  // Sidebar footer first span (may include data-business)
  html = html.replace(
    /(<div class="sidebar-footer"><span\b[^>]*>)([^<]*)(<\/span>)/g,
    `$1${safe}$3`
  );
  // About label first line
  html = html.replace(
    /(<div class="about-label">)([^<]*)(<br\s*\/?>)/gi,
    `$1${safe}$3`
  );
  // aria-label on brand link
  html = html.replace(
    /(aria-label=")שם העסק( - דף הבית")/g,
    `$1${escapeAttr(business)}$2`
  );
  // logo alt
  html = html.replace(/(alt=")לוגו שם העסק(")/g, `$1לוגו ${escapeAttr(business)}$2`);
  // data-business nodes
  html = setDataAttrText(html, 'data-business', business);
  return html;
}

function injectWhatsApp(html, content) {
  const base = content.whatsapp_url || 'https://wa.me/972500000000';
  let href = base;
  try {
    const url = new URL(base);
    if (content.whatsapp_message) url.searchParams.set('text', content.whatsapp_message);
    href = url.toString();
  } catch {
    href = base;
  }
  return html.replace(
    /(<a\b[^>]*\sdata-whatsapp\b[^>]*\shref=["'])([^"']*)(["'])/gi,
    `$1${escapeAttr(href)}$3`
  );
}

function markSsr(html, preview) {
  if (/\sdata-ssr=["']/.test(html)) {
    html = html.replace(/\sdata-ssr=["'][^"']*["']/, ' data-ssr="1"');
  } else {
    html = html.replace(/<html\b([^>]*)>/i, '<html$1 data-ssr="1">');
  }
  if (preview) {
    if (/<meta\b[^>]*name=["']robots["']/i.test(html)) {
      html = replaceMetaContent(html, 'name', 'robots', 'noindex, nofollow, noarchive');
    } else {
      html = html.replace(
        /<\/head>/i,
        '    <meta name="robots" content="noindex, nofollow, noarchive" />\n  </head>'
      );
    }
  }
  return html;
}

function pageTitle(meta, content, pagePath) {
  const business = content.business_name || 'שם העסק';
  const base = meta.title || business;
  if (pagePath === '/') {
    return base.includes(business) ? base : `${base} | ${business}`;
  }
  if (pagePath === '/404' || pagePath === '/404/') {
    return `העמוד לא נמצא | ${business}`;
  }
  const labels = {
    '/about/': 'אודות',
    '/services/': 'שירותים',
    '/portfolio/': 'תיק עבודות',
    '/faq/': 'שאלות נפוצות',
  };
  const label = labels[pagePath];
  if (!label) return base;
  // Keep page-specific titles but refresh business segment when template used placeholder.
  if (base.includes(business) || base.includes('שם העסק')) {
    return base.replaceAll('שם העסק', business);
  }
  return `${label} | ${business}`;
}

/**
 * Inject published/draft payload into a static HTML template.
 */
export function renderHtml(template, payload, { origin, pagePath, preview = false } = {}) {
  const content = payload?.content || {};
  const meta = payload?.meta && Object.keys(payload.meta).length ? payload.meta : buildMeta(payload);
  const siteOrigin = resolveSiteOrigin(origin || 'http://127.0.0.1:8788');
  const canonicalPath = pagePath || '/';
  const pageUrl = `${siteOrigin}${canonicalPath === '/' ? '/' : canonicalPath}`;
  const ogImagePath = meta.ogImage || content.og_image || '/assets/brand-logo.png';
  const ogImage = ogImagePath.startsWith('http')
    ? ogImagePath
    : `${siteOrigin}${ogImagePath.startsWith('/') ? ogImagePath : `/${ogImagePath}`}`;

  const jsonLd =
    payload?.jsonLd ||
    (canonicalPath === '/faq/' ? '' : buildJsonLd(payload, siteOrigin)) ||
    '';

  const page =
    canonicalPath === '/'
      ? 'home'
      : canonicalPath.replace(/^\/|\/$/g, '') || 'home';

  let html = template;
  const title = pageTitle(meta, content, canonicalPath);
  const isNotFound = canonicalPath === '/404' || canonicalPath === '/404/';
  const business = content.business_name || 'שם העסק';
  const notFoundDescription = `העמוד שחיפשת לא נמצא. חזרו לדף הבית של ${business}.`;

  html = setTitle(html, title);
  html = replaceMetaContent(
    html,
    'name',
    'description',
    isNotFound ? notFoundDescription : meta.description || ''
  );
  html = setCanonical(html, isNotFound ? `${siteOrigin}/` : pageUrl);

  if (!isNotFound) {
    html = replaceMetaContent(html, 'property', 'og:site_name', content.business_name || meta.title || '');
    html = replaceMetaContent(html, 'property', 'og:title', title);
    html = replaceMetaContent(html, 'property', 'og:description', meta.description || '');
    html = replaceMetaContent(html, 'property', 'og:url', pageUrl);
    html = replaceMetaContent(html, 'property', 'og:image', ogImage);
    html = replaceMetaContent(html, 'name', 'twitter:title', title);
    html = replaceMetaContent(html, 'name', 'twitter:description', meta.description || '');

    if (jsonLd && canonicalPath !== '/faq/') {
      html = setJsonLd(html, jsonLd);
    }
  }

  for (const key of CONTENT_TEXT_KEYS) {
    if (content[key] != null && content[key] !== '') {
      html = setDataContent(html, key, content[key]);
    }
  }
  html = setDataContentHtml(html, 'about_body', content.about_body);
  html = setDataAttrText(html, 'data-area', content.area_label);
  html = setDataAttrText(html, 'data-phone', content.contact_phone);
  html = setDataAttrText(html, 'data-email-label', content.contact_email);
  html = injectBusinessChrome(html, content.business_name);
  html = injectWhatsApp(html, content);

  if (html.includes('id="servicesList"')) {
    html = setElementInnerById(html, 'servicesList', servicesHtml(payload.services, page));
  }
  if (html.includes('id="portfolioGrid"')) {
    html = setElementInnerById(html, 'portfolioGrid', portfolioHtml(payload.portfolio, page));
  }

  html = markSsr(html, preview);
  return html;
}

/** Fallback: mark template as SSR shell without D1 content. */
export function buildFallbackHtml(template) {
  return markSsr(template, false);
}

export function cacheKey(origin, path, versionId) {
  return `https://ssr.cache.local/ssr:${origin}:${path}:v${versionId || '0'}`;
}

export function fallbackCacheKey(origin, path) {
  return `https://ssr.cache.local/ssr-fallback:${origin}:${path}`;
}
