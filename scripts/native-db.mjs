// Optional Windows development fallback; never touches existing database services.
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const source = readFileSync(join(root, 'apps/api/.env'), 'utf8');
const url = new URL(process.env.DATABASE_URL ?? source.match(/^DATABASE_URL=(.+)$/m)?.[1].trim() ?? '');
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('Native fallback is only for local development');
const bin = process.env.PG_BIN ?? 'C:/Program Files/PostgreSQL/18/bin';
// PostgreSQL's Windows binaries require an ASCII path; also avoid syncing live data with OneDrive.
const state = process.env.PG_DATA_ROOT ?? join(process.env.LOCALAPPDATA, 'WarrantyVault');
const directory = join(state, 'postgres');
const run = (name, args, env = {}) => {
  const result = spawnSync(join(bin, `${name}.exe`), args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: name === 'pg_ctl' ? 'ignore' : 'pipe',
    timeout: 30000,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  if (result.stdout) process.stdout.write(result.stdout);
  return result;
};
if (process.argv.includes('--stop')) {
  run('pg_ctl', ['-D', directory, '-m', 'fast', 'stop']);
  process.exit(0);
}
mkdirSync(state, { recursive: true });
if (!existsSync(join(directory, 'PG_VERSION'))) {
  const passwordFile = join(state, 'init-password');
  writeFileSync(passwordFile, decodeURIComponent(url.password), { mode: 0o600 });
  try {
    run('initdb', [
      '-D',
      directory,
      '-U',
      decodeURIComponent(url.username),
      '--pwfile',
      passwordFile,
      '--auth=scram-sha-256',
      '--encoding=UTF8',
      '--locale=C',
    ]);
  } finally {
    unlinkSync(passwordFile);
  }
}
const status = spawnSync(join(bin, 'pg_ctl.exe'), ['-D', directory, 'status'], {
  windowsHide: true,
  encoding: 'utf8',
});
if (status.status !== 0)
  run('pg_ctl', [
    '-D',
    directory,
    '-l',
    join(state, 'postgres.log'),
    '-o',
    `-h 127.0.0.1 -p ${url.port}`,
    'start',
  ]);
const env = { PGPASSWORD: decodeURIComponent(url.password) };
const args = ['-h', '127.0.0.1', '-p', url.port, '-U', decodeURIComponent(url.username)];
const database = url.pathname.slice(1);
if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('Invalid local database name');
const check = spawnSync(
  join(bin, 'psql.exe'),
  [...args, '-d', 'postgres', '-tAc', `SELECT 1 FROM pg_database WHERE datname='${database}'`],
  { windowsHide: true, encoding: 'utf8', env: { ...process.env, ...env } },
);
if (check.status !== 0) throw new Error(check.stderr);
if (check.stdout.trim() !== '1') run('createdb', [...args, database], env);
console.log(`Local PostgreSQL ready on 127.0.0.1:${url.port}`);
