import { extractVideoCover, optimizeMediaFile } from './media-optimize.js';

const CONTENT_FIELDS = [
  ['business_name', 'שם העסק'],
  ['hero_eyebrow', 'כותרת עליונה ב־Hero'],
  ['hero_title', 'כותרת Hero'],
  ['hero_title_em', 'משפט משנה ב־Hero'],
  ['hero_description', 'תיאור Hero', 'textarea'],
  ['brand_quote', 'משפט המותג', 'textarea'],
  ['about_title', 'כותרת אודות'],
  ['about_title_em', 'משפט משנה באודות'],
  ['about_body', 'טקסט אודות', 'textarea'],
  ['portfolio_lead', 'תיאור גלריה', 'textarea'],
  ['contact_intro', 'טקסט יצירת קשר', 'textarea'],
  ['area_label', 'אזור פעילות'],
  ['instagram_url', 'קישור Instagram'],
  ['contact_phone', 'טלפון / WhatsApp'],
  ['whatsapp_url', 'כתובת WhatsApp (wa.me)'],
  ['whatsapp_message', 'הודעה מקדימה ל־WhatsApp', 'textarea'],
  ['contact_email', 'אימייל'],
  ['seo_title', 'כותרת SEO'],
  ['seo_description', 'תיאור SEO', 'textarea'],
  ['og_image', 'תמונת OG (נתיב או URL)'],
];

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
const confirmCancelBtn = document.getElementById('confirmCancelBtn');

let contentState = {};
let servicesState = [];
let portfolioState = [];
let categories = ['כללי', 'פרויקטים', 'גלריה', 'וידאו'];
let confirmResolver = null;

function askConfirm({ title = 'אישור מחיקה', message = 'למחוק?', confirmLabel = 'מחיקה' } = {}) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmOkBtn.textContent = confirmLabel;
  confirmDialog.showModal();
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function settleConfirm(result) {
  if (confirmDialog.open) confirmDialog.close();
  if (confirmResolver) {
    confirmResolver(result);
    confirmResolver = null;
  }
}

confirmOkBtn.addEventListener('click', () => settleConfirm(true));
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
    const err = new Error(data.error || 'שגיאה');
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

function updateSaveBar() {
  const dirty = JSON.stringify(collectContentDraft()) !== savedSnapshot;
  saveContentBtn.disabled = !dirty;
  saveBar.classList.toggle('is-dirty', dirty);
  saveBarHint.textContent = dirty ? 'יש שינויים שלא נשמרו' : 'אין שינויים לשמירה';
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
}

function renderContentFields() {
  contentFields.innerHTML = CONTENT_FIELDS.map(([key, label, type]) => {
    const value = contentState[key] || '';
    if (type === 'textarea') {
      return `<label>${label}<textarea data-key="${key}" rows="4">${escapeHtml(value)}</textarea></label>`;
    }
    return `<label>${label}<input data-key="${key}" value="${escapeAttr(value)}" /></label>`;
  }).join('');
}

const MAX_SERVICES = 10;

