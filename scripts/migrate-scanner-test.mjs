import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { scannerTestDatabase } from './scanner-test-db.mjs';
const root = resolve(import.meta.dirname, '..');
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
  cwd: resolve(root, 'apps/api'), env: { ...process.env, DATABASE_URL: scannerTestDatabase() },
  stdio: 'inherit', windowsHide: true,
});
process.exitCode = result.status ?? 1;
