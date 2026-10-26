// Windows-only isolated acceptance environment. Creates a NEW cluster and never
// reuses, stops, resets, moves or deletes an existing database or directory.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync, openSync } from 'node:fs';
import { resolve, join } from 'node:path';
import net from 'node:net';

const root = resolve(import.meta.dirname, '..');
const bin = 'C:/Program Files/PostgreSQL/18/bin';
const parent = 'D:/WarrantyVault-ocr/test-clusters';
const cluster = join(parent, randomUUID());
if (existsSync(cluster)) throw new Error('Refusing to reuse an existing test cluster');
for (const port of [15434, 3101, 4174]) {
  await new Promise((done, fail) => {
    const server = net.createServer(); server.once('error', fail);
    server.listen(port, '127.0.0.1', () => server.close(done));
  });
}
const password = randomBytes(32).toString('hex');
const database = 'warrantyvault_scanner_test';
const username = 'warrantyvault_scanner_test';
const env = {
  ...process.env,
  DATABASE_URL: `postgresql://${username}:${password}@127.0.0.1:15434/${database}`,
  PGPASSWORD: password,
  PORT: '3101', WEB_URL: 'http://localhost:4174',
  LOCAL_STORAGE_PATH: join(cluster, 'receipts'), MAIL_DRIVER: 'file',
  MAIL_DIRECTORY: join(cluster, 'mail'), STORAGE_DRIVER: 'local',
  DEV_API_TARGET: 'http://localhost:3101',
};
mkdirSync(cluster, { recursive: true });
const pwfile = join(cluster, 'initial-password');
writeFileSync(pwfile, password, { mode: 0o600, flag: 'wx' });
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, env, windowsHide: true, encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  if (result.stdout) process.stdout.write(result.stdout);
};
run(join(bin, 'initdb.exe'), ['-D', join(cluster, 'postgres'), '-U', username, '--pwfile', pwfile, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C']);
// pg_ctl starts a persistent background server. Keep its pipes off the parent command.
const started = spawnSync(join(bin, 'pg_ctl.exe'), ['-D', join(cluster, 'postgres'), '-l', join(cluster, 'postgres.log'), '-o', '-h 127.0.0.1 -p 15434', 'start'], { windowsHide: true, stdio: 'ignore', timeout: 30000 });
if (started.status !== 0) throw new Error('Test PostgreSQL failed to start; see its log in ' + cluster);
run(join(bin, 'createdb.exe'), ['-h', '127.0.0.1', '-p', '15434', '-U', username, database]);
run(process.execPath, [join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], join(root, 'apps/api'));
run(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), 'prisma/seed.ts'], join(root, 'apps/api'));
run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], join(root, 'apps/api'));
const start = (args, cwd, name) => {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, detached: true,
    stdio: ['ignore', openSync(join(cluster, `${name}.log`), 'a'), openSync(join(cluster, `${name}-error.log`), 'a')] });
  child.unref(); return child.pid;
};
const apiPid = start(['dist/main.js'], join(root, 'apps/api'), 'api');
const webPid = start([join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4174'], join(root, 'apps/web'), 'web');
writeFileSync(join(root, '.data/scanner-test-environment.json'), JSON.stringify({ cluster, database, port: 15434, apiPid, webPid, url: 'http://localhost:4174' }, null, 2));
console.log('Isolated test app: http://localhost:4174; database: 127.0.0.1:15434. Existing app configuration unchanged.');
