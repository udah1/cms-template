import { extractVideoCover, optimizeMediaFile } from './media-optimize.js';
import {
  applyAdminChrome,
  assertUiI18nComplete,
  fieldLabel,
  localeDir,
  normalizeLocale,
  normalizeUiLocale,
  t,
  UI_DEFAULT_LOCALE,
} from './ui-i18n.js';

/** Structural field defs only - labels come from FIELD_LABELS via fieldLabel(). */
const CONTENT_FIELD_DEFS = [
  ['business_name'],
  ['hero_eyebrow'],
  ['hero_title'],
  ['hero_title_em'],
  ['hero_description', 'textarea'],
  ['brand_quote', 'textarea'],
  ['about_title'],
  ['about_title_em'],
  ['about_body', 'textarea'],
  ['portfolio_lead', 'textarea'],
  ['contact_intro', 'textarea'],
  ['area_label'],
  ['instagram_url'],
  ['contact_phone'],
  ['whatsapp_url'],
  ['whatsapp_message', 'textarea'],
  ['contact_email'],
  ['seo_title'],
  ['seo_description', 'textarea'],
  ['og_image'],
];

const STORAGE_ADMIN = 'cmsAdmin.adminLocale';
const STORAGE_CONTENT = 'cmsAdmin.contentLocale';
const STORAGE_ADMIN_LOCKED = 'cmsAdmin.adminLocaleLocked';

let siteLocales = [UI_DEFAULT_LOCALE];
let siteDefaultLocale = UI_DEFAULT_LOCALE;
let adminLocale = UI_DEFAULT_LOCALE;
let contentLocale = UI_DEFAULT_LOCALE;
let adminLocaleLocked = false;
let contentLoadGen = 0;

function tt(key, vars) {
  return t(adminLocale, key, vars);
}

function readStoredLocale(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return normalizeUiLocale(raw);
  } catch {
    return null;
  }
}

function writeStoredLocale(key, locale) {
  try {
    localStorage.setItem(key, normalizeUiLocale(locale));
  } catch {
    /* storage blocked - ignore */
  }
}

function readStoredBool(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeStoredBool(key, value) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* storage blocked - ignore */
  }
}

/** Map content locale → UI dictionary locale (he/en). */
function uiLocaleForContent(locale) {
  return normalizeUiLocale(locale);
}

/**
 * When UI is not locked, keep admin chrome aligned with content locale.
 * Manual admin-locale changes set the lock; matching content again clears it.
 */
function syncAdminLocaleToContent({ persist = true } = {}) {
  if (adminLocaleLocked) return false;
  const next = uiLocaleForContent(contentLocale);
  if (next === adminLocale) return false;
  adminLocale = next;
  if (persist) writeStoredLocale(STORAGE_ADMIN, adminLocale);
  return true;
}

function setAdminLocaleLocked(locked) {
  adminLocaleLocked = !!locked;
  writeStoredBool(STORAGE_ADMIN_LOCKED, adminLocaleLocked);
}

function resolveContentLocale(requested) {
  const normalized = normalizeLocale(requested);
  if (normalized && siteLocales.includes(normalized)) return normalized;
  // Case-insensitive match against configured locales (BCP-47 canonical form).
  if (requested != null && String(requested).trim()) {
    const needle = normalizeLocale(requested) || String(requested).trim();
    const hit = siteLocales.find((loc) => normalizeLocale(loc) === needle || loc === needle);
    if (hit) return hit;
  }
  return siteDefaultLocale;
}

function isMultilingualUi() {
  return siteLocales.length > 1;
}

