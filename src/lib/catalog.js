import { z } from 'zod';

const idSchema = z.string().regex(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/i);
const categorySchema = z.object({ id: idSchema, title: z.string().trim().min(1) });
const assetSchema = z.string().min(1).refine(isSafeAsset, 'Unsafe image URL or key');
const objectSchema = z.object({
  id: idSchema,
  original: assetSchema,
  preview: assetSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  title: z.string().trim().optional().default(''),
  description: z.string().trim().optional().default(''),
  tags: z.array(z.string().trim().min(1)).optional().default([]),
  filename: z.string().min(1).optional(),
});

/** @param {{id: string, title: string}[]} categories
 * @param {Record<string, unknown>} entries
 * @param {string} mediaBaseUrl */
export function createCatalog(categories, entries, mediaBaseUrl = 'https://objects-media.xinger.net/') {
  const parsedCategories = z.array(categorySchema).parse(categories);
  const categoryIds = new Set();
  const objectIds = new Set();
  const objects = [];
  const resultCategories = [];

  if (!isSafeBase(mediaBaseUrl)) throw new Error('Invalid media base URL');
  for (const category of parsedCategories) {
    if (categoryIds.has(category.id)) throw new Error(`Duplicate category: ${category.id}`);
    categoryIds.add(category.id);
    if (!(category.id in entries)) throw new Error(`Missing category file: ${category.id}.json`);
    const records = z.array(objectSchema).parse(entries[category.id]);
    resultCategories.push({ ...category, count: records.length });
    for (const record of records) {
      if (objectIds.has(record.id)) throw new Error(`Duplicate object: ${record.id}`);
      objectIds.add(record.id);
      const original = assetUrl(record.original, mediaBaseUrl);
      objects.push({
        ...record,
        original,
        preview: assetUrl(record.preview, mediaBaseUrl),
        title: record.title || `${category.title} · ${record.id}`,
        categoryId: category.id,
        categoryTitle: category.title,
        href: `/object/${record.id}/`,
        filename: record.filename || decodeURIComponent(original.split('/').pop() || record.id),
      });
    }
  }
  for (const id of Object.keys(entries)) {
    if (!categoryIds.has(id)) throw new Error(`Unknown category file: ${id}.json`);
  }
  return { categories: resultCategories, objects };
}

/** @template T @param {T[]} items @param {number} size @returns {T[][]} */
export function paginate(items, size = 60) {
  if (!Number.isInteger(size) || size < 1) throw new Error('Invalid page size');
  if (!items.length) return [[]];
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

/** @param {string | null} categoryId @param {number} page */
export function pageHref(categoryId, page) {
  const base = categoryId ? `/category/${categoryId}/` : '/';
  return page === 1 ? base : `${base}page/${page}/`;
}

/** @param {string} value */
function isSafeAsset(value) {
  if (/^https?:\/\//.test(value)) {
    try {
      const url = new URL(value);
      return !!url.hostname && !url.username && !url.password;
    } catch { return false; }
  }
  try {
    const decoded = decodeURIComponent(value);
    return !/^[\/]|[\\:?#]/.test(decoded) && decoded.split('/').every((part) => part && part !== '.' && part !== '..');
  } catch { return false; }
}

/** @param {string} value */
function isSafeBase(value) {
  return value === '/' || (/^\/(?!\/)/.test(value) && !value.includes('..')) || /^https?:\/\//.test(value) && isSafeAsset(value);
}

/** @param {string} key @param {string} base */
function assetUrl(key, base) {
  if (/^https?:\/\//.test(key)) return key;
  const encoded = key.split('/').map((part) => encodeURIComponent(decodeURIComponent(part))).join('/');
  return `${base.replace(/\/$/, '')}/${encoded}`;
}
