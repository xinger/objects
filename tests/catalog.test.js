import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalog, paginate, pageHref } from '../src/lib/catalog.js';

const categories = [{ id: 'chairs', title: 'Стулья' }, { id: 'lights', title: 'Свет' }];
const chair = {
  id: 'chair_01',
  title: 'Красный стул',
  original: 'originals/chair_01.png',
  preview: 'previews/chair_01.webp',
  width: 1200,
  height: 1600,
};

test('moving an object between categories preserves its page and original URL', () => {
  const before = createCatalog(categories, { chairs: [chair], lights: [] }, 'https://media.example.com/');
  const after = createCatalog(categories, { chairs: [], lights: [chair] }, 'https://media.example.com/');
  assert.equal(before.objects[0].href, '/object/chair_01/');
  assert.equal(after.objects[0].href, '/object/chair_01/');
  assert.equal(after.objects[0].original, 'https://media.example.com/originals/chair_01.png');
  assert.equal(after.objects[0].categoryId, 'lights');
  assert.equal(before.categories[0].count, 1);
  assert.equal(after.categories[0].count, 0);
});

test('missing optional text produces usable alt text and an empty description and tags', () => {
  const { title, ...untitled } = chair;
  const catalog = createCatalog(categories, { chairs: [untitled], lights: [] }, '/media/');
  assert.equal(catalog.objects[0].title, 'Стулья · chair_01');
  assert.equal(catalog.objects[0].description, '');
  assert.deepEqual(catalog.objects[0].tags, []);
  assert.equal(catalog.objects[0].preview, '/media/previews/chair_01.webp');
});

test('duplicate object IDs across categories fail instead of overwriting an object page', () => {
  assert.throws(() => createCatalog(categories, { chairs: [chair], lights: [chair] }), /duplicate object/i);
});

test('duplicate categories and missing or unlisted category files fail visibly', () => {
  assert.throws(() => createCatalog([categories[0], categories[0]], { chairs: [] }), /duplicate category/i);
  assert.throws(() => createCatalog(categories, { chairs: [] }), /missing category/i);
  assert.throws(() => createCatalog([], { forgotten: [chair] }), /unknown category/i);
});

test('unsafe image links and invalid dimensions are rejected before HTML generation', () => {
  for (const original of ['javascript:alert(1)', '//evil.example/file.png', '../file.png', '%2e%2e/file.png']) {
    assert.throws(() => createCatalog([categories[0]], { chairs: [{ ...chair, original }] }));
  }
  assert.throws(() => createCatalog([categories[0]], { chairs: [{ ...chair, width: 0 }] }));
  assert.throws(() => createCatalog([categories[0]], { chairs: [{ ...chair, id: '../outside' }] }));
});

test('empty and populated pagination keep every object and expose real navigable paths', () => {
  assert.deepEqual(paginate([], 2), [[]]);
  assert.deepEqual(paginate(['a', 'b', 'c', 'd', 'e'], 2), [['a', 'b'], ['c', 'd'], ['e']]);
  assert.equal(pageHref(null, 1), '/all/');
  assert.equal(pageHref(null, 2), '/all/page/2/');
  assert.equal(pageHref('chairs', 1), '/category/chairs/');
  assert.equal(pageHref('chairs', 3), '/category/chairs/page/3/');
  assert.throws(() => paginate(['a'], 0));
});

test('originals and previews can use separate domains while explicit URLs are preserved', () => {
  const catalog = createCatalog([categories[0]], { chairs: [chair] }, 'https://png.example/', 'https://webp.example/');
  assert.equal(catalog.objects[0].original, 'https://png.example/originals/chair_01.png');
  assert.equal(catalog.objects[0].preview, 'https://webp.example/previews/chair_01.webp');
  const explicit = createCatalog([categories[0]], { chairs: [{ ...chair, preview: 'https://external.example/chair.webp' }] });
  assert.equal(explicit.objects[0].preview, 'https://external.example/chair.webp');
  assert.throws(() => createCatalog([], {}, '/', 'javascript:evil'), /invalid preview base/i);
});

test('the mixed feed is stable within a build and across input order and keeps category order intact', () => {
  const chairs = Array.from({ length: 70 }, (_, index) => ({ ...chair, id: `chair_${index}` }));
  const lights = Array.from({ length: 70 }, (_, index) => ({ ...chair, id: `light_${index}` }));
  const first = createCatalog(categories, { chairs, lights });
  const rebuilt = createCatalog(categories, { chairs, lights });
  const reordered = createCatalog([...categories].reverse(), { chairs: [...chairs].reverse(), lights: [...lights].reverse() });
  const ids = (catalog) => catalog.feed.map((object) => object.id);

  assert.ok(Array.isArray(first.feed), 'The catalog exposes the mixed feed');
  assert.deepEqual(ids(first), ids(rebuilt));
  assert.deepEqual(ids(first), ids(reordered));
  assert.equal(first.feed.length, 140);
  assert.equal(new Set(ids(first)).size, 140);
  assert.deepEqual([...ids(first)].sort(), first.objects.map((object) => object.id).sort());
  assert.deepEqual(first.objects.map((object) => object.id), [...chairs, ...lights].map((object) => object.id));
  for (const page of paginate(first.feed).slice(0, 2)) {
    assert.deepEqual(new Set(page.map((object) => object.categoryId)), new Set(['chairs', 'lights']));
  }
});

test('a new build seed reshuffles the feed without losing objects or changing category order', () => {
  const chairs = Array.from({ length: 70 }, (_, index) => ({ ...chair, id: `chair_${index}` }));
  const lights = Array.from({ length: 70 }, (_, index) => ({ ...chair, id: `light_${index}` }));
  const entries = { chairs, lights };
  const first = createCatalog(categories, entries, '/media/', '/previews/', 'build-a');
  const repeated = createCatalog(categories, entries, '/media/', '/previews/', 'build-a');
  const next = createCatalog(categories, entries, '/media/', '/previews/', 'build-b');
  const ids = (catalog) => catalog.feed.map((object) => object.id);

  assert.deepEqual(ids(first), ids(repeated));
  assert.notDeepEqual(ids(first).slice(0, 60), ids(next).slice(0, 60));
  assert.deepEqual([...ids(first)].sort(), [...ids(next)].sort());
  assert.equal(new Set(ids(next)).size, 140);
  assert.deepEqual(first.objects, next.objects);
  assert.deepEqual(paginate(next.feed).flat(), next.feed);
});

test('new objects join the mixed feed without changing the relative order of existing objects', () => {
  const chairs = Array.from({ length: 20 }, (_, index) => ({ ...chair, id: `chair_${index}` }));
  const before = createCatalog(categories, { chairs, lights: [] });
  const after = createCatalog(categories, { chairs, lights: [{ ...chair, id: 'new_light' }] });

  assert.ok(Array.isArray(after.feed), 'The catalog exposes the mixed feed');
  assert.deepEqual(after.feed.filter((object) => object.id !== 'new_light').map((object) => object.id), before.feed.map((object) => object.id));
  assert.equal(after.feed.filter((object) => object.id === 'new_light').length, 1);
  assert.deepEqual(createCatalog([], {}).feed, []);
});