function withContentLocale(path, locale = contentLocale) {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}locale=${encodeURIComponent(locale)}`;
}

function applyChrome() {
  applyAdminChrome(adminLocale);
  syncLocalePickers();
}

function syncLocalePickers() {
  const wrap = document.getElementById('localePickers');
  const adminSelect = document.getElementById('adminLocaleSelect');
  const contentSelect = document.getElementById('contentLocaleSelect');
  const multi = isMultilingualUi();
  if (wrap) wrap.hidden = !multi;
  if (adminSelect) {
    // Admin chrome always offers he+en dictionary locales
    adminSelect.value = normalizeUiLocale(adminLocale);
  }
  if (contentSelect) {
    contentSelect.innerHTML = siteLocales
      .map((loc) => `<option value="${loc}">${t(adminLocale, `locale.${loc}`) || loc}</option>`)
      .join('');
    contentSelect.value = contentLocale;
  }
}

function initLocalesFromStorage() {
  // Early chrome for login (may be overridden once site locales are known).
  adminLocaleLocked = readStoredBool(STORAGE_ADMIN_LOCKED);
  contentLocale = resolveContentLocale(readStoredLocale(STORAGE_CONTENT) || siteDefaultLocale);
  adminLocale = readStoredLocale(STORAGE_ADMIN) || uiLocaleForContent(contentLocale);
  syncAdminLocaleToContent({ persist: true });
  applyChrome();
}

const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const userEmail = document.getElementById('userEmail');
const contentFields = document.getElementById('contentFields');
const servicesFields = document.getElementById('servicesFields');
const portfolioList = document.getElementById('portfolioList');
const itemDialog = document.getElementById('itemDialog');
const itemForm = document.getElementById('itemForm');
const itemCategories = document.getElementById('itemCategories');
const bulkCategories = document.getElementById('bulkCategories');
const bulkDialog = document.getElementById('bulkDialog');
const bulkForm = document.getElementById('bulkForm');
const confirmDialog = document.getElementById('confirmDialog');
const confirmTitle = document.getElementById('confirmTitle');
const confirmMessage = document.getElementById('confirmMessage');
const confirmOkBtn = document.getElementById('confirmOkBtn');
const confirmAltBtn = document.getElementById('confirmAltBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');

let contentState = {};
let servicesState = [];
let portfolioState = [];
let categories = ['כללי', 'פרויקטים', 'גלריה', 'וידאו'];
let confirmResolver = null;

function askConfirm({
  title,
  message,
  confirmLabel,
  confirmClass = 'btn btn-danger',
  altLabel = null,
  altValue = 'alt',
} = {}) {
  confirmTitle.textContent = title || tt('common.confirmDeleteTitle');
  confirmMessage.textContent = message || tt('common.confirmDeleteMessage');
  confirmOkBtn.textContent = confirmLabel || tt('common.delete');
  confirmOkBtn.className = confirmClass;
  if (confirmAltBtn) {
    if (altLabel) {
      confirmAltBtn.hidden = false;
      confirmAltBtn.textContent = altLabel;
    } else {
      confirmAltBtn.hidden = true;
    }
  }
  confirmCancelBtn.textContent = tt('common.cancel');
  confirmDialog.showModal();
  return new Promise((resolve) => {
    confirmResolver = (value) => resolve(value);
  });
}

function settleConfirm(result) {
  if (confirmDialog.open) confirmDialog.close();
  if (confirmResolver) {
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve(result);
  }
  if (confirmAltBtn) confirmAltBtn.hidden = true;
}

confirmOkBtn.addEventListener('click', () => settleConfirm(true));
confirmAltBtn?.addEventListener('click', () => settleConfirm('alt'));
confirmCancelBtn.addEventListener('click', () => settleConfirm(false));
confirmDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  settleConfirm(false);
});
confirmDialog.addEventListener('click', (event) => {
  if (event.target === confirmDialog) settleConfirm(false);
});

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || tt('common.error'));
    err.status = res.status;
    throw err;
  }
  return data;
}

function showStatus(el, message, isError = false) {
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle('is-error', isError);
}

const saveBar = document.getElementById('saveBar');
const saveContentBtn = document.getElementById('saveContentBtn');
const saveBarHint = document.getElementById('saveBarHint');
let savedSnapshot = '';
let activeTab = 'content';

function collectContentDraft() {
  const content = {};
  contentFields.querySelectorAll('[data-key]').forEach((el) => {
    content[el.dataset.key] = el.value;
  });
  const services = [...servicesFields.querySelectorAll('[data-service-id]')].map((card, index) => ({
    id: Number(card.dataset.serviceId),
    title: card.querySelector('[data-service-title]').value,
    description: card.querySelector('[data-service-description]').value,
    visible: card.querySelector('[data-service-visible]').checked,
    sort_order: index + 1,
  }));
  return { content, services };
}

function isContentDirty() {
  return JSON.stringify(collectContentDraft()) !== savedSnapshot;
}

function updateSaveBar() {
  const dirty = isContentDirty();
  saveContentBtn.disabled = !dirty;
  saveBar.classList.toggle('is-dirty', dirty);
  saveBarHint.textContent = dirty ? tt('save.hintDirty') : tt('save.hintClean');
}

function markContentClean() {
  savedSnapshot = JSON.stringify(collectContentDraft());
  updateSaveBar();
}

function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === name);
  });
  document.querySelectorAll('.panel').forEach((panel) => {
    panel.classList.toggle('hidden', panel.id !== `tab-${name}`);
  });
  saveBar.hidden = name !== 'content';
  if (name === 'audit') {
    loadAuditLog({ reset: true }).catch((err) => {
      const status = document.getElementById('auditStatus');
      if (status) showStatus(status, err.message || tt('audit.loadFailed'), true);
    });
  }
}

function renderContentFields() {
  const dir = localeDir(contentLocale);
  contentFields.innerHTML = CONTENT_FIELD_DEFS.map((def) => {
    const key = def[0];
    const type = def[1];
    const label = fieldLabel(adminLocale, key);
    const value = contentState[key] || '';
    if (type === 'textarea') {
      return `<label>${label}<textarea data-key="${key}" lang="${contentLocale}" dir="${dir}" rows="4">${escapeHtml(value)}</textarea></label>`;
    }
    return `<label>${label}<input data-key="${key}" lang="${contentLocale}" dir="${dir}" value="${escapeAttr(value)}" /></label>`;
  }).join('');
}

const MAX_SERVICES = 10;

function renderServices() {
  const canDelete = servicesState.length > 1;
  const addBtn = document.getElementById('addServiceBtn');
  if (addBtn) addBtn.disabled = servicesState.length >= MAX_SERVICES;

  const dir = localeDir(contentLocale);
  servicesFields.innerHTML = servicesState
    .map(
      (s, index) => `
      <div class="card" data-service-id="${s.id}">
        <div class="card-top">
          <h4>${tt('content.serviceN', { n: index + 1 })}</h4>
          <div class="card-actions">
            <label class="check"><input type="checkbox" data-service-visible ${s.visible ? 'checked' : ''}/> ${tt('content.visible')}</label>
            <button type="button" class="btn btn-danger" data-delete-service="${s.id}" ${canDelete ? '' : 'disabled'}>${tt('content.delete')}</button>
          </div>
        </div>
        <label>${tt('content.serviceName')}<input data-service-title lang="${contentLocale}" dir="${dir}" value="${escapeAttr(s.title)}" /></label>
        <label>${tt('content.serviceDesc')}<textarea data-service-description lang="${contentLocale}" dir="${dir}" rows="3">${escapeHtml(s.description)}</textarea></label>
      </div>`
    )
    .join('');
}

function portfolioThumbHtml(item) {
  const isVideo = item.media_type === 'video';
  const thumbSrc = isVideo ? item.cover_url || '' : item.media_url || '';
  const canOpen = !!(item.media_url || item.cover_url);
  if (!canOpen) {
    return `<div class="card-thumb card-thumb-empty" aria-hidden="true"></div>`;
  }
  const inner = thumbSrc
    ? `<img src="${escapeAttr(thumbSrc)}" alt="" loading="lazy" decoding="async" />${
        isVideo ? '<span class="card-thumb-play" aria-hidden="true"></span>' : ''
      }`
    : `<span class="card-thumb-play" aria-hidden="true"></span>`;
  return `<button type="button" class="card-thumb${isVideo ? ' is-video' : ''}${
    thumbSrc ? '' : ' card-thumb-empty'
  }" data-preview="${item.id}" aria-label="${isVideo ? tt('portfolio.playVideo') : tt('portfolio.openImage')}">${inner}</button>`;
}

const previewDialog = document.getElementById('previewDialog');
const previewDialogTitle = document.getElementById('previewDialogTitle');
const previewDialogBody = document.getElementById('previewDialogBody');
const previewCloseBtn = document.getElementById('previewCloseBtn');

