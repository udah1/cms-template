#!/usr/bin/env node
/**
 * Runs audit acceptance tests against an isolated local D1.
 *
 * Persist path: .wrangler/state-audit-test (never .wrangler/state, never --remote).
 * Spins up a temporary pages dev server on AUDIT_PORT (default 8799).
 */
import { spawn, execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERSIST = path.join(ROOT, '.wrangler', 'state-audit-test');
const PORT = String(process.env.AUDIT_PORT || '8799');
const BASE = `http://127.0.0.1:${PORT}`;

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    ...opts,
  });
}

function d1File(file) {
  run('npx', [
    'wrangler',
    'd1',
    'execute',
    'cms-template-pg-multilingual',
    '--local',
    `--persist-to=${PERSIST}`,
    `--file=${file}`,
  ]);
}

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 401 || res.status === 404) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`server did not become ready at ${url}`);
}

async function main() {
  console.log(`Audit tests → isolated D1 at ${PERSIST}`);
  console.log(`Temporary server → ${BASE}`);

  rmSync(PERSIST, { recursive: true, force: true });
  d1File('./schema.sql');
  d1File('./seed.sql');

  const child = spawn(
    'npx',
    [
      'wrangler',
      'pages',
      'dev',
      'public',
      `--persist-to=${PERSIST}`,
      '--ip',
      '127.0.0.1',
      '--port',
      PORT,
      '--show-interactive-dev-session=false',
    ],
    {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    }
  );

  let serverLog = '';
  child.stdout.on('data', (buf) => {
    serverLog += buf.toString();
  });
  child.stderr.on('data', (buf) => {
    serverLog += buf.toString();
  });

  const shutdown = () => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  };
  process.on('exit', shutdown);
  process.on('SIGINT', () => {
    shutdown();
    process.exit(130);
  });

  try {
    await waitForServer(`${BASE}/admin/`);
    run('node', ['scripts/acceptance-audit.mjs'], {
      env: {
        ...process.env,
        BASE,
        AUDIT_PERSIST: PERSIST,
        AUDIT_ISOLATED: '1',
      },
    });
    console.log('Isolated audit tests finished OK.');
  } catch (err) {
    console.error(err.message || err);
    if (serverLog) {
      console.error('--- server log (tail) ---');
      console.error(serverLog.slice(-4000));
    }
    process.exitCode = 1;
  } finally {
    shutdown();
    await new Promise((resolve) => {
      if (child.exitCode != null) return resolve();
      child.once('exit', resolve);
      setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3000);
    });
  }
}

main();
