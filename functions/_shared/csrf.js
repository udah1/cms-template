export function assertSameOrigin(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin) {
    try {
      const o = new URL(origin);
      if (o.protocol === url.protocol && o.host === url.host) return true;
    } catch {
      return false;
    }
    return false;
  }
  const referer = request.headers.get('Referer');
  if (referer) {
    try {
      const r = new URL(referer);
      if (r.protocol === url.protocol && r.host === url.host) return true;
    } catch {
      return false;
    }
    return false;
  }
  // Same-origin fetch from admin pages usually sends Origin; without either, reject.
  return false;
}
