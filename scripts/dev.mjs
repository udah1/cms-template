#!/usr/bin/env node
/**
 * Start wrangler pages dev on the first free port from START_PORT (default 8788).
 */
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const START_PORT = Number(process.env.PORT || process.env.START_PORT || 8788);
const MAX_TRIES = 50;

function canListen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, HOST);
  });
}

async function findFreePort(start) {
  for (let port = start; port < start + MAX_TRIES; port++) {
    if (await canListen(port)) return port;
  }
  throw new Error(`No free port found in range ${start}-${start + MAX_TRIES - 1}`);
}

const port = await findFreePort(START_PORT);
if (port !== START_PORT) {
  console.log(`Port ${START_PORT} is in use; using ${port} instead.`);
}

const child = spawn(
  'npx',
  [
    'wrangler',
    'pages',
    'dev',
    'public',
    '--persist-to=.wrangler/state',
    '--ip',
    HOST,
    '--port',
    String(port),
    '--show-interactive-dev-session=false',
  ],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  }
);

const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
