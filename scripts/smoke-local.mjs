// Non-destructive local acceptance check. Leaves its newly created test account and products.
import { chromium, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = 'http://localhost:4173';
const email = `local-smoke-${Date.now()}@example.com`;
const password = randomBytes(24).toString('base64url');
const today = new Date().toISOString().slice(0, 10);
const soon = new Date(`${today}T00:00:00Z`);
soon.setUTCDate(soon.getUTCDate() + 7);
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Local verification');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create your vault' }).click();
  await expect(page.getByRole('heading', { name: /peace of mind, Local/ })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: /peace of mind, Local/ })).toBeVisible();

  const cases = [
    {
      name: 'Local check — active warranty',
      purchase: today,
      months: 12,
      status: 'ACTIVE',
      badge: 'Protected',
    },
    {
      name: 'Local check — expiring in 7 days',
      purchase: today,
      months: 12,
      override: soon.toISOString().slice(0, 10),
      status: 'EXPIRING_SOON',
      badge: 'Expiring soon',
      days: 7,
    },
    {
      name: 'Local check — month-end warranty',
      purchase: '2026-01-31',
      months: 1,
      status: 'EXPIRED',
      badge: 'Expired',
      expectedDate: '2026-02-28',
    },
  ];
  const results = [];
  for (const item of cases) {
    await page.goto('/app/products/new');
    await page.getByLabel('Product name').fill(item.name);
    await page.getByLabel('Category').selectOption({ label: 'Electronics' });
    await page.getByLabel('Purchase date').fill(item.purchase);
    await page.getByLabel('Warranty duration').fill(String(item.months));
    if (item.override) await page.getByLabel('Override expiration date').fill(item.override);
    await page.getByRole('button', { name: 'Add to my vault' }).click();
    await expect(page.getByRole('heading', { name: item.name, exact: true })).toBeVisible();
    await expect(page.locator('.badge')).toHaveText(item.badge);
    const id = new URL(page.url()).pathname.split('/').at(-1);
    const response = await context.request.get(`/api/products/${id}`);
    expect(response.status()).toBe(200);
    const product = await response.json();
    expect(product.status).toBe(item.status);
    if (item.days !== undefined) expect(product.daysRemaining).toBe(item.days);
    if (item.expectedDate) expect(product.expiresAt.slice(0, 10)).toBe(item.expectedDate);
    expect(product.progress).toBeGreaterThanOrEqual(0);
    expect(product.progress).toBeLessThanOrEqual(100);
    results.push({
      name: product.name,
      status: product.status,
      expiresAt: product.expiresAt,
      daysRemaining: product.daysRemaining,
    });
  }
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: /peace of mind, Local/ })).toBeVisible();
  const summary = await (await context.request.get('/api/dashboard/summary')).json();
  expect({
    total: summary.total,
    active: summary.active,
    expiring: summary.expiring,
    expired: summary.expired,
  }).toEqual({ total: 3, active: 1, expiring: 1, expired: 1 });
  await page.reload();
  await expect(page.getByText('Local check — active warranty', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await mkdir('.data', { recursive: true });
  await page.screenshot({ path: '.data/local-smoke-dashboard.png', fullPage: true });
  const report = {
    registration: 'passed',
    login: 'passed',
    productCreation: 'passed',
    warrantyTracking: 'passed',
    dashboard: 'passed',
    pageErrors: errors,
    email,
    results,
    dataDeleted: false,
  };
  await writeFile('.data/local-smoke-result.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