function closeMediaPreview() {
  const video = previewDialogBody?.querySelector('video');
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  previewDialogBody.innerHTML = '';
  if (previewDialog?.open) previewDialog.close();
}

function openMediaPreview(item) {
  if (!item || !previewDialog) return;
  const isVideo = item.media_type === 'video';
  const title = item.title || (isVideo ? tt('portfolio.video') : tt('portfolio.image'));
  previewDialogTitle.textContent = title;
  if (isVideo && item.media_url) {
    const poster = item.cover_url ? ` poster="${escapeAttr(item.cover_url)}"` : '';
    previewDialogBody.innerHTML = `<video class="preview-media" controls playsinline autoplay preload="metadata"${poster} src="${escapeAttr(item.media_url)}"></video>`;
  } else if (item.media_url) {
    previewDialogBody.innerHTML = `<img class="preview-media" src="${escapeAttr(item.media_url)}" alt="${escapeAttr(item.alt_text || title)}" />`;
  } else {
    return;
  }
  previewDialog.showModal();
}

previewCloseBtn?.addEventListener('click', closeMediaPreview);
previewDialog?.addEventListener('close', () => {
  const video = previewDialogBody?.querySelector('video');
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  previewDialogBody.innerHTML = '';
});
previewDialog?.addEventListener('click', (event) => {
  if (event.target === previewDialog) closeMediaPreview();
});

function renderPortfolio() {
  if (!portfolioState.length) {
    portfolioList.innerHTML = `<p class="meta">${tt('portfolio.empty')}</p>`;
    return;
  }
  portfolioList.innerHTML = portfolioState
    .map(
      (item, index) => `
      <article class="card card-portfolio" data-id="${item.id}">
        <div class="card-top">
          ${portfolioThumbHtml(item)}
          <div class="card-copy">
            <h4>${escapeHtml(item.title || tt('portfolio.untitled'))}</h4>
            <div class="meta">${escapeHtml((item.categories || [item.category]).filter(Boolean).join(' · '))} · ${item.media_type === 'video' ? tt('portfolio.video') : tt('portfolio.image')} · ${item.visible ? tt('portfolio.visible') : tt('portfolio.hidden')}${item.featured ? ` · ${tt('portfolio.onHome')}` : ''}</div>
          </div>
        </div>
        <div class="card-actions">
          <button type="button" class="btn btn-ghost" data-edit="${item.id}">${tt('portfolio.edit')}</button>
          <button type="button" class="btn btn-ghost btn-icon" data-up="${item.id}" aria-label="${tt('portfolio.moveUp')}" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn btn-ghost btn-icon" data-down="${item.id}" aria-label="${tt('portfolio.moveDown')}" ${index === portfolioState.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn btn-danger" data-delete="${item.id}">${tt('portfolio.delete')}</button>
        </div>
      </article>`
    )
    .join('');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str).replaceAll('"', '&quot;');
}

async function loadAdminData({ locale } = {}) {
  const loadLocale = resolveContentLocale(locale || contentLocale);
  const gen = ++contentLoadGen;
  const [contentRes, portfolioRes] = await Promise.all([
    api(withContentLocale('/api/admin/content', loadLocale)),
    api(withContentLocale('/api/admin/portfolio', loadLocale)),
  ]);
  // Drop stale responses: newer load started, or user switched content locale.
  if (gen !== contentLoadGen) return;
  if (loadLocale !== contentLocale) return;
  if (Array.isArray(contentRes.locales) && contentRes.locales.length) {
    siteLocales = contentRes.locales.map((l) => String(l));
  }
  if (contentRes.defaultLocale) siteDefaultLocale = String(contentRes.defaultLocale);
  if (!isMultilingualUi()) {
    setAdminLocaleLocked(false);
    contentLocale = siteDefaultLocale;
    adminLocale = normalizeUiLocale(siteDefaultLocale);
  } else {
    contentLocale = resolveContentLocale(contentRes.locale || loadLocale || contentLocale);
    if (!adminLocaleLocked) {
      adminLocale = uiLocaleForContent(contentLocale);
    } else {
      adminLocale = readStoredLocale(STORAGE_ADMIN) || adminLocale;
    }
  }
  writeStoredLocale(STORAGE_ADMIN, adminLocale);
  writeStoredLocale(STORAGE_CONTENT, contentLocale);
  applyChrome();
  contentState = contentRes.content || {};
  servicesState = contentRes.services || [];
  portfolioState = portfolioRes.items || [];
  categories = portfolioRes.categories || categories;
  const categoryHtml = categories
    .map(
      (c) =>
        `<label class="check"><input type="checkbox" name="categories" value="${escapeAttr(c)}" /> ${escapeHtml(c)}</label>`
    )
    .join('');
  itemCategories.innerHTML = categoryHtml;
  if (bulkCategories) bulkCategories.innerHTML = categoryHtml;
  renderContentFields();
  renderServices();
  renderPortfolio();
  markContentClean();
  saveBar.hidden = activeTab !== 'content';
  if (!appView.classList.contains('hidden')) {
    await refreshPublishStatus().catch(() => {});
  }
}

function getSelectedCategories(container = itemCategories) {
  return [...container.querySelectorAll('input[name="categories"]:checked')].map((el) => el.value);
}

function setSelectedCategories(list, container = itemCategories) {
  const selected = new Set(list?.length ? list : [categories[0]]);
  container.querySelectorAll('input[name="categories"]').forEach((el) => {
    el.checked = selected.has(el.value);
  });
}

const publishVersionLabel = document.getElementById('publishVersionLabel');
const publishStatusLabel = document.getElementById('publishStatusLabel');
const publishMessage = document.getElementById('publishMessage');
const previewBtn = document.getElementById('previewBtn');
const publishBtn = document.getElementById('publishBtn');
const rollbackBtn = document.getElementById('rollbackBtn');
let publishPollTimer = null;

function formatVersionDate(iso) {
  if (!iso) return '';
  try {
    const tag = adminLocale === 'en' ? 'en-US' : 'he-IL';
    return new Date(iso.endsWith('Z') ? iso : `${iso}Z`).toLocaleString(tag);
  } catch {
    return iso;
  }
}

