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
  assert.equal(pageHref(null, 1), '/');
  assert.equal(pageHref(null, 2), '/page/2/');
  assert.equal(pageHref('chairs', 1), '/category/chairs/');
  assert.equal(pageHref('chairs', 3), '/category/chairs/page/3/');
  assert.throws(() => paginate(['a'], 0));
});
