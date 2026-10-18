const CATEGORIES = ['הכול', 'כללי', 'פרויקטים', 'גלריה', 'וידאו'];
const PORTFOLIO_PAGE_SIZE = 12;

let portfolioItems = [];
let portfolioCategory = 'הכול';
let portfolioVisibleCount = PORTFOLIO_PAGE_SIZE;

const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('mobileSidebar');
const overlay = document.getElementById('sidebarOverlay');
const sidebarClose = document.getElementById('sidebarClose');

function setMenuState(isOpen) {
  if (!sidebar || !overlay || !menuToggle) return;
  sidebar.classList.toggle('is-open', isOpen);
  overlay.classList.toggle('is-visible', isOpen);
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  sidebar.setAttribute('aria-hidden', String(!isOpen));
  document.body.classList.toggle('menu-open', isOpen);
}

menuToggle?.addEventListener('click', () => setMenuState(true));
sidebarClose?.addEventListener('click', () => setMenuState(false));
overlay?.addEventListener('click', () => setMenuState(false));
sidebar?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenuState(false)));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenuState(false);
});

function setText(selector, value) {
  if (value == null || value === '') return;
  document.querySelectorAll(selector).forEach((el) => {
    el.textContent = value;
  });
}

function setHtmlParagraphs(selector, value) {
  const el = document.querySelector(selector);
  if (!el || value == null) return;
  const parts = String(value)
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  el.innerHTML = parts.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function whatsappHref(base, message) {
  const url = new URL(base || 'https://wa.me/972500000000');
  if (message) url.searchParams.set('text', message);
  return url.toString();
}

function telHref(phone) {
  const digits = String(phone || '050-000-0000').replace(/\D/g, '');
  if (!digits) return 'tel:+972500000000';
  const intl = digits.startsWith('972') ? digits : digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
  return `tel:+${intl}`;
}

function applyContent(content) {
  for (const [key, value] of Object.entries(content || {})) {
    document.querySelectorAll(`[data-content="${key}"]`).forEach((el) => {
      el.textContent = value;
    });
  }
  setHtmlParagraphs('[data-content-html="about_body"]', content.about_body);
  setText('[data-area]', content.area_label);
  setText('[data-phone]', content.contact_phone);
  setText('[data-email-label]', content.contact_email);
  setText('[data-business]', content.business_name);

  const wa = whatsappHref(content.whatsapp_url, content.whatsapp_message);
  document.querySelectorAll('[data-whatsapp]').forEach((a) => {
    a.href = wa;
    a.target = '_blank';
    a.rel = 'noreferrer';
  });

  const phone = content.contact_phone || '050-000-0000';
  document.querySelectorAll('[data-tel]').forEach((a) => {
    a.href = telHref(phone);
  });

  if (content.instagram_url) {
    document.querySelectorAll('[data-instagram]').forEach((a) => {
      a.href = content.instagram_url;
    });
  }
  if (content.contact_email) {
    document.querySelectorAll('[data-email]').forEach((a) => {
      a.href = `mailto:${content.contact_email}`;
    });
  }
}

function renderServices(services) {
  const root = document.getElementById('servicesList');
  if (!root) return;
  if (!services?.length) {
    root.innerHTML = '<p class="empty-note">השירותים יעודכנו בקרוב.</p>';
    return;
  }
  const heading = document.documentElement.dataset.page === 'services' ? 'h2' : 'h3';
  root.innerHTML = services
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

function filteredPortfolio() {
  if (portfolioCategory === 'הכול') return portfolioItems;
  return portfolioItems.filter((item) => itemCategories(item).includes(portfolioCategory));
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
    <article class="portfolio-card${tall}${wide}" data-index="${index}" data-categories="${escapeHtml(cats.join(','))}" role="button" tabindex="0" aria-label="פתיחת ${alt}">
      <div class="${imageClass}">${media}${play}</div>
      <div class="portfolio-meta">
        <span>${escapeHtml(label)}</span>
        <b>${escapeHtml(item.title || 'עבודה')}</b>
      </div>
    </article>`;
}

function escapeAttr(str) {
  return escapeHtml(str).replaceAll('"', '&quot;');
}

function renderPortfolioFilters() {
  const filters = document.getElementById('portfolioFilters');
  if (!filters) return;
  filters.innerHTML = CATEGORIES.map(
    (cat) =>
      `<button type="button" class="filter${cat === portfolioCategory ? ' active' : ''}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`
  ).join('');
  filters.querySelectorAll('.filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      portfolioCategory = btn.dataset.category;
      portfolioVisibleCount = PORTFOLIO_PAGE_SIZE;
      renderPortfolioFilters();
      renderPortfolioGrid();
    });
  });
}

