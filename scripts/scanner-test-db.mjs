// Access only the recorded isolated test database. Never log its credentials.
import { readFileSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
export function scannerTestDatabase() {
  const root = resolve(import.meta.dirname, '..');
  const record = JSON.parse(readFileSync(join(root, '.data/scanner-test-environment.json'), 'utf8'));
  const cluster = resolve(record.cluster);
  if (dirname(cluster).toLowerCase() !== resolve('D:/WarrantyVault-ocr/test-clusters').toLowerCase() ||
      !/^[0-9a-f-]{36}$/.test(basename(cluster)) || record.database !== 'warrantyvault_scanner_test' || record.port !== 15434) {
    throw new Error('Unrecognized isolated test database');
  }
  const password = readFileSync(join(cluster, 'initial-password'), 'utf8');
  if (!/^[0-9a-f]{64}$/.test(password)) throw new Error('Unexpected credential format');
  return `postgresql://warrantyvault_scanner_test:${password}@127.0.0.1:15434/warrantyvault_scanner_test`;
}
