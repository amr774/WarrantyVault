// Uses a public scanned receipt, never mocks OCR, and leaves new test accounts intact.
// Download the sample as described in docs/LOCAL_OCR.md before running.
import { chromium, expect } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const baseURL = process.env.SCANNER_TEST_URL ?? 'http://localhost:4174';
const directory = '.data/real-receipt';
const file = `${directory}/sroie-000.jpg`;
const bytes = await readFile(file);
const report = {
  testedAt: new Date().toISOString(), baseURL,
  source: 'https://github.com/zzzDavid/ICDAR-2019-SROIE/blob/master/data/img/000.jpg',
  sha256: createHash('sha256').update(bytes).digest('hex'), checks: [],
};
const health = await fetch('http://127.0.0.1:8100/health');
expect(health.status).toBe(200);
report.ocrHealth = await health.json();
const direct = await fetch('http://127.0.0.1:8100/analyze', {
  method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes,
  signal: AbortSignal.timeout(180000),
});
expect(direct.status).toBe(200);
await writeFile(`${directory}/direct-ocr-after-fix.json`, JSON.stringify(await direct.json(), null, 2));
report.checks.push('Python health and direct actual receipt OCR succeeded');
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL });
context.setDefaultTimeout(30000);
let page = await context.newPage();
const errors = [];
const watchErrors = () => page.on('pageerror', error => errors.push(error.message));
watchErrors();
try {
  expect((await context.request.get('/api/health')).status()).toBe(200);
  const email = `real-receipt-${Date.now()}@example.com`;
  const password = randomBytes(24).toString('base64url');
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Real receipt verification');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create your vault' }).click();
  await expect(page).toHaveURL(`${baseURL}/app`, { timeout: 30000 });
  await page.close();
  await context.clearCookies();
  page = await context.newPage();
  watchErrors();
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${baseURL}/app`, { timeout: 30000 });
  report.account = email;
  report.checks.push('Registration and fresh-cookie login through React succeeded');
  await page.getByRole('link', { name: 'Scan Receipt', exact: true }).click();

  for (const extension of ['jpg', 'pdf']) {
    await page.getByLabel('Upload scan document').setInputFiles(`${directory}/sroie-000.${extension}`);
    if (extension === 'jpg') await expect(page.getByAltText('Original receipt')).toBeVisible();
    else await expect(page.getByRole('link', { name: 'Open original PDF' })).toBeVisible();
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/scanner/analyze'), { timeout: 190000 });
    await page.getByRole('button', { name: 'Start OCR' }).click();
    await expect(page.getByRole('progressbar', { name: 'OCR processing' })).toBeVisible();
    const response = await responsePromise;
    expect(response.status(), await response.text()).toBe(201);
    const result = await response.json();
    await writeFile(`${directory}/api-ocr-${extension}.json`, JSON.stringify(result, null, 2));
    await expect(page.getByRole('heading', { name: 'Review before saving' })).toBeVisible();
    await expect(page.getByLabel('Purchase date', { exact: true })).toHaveValue('2018-12-25');
    await expect(page.getByLabel('Warranty duration (months)')).toHaveValue('');
    await expect(page.getByLabel('Warranty expiration date')).toHaveValue('');
    await expect(page.getByLabel('Product name', { exact: true })).toHaveValue('');
    expect(result.fields.purchaseDate.uncertain).toBe(true);
    const text = result.lines.map(line => line.text).join('\n');
    expect(text).toContain('KF MODELLING CLAY KIDDY FISH');
    expect(text).toContain('25/12/2018');
    expect(text).toContain('9.00');
    await page.getByText('Recognized text (1 pages)', { exact: true }).click();
    await expect(page.locator('.scan-review pre')).toContainText('KF MODELLING CLAY KIDDY FISH');
    if (extension === 'pdf') {
      await expect.poll(() => page.getByAltText('Original PDF page 1').evaluate(image => image.naturalWidth)).toBeGreaterThan(100);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: `${directory}/review-${extension}.png`, fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${directory}/review-${extension}-mobile.png`, fullPage: true, animations: 'disabled' });
    expect((await (await context.request.get('/api/products')).json()).total).toBe(0);
    report.checks.push(`${extension}: actual OCR through Nest, visible preview/progress/text, correct date, blank unknown warranty, no automatic save, mobile layout`);
    report[extension] = { lineCount: result.lines.length, fields: result.fields };
  }

  // A receipt with no warranty statement cannot justify invented coverage.
  await page.getByLabel('Product name', { exact: true }).fill('KF MODELLING CLAY KIDDY FISH');
  await page.getByLabel('Merchant / store').fill('BOOK TALK (TAMAN DAYA) SDN BHD');
  await page.getByLabel('Purchase price', { exact: true }).fill('9.00');
  await page.getByLabel('Currency (3-letter code)').fill('MYR');
  await page.getByLabel('Category').selectOption({ index: 1 });
  await page.getByLabel('I checked these details').check();
  let confirms = 0;
  page.on('request', request => { if (request.url().endsWith('/api/scanner/confirm')) confirms++; });
  await page.getByRole('button', { name: 'Confirm & Save' }).click();
  expect(await page.getByLabel('Warranty duration (months)').evaluate(input => input.validity.valueMissing)).toBe(true);
  expect(confirms).toBe(0);
  expect((await (await context.request.get('/api/products')).json()).total).toBe(0);
  report.checks.push('Manual review editable; missing warranty prevents save instead of inventing coverage');

  await page.getByLabel('Upload scan document').setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('alert')).toContainText('Choose a JPG, PNG, WebP or PDF');
  await expect(page.getByRole('button', { name: 'Start OCR' })).toBeDisabled();
  await page.getByLabel('Upload scan document').setInputFiles({ name: 'corrupt.png', mimeType: 'image/png', buffer: Buffer.from('invalid') });
  await page.getByRole('button', { name: 'Start OCR' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start OCR' })).toBeEnabled();
  report.checks.push('Invalid type and corrupt upload show recoverable errors');
  expect(errors).toEqual([]);
  report.checks.push('No uncaught browser errors');
  await writeFile(`${directory}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
