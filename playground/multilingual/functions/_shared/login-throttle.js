/** Basic login throttle stored in D1. */

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

export async function ensureLoginThrottleTable(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS login_throttle (
        throttle_key TEXT PRIMARY KEY,
        fail_count INTEGER NOT NULL DEFAULT 0,
        window_started_at TEXT NOT NULL DEFAULT (datetime('now')),
        locked_until TEXT
      )`
    )
    .run();
}

export function clientThrottleKey(request, email = '') {
  const cf = request.headers.get('CF-Connecting-IP');
  const fwd = request.headers.get('X-Forwarded-For');
  const ip = (cf || (fwd ? fwd.split(',')[0].trim() : '') || 'unknown').slice(0, 80);
  const mail = String(email || '')
    .trim()
    .toLowerCase()
    .slice(0, 120);
  return mail ? `${ip}|${mail}` : ip;
}

export async function assertLoginAllowed(db, key) {
  await ensureLoginThrottleTable(db);
  const row = await db
    .prepare('SELECT fail_count, window_started_at, locked_until FROM login_throttle WHERE throttle_key = ?')
    .bind(key)
    .first();
  if (!row) return;
  if (row.locked_until) {
    const until = Date.parse(row.locked_until);
    if (Number.isFinite(until) && until > Date.now()) {
      const err = new Error('יותר מדי ניסיונות כושלים. נסי שוב בעוד כמה דקות.');
      err.status = 429;
      throw err;
    }
  }
}

export async function recordLoginFailure(db, key) {
  await ensureLoginThrottleTable(db);
  const row = await db
    .prepare('SELECT fail_count, window_started_at, locked_until FROM login_throttle WHERE throttle_key = ?')
    .bind(key)
    .first();
  const now = Date.now();
  if (!row) {
    await db
      .prepare(
        `INSERT INTO login_throttle (throttle_key, fail_count, window_started_at, locked_until)
         VALUES (?, 1, datetime('now'), NULL)`
      )
      .bind(key)
      .run();
    return;
  }

  const windowStart = Date.parse(row.window_started_at);
  let fails = Number(row.fail_count) || 0;
  if (!Number.isFinite(windowStart) || now - windowStart > WINDOW_MS) {
    fails = 1;
    await db
      .prepare(
        `UPDATE login_throttle
         SET fail_count = 1, window_started_at = datetime('now'), locked_until = NULL
         WHERE throttle_key = ?`
      )
      .bind(key)
      .run();
    return;
  }

  fails += 1;
  const lockedUntil =
    fails >= MAX_FAILS ? new Date(now + LOCK_MS).toISOString().replace('T', ' ').slice(0, 19) : null;
  await db
    .prepare(
      `UPDATE login_throttle
       SET fail_count = ?, locked_until = ?
       WHERE throttle_key = ?`
    )
    .bind(fails, lockedUntil, key)
    .run();
}

export async function clearLoginFailures(db, key) {
  await ensureLoginThrottleTable(db);
  await db.prepare('DELETE FROM login_throttle WHERE throttle_key = ?').bind(key).run();
}