const publishStrip = document.getElementById('publishStrip');

function publishStatusLabelText(status) {
  if (status === 'Publishing') return tt('publish.status.Publishing');
  if (status === 'Failed') return tt('publish.status.Failed');
  return tt('publish.status.Published');
}

function syncPublishStickyOffset() {
  const header = document.querySelector('.admin-header');
  const h = header?.offsetHeight || 0;
  document.documentElement.style.setProperty('--admin-header-h', `${h}px`);
}

function renderPublishStatus(data) {
  const published = data?.publishedVersion;
  if (published) {
    publishVersionLabel.textContent = tt('publish.version', {
      id: published.id,
      date: formatVersionDate(published.createdAt),
    });
  } else {
    publishVersionLabel.textContent = tt('publish.versionNone');
  }

  const status = data?.status || 'Published';
  const busy = !!data?.publishing || status === 'Publishing';
  const hasChanges = !!data?.hasUnpublishedChanges;

  if (busy) {
    publishStatusLabel.textContent = publishStatusLabelText(status);
  } else if (hasChanges) {
    publishStatusLabel.textContent = tt('publish.status.pending');
  } else if (status === 'Failed') {
    publishStatusLabel.textContent = publishStatusLabelText('Failed');
  } else {
    publishStatusLabel.textContent = publishStatusLabelText('Published');
  }

  publishStatusLabel.classList.toggle('is-publishing', busy);
  publishStatusLabel.classList.toggle('is-failed', !busy && status === 'Failed');
  publishStatusLabel.classList.toggle('is-pending', !busy && hasChanges);

  previewBtn.disabled = busy;
  publishBtn.disabled = busy || !hasChanges;
  rollbackBtn.disabled = busy || !data?.previousVersion;

  publishStrip?.classList.toggle('is-sticky', !busy && hasChanges);
  syncPublishStickyOffset();
}

async function refreshPublishStatus() {
  const locale = contentLocale;
  const data = await api(withContentLocale('/api/admin/publish/status', locale));
  renderPublishStatus(data);
  return data;
}

function draftSavedMessage(data, base) {
  const baseMsg = base || tt('content.draftSaved');
  if (data?.hasUnpublishedChanges) {
    return base ? `${baseMsg} - ${tt('publish.status.pending')}` : tt('content.draftSavedPublish');
  }
  return baseMsg;
}

function stopPublishPoll() {
  if (publishPollTimer) {
    clearInterval(publishPollTimer);
    publishPollTimer = null;
  }
}

async function pollUntilIdle() {
  stopPublishPoll();
  return new Promise((resolve) => {
    const tick = async () => {
      try {
        const data = await refreshPublishStatus();
        if (!data.publishing && data.status !== 'Publishing') {
          stopPublishPoll();
          resolve(data);
        }
      } catch (err) {
        stopPublishPoll();
        showStatus(publishMessage, err.message, true);
        resolve(null);
      }
    };
    tick();
    publishPollTimer = setInterval(tick, 800);
  });
}

async function enterApp(email, { mustChangePassword = false } = {}) {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  userEmail.textContent = email || '';
  await loadAdminData();
  try {
    await refreshPublishStatus();
  } catch (err) {
    showStatus(publishMessage, err.message, true);
  }
  if (mustChangePassword) {
    switchTab('password');
    showStatus(document.getElementById('passwordStatus'), tt('password.demoWarning'), true);
  }
}

async function boot() {
  try {
    assertUiI18nComplete();
  } catch (err) {
    console.error(err);
  }
  initLocalesFromStorage();
  try {
    const me = await api('/api/auth/me');
    await enterApp(me.email);
  } catch {
    appView.classList.add('hidden');
    loginView.classList.remove('hidden');
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const form = new FormData(loginForm);
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password'),
      }),
    });
    await enterApp(data.email, { mustChangePassword: !!data.mustChangePassword });
  } catch (err) {
    loginError.hidden = false;
    loginError.textContent = err.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  location.reload();
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.getElementById('tab-content').addEventListener('input', updateSaveBar);
document.getElementById('tab-content').addEventListener('change', updateSaveBar);

async function saveContentDraft() {
  const status = document.getElementById('contentStatus');
  const locale = contentLocale;
  const { content: nextContent, services: nextServices } = collectContentDraft();
  saveContentBtn.disabled = true;
  await api(withContentLocale('/api/admin/content', locale), {
    method: 'PUT',
    body: JSON.stringify({ locale, content: nextContent, services: nextServices }),
  });
  if (locale !== contentLocale) return;
  contentState = nextContent;
  servicesState = nextServices.map((s) => ({ ...s, visible: s.visible ? 1 : 0 }));
  markContentClean();
  const pub = await refreshPublishStatus().catch(() => null);
  showStatus(status, draftSavedMessage(pub));
}

saveContentBtn.addEventListener('click', async () => {
  if (saveContentBtn.disabled) return;
  const status = document.getElementById('contentStatus');
  try {
    await saveContentDraft();
  } catch (err) {
    updateSaveBar();
    showStatus(status, err.message, true);
  }
});

document.getElementById('addServiceBtn').addEventListener('click', async () => {
  const status = document.getElementById('contentStatus');
  if (servicesState.length >= MAX_SERVICES) {
    showStatus(status, tt('content.maxServices', { n: MAX_SERVICES }), true);
    return;
  }
  const locale = contentLocale;
  try {
    await api(withContentLocale('/api/admin/services', locale), {
      method: 'POST',
      body: JSON.stringify({ locale, title: tt('content.newServiceTitle'), description: '' }),
    });
    if (locale !== contentLocale) return;
    const contentRes = await api(withContentLocale('/api/admin/content', locale));
    if (locale !== contentLocale) return;
    servicesState = contentRes.services || [];
    renderServices();
    markContentClean();
    const pub = await refreshPublishStatus().catch(() => null);
    showStatus(status, draftSavedMessage(pub));
  } catch (err) {
    showStatus(status, err.message, true);
  }
});

servicesFields.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-delete-service]');
  if (!btn) return;
  const status = document.getElementById('contentStatus');
  if (servicesState.length <= 1) {
    showStatus(status, tt('content.minServices'), true);
    return;
  }
  const ok = await askConfirm({
    title: tt('content.deleteServiceTitle'),
    message: tt('content.deleteServiceMessage'),
  });
  if (!ok) return;
  const locale = contentLocale;
  try {
    await api(withContentLocale(`/api/admin/services/${btn.dataset.deleteService}`, locale), {
      method: 'DELETE',
    });
    if (locale !== contentLocale) return;
    const contentRes = await api(withContentLocale('/api/admin/content', locale));
    if (locale !== contentLocale) return;
    servicesState = contentRes.services || [];
    renderServices();
    markContentClean();
    const pub = await refreshPublishStatus().catch(() => null);
    showStatus(status, draftSavedMessage(pub));
  } catch (err) {
    showStatus(status, err.message, true);
  }
});