function loadedPortfolio() {
  return filteredPortfolio().slice(0, portfolioVisibleCount);
}

function renderPortfolioGrid() {
  const grid = document.getElementById('portfolioGrid');
  const more = document.getElementById('portfolioMore');
  if (!grid || !more) return;

  const filtered = filteredPortfolio();
  if (!filtered.length) {
    grid.innerHTML = '<p class="empty-note">עבודות יופיעו כאן בקרוב.</p>';
    more.innerHTML = '';
    return;
  }

  const visible = loadedPortfolio();
  grid.innerHTML = visible.map((item, index) => portfolioCardHtml(item, index)).join('');

  grid.querySelectorAll('.portfolio-card').forEach((card) => {
    const open = () => openLightbox(Number(card.dataset.index));
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });

  const remaining = filtered.length - visible.length;
  if (remaining > 0) {
    more.innerHTML = `
      <button type="button" class="load-more-btn" id="portfolioLoadMore">
        <span class="load-more-label">עוד עבודות</span>
        <span class="load-more-count">${remaining} נוספות</span>
        <span class="load-more-arrow" aria-hidden="true">↓</span>
      </button>`;
    document.getElementById('portfolioLoadMore').addEventListener('click', () => {
      portfolioVisibleCount += PORTFOLIO_PAGE_SIZE;
      renderPortfolioGrid();
    });
  } else {
    more.innerHTML = '';
  }
}

function renderPortfolio(items, activeCategory = 'הכול') {
  portfolioItems = items || [];
  portfolioCategory = activeCategory;
  portfolioVisibleCount = PORTFOLIO_PAGE_SIZE;
  renderPortfolioFilters();
  renderPortfolioGrid();
}

/* --- Lightbox carousel (among already-loaded gallery items) --- */
const lightbox = document.getElementById('lightbox');
const lightboxStage = document.getElementById('lightboxStage');
const lightboxTitle = document.getElementById('lightboxTitle');
const lightboxCounter = document.getElementById('lightboxCounter');
const lightboxPrev = document.getElementById('lightboxPrev');
const lightboxNext = document.getElementById('lightboxNext');
const lightboxLoadMore = document.getElementById('lightboxLoadMore');
let lightboxIndex = 0;
let touchStartX = 0;
let lightboxReturnFocus = null;

function hasMorePortfolio() {
  return filteredPortfolio().length > loadedPortfolio().length;
}

function openLightbox(index) {
  const items = loadedPortfolio();
  if (!items.length || index < 0 || index >= items.length) return;
  lightboxIndex = index;
  lightboxReturnFocus = document.activeElement;
  lightbox.hidden = false;
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.classList.add('lightbox-open');
  renderLightboxSlide();
  lightboxCloseFocus();
}

function lightboxCloseFocus() {
  const closeBtn = lightbox?.querySelector('[data-lightbox-close].lightbox-close');
  closeBtn?.focus();
}

function closeLightbox() {
  const returnTo = lightboxReturnFocus;
  lightbox.hidden = true;
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lightbox-open');
  lightboxStage.innerHTML = '';
  if (lightboxLoadMore) lightboxLoadMore.hidden = true;
  lightboxReturnFocus = null;
  if (returnTo && typeof returnTo.focus === 'function') {
    try {
      returnTo.focus();
    } catch {
      // ignore
    }
  }
}

