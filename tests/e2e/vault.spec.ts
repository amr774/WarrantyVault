import { test, expect } from '@playwright/test';
test('register, add, search, edit, upload, view, delete and sign out', async ({ page }, info) => {
  const email = `browser-${Date.now()}-${info.project.name}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Alex Morgan');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Browser-test-password-123');
  await page.getByRole('button', { name: 'Create your vault' }).click();
  await expect(page.getByRole('heading', { name: /peace of mind, Alex/ })).toBeVisible();
  await page.getByRole('link', { name: 'Add product', exact: true }).click();
  await page.getByLabel('Product name').fill('Studio headphones');
  await page.getByLabel('Category').selectOption({ label: 'Electronics' });
  await page.getByLabel('Brand', { exact: true }).fill('Acme');
  await page.getByLabel('Purchase date').fill('2026-01-31');
  await page.getByLabel('Warranty duration').fill('12');
  await page.getByRole('button', { name: 'Add to my vault' }).click();
  await expect(page.getByRole('heading', { name: 'Studio headphones', exact: true })).toBeVisible();
  await page
    .getByLabel('Upload receipts', { exact: true })
    .setInputFiles('tests/fixtures/ocr/english.pdf');
  await expect(page.getByRole('link', { name: /english.pdf/ })).toBeVisible();
  const documentResponse = page.waitForResponse(response => response.url().includes('/content?') && response.status() === 200);
  await page.getByRole('link', { name: /english.pdf/ }).click();
  await expect(page.getByRole('heading', { name: 'english.pdf' })).toBeVisible();
  expect((await documentResponse).headers()['content-type']).toContain('application/pdf');
  await page.goBack();
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Product name').fill('Travel headphones');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Travel headphones' })).toBeVisible();
  await page.goto('/app/products');
  await page.getByLabel('Search products').fill('Travel');
  await expect(page.getByRole('heading', { name: 'Travel headphones' })).toBeVisible();
  await page.getByRole('link', { name: /Travel headphones/ }).click();
  await page.getByRole('button', { name: 'Delete product', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Your vault starts here')).toBeVisible();
  await page.goto('/app/settings');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.screenshot({ path: `test-results/${info.project.name}-settings.png`, fullPage: true });
  await page.goto('/app/profile');
  await page.getByLabel('Confirm your password').fill('Browser-test-password-123');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Keep the receipt/ })).toBeVisible();
});
test('public pages and responsive layout', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Keep the receipt/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: `test-results/${info.project.name}-landing.png`, fullPage: true });
  await page.goto('/pricing');
  await expect(page.getByRole('button', { name: 'Not available for purchase' })).toBeDisabled();
  await page.goto('/app');
  await expect(page).toHaveURL(/login/);
  await page.goto('/not-a-page');
  await expect(page.getByRole('heading', { name: /isn’t in your vault/ })).toBeVisible();
});
