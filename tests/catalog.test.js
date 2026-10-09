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

test('the feed puts recently added objects first across categories and preserves category order', () => {
  const chairs = [
    { ...chair, id: 'chair_newer', addedAt: '2026-10-07T10:00:00Z' },
    { ...chair, id: 'chair_older', addedAt: '2026-10-05T10:00:00Z' },
  ];
  const lights = [
    { ...chair, id: 'light_new', addedAt: '2026-10-08T12:00:00+03:00' },
    { ...chair, id: 'light_equal', addedAt: '2026-10-07T13:00:00+03:00' },
    { ...chair, id: 'light_legacy' },
  ];
  const first = createCatalog(categories, { chairs, lights });
  const reordered = createCatalog([...categories].reverse(), { chairs: [...chairs].reverse(), lights: [...lights].reverse() });
  const expected = ['light_new', 'chair_newer', 'light_equal', 'chair_older', 'light_legacy'];

  assert.deepEqual(first.feed.map((object) => object.id), expected);
  assert.deepEqual(reordered.feed.map((object) => object.id), expected);
  assert.deepEqual(paginate(first.feed, 2).flat().map((object) => object.id), expected);
  assert.deepEqual(first.objects.map((object) => object.id), ['chair_newer', 'chair_older', 'light_new', 'light_equal', 'light_legacy']);
  assert.equal(first.feed[0].addedAt, '2026-10-08T12:00:00+03:00');
  assert.deepEqual(createCatalog([], {}).feed, []);
});

test('invalid addition dates cannot silently corrupt chronological sorting', () => {
  assert.throws(() => createCatalog([categories[0]], { chairs: [{ ...chair, addedAt: 'yesterday' }] }));
});

test('original download byte size is preserved and invalid sizes are rejected', () => {
  const catalog = createCatalog([categories[0]], { chairs: [{ ...chair, originalBytes: 1828665 }] });
  assert.equal(catalog.objects[0].originalBytes, 1828665);
  for (const originalBytes of [0, -1, 1.5, '1828665']) {
    assert.throws(() => createCatalog([categories[0]], { chairs: [{ ...chair, originalBytes }] }));
  }
  assert.equal(createCatalog([categories[0]], { chairs: [chair] }).objects[0].originalBytes, undefined);
});