function renderServices() {
  const canDelete = servicesState.length > 1;
  const addBtn = document.getElementById('addServiceBtn');
  if (addBtn) addBtn.disabled = servicesState.length >= MAX_SERVICES;

  servicesFields.innerHTML = servicesState
    .map(
      (s, index) => `
      <div class="card" data-service-id="${s.id}">
        <div class="card-top">
          <h4>שירות ${index + 1}</h4>
          <div class="card-actions">
            <label class="check"><input type="checkbox" data-service-visible ${s.visible ? 'checked' : ''}/> מוצג</label>
            <button type="button" class="btn btn-danger" data-delete-service="${s.id}" ${canDelete ? '' : 'disabled'}>מחיקה</button>
          </div>
        </div>
        <label>שם<input data-service-title value="${escapeAttr(s.title)}" /></label>
        <label>תיאור<textarea data-service-description rows="3">${escapeHtml(s.description)}</textarea></label>
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
  }" data-preview="${item.id}" aria-label="${isVideo ? 'ניגון סרטון' : 'פתיחת תמונה'}">${inner}</button>`;
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
  const title = item.title || (isVideo ? 'סרטון' : 'תמונה');
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
    portfolioList.innerHTML = '<p class="meta">אין פריטים עדיין. אפשר להוסיף פריט חדש.</p>';
    return;
  }
  portfolioList.innerHTML = portfolioState
    .map(
      (item, index) => `
      <article class="card card-portfolio" data-id="${item.id}">
        <div class="card-top">
          ${portfolioThumbHtml(item)}
          <div class="card-copy">
            <h4>${escapeHtml(item.title || 'ללא כותרת')}</h4>
            <div class="meta">${escapeHtml((item.categories || [item.category]).filter(Boolean).join(' · '))} · ${item.media_type === 'video' ? 'סרטון' : 'תמונה'} · ${item.visible ? 'מוצג' : 'מוסתר'}${item.featured ? ' · בדף הבית' : ''}</div>
          </div>
        </div>
        <div class="card-actions">
          <button type="button" class="btn btn-ghost" data-edit="${item.id}">עריכה</button>
          <button type="button" class="btn btn-ghost btn-icon" data-up="${item.id}" aria-label="הזזה למעלה" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn btn-ghost btn-icon" data-down="${item.id}" aria-label="הזזה למטה" ${index === portfolioState.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn btn-danger" data-delete="${item.id}">מחיקה</button>
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

async function loadAdminData() {
  const [contentRes, portfolioRes] = await Promise.all([
    api('/api/admin/content'),
    api('/api/admin/portfolio'),
  ]);
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
    return new Date(iso.endsWith('Z') ? iso : `${iso}Z`).toLocaleString('he-IL');
  } catch {
    return iso;
  }
}

const PUBLISH_STATUS_HE = {
  Published: 'פורסם',
  Publishing: 'מפרסם…',
  Failed: 'נכשל',
};

const publishStrip = document.getElementById('publishStrip');

function publishStatusHe(status) {
  return PUBLISH_STATUS_HE[status] || status || 'פורסם';
}

function syncPublishStickyOffset() {
  const header = document.querySelector('.admin-header');
  const h = header?.offsetHeight || 0;
  document.documentElement.style.setProperty('--admin-header-h', `${h}px`);
}

function renderPublishStatus(data) {
  const published = data?.publishedVersion;
  if (published) {
    publishVersionLabel.textContent = `גרסה מפורסמת: #${published.id} · ${formatVersionDate(published.createdAt)}`;
  } else {
    publishVersionLabel.textContent = 'גרסה מפורסמת: —';
  }

  const status = data?.status || 'Published';
  const busy = !!data?.publishing || status === 'Publishing';
  const hasChanges = !!data?.hasUnpublishedChanges;

  if (busy) {
    publishStatusLabel.textContent = publishStatusHe(status);
  } else if (hasChanges) {
    publishStatusLabel.textContent = 'יש שינויים לפרסום';
  } else if (status === 'Failed') {
    publishStatusLabel.textContent = publishStatusHe('Failed');
  } else {
    publishStatusLabel.textContent = publishStatusHe('Published');
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
  const data = await api('/api/admin/publish/status');
  renderPublishStatus(data);
  return data;
}

function draftSavedMessage(data, base = 'טיוטה נשמרה') {
  return data?.hasUnpublishedChanges ? `${base} - לא לשכוח לפרסם` : base;
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
    showStatus(
      document.getElementById('passwordStatus'),
      'זוהתה סיסמת הדמו (ChangeMe123!). החליפו אותה לפני פריסה לאתר חי.',
      true
    );
  }
}