async function uploadMediaFile(file, kind = 'auto', onProgress) {
  const body = new FormData();
  body.append('file', file);
  body.append('kind', kind);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/upload');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      const pct = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
      onProgress(pct);
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
        return;
      }
      const err = new Error(data.error || tt('upload.failed'));
      err.status = xhr.status;
      reject(err);
    };
    xhr.onerror = () => reject(new Error(tt('upload.networkFailed')));
    xhr.send(body);
  });
}

function setSourceMode(groupName, mode) {
  const radio = itemForm.querySelector(`input[name="${groupName}"][value="${mode}"]`);
  if (radio) radio.checked = true;
}

function syncMediaSourceUi() {
  const mode = itemForm.media_source?.value || 'upload';
  const uploadPanel = document.getElementById('mediaUploadPanel');
  const urlPanel = document.getElementById('mediaUrlPanel');
  if (uploadPanel) uploadPanel.hidden = mode !== 'upload';
  if (urlPanel) urlPanel.hidden = mode !== 'url';
  syncMediaTypeVisibility();
}

function syncMediaTypeVisibility() {
  const mode = itemForm.media_source?.value || 'upload';
  const typeField = document.getElementById('mediaTypeField');
  const typeHint = document.getElementById('mediaTypeHint');
  const isUrl = mode === 'url';
  if (typeField) typeField.hidden = !isUrl;
  if (typeHint) typeHint.hidden = isUrl;
}

function syncCoverSourceUi() {
  const mode = itemForm.cover_source?.value || 'upload';
  const uploadPanel = document.getElementById('coverUploadPanel');
  const urlPanel = document.getElementById('coverUrlPanel');
  if (uploadPanel) uploadPanel.hidden = mode !== 'upload';
  if (urlPanel) urlPanel.hidden = mode !== 'url';
}

function syncCoverVisibility() {
  const coverFieldset = document.getElementById('coverFieldset');
  const isVideo = (itemForm.media_type?.value || 'image') === 'video';
  if (coverFieldset) coverFieldset.hidden = !isVideo;
}

function updateCurrentHints() {
  const mediaHint = document.getElementById('mediaCurrentHint');
  const coverHint = document.getElementById('coverCurrentHint');
  const mediaUrl = itemForm.media_url?.value?.trim() || '';
  const coverUrl = itemForm.cover_url?.value?.trim() || '';
  if (mediaHint) {
    if (mediaUrl && (itemForm.media_source?.value || 'upload') === 'upload') {
      mediaHint.hidden = false;
      mediaHint.textContent = tt('item.current', { url: mediaUrl });
    } else {
      mediaHint.hidden = true;
      mediaHint.textContent = '';
    }
  }
  if (coverHint) {
    if (coverUrl && (itemForm.cover_source?.value || 'upload') === 'upload') {
      coverHint.hidden = false;
      coverHint.textContent = tt('item.current', { url: coverUrl });
    } else {
      coverHint.hidden = true;
      coverHint.textContent = '';
    }
  }
}

function openItemDialog(item = null) {
  itemForm.reset();
  itemForm.id.value = item?.id || '';
  itemForm.title.value = item?.title || '';
  setSelectedCategories(item?.categories || (item?.category ? [item.category] : [categories[0]]));
  itemForm.media_type.value = item?.media_type || 'image';
  itemForm.media_url.value = item?.media_url || '';
  itemForm.cover_url.value = item?.cover_url || '';
  itemForm.alt_text.value = item?.alt_text || '';
  itemForm.visible.checked = item ? !!item.visible : true;
  itemForm.featured.checked = item ? !!item.featured : false;
  const mediaFile = document.getElementById('mediaFile');
  const coverFile = document.getElementById('coverFile');
  const uploadStatus = document.getElementById('mediaUploadStatus');
  if (mediaFile) mediaFile.value = '';
  if (coverFile) coverFile.value = '';
  if (uploadStatus) {
    uploadStatus.hidden = true;
    uploadStatus.textContent = '';
  }
  setSourceMode('media_source', 'upload');
  setSourceMode('cover_source', 'upload');
  syncMediaSourceUi();
  syncCoverSourceUi();
  syncCoverVisibility();
  syncMediaTypeVisibility();
  updateCurrentHints();
  document.getElementById('itemDialogTitle').textContent = item
    ? tt('portfolio.itemEdit')
    : tt('portfolio.itemNew');
  document.getElementById('itemError').hidden = true;
  itemDialog.showModal();
}

itemForm.querySelectorAll('input[name="media_source"]').forEach((el) => {
  el.addEventListener('change', () => {
    syncMediaSourceUi();
    updateCurrentHints();
  });
});
itemForm.querySelectorAll('input[name="cover_source"]').forEach((el) => {
  el.addEventListener('change', () => {
    syncCoverSourceUi();
    updateCurrentHints();
  });
});
document.getElementById('mediaTypeSelect')?.addEventListener('change', () => {
  syncCoverVisibility();
});