function stepLightbox(delta) {
  const items = loadedPortfolio();
  if (!items.length) return;
  const next = lightboxIndex + delta;
  if (next < 0) return;
  if (next >= items.length) {
    if (hasMorePortfolio()) {
      updateLightboxLoadMore(true);
    }
    return;
  }
  lightboxIndex = next;
  renderLightboxSlide();
}

function updateLightboxLoadMore(forceShow = false) {
  if (!lightboxLoadMore) return;
  const atEnd = lightboxIndex >= loadedPortfolio().length - 1;
  const show = hasMorePortfolio() && (forceShow || atEnd);
  lightboxLoadMore.hidden = !show;
}

function loadMorePortfolioFromLightbox() {
  if (!hasMorePortfolio()) return;
  const keepIndex = lightboxIndex;
  portfolioVisibleCount += PORTFOLIO_PAGE_SIZE;
  renderPortfolioGrid();
  lightboxIndex = Math.min(keepIndex, loadedPortfolio().length - 1);
  renderLightboxSlide();
}

function renderLightboxSlide() {
  const items = loadedPortfolio();
  const item = items[lightboxIndex];
  if (!item) return;

  lightboxTitle.textContent = item.title || '';
  lightboxCounter.textContent = `${lightboxIndex + 1} מתוך ${items.length}`;
  lightboxPrev.disabled = lightboxIndex <= 0;
  lightboxNext.disabled = lightboxIndex >= items.length - 1 && !hasMorePortfolio();
  updateLightboxLoadMore();

  if (item.media_type === 'video' && item.media_url) {
    const poster = item.cover_url ? ` poster="${escapeAttr(item.cover_url)}"` : '';
    lightboxStage.innerHTML = `
      <video class="lightbox-media" controls playsinline autoplay preload="auto"${poster} src="${escapeAttr(item.media_url)}">
        הדפדפן לא תומך בניגון וידאו.
      </video>`;
    const video = lightboxStage.querySelector('video');
    if (video) {
      video.muted = false;
      video.play().catch(() => {
        video.muted = true;
        return video.play();
      }).catch(() => {});
    }
  } else {
    const src = thumbUrl(item) || item.media_url || '';
    lightboxStage.innerHTML = src
      ? `<img class="lightbox-media" src="${escapeAttr(src)}" alt="${escapeHtml(item.alt_text || item.title || '')}" />`
      : '<p class="lightbox-empty">אין מדיה להצגה</p>';
  }
}

lightbox?.querySelectorAll('[data-lightbox-close]').forEach((el) => {
  el.addEventListener('click', closeLightbox);
});
lightboxPrev?.addEventListener('click', () => stepLightbox(-1));
lightboxNext?.addEventListener('click', () => stepLightbox(1));
lightboxLoadMore?.addEventListener('click', () => loadMorePortfolioFromLightbox());

document.addEventListener('keydown', (event) => {
  if (lightbox?.hidden) return;
  if (event.key === 'Escape') closeLightbox();
  if (event.key === 'ArrowRight') stepLightbox(-1);
  if (event.key === 'ArrowLeft') stepLightbox(1);
});

lightboxStage?.addEventListener(
  'touchstart',
  (event) => {
    touchStartX = event.changedTouches[0]?.clientX || 0;
  },
  { passive: true }
);

lightboxStage?.addEventListener(
  'touchend',
  (event) => {
    const endX = event.changedTouches[0]?.clientX || 0;
    const delta = endX - touchStartX;
    if (Math.abs(delta) < 50) return;
    // RTL: swipe toward the arrow direction
    if (delta > 0) stepLightbox(1);
    else stepLightbox(-1);
  },
  { passive: true }
);

function getPreviewToken() {
  const params = new URLSearchParams(location.search);
  return params.get('preview') || '';
}

