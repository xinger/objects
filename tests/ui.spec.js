import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('pagination and category links expose every object, including an empty category', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.object-tile')).toHaveCount(60);
  await page.getByRole('link', { name: 'Следующая страница' }).click();
  await expect(page).toHaveURL(/\/page\/2\/$/);
  await expect(page.locator('.object-tile')).toHaveCount(1);
  await page.getByRole('link', { name: 'Объект 61', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Объект 61' })).toBeVisible();
  await page.locator('.back-link').click();
  await expect(page).toHaveURL(/\/category\/test\/$/);
  await page.getByRole('link', { name: 'Пустая категория', exact: true }).click();
  await expect(page.getByText('Пока пусто', { exact: true })).toBeVisible();
});

test('theme follows the system and an explicit choice persists across navigation and reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Включить светлую тему' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('link', { name: 'Предметы', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: 'Включить тёмную тему' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('mobile users can download original bytes without hovering and recover from a failed download', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/object/test_1/');
  const link = page.getByRole('link', { name: 'Скачать', exact: true });
  await page.route('**/media/tests/original.svg', (route) => route.abort());
  await link.click();
  await expect(page.getByText('Не удалось скачать', { exact: true })).toBeVisible();
  await expect(link).not.toHaveAttribute('aria-busy', 'true');
  await page.unroute('**/media/tests/original.svg');
  const downloadPromise = page.waitForEvent('download');
  await link.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('original.svg');
  expect(readFileSync(await download.path())).toEqual(readFileSync('media/preview-public/media/tests/original.svg'));
  await expect(page.getByText('Не удалось скачать', { exact: true })).toBeHidden();
  await page.goto('/');
  await expect(page.locator('.tile-download').first()).toBeVisible();
  const size = await page.locator('.tile-download').first().boundingBox();
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('category and download links work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: 'http://127.0.0.1:4322' });
  const page = await context.newPage();
  await page.goto('/category/test/');
  await expect(page.locator('.object-tile')).toHaveCount(60);
  const objectLink = page.getByRole('link', { name: 'Объект 1', exact: true });
  await expect(objectLink).toBeVisible();
  // With scripts disabled, Chromium can stall Playwright's animation-frame
  // stability check. A native mouse click still exercises the real link.
  const box = await objectLink.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForURL('**/object/test_1/');
  const downloadPromise = page.waitForEvent('download');
  const originalLink = page.getByRole('link', { name: 'Скачать', exact: true });
  await expect(originalLink).toBeVisible();
  await originalLink.click({ force: true });
  const download = await downloadPromise;
  expect(readFileSync(await download.path())).toEqual(readFileSync('media/preview-public/media/tests/original.svg'));
  await context.close();
});
