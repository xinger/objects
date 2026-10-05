import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('scrolling appends all pages once and keeps category and object links usable', async ({ page }) => {
  await page.goto('/all/');
  await expect(page.locator('.object-tile')).toHaveCount(60);
  await expect(page.getByRole('navigation', { name: /^Pages$/i })).toBeHidden();
  await page.locator('.object-tile').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.object-tile')).toHaveCount(120);
  await page.locator('.object-tile').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.object-tile')).toHaveCount(141);
  expect(new Set(await page.locator('.object-link').evaluateAll((links) => links.map((link) => link.href))).size).toBe(141);
  await expect(page).toHaveURL('/all/');
  await expect(page.locator('[data-scroll-loader]')).toBeHidden();
  await page.getByRole('link', { name: /^Object 121$/i, exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Object 121$/i })).toBeVisible();
  await page.locator('.back-link').click();
  await expect(page).toHaveURL(/\/category\/test\/$/);
  await page.getByRole('link', { name: /^Empty category$/i, exact: true }).click();
  await expect(page.getByText('No objects yet', { exact: true })).toBeVisible();
});

test('theme follows the system and an explicit choice persists across navigation and reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: /^Switch to light theme$/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('link', { name: /^Items$/i, exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: /^Switch to dark theme$/i }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('mobile users can download original bytes from the object page and recover from a failed download', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/object/test_1/');
  const link = page.getByRole('link', { name: /^Download$/i, exact: true });
  await page.route('**/media/tests/original.svg', (route) => route.abort());
  await link.click();
  await expect(page.getByText('Download failed', { exact: true })).toBeVisible();
  await expect(link).not.toHaveAttribute('aria-busy', 'true');
  await page.unroute('**/media/tests/original.svg');
  const downloadPromise = page.waitForEvent('download');
  await link.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('original.svg');
  expect(readFileSync(await download.path())).toEqual(readFileSync('media/preview-public/media/tests/original.svg'));
  await expect(page.getByText('Download failed', { exact: true })).toBeHidden();
  await page.goto('/all/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('category and download links work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: 'http://127.0.0.1:4322' });
  const page = await context.newPage();
  await page.goto('/category/test/');
  await expect(page.locator('.object-tile')).toHaveCount(60);
  await expect(page.getByRole('link', { name: /^Next page$/i })).toBeVisible();
  await page.getByRole('link', { name: /^Next page$/i }).click({ force: true });
  await page.waitForURL('**/category/test/page/2/');
  await expect(page.getByRole('link', { name: /^Object 61$/i, exact: true })).toBeVisible();
  await page.goto('/category/test/');
  const objectLink = page.getByRole('link', { name: /^Object 1$/i, exact: true });
  await expect(objectLink).toBeVisible();
  // With scripts disabled, Chromium can stall Playwright's animation-frame
  // stability check. A native mouse click still exercises the real link.
  const box = await objectLink.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForURL('**/object/test_1/');
  const downloadPromise = page.waitForEvent('download');
  const originalLink = page.getByRole('link', { name: /^Download$/i, exact: true });
  await expect(originalLink).toBeVisible();
  await originalLink.click({ force: true });
  const download = await downloadPromise;
  expect(readFileSync(await download.path())).toEqual(readFileSync('media/preview-public/media/tests/original.svg'));
  await context.close();
});

