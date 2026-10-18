const SESSION_COOKIE = 'cms_session';
const SESSION_DAYS = 14;
const SESSION_DAYS_REMEMBER = 365;

export function sessionDaysForRemember(rememberMe) {
  return rememberMe ? SESSION_DAYS_REMEMBER : SESSION_DAYS;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

export function badRequest(message, status = 400) {
  return json({ error: message }, status);
}

function b64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPassword(password, saltBytes) {
  const enc = new TextEncoder();
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `pbkdf2$100000$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  const salt = fromB64(parts[2]);
  const expected = parts[3];
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const actual = b64(new Uint8Array(bits));
  return actual === expected;
}

export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

export function sessionCookie(token, request, maxAgeSeconds = SESSION_DAYS * 86400) {
  const url = new URL(request.url);
  const secure = url.protocol === 'https:';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getSessionToken(request) {
  return parseCookies(request)[SESSION_COOKIE] || null;
}

export async function createSession(db, userId, { days = SESSION_DAYS } = {}) {
  const ttlDays = Number(days) > 0 ? Number(days) : SESSION_DAYS;
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, '');
  const expires = new Date(Date.now() + ttlDays * 86400 * 1000).toISOString();
  await db
    .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, userId, expires)
    .run();
  return { token, days: ttlDays, maxAgeSeconds: ttlDays * 86400 };
}

export async function destroySession(db, token) {
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

export async function requireUser(db, request) {
  const token = getSessionToken(request);
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT u.id, u.email, s.expires_at
       FROM sessions s
       JOIN admin_users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .bind(token)
    .first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await destroySession(db, token);
    return null;
  }
  return { id: row.id, email: row.email, token };
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
