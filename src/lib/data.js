import { readFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createCatalog } from './catalog.js';
import { randomUUID } from 'node:crypto';

/** @type {ReturnType<typeof createCatalog> | undefined} */
let catalog;
const feedSeed = randomUUID();

export function getCatalog() {
  if (catalog && !import.meta.env.DEV) return catalog;
  const directory = resolve(process.env.CATALOG_DATA_DIR || 'data');
  const categories = JSON.parse(readFileSync(resolve(directory, 'categories.json'), 'utf8'));
  const categoryDirectory = resolve(directory, 'categories');
  const entries = Object.fromEntries(readdirSync(categoryDirectory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => [basename(name, '.json'), JSON.parse(readFileSync(resolve(categoryDirectory, name), 'utf8'))]));
  catalog = createCatalog(categories, entries,
    import.meta.env.PUBLIC_MEDIA_BASE_URL || 'https://objects-media.xinger.net/',
    import.meta.env.PUBLIC_PREVIEW_BASE_URL || import.meta.env.PUBLIC_MEDIA_BASE_URL || 'https://objects-previews.xinger.net/', feedSeed);
  return catalog;
}