document.getElementById('mediaFile')?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const status = document.getElementById('mediaUploadStatus');
  const error = document.getElementById('itemError');
  try {
    status.hidden = false;
    error.hidden = true;
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    const optimized = await optimizeMediaFile(file, kind, (msg) => {
      status.textContent = msg;
    });
    status.textContent = tt('item.uploading', { pct: 0 });
    const data = await uploadMediaFile(optimized, kind, (pct) => {
      status.textContent = tt('item.uploading', { pct });
    });
    itemForm.media_url.value = data.url;
    if (kind === 'video') itemForm.media_type.value = 'video';
    else {
      itemForm.media_type.value = 'image';
      itemForm.cover_url.value = '';
    }
    syncCoverVisibility();
    updateCurrentHints();

    if (kind === 'video') {
      try {
        const coverFile = await extractVideoCover(file, (msg) => {
          status.textContent = msg;
        });
        status.textContent = tt('item.uploadingCoverAuto', { pct: 0 });
        const coverData = await uploadMediaFile(coverFile, 'image', (pct) => {
          status.textContent = tt('item.uploadingCoverAuto', { pct });
        });
        itemForm.cover_url.value = coverData.url;
        updateCurrentHints();
        status.textContent = tt('item.uploadedWithCover');
      } catch (coverErr) {
        status.textContent = tt('item.uploadedCoverFail', { error: coverErr.message });
      }
    } else {
      status.textContent = tt('item.uploaded');
    }
  } catch (err) {
    status.hidden = true;
    error.hidden = false;
    error.textContent = err.message;
  }
});

document.getElementById('coverFile')?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const status = document.getElementById('mediaUploadStatus');
  const error = document.getElementById('itemError');
  try {
    status.hidden = false;
    error.hidden = true;
    const optimized = await optimizeMediaFile(file, 'image', (msg) => {
      status.textContent = msg;
    });
    status.textContent = tt('item.uploadingCover', { pct: 0 });
    const data = await uploadMediaFile(optimized, 'image', (pct) => {
      status.textContent = tt('item.uploadingCover', { pct });
    });
    itemForm.cover_url.value = data.url;
    updateCurrentHints();
    status.textContent = tt('item.coverUploaded');
  } catch (err) {
    status.hidden = true;
    error.hidden = false;
    error.textContent = err.message;
  }
});

document.getElementById('addItemBtn').addEventListener('click', () => openItemDialog());
document.getElementById('cancelItemBtn').addEventListener('click', () => itemDialog.close());

function numberedLabel(base, index, total) {
  const clean = String(base || '').trim();
  if (!clean) return total > 1 ? String(index) : '';
  return total > 1 ? `${clean} ${index}` : clean;
}

function openBulkDialog() {
  if (!bulkForm || !bulkDialog) return;
  bulkForm.reset();
  setSelectedCategories([categories[0]], bulkCategories);
  bulkForm.visible.checked = true;
  bulkForm.featured.checked = false;
  const filesHint = document.getElementById('bulkFilesHint');
  const bulkStatus = document.getElementById('bulkStatus');
  const bulkError = document.getElementById('bulkError');
  if (filesHint) {
    filesHint.hidden = true;
    filesHint.textContent = '';
  }
  if (bulkStatus) {
    bulkStatus.hidden = true;
    bulkStatus.textContent = '';
  }
  if (bulkError) bulkError.hidden = true;
  const submitBtn = document.getElementById('bulkSubmitBtn');
  if (submitBtn) submitBtn.disabled = false;
  bulkDialog.showModal();
}

document.getElementById('bulkImagesBtn')?.addEventListener('click', () => openBulkDialog());
document.getElementById('cancelBulkBtn')?.addEventListener('click', () => bulkDialog?.close());

document.getElementById('bulkImagesInput')?.addEventListener('change', (event) => {
  const count = [...(event.target.files || [])].filter((f) => f.type.startsWith('image/')).length;
  const hint = document.getElementById('bulkFilesHint');
  if (!hint) return;
  if (!count) {
    hint.hidden = true;
    hint.textContent = '';
    return;
  }
  hint.hidden = false;
  hint.textContent = tt('bulk.filesSelected', { n: count });
});

bulkForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = document.getElementById('bulkError');
  const status = document.getElementById('bulkStatus');
  const submitBtn = document.getElementById('bulkSubmitBtn');
  const selectedCategories = getSelectedCategories(bulkCategories);
  const files = [...(document.getElementById('bulkImagesInput')?.files || [])].filter((f) =>
    f.type.startsWith('image/')
  );
  if (!selectedCategories.length) {
    error.hidden = false;
    error.textContent = tt('item.needCategory');
    return;
  }
  if (!files.length) {
    error.hidden = false;
    error.textContent = tt('bulk.needImages');
    return;
  }
  const titleBase = bulkForm.title.value.trim();
  const altBase = bulkForm.alt_text.value.trim();
  const visible = bulkForm.visible.checked;
  const featured = bulkForm.featured.checked;
  let ok = 0;
  let failed = 0;
  error.hidden = true;
  if (submitBtn) submitBtn.disabled = true;
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const n = i + 1;
      status.hidden = false;
      status.textContent = tt('bulk.uploading', { n, total: files.length });
      try {
        const optimized = await optimizeMediaFile(file, 'image', (msg) => {
          status.textContent = `${msg} (${n}/${files.length})`;
        });
        const uploaded = await uploadMediaFile(optimized, 'image');
        const locale = contentLocale;
        await api(withContentLocale('/api/admin/portfolio', locale), {
          method: 'POST',
          body: JSON.stringify({
            locale,
            title: numberedLabel(titleBase, n, files.length),
            categories: selectedCategories,
            media_type: 'image',
            media_url: uploaded.url,
            cover_url: '',
            alt_text: numberedLabel(altBase, n, files.length),
            visible,
            featured,
          }),
        });
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    await loadAdminData();
    bulkDialog.close();
    const pub = await refreshPublishStatus().catch(() => null);
    if (failed) {
      showStatus(
        document.getElementById('portfolioStatus'),
        tt('bulk.partialFail', { ok, failed }),
        true
      );
    } else {
      showStatus(
        document.getElementById('portfolioStatus'),
        draftSavedMessage(pub, tt('bulk.done', { n: ok }))
      );
    }
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
    status.hidden = true;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

itemForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = document.getElementById('itemError');
  const selectedCategories = getSelectedCategories();
  if (!selectedCategories.length) {
    error.hidden = false;
    error.textContent = tt('item.needCategory');
    return;
  }
  const locale = contentLocale;
  const payload = {
    locale,
    title: itemForm.title.value.trim(),
    categories: selectedCategories,
    media_type: itemForm.media_type.value,
    media_url: itemForm.media_url.value.trim(),
    cover_url: itemForm.cover_url.value.trim(),
    alt_text: itemForm.alt_text.value.trim(),
    visible: itemForm.visible.checked,
    featured: itemForm.featured.checked,
  };
  const id = itemForm.id.value;
  try {
    if (id) {
      const existing = portfolioState.find((p) => String(p.id) === String(id));
      await api(withContentLocale(`/api/admin/portfolio/${id}`, locale), {
        method: 'PUT',
        body: JSON.stringify({ ...payload, sort_order: existing?.sort_order || 0 }),
      });
    } else {
      await api(withContentLocale('/api/admin/portfolio', locale), {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    itemDialog.close();
    await loadAdminData();
    const pub = await refreshPublishStatus().catch(() => null);
    showStatus(document.getElementById('portfolioStatus'), draftSavedMessage(pub));
  } catch (err) {
    error.hidden = false;
    error.textContent = err.message;
  }
});

portfolioList.addEventListener('click', async (event) => {
  const btn = event.target.closest('button');
  if (!btn) return;
  const status = document.getElementById('portfolioStatus');

  if (btn.dataset.preview) {
    const item = portfolioState.find((p) => String(p.id) === btn.dataset.preview);
    if (item) openMediaPreview(item);
    return;
  }

  if (btn.dataset.edit) {
    const item = portfolioState.find((p) => String(p.id) === btn.dataset.edit);
    if (item) openItemDialog(item);
    return;
  }

  if (btn.dataset.delete) {
    const ok = await askConfirm({
      title: tt('portfolio.deleteTitle'),
      message: tt('portfolio.deleteMessage'),
    });
    if (!ok) return;
    const locale = contentLocale;
    try {
      await api(withContentLocale(`/api/admin/portfolio/${btn.dataset.delete}`, locale), {
        method: 'DELETE',
      });
      await loadAdminData({ locale });
      const pub = await refreshPublishStatus().catch(() => null);
      showStatus(status, draftSavedMessage(pub));
    } catch (err) {
      showStatus(status, err.message, true);
    }
    return;
  }

  if (btn.dataset.up || btn.dataset.down) {
    const id = Number(btn.dataset.up || btn.dataset.down);
    const index = portfolioState.findIndex((p) => p.id === id);
    if (index < 0) return;
    const swapWith = btn.dataset.up ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= portfolioState.length) return;
    const ids = portfolioState.map((p) => p.id);
    [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
    const locale = contentLocale;
    try {
      await api(withContentLocale('/api/admin/portfolio/reorder', locale), {
        method: 'PUT',
        body: JSON.stringify({ ids, locale }),
      });
      await loadAdminData({ locale });
    } catch (err) {
      showStatus(status, err.message, true);
    }
  }
});

document.getElementById('passwordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.getElementById('passwordStatus');
  const formEl = event.currentTarget;
  const form = new FormData(formEl);
  try {
    await api('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: form.get('currentPassword'),
        newPassword: form.get('newPassword'),
        confirmPassword: form.get('confirmPassword'),
      }),
    });
    formEl.reset();
    showStatus(status, tt('password.updated'));
  } catch (err) {
    showStatus(status, err.message, true);
  }
});

previewBtn.addEventListener('click', async () => {
  const publishLocale = contentLocale;
  try {
    previewBtn.disabled = true;
    const data = await api(withContentLocale('/api/admin/preview-token', publishLocale), {
      method: 'POST',
      body: JSON.stringify({ locale: publishLocale }),
    });
    window.open(data.previewUrl, '_blank', 'noopener');
    showStatus(publishMessage, tt('publish.previewOpened'));
  } catch (err) {
    showStatus(publishMessage, err.message, true);
  } finally {
    await refreshPublishStatus().catch(() => {});
  }
});

publishBtn.addEventListener('click', async () => {
  const ok = await askConfirm({
    title: tt('publish.confirmTitle'),
    message: tt('publish.confirmMessage'),
    confirmLabel: tt('publish.confirmOk'),
    confirmClass: 'btn',
  });
  if (!ok) return;
  const publishLocale = contentLocale;
  try {
    publishBtn.disabled = true;
    previewBtn.disabled = true;
    rollbackBtn.disabled = true;
    publishStatusLabel.textContent = publishStatusLabelText('Publishing');
    publishStatusLabel.classList.add('is-publishing');
    publishStatusLabel.classList.remove('is-failed');
    showStatus(publishMessage, tt('publish.publishing'));
    await api(withContentLocale('/api/admin/publish', publishLocale), {
      method: 'POST',
      body: JSON.stringify({ locale: publishLocale }),
    });
    await pollUntilIdle();
    showStatus(publishMessage, tt('publish.success'));
  } catch (err) {
    await refreshPublishStatus().catch(() => {});
    showStatus(publishMessage, err.message || tt('publish.failed'), true);
  }
});

rollbackBtn.addEventListener('click', async () => {
  const ok = await askConfirm({
    title: tt('rollback.confirmTitle'),
    message: tt('rollback.confirmMessage'),
    confirmLabel: tt('rollback.confirmOk'),
    confirmClass: 'btn',
  });
  if (!ok) return;
  const publishLocale = contentLocale;
  try {
    publishBtn.disabled = true;
    previewBtn.disabled = true;
    rollbackBtn.disabled = true;
    publishStatusLabel.textContent = publishStatusLabelText('Publishing');
    publishStatusLabel.classList.add('is-publishing');
    showStatus(publishMessage, tt('publish.rolling'));
    await api(withContentLocale('/api/admin/rollback', publishLocale), {
      method: 'POST',
      body: JSON.stringify({ locale: publishLocale }),
    });
    await pollUntilIdle();
    await loadAdminData({ locale: publishLocale });
    showStatus(publishMessage, tt('publish.rollbackSuccess'));
  } catch (err) {
    await refreshPublishStatus().catch(() => {});
    showStatus(publishMessage, err.message || tt('publish.rollbackFailed'), true);
  }
});