function enablePreviewMode() {
  let robots = document.querySelector('meta[name="robots"]');
  if (!robots) {
    robots = document.createElement('meta');
    robots.setAttribute('name', 'robots');
    document.head.appendChild(robots);
  }
  robots.setAttribute('content', 'noindex, nofollow, noarchive');

  if (!document.getElementById('previewBanner')) {
    const banner = document.createElement('div');
    banner.id = 'previewBanner';
    banner.setAttribute('role', 'status');
    banner.style.cssText =
      'position:fixed;inset-inline:0;top:0;z-index:100;padding:8px 16px;display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;font:600 13px var(--sans),Assistant,sans-serif;background:#24201d;color:#fffdfa;';
    const label = document.createElement('span');
    label.textContent = 'תצוגה מקדימה - טיוטה (לא האתר הציבורי)';
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'סגירה וחזרה לניהול';
    back.style.cssText =
      'border:0;background:transparent;color:#fffdfa;text-decoration:underline;text-underline-offset:3px;font:inherit;font-weight:600;cursor:pointer;white-space:nowrap;padding:0;';
    back.addEventListener('click', () => {
      try {
        if (window.opener && !window.opener.closed) window.opener.focus();
      } catch {
        // cross-origin / blocked
      }
      window.close();
      // If the browser blocks close (tab not script-opened), stay here with a hint.
      setTimeout(() => {
        if (!document.hidden) {
          back.textContent = 'סגרי את הטאב הזה - הניהול בטאב האחר';
          back.disabled = true;
          back.style.textDecoration = 'none';
          back.style.cursor = 'default';
          back.style.opacity = '0.85';
        }
      }, 200);
    });
    banner.append(label, back);
    document.body.prepend(banner);
    document.body.style.paddingTop = '36px';
  }
}

function applySeo(data) {
  const meta = data?.meta || {};
  const lockTitle = document.documentElement.hasAttribute('data-seo-lock-title');
  const lockDescription = document.documentElement.hasAttribute('data-seo-lock-description');
  const isHome = document.documentElement.dataset.page === 'home';

  if (meta.description && !lockDescription && isHome) {
    let desc = document.querySelector('meta[name="description"]');
    if (!desc) {
      desc = document.createElement('meta');
      desc.setAttribute('name', 'description');
      document.head.appendChild(desc);
    }
    desc.setAttribute('content', meta.description);
  }
  if (meta.title && !lockTitle && isHome) {
    const business = (data?.content && data.content.business_name) || 'שם העסק';
    document.title = meta.title.includes(business) ? meta.title : `${meta.title} | ${business}`;
  }

  // Keep page-specific FAQ JSON-LD on /faq/; refresh business graph elsewhere.
  if (document.documentElement.dataset.page === 'faq') return;

  const jsonLd = data?.jsonLd || '';
  let script = document.getElementById('siteJsonLd');
  if (jsonLd) {
    if (!script) {
      script = document.createElement('script');
      script.id = 'siteJsonLd';
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = jsonLd;
  } else if (script) {
    script.remove();
  }
}

async function boot() {
  const previewToken = getPreviewToken();
  try {
    const endpoint = previewToken
      ? `/api/preview/site?token=${encodeURIComponent(previewToken)}`
      : '/api/public/site';
    const res = await fetch(endpoint, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('api');
    const data = await res.json();
    if (previewToken || data.preview) enablePreviewMode();
    applySeo(data);
    applyContent(data.content || {});
    renderServices(data.services || []);
    const portfolio = data.portfolio || [];
    const isHome = document.documentElement.dataset.page === 'home';
    renderPortfolio(isHome ? portfolio.filter((item) => item.featured) : portfolio);
  } catch {
    // Keep static HTML services/portfolio; do not wipe the page on temporary API failure.
    if (previewToken) enablePreviewMode();
    document.querySelectorAll('[data-whatsapp]').forEach((a) => {
      if (a.getAttribute('href')?.includes('wa.me')) return;
      a.href = whatsappHref(
        'https://wa.me/972500000000',
        'שלום, אשמח לקבל פרטים נוספים.'
      );
    });
  }
}

boot();
