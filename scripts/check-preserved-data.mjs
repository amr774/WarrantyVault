// Read-only evidence that the audit did not remove existing accounts/products/receipts.
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { scannerTestDatabase } from './scanner-test-db.mjs';
config({ path: 'apps/api/.env', quiet: true });
const filename = '.data/preserved-data-baseline.json';
const mode = process.argv[2];
const original = process.env.DATABASE_URL;
const previous = mode === 'verify' ? JSON.parse(readFileSync(filename, 'utf8')) : {};
const current = {};
for (const [name, url] of [['original', original], ['scanner', scannerTestDatabase()]]) {
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    current[name] = {};
    for (const model of ['user', 'product', 'receipt']) {
      const rows = await db[model].findMany({ select: { id: true }, orderBy: { id: 'asc' } });
      const ids = rows.map(row => row.id);
      if (mode === 'verify' && previous[name] && previous[name][model].some(id => !ids.includes(id))) throw new Error(`Existing ${name}/${model} data missing`);
      current[name][model] = ids;
      console.log(`${name}/${model}: ${ids.length} rows; id hash ${createHash('sha256').update(ids.join(',')).digest('hex')}`);
    }
  } catch (error) {
    if (name !== 'original' || (mode === 'verify' && previous[name])) throw error;
    current[name] = null;
    console.log('Original Docker database unavailable; no changes attempted there.');
  } finally { await db.$disconnect(); }
}
if (mode === 'baseline') writeFileSync(filename, JSON.stringify(current, null, 2), { flag: 'wx' });
else if (mode !== 'verify') throw new Error('Use baseline or verify');
else console.log('All baseline accounts, products and receipts preserved.');