async function switchContentLocale(nextLocale) {
  const target = resolveContentLocale(nextLocale);
  if (target === contentLocale) return;
  if (isContentDirty()) {
    const choice = await askConfirm({
      title: tt('dirty.switchTitle'),
      message: tt('dirty.switchMessage'),
      confirmLabel: tt('dirty.saveAndSwitch'),
      confirmClass: 'btn',
      altLabel: tt('dirty.discardAndSwitch'),
    });
    if (choice === false) {
      syncLocalePickers();
      return;
    }
    if (choice === true) {
      try {
        await saveContentDraft();
      } catch (err) {
        showStatus(document.getElementById('contentStatus'), err.message, true);
        syncLocalePickers();
        return;
      }
    }
  }
  contentLocale = target;
  writeStoredLocale(STORAGE_CONTENT, contentLocale);
  // Unlocked UI follows content; locked UI stays until the user changes it again.
  syncAdminLocaleToContent({ persist: true });
  syncLocalePickers();
  try {
    await loadAdminData({ locale: contentLocale });
  } catch (err) {
    showStatus(publishMessage, err.message, true);
  }
}

function switchAdminLocale(nextLocale) {
  if (!isMultilingualUi()) {
    syncLocalePickers();
    return;
  }
  adminLocale = normalizeUiLocale(nextLocale);
  writeStoredLocale(STORAGE_ADMIN, adminLocale);
  // Explicit UI pick locks follow-mode; matching content again unlocks.
  setAdminLocaleLocked(adminLocale !== uiLocaleForContent(contentLocale));
  applyChrome();
  renderContentFields();
  renderServices();
  renderPortfolio();
  updateSaveBar();
  refreshPublishStatus().catch(() => {});
}

document.getElementById('adminLocaleSelect')?.addEventListener('change', (event) => {
  switchAdminLocale(event.target.value);
});

document.getElementById('contentLocaleSelect')?.addEventListener('change', async (event) => {
  await switchContentLocale(event.target.value);
});

window.addEventListener('resize', () => {
  if (publishStrip?.classList.contains('is-sticky')) syncPublishStickyOffset();
});

let auditNextCursor = null;
let auditLoading = false;

function auditFilterParams() {
  const params = new URLSearchParams();
  const action = document.getElementById('auditActionFilter')?.value || '';
  const entityType = document.getElementById('auditEntityFilter')?.value || '';
  const from = document.getElementById('auditFromFilter')?.value || '';
  const to = document.getElementById('auditToFilter')?.value || '';
  if (action) params.set('action', action);
  if (entityType) params.set('entity_type', entityType);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('limit', '25');
  return params;
}

function formatAuditDetails(details) {
  if (!details || typeof details !== 'object') return '';
  const fields = details.fields;
  if (fields && typeof fields === 'object') {
    const lines = Object.entries(fields).map(([key, diff]) => {
      const before = diff && typeof diff === 'object' && 'before' in diff ? diff.before : '';
      const after = diff && typeof diff === 'object' && 'after' in diff ? diff.after : '';
      return `${key}:\n  ${tt('audit.before')}: ${stringifyAuditValue(before)}\n  ${tt('audit.after')}: ${stringifyAuditValue(after)}`;
    });
    if (lines.length) return lines.join('\n\n');
  }
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return '';
  }
}

function stringifyAuditValue(value) {
  if (value == null) return '—';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  const text = String(value);
  return text.length ? text : '—';
}

function renderAuditItems(items, { append }) {
  const list = document.getElementById('auditList');
  if (!list) return;
  const html = (items || [])
    .map((item) => {
      const when = item.createdAt ? escapeHtml(item.createdAt) : '—';
      const user = escapeHtml(item.actorEmail || (item.actorUserId ? `#${item.actorUserId}` : '—'));
      const action = escapeHtml(item.action || '');
      const entity = escapeHtml([item.entityType, item.entityId].filter(Boolean).join(' · ') || '—');
      const summary = escapeHtml(item.summary || '');
      const ok = item.success !== false;
      const badge = ok
        ? `<span class="audit-badge">${tt('audit.success')}</span>`
        : `<span class="audit-badge is-fail">${tt('audit.fail')}</span>`;
      const detailsText = formatAuditDetails(item.details);
      const detailsBlock = detailsText
        ? `<pre class="audit-diff">${escapeHtml(detailsText)}</pre>`
        : '';
      return `<article class="audit-row">
        <div class="audit-row-head">
          <time datetime="${when}">${when}</time>
          <span class="audit-action">${action}</span>
          ${badge}
        </div>
        <p class="audit-meta">${user} · ${entity}</p>
        <p class="audit-summary">${summary}</p>
        ${detailsBlock}
      </article>`;
    })
    .join('');
  if (append) list.insertAdjacentHTML('beforeend', html);
  else list.innerHTML = html || `<p class="meta">${tt('audit.empty')}</p>`;
}

async function loadAuditLog({ reset = false, append = false } = {}) {
  if (auditLoading) return;
  const status = document.getElementById('auditStatus');
  const moreBtn = document.getElementById('auditMoreBtn');
  auditLoading = true;
  try {
    if (status) status.hidden = true;
    const params = auditFilterParams();
    if (!reset && append && auditNextCursor) params.set('cursor', String(auditNextCursor));
    if (reset) auditNextCursor = null;
    const data = await api(`/api/admin/audit?${params.toString()}`);
    renderAuditItems(data.items || [], { append: append && !reset });
    auditNextCursor = data.nextCursor || null;
    if (moreBtn) moreBtn.hidden = !data.hasMore;
  } catch (err) {
    if (status) showStatus(status, err.message || tt('audit.loadFailed'), true);
    throw err;
  } finally {
    auditLoading = false;
  }
}

document.getElementById('auditFilters')?.addEventListener('submit', (event) => {
  event.preventDefault();
  loadAuditLog({ reset: true }).catch(() => {});
});

document.getElementById('auditRefreshBtn')?.addEventListener('click', () => {
  loadAuditLog({ reset: true }).catch(() => {});
});

document.getElementById('auditMoreBtn')?.addEventListener('click', () => {
  if (!auditNextCursor) return;
  loadAuditLog({ append: true }).catch(() => {});
});

boot();
