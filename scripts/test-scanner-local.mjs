// Non-destructive: creates fresh test accounts/products and leaves them in place.
import { chromium, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const baseURL = process.env.SCANNER_TEST_URL ?? 'http://localhost:4173';
const root = 'tests/fixtures/ocr';
const headers = { Origin: baseURL };
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL });
const other = await browser.newContext({ baseURL });
const page = await context.newPage();
const report = { checks: [], products: [], accounts: [] };
const errors = [];
page.on('pageerror', error => errors.push(error.message));
async function register(ctx, suffix) {
  const email = `scanner-${Date.now()}-${suffix}@example.com`;
  const password = randomBytes(24).toString('base64url');
  const response = await ctx.request.post('/api/auth/register', { headers, data: { name: 'Scanner verification', email, password } });
  expect(response.status(), await response.text()).toBe(201);
  report.accounts.push(email);
}
async function upload(ctx, route, filename, product) {
  const mimeType = filename.endsWith('.pdf') ? 'application/pdf' : filename.endsWith('.jpg') ? 'image/jpeg' : filename.endsWith('.webp') ? 'image/webp' : 'image/png';
  const request = async () => ctx.request.post(`/api/scanner/${route}`, { headers, timeout: 190000, multipart: {
    file: { name: filename, mimeType, buffer: await readFile(`${root}/${filename}`) },
    ...(product ? { product: JSON.stringify(product) } : {}),
  } });
  let response = await request();
  if (response.status() === 429 && route === 'analyze') {
    report.checks.push('Scan rate limit enforced; waiting for its window before continuing');
    await new Promise(resolve => setTimeout(resolve, 30000));
    await new Promise(resolve => setTimeout(resolve, 31000));
    response = await request();
  }
  return response;
}
try {
  expect((await upload(other, 'analyze', 'english.png')).status()).toBe(401);
  report.checks.push('Unauthenticated scan rejected');
  await register(context, 'owner');
  await page.goto('/app');
  await page.getByRole('link', { name: 'Scan Receipt', exact: true }).click();
  await page.getByLabel('Upload scan document').setInputFiles(`${root}/english.png`);
  await expect(page.getByAltText('Original receipt')).toBeVisible();
  await page.getByRole('button', { name: 'Start OCR' }).click();
  await expect(page.getByRole('heading', { name: 'Review before saving' })).toBeVisible({ timeout: 190000 });
  await expect(page.getByLabel('Product name')).toHaveValue('Studio Headphones');
  await expect(page.getByLabel('Purchase date', { exact: false })).toHaveValue('2026-10-15');
  await expect(page.getByLabel('Warranty expiration date')).toHaveValue('2027-10-15');
  expect((await (await context.request.get('/api/products')).json()).total).toBe(0);
  report.checks.push('English PNG OCR, preview, date extraction, warranty calculation, no automatic save');
  await page.getByLabel('Product name').fill('Reviewed Studio Headphones');
  await page.getByLabel('Category').selectOption({ label: 'Electronics' });
  await page.getByLabel('I checked these details').check();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '.data/scanner-review-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: '.data/scanner-review.png', fullPage: true });
  await page.getByRole('button', { name: 'Confirm & Save' }).click();
  await expect(page).toHaveURL(/\/app\/products\/[\w-]+$/, { timeout: 30000 });
  const id = page.url().split('/').at(-1);
  const product = await (await context.request.get(`/api/products/${id}`)).json();
  expect(product.name).toBe('Reviewed Studio Headphones');
  expect(product.expiresAt.slice(0, 10)).toBe('2027-10-15');
  expect(product.warrantyStartDate.slice(0, 10)).toBe('2026-10-15');
  expect(product.expirationOverride).toBe(false);
  expect(product.receipts).toHaveLength(1);
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Warranty duration').fill('24');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/products/${id}$`));
  const revised = await (await context.request.get(`/api/products/${id}`)).json();
  expect(revised.expiresAt.slice(0, 10)).toBe('2028-10-15');
  expect(revised.expirationOverride).toBe(false);
  report.checks.push('Scanned calculated expiry stays automatic and recalculates after editing duration');
  report.products.push(product.id);
  report.checks.push('Confirmed edits, product and original saved together');
  const download = await (await context.request.get(`/api/receipts/${product.receipts[0].id}/download`)).json();
  expect(Buffer.compare(await (await context.request.get(download.url)).body(), await readFile(`${root}/english.png`))).toBe(0);
  await register(other, 'other');
  for (const path of [`/api/products/${id}`, `/api/products/${id}/receipts`, `/api/receipts/${product.receipts[0].id}/download`, download.url]) {
    expect((await other.request.get(path)).status()).toBe(404);
  }
  report.checks.push('Original bytes preserved; cross-user product/document/download denied');
  const categories = await (await context.request.get('/api/categories')).json();
  const valid = { name: 'Arabic OCR test', categoryId: categories[0].id, purchaseDate: '2026-10-15', warrantyMonths: 12, currency: 'EGP' };
  for (const filename of ['arabic.png', 'arabic.pdf', 'english.pdf', 'english.jpg', 'english.webp']) {
    const response = await upload(context, 'analyze', filename);
    expect(response.status(), await response.text()).toBe(201);
    const result = await response.json();
    await writeFile(`.data/ocr-${filename.replace('.', '-')}.json`, JSON.stringify(result, null, 2));
    expect(result.lines.length).toBeGreaterThan(3);
    if (filename.startsWith('arabic')) {
      expect(result.lines.some(line => /[\u0600-\u06ff]/.test(line.text))).toBe(true);
      expect(result.fields.name?.value).toBe('سماعات');
      if (filename.endsWith('.png') || result.fields.purchaseDate) expect(result.fields.purchaseDate?.value).toBe('2026-10-15');
      else report.checks.push(`${filename}: unread purchase date left blank for manual review`);
      // The Arabic model may omit the printed duration digits. Never manufacture them.
      if (result.fields.warrantyMonths) expect(result.fields.warrantyMonths.value).toBe(12);
      else report.checks.push(`${filename}: unread duration left blank for manual review`);
      if (filename.endsWith('.pdf')) {
        const reviewed = { ...valid, ...Object.fromEntries(Object.entries(result.fields).map(([key, value]) => [key, value.value])) };
        const saved = await upload(context, 'confirm', filename, reviewed);
        expect(saved.status(), await saved.text()).toBe(201);
        report.products.push((await saved.json()).id);
      }
    } else {
      expect(result.fields.name?.value).toBe('Studio Headphones');
    }
    report.checks.push(`${filename}: actual local OCR passed`);
  }
  expect((await upload(context, 'confirm', 'six-pages.pdf', valid)).status()).toBe(422);
  const malformed = await context.request.post('/api/scanner/confirm', { headers, multipart: {
    product: JSON.stringify(valid), file: { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') },
  } });
  expect(malformed.status()).toBe(400);
  const oversized = await context.request.post('/api/scanner/confirm', { headers, multipart: {
    product: JSON.stringify(valid), file: { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(10485761) },
  } });
  expect(oversized.status()).toBe(413);
  const forged = await upload(context, 'confirm', 'english.png', { ...valid, userId: '00000000-0000-0000-0000-000000000000' });
  expect(forged.status()).toBe(400);
  expect((await (await context.request.get('/api/products')).json()).total).toBe(2);
  report.checks.push('Page limit, size limit, malformed file and forged owner rejected without saving');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/products/new');
  await expect(page.getByRole('link', { name: 'Scan Receipt' })).toBeVisible();
  await page.getByRole('link', { name: 'Scan Receipt' }).click();
  await expect(page.getByLabel('Take receipt photo')).toHaveAttribute('capture', 'environment');
  report.checks.push('Mobile camera input and product-page scan entry accessible');
  expect(errors).toEqual([]);
  await writeFile('.data/scanner-test-result.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: '.data/scanner-failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
