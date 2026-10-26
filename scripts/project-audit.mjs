// Runs destructive acceptance cases only in a newly created audit database.
// Existing databases, files and Docker volumes are never reset or removed.
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, openSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { scannerTestDatabase } from './scanner-test-db.mjs';

const root = resolve(import.meta.dirname, '..');
const mode = process.argv[2] ?? 'prepare';
const statePath = join(root, '.data/project-audit-current.json');
const run = (args, env, cwd = root) => {
  const result = spawnSync(process.execPath, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error(`Audit command failed: ${args[0]} (exit ${result.status})`);
};
const envFor = state => {
  if (!/^warrantyvault_audit_[0-9a-f]{32}$/.test(state.database)) throw new Error('Not an audit database');
  const url = new URL(scannerTestDatabase());
  url.pathname = '/' + state.database;
  return { ...process.env, DATABASE_URL: url.toString(), NODE_ENV: 'test',
    WEB_URL: 'http://localhost:4175', PORT: '3102', MAIL_DRIVER: 'file', STORAGE_DRIVER: 'local',
    MAIL_DIRECTORY: join(state.directory, 'mail'), LOCAL_STORAGE_PATH: join(state.directory, 'receipts'),
    E2E_BASE_URL: 'http://localhost:4175', SCANNER_TEST_URL: 'http://localhost:4175',
    DEV_API_TARGET: 'http://localhost:3102',
  };
};
if (mode === 'prepare') {
  const id = randomUUID().replaceAll('-', '');
  const state = { database: `warrantyvault_audit_${id}`, directory: join(root, '.data/project-audit', id), createdAt: new Date().toISOString() };
  mkdirSync(state.directory, { recursive: true });
  process.env.DATABASE_URL = scannerTestDatabase();
  const db = new PrismaClient();
  try { await db.$executeRawUnsafe(`CREATE DATABASE "${state.database}"`); } finally { await db.$disconnect(); }
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  const env = envFor(state);
  run([join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], env, join(root, 'apps/api'));
  run([join(root, 'node_modules/tsx/dist/cli.mjs'), 'prisma/seed.ts'], env, join(root, 'apps/api'));
  console.log('Prepared new isolated audit database. Existing databases unchanged.');
} else {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const env = envFor(state);
  if (mode === 'migrate') {
    run([join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], env, join(root, 'apps/api'));
  } else if (mode === 'integration') {
    run([join(root, 'node_modules/jest/bin/jest.js'), '--runInBand', '--runTestsByPath', 'src/integration.spec.ts', 'src/rate-limit.integration.spec.ts'], env, join(root, 'apps/api'));
  } else if (mode === 'start') {
    for (const port of [3102, 4175]) await new Promise((done, fail) => {
      const server = net.createServer(); server.once('error', fail);
      server.listen(port, '127.0.0.1', () => server.close(done));
    });
    const start = (args, cwd, name) => {
      const child = spawn(process.execPath, args, { cwd, env, detached: true, windowsHide: true,
        stdio: ['ignore', openSync(join(state.directory, `${name}.log`), 'a'), openSync(join(state.directory, `${name}-error.log`), 'a')] });
      child.unref(); return child.pid;
    };
    state.apiPid = start(['dist/main.js'], join(root, 'apps/api'), 'api');
    state.webPid = start([join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4175'], join(root, 'apps/web'), 'web');
    writeFileSync(statePath, JSON.stringify(state, null, 2));
    console.log('Audit app started on http://localhost:4175');
  } else if (mode === 'e2e') {
    run([join(root, 'node_modules/@playwright/test/cli.js'), 'test'], env);
  } else if (mode === 'scanner') {
    run([join(root, 'scripts/test-scanner-local.mjs')], env);
    run([join(root, 'scripts/test-scanner-ui.mjs')], env);
    run([join(root, 'scripts/test-scanner-real-receipt.mjs')], env);
  } else throw new Error('Use prepare, integration, start, e2e or scanner');
}