async function boot() {
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

saveContentBtn.addEventListener('click', async () => {
  if (saveContentBtn.disabled) return;
  const status = document.getElementById('contentStatus');
  const { content: nextContent, services: nextServices } = collectContentDraft();
  try {
    saveContentBtn.disabled = true;
    await api('/api/admin/content', {
      method: 'PUT',
      body: JSON.stringify({ content: nextContent, services: nextServices }),
    });
    contentState = nextContent;
    servicesState = nextServices.map((s) => ({ ...s, visible: s.visible ? 1 : 0 }));
    markContentClean();
    const pub = await refreshPublishStatus().catch(() => null);
    showStatus(status, draftSavedMessage(pub));
  } catch (err) {
    updateSaveBar();
    showStatus(status, err.message, true);
  }
});

document.getElementById('addServiceBtn').addEventListener('click', async () => {
  const status = document.getElementById('contentStatus');
  if (servicesState.length >= MAX_SERVICES) {
    showStatus(status, `ניתן להוסיף עד ${MAX_SERVICES} שירותים`, true);
    return;
  }
  try {
    await api('/api/admin/services', {
      method: 'POST',
      body: JSON.stringify({ title: 'שירות חדש', description: '' }),
    });
    const contentRes = await api('/api/admin/content');
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
    showStatus(status, 'חייבים להשאיר לפחות שירות אחד', true);
    return;
  }
  const ok = await askConfirm({
    title: 'מחיקת שירות',
    message: 'למחוק את השירות? לא ניתן לשחזר אחר כך.',
  });
  if (!ok) return;
  try {
    await api(`/api/admin/services/${btn.dataset.deleteService}`, { method: 'DELETE' });
    const contentRes = await api('/api/admin/content');
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
      const err = new Error(data.error || 'העלאה נכשלה');
      err.status = xhr.status;
      reject(err);
    };
    xhr.onerror = () => reject(new Error('העלאה נכשלה - בעיית רשת'));
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
      mediaHint.textContent = `נוכחי: ${mediaUrl}`;
    } else {
      mediaHint.hidden = true;
      mediaHint.textContent = '';
    }
  }
  if (coverHint) {
    if (coverUrl && (itemForm.cover_source?.value || 'upload') === 'upload') {
      coverHint.hidden = false;
      coverHint.textContent = `נוכחי: ${coverUrl}`;
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
  document.getElementById('itemDialogTitle').textContent = item ? 'עריכת פריט' : 'פריט חדש';
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
    status.textContent = 'מעלה מדיה… 0%';
    const data = await uploadMediaFile(optimized, kind, (pct) => {
      status.textContent = `מעלה מדיה… ${pct}%`;
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
        status.textContent = 'מעלה קאבר אוטומטי… 0%';
        const coverData = await uploadMediaFile(coverFile, 'image', (pct) => {
          status.textContent = `מעלה קאבר אוטומטי… ${pct}%`;
        });
        itemForm.cover_url.value = coverData.url;
        updateCurrentHints();
        status.textContent = 'המדיה והקאבר הועלו - טיוטה תישמר עם שמירת הפריט';
      } catch (coverErr) {
        status.textContent = `המדיה הועלתה; קאבר אוטומטי נכשל (${coverErr.message}). אפשר להעלות ידנית.`;
      }
    } else {
      status.textContent = 'המדיה הועלתה (אחרי דחיסה) - טיוטה תישמר עם שמירת הפריט';
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
    status.textContent = 'מעלה קאבר… 0%';
    const data = await uploadMediaFile(optimized, 'image', (pct) => {
      status.textContent = `מעלה קאבר… ${pct}%`;
    });
    itemForm.cover_url.value = data.url;
    updateCurrentHints();
    status.textContent = 'הקאבר הועלה - טיוטה תישמר עם שמירת הפריט';
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
  hint.textContent = `נבחרו ${count} תמונות`;
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
    error.textContent = 'יש לבחור לפחות קטגוריה אחת';
    return;
  }
  if (!files.length) {
    error.hidden = false;
    error.textContent = 'יש לבחור לפחות תמונה אחת';
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
      status.textContent = `מעלה תמונה ${n} מתוך ${files.length}…`;
      try {
        const optimized = await optimizeMediaFile(file, 'image', (msg) => {
          status.textContent = `${msg} (${n}/${files.length})`;
        });
        const uploaded = await uploadMediaFile(optimized, 'image');
        await api('/api/admin/portfolio', {
          method: 'POST',
          body: JSON.stringify({
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
        `הועלו ${ok} תמונות, ${failed} נכשלו - בדקי ונסה שוב`,
        true
      );
    } else {
      showStatus(
        document.getElementById('portfolioStatus'),
        draftSavedMessage(pub, `הועלו ${ok} תמונות לטיוטה`)
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
    error.textContent = 'יש לבחור לפחות קטגוריה אחת';
    return;
  }
  const payload = {
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
      await api(`/api/admin/portfolio/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...payload, sort_order: existing?.sort_order || 0 }),
      });
    } else {
      await api('/api/admin/portfolio', { method: 'POST', body: JSON.stringify(payload) });
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
      title: 'מחיקת פריט',
      message: 'למחוק את הפריט מתיק העבודות? לא ניתן לשחזר אחר כך.',
    });
    if (!ok) return;
    try {
      await api(`/api/admin/portfolio/${btn.dataset.delete}`, { method: 'DELETE' });
      await loadAdminData();
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
    try {
      await api('/api/admin/portfolio/reorder', { method: 'PUT', body: JSON.stringify({ ids }) });
      await loadAdminData();
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
    showStatus(status, 'הסיסמה עודכנה.');
  } catch (err) {
    showStatus(status, err.message, true);
  }
});

previewBtn.addEventListener('click', async () => {
  try {
    previewBtn.disabled = true;
    const data = await api('/api/admin/preview-token', { method: 'POST', body: '{}' });
    window.open(data.previewUrl, '_blank', 'noopener');
    showStatus(publishMessage, 'נפתחה תצוגה מקדימה של הטיוטה');
  } catch (err) {
    showStatus(publishMessage, err.message, true);
  } finally {
    await refreshPublishStatus().catch(() => {});
  }
});

publishBtn.addEventListener('click', async () => {
  const ok = await askConfirm({
    title: 'פרסום האתר',
    message: 'לפרסם את הטיוטה הנוכחית לאתר הציבורי?',
    confirmLabel: 'פרסום',
  });
  if (!ok) return;
  try {
    publishBtn.disabled = true;
    previewBtn.disabled = true;
    rollbackBtn.disabled = true;
    publishStatusLabel.textContent = publishStatusHe('Publishing');
    publishStatusLabel.classList.add('is-publishing');
    publishStatusLabel.classList.remove('is-failed');
    showStatus(publishMessage, 'מפרסם…');
    await api('/api/admin/publish', { method: 'POST', body: '{}' });
    await pollUntilIdle();
    showStatus(publishMessage, 'פורסם בהצלחה');
  } catch (err) {
    await refreshPublishStatus().catch(() => {});
    showStatus(publishMessage, err.message || 'הפרסום נכשל', true);
  }
});

rollbackBtn.addEventListener('click', async () => {
  const ok = await askConfirm({
    title: 'שחזור לגרסה קודמת',
    message:
      'לשחזר את כל האתר (תוכן, גלריה, metadata ו־schema) לגרסה הקודמת שפורסמה? המדיה עצמה לא תימחק.',
    confirmLabel: 'שחזור',
  });
  if (!ok) return;
  try {
    publishBtn.disabled = true;
    previewBtn.disabled = true;
    rollbackBtn.disabled = true;
    publishStatusLabel.textContent = publishStatusHe('Publishing');
    publishStatusLabel.classList.add('is-publishing');
    showStatus(publishMessage, 'משחזר ומפרסם…');
    await api('/api/admin/rollback', { method: 'POST', body: '{}' });
    await pollUntilIdle();
    await loadAdminData();
    showStatus(publishMessage, 'שוחזר לגרסה הקודמת ופורסם');
  } catch (err) {
    await refreshPublishStatus().catch(() => {});
    showStatus(publishMessage, err.message || 'השחזור נכשל', true);
  }
});

window.addEventListener('resize', () => {
  if (publishStrip?.classList.contains('is-sticky')) syncPublishStickyOffset();
});

boot();
