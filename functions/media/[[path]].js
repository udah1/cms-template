import { contentTypeForKey } from '../_shared/media.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const bucket = env.MEDIA;
  if (!bucket) {
    return new Response('Media storage is not configured', { status: 503 });
  }

  const parts = (params.path || []).filter(Boolean);
  if (!parts.length) {
    return new Response('Not found', { status: 404 });
  }

  const key = parts.map(decodeURIComponent).join('/');
  if (key.includes('..') || key.startsWith('/')) {
    return new Response('Not found', { status: 404 });
  }

  const object = await bucket.get(key);
  if (!object) {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  if (!headers.has('content-type')) {
    headers.set('Content-Type', contentTypeForKey(key));
  }
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { headers });
}
