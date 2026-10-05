import { defineConfig } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('media/test-data/categories', { recursive: true });
mkdirSync('media/preview-public/media/tests', { recursive: true });
writeFileSync('media/test-data/categories.json', JSON.stringify([{ id: 'test', title: 'Items' }, { id: 'empty', title: 'Empty category' }, { id: 'lights', title: 'Lights' }]));
writeFileSync('media/test-data/categories/test.json', JSON.stringify(Array.from({ length: 121 }, (_, index) => ({
  id: `test_${index + 1}`,
  title: `Object ${index + 1}`,
  original: 'original.svg',
  preview: index === 120 ? 'alternate.svg' : 'original.svg',
  width: 640,
  height: 800,
}))));
writeFileSync('media/test-data/categories/empty.json', '[]');
writeFileSync('media/test-data/categories/lights.json', JSON.stringify(Array.from({ length: 20 }, (_, index) => ({
  id: `light_${index + 1}`,
  title: `Light ${index + 1}`,
  original: 'original.svg',
  preview: 'original.svg',
  width: 640,
  height: 800,
}))));
writeFileSync('media/preview-public/media/tests/original.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800"><circle cx="320" cy="400" r="100" fill="#c35037"/></svg>');
writeFileSync('media/preview-public/media/tests/alternate.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800"><circle cx="320" cy="400" r="100" fill="#3750c3"/></svg>');

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  outputDir: 'media/test-results',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4322', channel: 'chrome', headless: true, acceptDownloads: true },
  webServer: {
    command: 'CATALOG_DATA_DIR=media/test-data PUBLIC_MEDIA_BASE_URL=/media/tests/ PREVIEW_PUBLIC_DIR=media/preview-public ASTRO_TELEMETRY_DISABLED=1 npm run dev -- --port 4322 --ignore-lock',
    url: 'http://127.0.0.1:4322',
    reuseExistingServer: false,
  },
});
