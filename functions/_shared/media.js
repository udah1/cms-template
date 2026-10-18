const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
export const MAX_VIDEO_DURATION_SEC = 120;

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export function contentTypeForKey(key) {
  const lower = String(key || '').toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  return 'application/octet-stream';
}

function sanitizeBaseName(name) {
  const base = String(name || 'file')
    .split(/[/\\]/)
    .pop()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._\u0590-\u05FF-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return base || 'file';
}

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/**
 * @param {{ file: File, kind?: 'image'|'video'|'auto' }} opts
 */
export function planUpload({ file, kind = 'auto' }) {
  if (!file || typeof file.size !== 'number') {
    const err = new Error('קובץ חסר');
    err.status = 400;
    throw err;
  }

  const type = String(file.type || '').toLowerCase();
  const isImage = IMAGE_TYPES.has(type);
  const isVideo = VIDEO_TYPES.has(type);

  if (kind === 'image' && !isImage) {
    const err = new Error('יש להעלות תמונה (JPEG / PNG / WebP)');
    err.status = 400;
    throw err;
  }
  if (kind === 'video' && !isVideo) {
    const err = new Error('יש להעלות סרטון (MP4 / WebM)');
    err.status = 400;
    throw err;
  }
  if (kind === 'auto' && !isImage && !isVideo) {
    const err = new Error('סוג קובץ לא נתמך');
    err.status = 400;
    throw err;
  }

  const max = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > max) {
    const mb = Math.round(max / (1024 * 1024));
    const err = new Error(`הקובץ גדול מדי (מקסימום ${mb}MB)`);
    err.status = 400;
    throw err;
  }

  const folder = isVideo ? 'videos' : 'images';
  const ext = EXT_BY_TYPE[type] || (isVideo ? 'mp4' : 'jpg');
  const key = `${folder}/${Date.now()}-${randomId()}-${sanitizeBaseName(file.name)}.${ext}`;

  return {
    key,
    contentType: type,
    folder,
    isVideo,
    publicPath: `/media/${key}`,
  };
}
