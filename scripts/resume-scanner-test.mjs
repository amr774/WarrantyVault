// Resume ONLY the isolated test environment created by start-scanner-test.mjs.
// The test password is consumed privately, never emitted or placed in command arguments.
import { readFileSync, openSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
const root = resolve(import.meta.dirname, '..');
const recordPath = join(root, '.data/scanner-test-environment.json');
const record = JSON.parse(readFileSync(recordPath, 'utf8'));
const cluster = resolve(record.cluster);
if (dirname(cluster).toLowerCase() !== resolve('D:/WarrantyVault-ocr/test-clusters').toLowerCase() ||
    !/^[0-9a-f-]{36}$/.test(cluster.split(/[\\/]/).at(-1)) ||
    record.database !== 'warrantyvault_scanner_test' || record.port !== 15434 ||
    readFileSync(join(cluster, 'postgres/PG_VERSION'), 'utf8').trim() !== '18') {
  throw new Error('Not a recognized isolated scanner test cluster');
}
async function available(port) { return new Promise((done, fail) => {
  const server = net.createServer(); server.once('error', fail);
  server.listen(port, '127.0.0.1', () => server.close(done));
}); }
await available(3101);
await available(4174);
const pgctl = 'C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe';
const status = spawnSync(pgctl, ['-D', join(cluster, 'postgres'), 'status'], { windowsHide: true, stdio: 'ignore' });
if (status.status !== 0) {
  await available(15434);
  const started = spawnSync(pgctl, ['-D', join(cluster, 'postgres'), '-l', join(cluster, 'postgres.log'), '-o', '-h 127.0.0.1 -p 15434', 'start'], { windowsHide: true, stdio: 'ignore', timeout: 30000 });
  if (started.status !== 0) throw new Error('Could not resume the test database; no reset attempted');
}
const password = readFileSync(join(cluster, 'initial-password'), 'utf8');
if (!/^[0-9a-f]{64}$/.test(password)) throw new Error('Unexpected test credential format');
// Acceptance testing needs a stable API process; filesystem watchers can interrupt requests.
const child = spawn(process.execPath, ['dist/main.js'], {
  cwd: join(root, 'apps/api'), detached: true, windowsHide: true,
  env: { ...process.env,
    DATABASE_URL: `postgresql://warrantyvault_scanner_test:${password}@127.0.0.1:15434/warrantyvault_scanner_test`,
    PORT: '3101', WEB_URL: 'http://localhost:4174', STORAGE_DRIVER: 'local', MAIL_DRIVER: 'file',
    LOCAL_STORAGE_PATH: join(cluster, 'receipts'), MAIL_DIRECTORY: join(cluster, 'mail'),
  },
  stdio: ['ignore', openSync(join(cluster, 'api.log'), 'a'), openSync(join(cluster, 'api-error.log'), 'a')],
});
child.unref();
record.apiPid = child.pid;
const web = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4174'], {
  cwd: join(root, 'apps/web'), detached: true, windowsHide: true,
  env: { ...process.env, DEV_API_TARGET: 'http://localhost:3101' },
  stdio: ['ignore', openSync(join(cluster, 'web.log'), 'a'), openSync(join(cluster, 'web-error.log'), 'a')],
});
web.unref();
record.webPid = web.pid;
writeFileSync(recordPath, JSON.stringify(record, null, 2));
console.log('Resumed isolated test app at http://localhost:4174 (database unchanged).');
