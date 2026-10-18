import {
  getDefaultLocale,
  getLocales,
  isMultilingual,
  localeDir,
  localeOg,
  localizePath,
  parsePathLocale,
} from './i18n.js';
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
 * Normalize request pathname to a trailing-slash SSR path (+ locale).
 * Returns { path, locale, redirectTo, invalidLocale }.
 */
export function resolveSsrPath(pathname) {
  const parsed = parsePathLocale(pathname);
  if (parsed.invalidLocale) {
    return { path: null, locale: null, redirectTo: null, invalidLocale: true };
  }

  let pagePath = parsed.pagePath || '/';
  if (!pagePath.startsWith('/')) pagePath = `/${pagePath}`;

  // Slash redirect for logical page, preserving locale prefix in redirect target.
  if (!pagePath.endsWith('/') && PUBLIC_SSR_PATHS[`${pagePath}/`]) {
    const withSlash = `${pagePath}/`;
    return {
      path: withSlash,
      locale: parsed.locale,
      redirectTo: localizePath(withSlash, parsed.locale),
      invalidLocale: false,
    };
  }

  if (parsed.redirectTo != null) {
    // Default-locale prefix strip: /he/about/ → /about/
    const targetPage = parsed.pagePath;
    if (PUBLIC_SSR_PATHS[targetPage] || targetPage === '/') {
      return {
        path: targetPage,
        locale: parsed.locale,
        redirectTo: localizePath(targetPage, parsed.locale),
        invalidLocale: false,
      };
    }
  }

  if (PUBLIC_SSR_PATHS[pagePath]) {
    return { path: pagePath, locale: parsed.locale, redirectTo: null, invalidLocale: false };
  }

  return { path: null, locale: parsed.locale, redirectTo: null, invalidLocale: false };
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

function setElementInnerByAttr(html, attr, attrValue, inner) {
  const openRe = new RegExp(
    `<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*\\s${escapeRegExp(attr)}=["']${escapeRegExp(attrValue)}["'][^>]*>`,
    'i'
  );
  const openMatch = openRe.exec(html);
  if (!openMatch) return html;
  const tagName = openMatch[1];
  const start = openMatch.index + openMatch[0].length;
  const scanner = new RegExp(`</?${escapeRegExp(tagName)}\\b[^>]*>`, 'gi');
  scanner.lastIndex = start;
  let depth = 1;
  let match;
  while ((match = scanner.exec(html))) {
    if (match[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) {
        return html.slice(0, start) + inner + html.slice(match.index);
      }
      continue;
    }
    if (!/\/>$/.test(match[0])) depth += 1;
  }
  return html;
}

function setDataContentHtml(html, key, value) {
  if (value == null) return html;
  const parts = String(value)
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const inner = parts.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  return setElementInnerByAttr(html, 'data-content-html', key, inner);
}

function setDataAttrText(html, attr, value) {
  if (value == null || value === '') return html;
  const re = new RegExp(
    `(<[a-zA-Z][^>]*\\s${escapeRegExp(attr)}(?:=["'][^"']*["'])?[^>]*>)([\\s\\S]*?)(<\\/[a-zA-Z]+>)`,
    'g'
  );
  return html.replace(re, `$1${escapeHtml(value)}$3`);
}

/**
 * Replace the full innerHTML of the element with the given id.
 * Depth-counts matching open/close tags so nested markup is not truncated
 * at the first closing tag (e.g. portfolioGrid / servicesList).
 */
function setElementInnerById(html, id, inner) {
  const openRe = new RegExp(
    `<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*\\sid=["']${escapeRegExp(id)}["'][^>]*>`,
    'i'
  );
  const openMatch = openRe.exec(html);
  if (!openMatch) return html;
  const tagName = openMatch[1];
  const start = openMatch.index + openMatch[0].length;
  const scanner = new RegExp(`</?${escapeRegExp(tagName)}\\b[^>]*>`, 'gi');
  scanner.lastIndex = start;
  let depth = 1;
  let match;
  while ((match = scanner.exec(html))) {
    if (match[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) {
        return html.slice(0, start) + inner + html.slice(match.index);
      }
      continue;
    }
    if (!/\/>$/.test(match[0])) depth += 1;
  }
  return html;
}

function chromeText(locale, he, en) {
  return locale === 'en' ? en : he;
}

function servicesHtml(services, page, locale = getDefaultLocale()) {
  if (!services?.length) {
    return `<p class="empty-note">${chromeText(
      locale,
      'השירותים יעודכנו בקרוב.',
      'Services will be updated soon.'
    )}</p>`;
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

function portfolioCardHtml(item, index, locale = getDefaultLocale()) {
  const tall = index % 4 === 0 ? ' tall' : '';
  const wide = index % 5 === 3 ? ' wide' : '';
  const cats = itemCategories(item);
  const isVideo = item.media_type === 'video';
  const label = isVideo ? 'VIDEO' : cats.join(' · ');
  const url = thumbUrl(item);
  const fallbackTitle = chromeText(locale, 'עבודה', 'Work');
  const alt = escapeHtml(item.alt_text || item.title || fallbackTitle);
  const media = url
    ? `<img src="${escapeAttr(url)}" alt="${alt}" loading="lazy" decoding="async" width="800" height="1000" />`
    : '';
  const play = isVideo ? '<span class="portfolio-play" aria-hidden="true"></span>' : '';
  const imageClass =
    isVideo && !url ? 'portfolio-image photo-placeholder is-video-fallback' : 'portfolio-image photo-placeholder';
  const openLabel = chromeText(locale, `פתיחת ${alt}`, `Open ${alt}`);
  return `
    <article class="portfolio-card${tall}${wide}" data-index="${index}" data-categories="${escapeAttr(cats.join(','))}" role="button" tabindex="0" aria-label="${escapeAttr(openLabel)}">
      <div class="${imageClass}">${media}${play}</div>
      <div class="portfolio-meta">
        <span>${escapeHtml(label)}</span>
        <b>${escapeHtml(item.title || fallbackTitle)}</b>
      </div>
    </article>`;
}

function portfolioHtml(items, page, locale = getDefaultLocale()) {
  const list = page === 'home' ? (items || []).filter((i) => i.featured) : items || [];
  const visible = list.slice(0, 12);
  if (!visible.length) {
    return `<p class="empty-note">${chromeText(
      locale,
      'עבודות יופיעו כאן בקרוב.',
      'Work will appear here soon.'
    )}</p>`;
  }
  return visible.map((item, index) => portfolioCardHtml(item, index, locale)).join('');
}

/**
 * Swap hardcoded template chrome (nav, section titles, CTAs) for the active locale.
 * CMS fields use data-content; this covers static Hebrew shell copy in the HTML files.
 */
function applyStaticChrome(html, locale) {
  if (locale !== 'en') return html;
  const pairs = [
    ['aria-label="ניווט ראשי"', 'aria-label="Main navigation"'],
    ['aria-label="תפריט נייד"', 'aria-label="Mobile menu"'],
    ['aria-label="פתיחת תפריט"', 'aria-label="Open menu"'],
    ['aria-label="סגירת תפריט"', 'aria-label="Close menu"'],
    ['aria-label="קישורים בתחתית"', 'aria-label="Footer links"'],
    ['aria-label="סינון תיק עבודות"', 'aria-label="Portfolio filters"'],
    ['aria-label="צור קשר ב־WhatsApp"', 'aria-label="Contact on WhatsApp"'],
    ['aria-label="סגירה"', 'aria-label="Close"'],
    ['aria-label="הקודם"', 'aria-label="Previous"'],
    ['aria-label="הבא"', 'aria-label="Next"'],
    ['alt="לוגו שם העסק"', 'alt="Business logo"'],
    ['alt="לוגו ', 'alt="Logo '],
    ['alt="תמונה לדוגמה"', 'alt="Sample image"'],
    [' - דף הבית"', ' - home"'],
    ['aria-label="שם העסק - שם העסק"', 'aria-label="Business Name - About"'],
    ['<small>שירות מקצועי</small>', '<small>Professional service</small>'],
    ['>תיק עבודות</a>', '>Portfolio</a>'],
    ['>תיק עבודות <span>', '>Portfolio <span>'],
    ['>שירותים</a>', '>Services</a>'],
    ['>שירותים <span>', '>Services <span>'],
    ['>אודות</a>', '>About</a>'],
    ['>אודות <span>', '>About <span>'],
    ['>שאלות נפוצות</a>', '>FAQ</a>'],
    ['>שאלות נפוצות <span>', '>FAQ <span>'],
    ['>יצירת קשר</a>', '>Contact</a>'],
    ['>יצירת קשר <span>', '>Contact <span>'],
    ['>דף הבית <span>', '>Home <span>'],
    ['צור קשר ב־WhatsApp</a>', 'Contact on WhatsApp</a>'],
    ['לצפייה בתיק העבודות <span>', 'View portfolio <span>'],
    ['שירות · פרויקט · ייעוץ<br />', 'Service · Project · Consulting<br />'],
    ['<h2>מבחר <em>פרויקטים</em></h2>', '<h2>Selected <em>projects</em></h2>'],
    [
      'השירותים שלנו בהאזור שלכם - מהשיחה הראשונה ועד הטאץ׳ האחרון. לתיאום מחיר יש לפנות בפרטי.',
      'Our services in your area - from the first conversation to the final touch. Contact us for pricing.',
    ],
    [
      '<h2>בדיוק למה<br /><em>שאת צריכה</em></h2>',
      '<h2>Exactly why<br /><em>it is worth choosing</em></h2>',
    ],
    ['לתיק העבודות המלא <span>', 'Full portfolio <span>'],
    ['לכל השירותים <span>', 'All services <span>'],
    ['עוד עלינו <span>', 'More about us <span>'],
    [
      '<h2>האירוע שלך<br /><em>מתחיל כאן.</em></h2>',
      '<h2>Your project<br /><em>starts here.</em></h2>',
    ],
    ['<p>מוכנה להתחיל?</p>', '<p>Ready to start?</p>'],
    [
      '<h3>בואי נדבר על<br /><em>האירוע שלך.</em></h3>',
      '<h3>Let us talk about<br /><em>your project.</em></h3>',
    ],
    [
      'הודעה מוכנה תיפתח לכם ב־WhatsApp · ',
      'A ready message will open in WhatsApp · ',
    ],
    ['טען עוד עבודות</button>', 'Load more work</button>'],
    ['שם העסק - דף הבית"', 'Business name - home"'],
  ];
  let out = html;
  for (const [from, to] of pairs) {
    out = out.split(from).join(to);
  }
  return out;
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

/** Set Instagram href from CMS, or remove the link when the field is empty. */
function injectInstagram(html, content) {
  const href = String(content.instagram_url || '').trim();
  if (!href) {
    return html.replace(/<a\b[^>]*\sdata-instagram\b[^>]*>[\s\S]*?<\/a>/gi, '');
  }
  return html.replace(
    /(<a\b[^>]*\sdata-instagram\b[^>]*\shref=["'])([^"']*)(["'])/gi,
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

function pageTitle(meta, content, pagePath, locale = getDefaultLocale()) {
  const business = content.business_name || (locale === 'en' ? 'Business name' : 'שם העסק');
  const base = meta.title || business;
  // Brand | page - same order as admin document title.
  if (pagePath === '/') {
    if (base === business) return business;
    if (base.includes(business)) return base;
    return `${business} | ${base}`;
  }
  if (pagePath === '/404' || pagePath === '/404/') {
    return locale === 'en' ? `${business} | Page not found` : `${business} | העמוד לא נמצא`;
  }
  const labelsHe = {
    '/about/': 'אודות',
    '/services/': 'שירותים',
    '/portfolio/': 'תיק עבודות',
    '/faq/': 'שאלות נפוצות',
  };
  const labelsEn = {
    '/about/': 'About',
    '/services/': 'Services',
    '/portfolio/': 'Portfolio',
    '/faq/': 'FAQ',
  };
  const labels = locale === 'en' ? labelsEn : labelsHe;
  const label = labels[pagePath];
  if (!label) return base;
  if (base.includes(business) || base.includes('שם העסק') || base.includes('Business name')) {
    return base.replaceAll('שם העסק', business).replaceAll('Business name', business);
  }
  return `${business} | ${label}`;
}

function setHtmlLangDir(html, locale) {
  const lang = locale || getDefaultLocale();
  const dir = localeDir(lang);
  return html.replace(/<html\b([^>]*)>/i, (full, attrs) => {
    let next = attrs;
    if (/\slang=["'][^"']*["']/i.test(next)) {
      next = next.replace(/\slang=["'][^"']*["']/i, ` lang="${escapeAttr(lang)}"`);
    } else {
      next += ` lang="${escapeAttr(lang)}"`;
    }
    if (/\sdir=["'][^"']*["']/i.test(next)) {
      next = next.replace(/\sdir=["'][^"']*["']/i, ` dir="${escapeAttr(dir)}"`);
    } else {
      next += ` dir="${escapeAttr(dir)}"`;
    }
    return `<html${next}>`;
  });
}

function rewriteInternalLinks(html, locale) {
  if (!isMultilingual() || locale === getDefaultLocale()) return html;
  const paths = Object.keys(PUBLIC_SSR_PATHS);
  let out = html;
  for (const pagePath of paths) {
    const localized = localizePath(pagePath, locale);
    // href="/about/" → href="/en/about/"
    const re = new RegExp(`(href=["'])${escapeRegExp(pagePath)}(["'])`, 'gi');
    out = out.replace(re, `$1${localized}$2`);
  }
  return out;
}

function injectHreflang(html, origin, pagePath, locale) {
  if (!isMultilingual()) return html;
  const tags = getLocales()
    .map((loc) => {
      const href = `${origin}${localizePath(pagePath, loc)}`;
      return `    <link rel="alternate" hreflang="${escapeAttr(loc)}" href="${escapeAttr(href)}" />`;
    })
    .join('\n');
  const xDefault = `${origin}${localizePath(pagePath, getDefaultLocale())}`;
  const block = `${tags}\n    <link rel="alternate" hreflang="x-default" href="${escapeAttr(xDefault)}" />\n`;
  // Remove any prior hreflang we injected
  let out = html.replace(/\s*<link\b[^>]*\bhreflang=["'][^"']*["'][^>]*>\s*/gi, '\n');
  return out.replace(/<\/head>/i, `${block}  </head>`);
}

function localeLabel(loc) {
  if (loc === 'he' || String(loc).startsWith('he')) return 'עברית';
  if (loc === 'en' || String(loc).startsWith('en')) return 'English';
  return loc;
}

function languageSwitcherHtml(pagePath, locale, availableLocales, { className = 'lang-switch' } = {}) {
  if (!isMultilingual()) return '';
  const available =
    availableLocales instanceof Set ? availableLocales : new Set(availableLocales || getLocales());
  const options = getLocales()
    .map((loc) => {
      const label = localeLabel(loc);
      const href = localizePath(pagePath, loc);
      const selected = loc === locale ? ' selected' : '';
      const disabled = available.has(loc) ? '' : ' disabled';
      return `<option value="${escapeAttr(href)}" lang="${escapeAttr(loc)}"${selected}${disabled}>${escapeHtml(label)}</option>`;
    })
    .join('');
  return `<label class="${escapeAttr(className)}"><select class="lang-switch__select" data-lang-switch aria-label="Language">${options}</select></label>`;
}

function injectLanguageSwitcher(html, pagePath, locale, availableLocales) {
  const headerSwitcher = languageSwitcherHtml(pagePath, locale, availableLocales, {
    className: 'lang-switch lang-switch--header',
  });
  const sidebarSwitcher = languageSwitcherHtml(pagePath, locale, availableLocales, {
    className: 'lang-switch lang-switch--sidebar',
  });
  if (!headerSwitcher) return html;

  let out = html
    .replace(/<div class="header-tools">([\s\S]*?)<\/div>/gi, '$1')
    .replace(/<(?:nav|label) class="lang-switch[\s\S]*?<\/(?:nav|label)>/gi, '');

  if (/<button class="menu-button"[\s\S]*?<\/button>/i.test(out)) {
    out = out.replace(
      /(<button class="menu-button"[\s\S]*?<\/button>)/i,
      `$1\n      ${headerSwitcher}`
    );
  } else if (/<\/header>/i.test(out)) {
    out = out.replace(/<\/header>/i, `  ${headerSwitcher}\n    </header>`);
  }

  if (/<nav class="sidebar-nav"[^>]*>/i.test(out)) {
    out = out.replace(/(<nav class="sidebar-nav"[^>]*>)/i, `$1\n        ${sidebarSwitcher}\n`);
  }

  return out;
}

/**
 * Inject published/draft payload into a static HTML template.
 * @param {{ origin?: string, pagePath?: string, preview?: boolean, locale?: string, availableLocales?: Set<string>|string[] }} opts
 */
export function renderHtml(template, payload, opts = {}) {
  const {
    origin,
    pagePath,
    preview = false,
    locale = payload?.locale || getDefaultLocale(),
    availableLocales = getLocales(),
  } = opts;
  const content = payload?.content || {};
  const meta = payload?.meta && Object.keys(payload.meta).length ? payload.meta : buildMeta(payload);
  const siteOrigin = resolveSiteOrigin(origin || 'http://127.0.0.1:3788');
  const logicalPath = pagePath || '/';
  const canonicalPath = localizePath(logicalPath === '/404' || logicalPath === '/404/' ? '/' : logicalPath, locale);
  const pageUrl = `${siteOrigin}${canonicalPath === '/' ? '/' : canonicalPath}`;
  const ogImagePath = meta.ogImage || content.og_image || '/assets/brand-logo.png';
  const ogImage = ogImagePath.startsWith('http')
    ? ogImagePath
    : `${siteOrigin}${ogImagePath.startsWith('/') ? ogImagePath : `/${ogImagePath}`}`;

  const jsonLd =
    payload?.jsonLd ||
    (logicalPath === '/faq/' ? '' : buildJsonLd({ ...payload, locale }, siteOrigin)) ||
    '';

  const page =
    logicalPath === '/'
      ? 'home'
      : logicalPath.replace(/^\/|\/$/g, '') || 'home';

  const available = availableLocales instanceof Set ? availableLocales : new Set(availableLocales || []);

  let html = template;
  html = setHtmlLangDir(html, locale);
  const title = pageTitle(meta, content, logicalPath, locale);
  const isNotFound = logicalPath === '/404' || logicalPath === '/404/';
  const business = content.business_name || (locale === 'en' ? 'Business name' : 'שם העסק');
  const notFoundDescription =
    locale === 'en'
      ? `The page you requested was not found. Return to the ${business} home page.`
      : `העמוד שחיפשת לא נמצא. חזרו לדף הבית של ${business}.`;

  html = setTitle(html, title);
  html = replaceMetaContent(
    html,
    'name',
    'description',
    isNotFound ? notFoundDescription : meta.description || ''
  );
  html = setCanonical(html, isNotFound ? `${siteOrigin}${localizePath('/', locale)}` : pageUrl);

  if (!isNotFound) {
    html = replaceMetaContent(html, 'property', 'og:site_name', content.business_name || meta.title || '');
    html = replaceMetaContent(html, 'property', 'og:title', title);
    html = replaceMetaContent(html, 'property', 'og:description', meta.description || '');
    html = replaceMetaContent(html, 'property', 'og:url', pageUrl);
    html = replaceMetaContent(html, 'property', 'og:image', ogImage);
    html = replaceMetaContent(html, 'property', 'og:locale', localeOg(locale));
    html = replaceMetaContent(html, 'name', 'twitter:title', title);
    html = replaceMetaContent(html, 'name', 'twitter:description', meta.description || '');
    html = injectHreflang(html, siteOrigin, logicalPath, locale);

    if (jsonLd && logicalPath !== '/faq/') {
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
  html = injectInstagram(html, content);
  html = applyStaticChrome(html, locale);
  html = rewriteInternalLinks(html, locale);
  html = injectLanguageSwitcher(html, isNotFound ? '/' : logicalPath, locale, available);

  if (html.includes('id="servicesList"')) {
    html = setElementInnerById(html, 'servicesList', servicesHtml(payload.services, page, locale));
  }
  if (html.includes('id="portfolioGrid"')) {
    html = setElementInnerById(html, 'portfolioGrid', portfolioHtml(payload.portfolio, page, locale));
  }

  html = markSsr(html, preview);
  return html;
}

/** Fallback: mark template as SSR shell without D1 content. */
export function buildFallbackHtml(template) {
  return markSsr(template, false);
}

/** Bump SSR_CACHE_REV when HTML chrome injection changes (invalidates stale Cache API entries). */
const SSR_CACHE_REV = 'chrome-i18n-inner-fix-2';

export function cacheKey(origin, path, versionId, locale = 'he') {
  return `https://ssr.cache.local/ssr:${SSR_CACHE_REV}:${origin}:${path}:v${versionId || '0'}:l${locale || 'he'}`;
}

export function fallbackCacheKey(origin, path, locale = 'he') {
  return `https://ssr.cache.local/ssr-fallback:${SSR_CACHE_REV}:${origin}:${path}:l${locale || 'he'}`;
}
