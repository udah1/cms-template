#!/usr/bin/env node
/**
 * Fail-closed remote D1 seed.
 * Installs the local demo admin password - never run from CI/deploy by accident.
 *
 *   ALLOW_DEMO_REMOTE_SEED=1 npm run db:seed:remote
 */
import { spawnSync } from 'node:child_process';

if (process.env.ALLOW_DEMO_REMOTE_SEED !== '1') {
  console.error(`
Remote seed is blocked.

seed.sql installs the demo admin password (local bootstrap only).
CI and deploy pipelines must not run this without an intentional override.

To seed a remote D1 on purpose:
  ALLOW_DEMO_REMOTE_SEED=1 npm run db:seed:remote

Then sign in to Admin and change the password immediately.
`);
  process.exit(1);
}

console.error(`
*** ALLOW_DEMO_REMOTE_SEED=1 ***
Remote seed will install demo admin credentials.
Change the password in Admin right after first login.
`);

const result = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'cms-template', '--remote', '--file=./seed.sql'],
  { stdio: 'inherit', shell: process.platform === 'win32' }
);

process.exit(result.status ?? 1);