test('a failed category page can be retried without losing or duplicating images', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/category/test/page/2/', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/category/test/');
  await page.locator('.object-tile').last().scrollIntoViewIfNeeded();
  const retry = page.getByRole('button', { name: /^Retry$/i, exact: true });
  await expect(retry).toBeVisible();
  await expect(page.locator('.object-tile')).toHaveCount(60);
  await page.unroute('**/category/test/page/2/');
  await retry.click();
  await expect(page.locator('.object-tile')).toHaveCount(120);
  await expect(retry).toBeHidden();
  await page.getByRole('link', { name: /^Object 61$/i, exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Object 61$/i })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: /^Download$/i, exact: true }).click();
  const download = await downloadPromise;
  expect(readFileSync(await download.path())).toEqual(readFileSync('media/preview-public/media/tests/original.svg'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('images appended by scrolling show the existing fallback when their preview fails', async ({ page }) => {
  await page.goto('/all/');
  await page.route('**/media/tests/*.svg', (route) => route.abort());
  await page.locator('.object-tile').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.object-tile')).toHaveCount(120);
  await expect(page.locator('.object-tile').nth(60).getByText('Image unavailable')).toBeVisible();
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`far previews detach and restore without changing the grid at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/category/test/');
    const first = page.locator('.object-tile img').first();
    await expect.poll(() => first.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(page.locator('.object-tile img').nth(59)).not.toHaveAttribute('src');
    await page.locator('.object-tile').nth(59).scrollIntoViewIfNeeded();
    await expect(page.locator('.object-tile')).toHaveCount(120);
    await page.locator('.object-tile').nth(119).scrollIntoViewIfNeeded();
    await expect(page.locator('.object-tile')).toHaveCount(121);
    await page.locator('.object-tile').last().scrollIntoViewIfNeeded();
    const last = page.locator('.object-tile img').last();
    await expect.poll(() => last.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(first).not.toHaveAttribute('src');
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const sizes = await page.locator('.object-tile').evaluateAll((tiles) => tiles.map((tile) => {
      const { width, height } = tile.getBoundingClientRect();
      return { width, height };
    }));
    expect(sizes.every((size) => size.height > 100 && Math.abs(size.width - size.height) < 1)).toBe(true);
    await page.locator('.object-tile').first().scrollIntoViewIfNeeded();
    await expect(first).toHaveAttribute('src', '/media/tests/original.svg');
    await expect.poll(() => first.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(last).not.toHaveAttribute('src');
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
    await expect(page.locator('.image-unavailable:not([hidden])')).toHaveCount(0);
    await page.getByRole('link', { name: /^Object 1$/i, exact: true }).click();
    await expect(page.getByRole('heading', { name: /^Object 1$/i })).toBeVisible();
  });
}

test('home and all share a mixed feed that stays stable on reload and keeps category filters usable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.object-tile')).toHaveCount(60);
  await expect(page.locator('.category-card')).toHaveCount(0);
  await expect(page.locator('.object-link[href^="/object/test_"]').first()).toBeVisible();
  await expect(page.locator('.object-link[href^="/object/light_"]').first()).toBeVisible();
  const firstPage = await page.locator('.object-link').evaluateAll((links) => links.map((link) => link.pathname));
  await page.reload();
  expect(await page.locator('.object-link').evaluateAll((links) => links.map((link) => link.pathname))).toEqual(firstPage);
  await page.locator('.object-tile').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.object-tile')).toHaveCount(120);
  const firstTwoPages = await page.locator('.object-link').evaluateAll((links) => links.map((link) => link.pathname));
  expect(new Set(firstTwoPages).size).toBe(120);
  await page.goto('/all/');
  await expect(page.locator('.object-tile')).toHaveCount(60);
  expect(await page.locator('.object-link').evaluateAll((links) => links.map((link) => link.pathname))).toEqual(firstPage);
  await page.locator('.object-tile').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.object-tile')).toHaveCount(120);
  expect(await page.locator('.object-link').evaluateAll((links) => links.map((link) => link.pathname))).toEqual(firstTwoPages);
  await page.getByRole('link', { name: /^Items$/i, exact: true }).click();
  await expect(page).toHaveURL('/category/test/');
  await expect(page.locator('.object-tile')).toHaveCount(60);
  await expect(page.locator('.object-link[href^="/object/light_"]')).toHaveCount(0);
});

test('the home feed fits mobile and paginates without JavaScript without duplicates', async ({ browser, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.object-tile')).toHaveCount(60);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: 'http://127.0.0.1:4322' });
  const fallback = await context.newPage();
  await fallback.goto('/');
  await expect(fallback.locator('.object-tile')).toHaveCount(60);
  const firstPage = await fallback.locator('.object-link').evaluateAll((links) => links.map((link) => link.pathname));
  await fallback.getByRole('link', { name: /^Next page$/i }).click({ force: true });
  await expect(fallback).toHaveURL('/all/page/2/');
  await expect(fallback.locator('.object-tile')).toHaveCount(60);
  const secondPage = await fallback.locator('.object-link').evaluateAll((links) => links.map((link) => link.pathname));
  expect(new Set([...firstPage, ...secondPage]).size).toBe(120);
  await context.close();
});
