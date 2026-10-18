/** Helpers for R2 keys derived from public /media/... URLs. */

export function mediaKeyFromUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const path = raw.startsWith('http') ? new URL(raw).pathname : raw;
    if (!path.startsWith('/media/')) return null;
    const key = decodeURIComponent(path.slice('/media/'.length));
    if (!key || key.includes('..') || key.startsWith('/')) return null;
    return key;
  } catch {
    return null;
  }
}

export async function deleteMediaUrl(bucket, url) {
  if (!bucket) return;
  const key = mediaKeyFromUrl(url);
  if (!key) return;
  try {
    await bucket.delete(key);
  } catch (err) {
    console.error('R2 delete failed', key, err);
  }
}

export async function deletePortfolioMedia(bucket, row) {
  if (!row) return;
  await deleteMediaUrl(bucket, row.media_url);
  if (row.cover_url && row.cover_url !== row.media_url) {
    await deleteMediaUrl(bucket, row.cover_url);
  }
}
