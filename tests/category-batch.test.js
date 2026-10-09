import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createJobs, saveImage, importBatch, categoryContext } from '../scripts/category-batch.js';
import { stat, utimes } from 'node:fs/promises';

async function fixture(t, count = 4) {
  await mkdir('media', { recursive: true });
  const root = await mkdtemp(path.resolve('media/batch-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const batch = path.join(root, 'batch');
  await mkdir(batch);
  const manifest = {
    category: { id: 'shells', title: 'Раковины' },
    objects: Array.from({ length: count }, (_, index) => ({
      filename: `${String(index + 1).padStart(3, '0')}-shell.png`,
      title: `Shell ${index + 1}`, description: 'A watercolor shell.',
      tags: ['shell', 'watercolor'], prompt: `Exactly one shell, variant ${index + 1}.`,
    })),
  };
  await writeFile(path.join(batch, 'collection.json'), JSON.stringify(manifest));
  const source = path.join(root, 'generated.png');
  await sharp({ create: { width: 24, height: 32, channels: 4, background: { r: 120, g: 60, b: 30, alpha: 0.5 } } }).png().toFile(source);
  return { root, batch, manifest, source };
}

test('jobs give each pending image to exactly one worker and resume without completed images', async (t) => {
  const { batch, source } = await fixture(t);
  await saveImage(batch, '002-shell.png', source);
  const jobs = await createJobs(batch);
  assert.equal(jobs.length, 3);
  const assignments = await Promise.all(jobs.map(async (file) => JSON.parse(await readFile(file, 'utf8'))));
  assert.deepEqual(assignments.flatMap((job) => job.objects.map((object) => object.filename)).sort(), ['001-shell.png', '003-shell.png', '004-shell.png']);
  assert.ok(assignments.every((job) => job.directory === batch && job.objects.length === 1));
  const single = await createJobs(batch, 1);
  assert.equal(single.length, 1);
  assert.equal(JSON.parse(await readFile(single[0], 'utf8')).objects.length, 3);
  for (const workers of [0, 4, 1.5]) await assert.rejects(() => createJobs(batch, workers), /1.*3/);
});

test('saving preserves original bytes, refuses replacement and rejects opaque or blank PNGs', async (t) => {
  const { batch, source } = await fixture(t);
  const destination = await saveImage(batch, '001-shell.png', source);
  assert.deepEqual(await readFile(destination), await readFile(source));
  await assert.rejects(() => saveImage(batch, '001-shell.png', source), /exist|существует/i);
  await assert.rejects(() => saveImage(batch, '../escape.png', source), /filename|имя/i);
  for (const alpha of [0, 1]) {
    await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha } } }).png().toFile(source);
    await assert.rejects(() => saveImage(batch, '002-shell.png', source), /прозрач|пуст/i);
  }
  await assert.rejects(() => access(path.join(batch, 'images/002-shell.png')), { code: 'ENOENT' });
});

test('duplicate filenames are rejected before assigning generation jobs', async (t) => {
  const { batch, manifest } = await fixture(t);
  manifest.objects[1].filename = manifest.objects[0].filename;
  await writeFile(path.join(batch, 'collection.json'), JSON.stringify(manifest));
  await assert.rejects(() => createJobs(batch), /Duplicate|повтор/i);
});

test('import adds explicit metadata and preserves the existing category and complete asset library', async (t) => {
  const { root, batch, manifest, source } = await fixture(t, 1);
  await mkdir(path.join(root, 'data/categories'), { recursive: true });
  await mkdir(path.join(root, 'media/library/originals'), { recursive: true });
  await mkdir(path.join(root, 'media/library/previews'), { recursive: true });
  const old = [{ id: 'flowers-001-rose', title: 'Rose', original: 'originals/rose.png', preview: 'previews/rose.webp', width: 24, height: 32 }];
  await writeFile(path.join(root, 'data/categories.json'), '[{"id":"flowers","title":"Цветы"}]\n');
  const oldJson = JSON.stringify(old) + '\n';
  await writeFile(path.join(root, 'data/categories/flowers.json'), oldJson);
  await writeFile(path.join(root, 'media/library/originals/rose.png'), await readFile(source));
  await sharp(source).webp().toFile(path.join(root, 'media/library/previews/rose.webp'));
  await saveImage(batch, '001-shell.png', source);
  await importBatch(batch, root);
  assert.equal(await readFile(path.join(root, 'data/categories/flowers.json'), 'utf8'), oldJson);
  const categories = JSON.parse(await readFile(path.join(root, 'data/categories.json'), 'utf8'));
  assert.deepEqual(categories.map((category) => category.id), ['flowers', 'shells']);
  const [record] = JSON.parse(await readFile(path.join(root, 'data/categories/shells.json'), 'utf8'));
  assert.equal(record.title, 'Shell 1');
  assert.equal(record.description, manifest.objects[0].description);
  assert.deepEqual(record.tags, ['shell', 'watercolor']);
  assert.equal(record.prompt, undefined);
  assert.deepEqual(await readFile(path.join(root, 'media/library', record.original)), await readFile(source));
  assert.equal((await sharp(path.join(root, 'media/library', record.preview)).metadata()).hasAlpha, true);
  await access(path.join(root, 'media/library/originals/rose.png'));
  await access(path.join(root, 'media/library/previews/rose.webp'));
  await importBatch(batch, root);
  assert.equal(JSON.parse(await readFile(path.join(root, 'data/categories.json'), 'utf8')).length, 2);
});

test('incomplete batches and missing old assets cannot change the catalogue', async (t) => {
  const { root, batch, source } = await fixture(t, 1);
  await mkdir(path.join(root, 'data/categories'), { recursive: true });
  await writeFile(path.join(root, 'data/categories.json'), '[]\n');
  await assert.rejects(() => importBatch(batch, root), /не заверш|отсутств|missing/i);
  assert.equal(await readFile(path.join(root, 'data/categories.json'), 'utf8'), '[]\n');
  await saveImage(batch, '001-shell.png', source);
  await writeFile(path.join(root, 'data/categories.json'), '[{"id":"flowers","title":"Цветы"}]\n');
  await writeFile(path.join(root, 'data/categories/flowers.json'), '[{"id":"rose","original":"originals/rose.png","preview":"previews/rose.webp","width":24,"height":32}]');
  await assert.rejects(() => importBatch(batch, root), /библиотек|ENOENT/i);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'data/categories.json'), 'utf8')).map((category) => category.id), ['flowers']);
  await assert.rejects(() => access(path.join(root, 'data/categories/shells.json')), { code: 'ENOENT' });
});

test('appending a finished series preserves old records, assets and previews and is repeatable', async (t) => {
  const { root, batch, manifest, source } = await fixture(t, 1);
  await mkdir(path.join(root, 'data/categories'), { recursive: true });
  await writeFile(path.join(root, 'data/categories.json'), '[]');
  await saveImage(batch, '001-shell.png', source);
  await importBatch(batch, root);
  const categoryFile = path.join(root, 'data/categories/shells.json');
  const first = JSON.parse(await readFile(categoryFile, 'utf8'));
  const oldPreview = path.join(batch, 'prepared', first[0].preview);
  const oldOriginal = path.join(root, 'media/library', first[0].original);
  await utimes(oldPreview, 1, 1);
  await utimes(oldOriginal, 1, 1);
  await writeFile(path.join(root, 'data/categories.json'), '[{"id":"shells","title":"Раковины","cover":"shells-001-shell"}]\n');
  const registry = await readFile(path.join(root, 'data/categories.json'), 'utf8');
  manifest.objects.push({ filename: '002-nautilus.png', title: 'Nautilus', description: 'A spiral watercolor shell.', tags: ['nautilus'], prompt: 'One watercolor nautilus.' });
  await writeFile(path.join(batch, 'collection.json'), JSON.stringify(manifest));
  await saveImage(batch, '002-nautilus.png', source);
  await assert.rejects(() => importBatch(batch, root), /append/);
  const result = await importBatch(batch, root, true);
  assert.equal(result.count, 2);
  assert.equal(result.added, 1);
  const second = JSON.parse(await readFile(categoryFile, 'utf8'));
  assert.deepEqual(second[0], first[0]);
  assert.equal(second[1].id, 'shells-002-nautilus');
  assert.equal((await stat(oldPreview)).mtimeMs, 1000);
  assert.equal((await stat(oldOriginal)).mtimeMs, 1000);
  assert.deepEqual(await readFile(oldOriginal), await readFile(source));
  assert.equal(await readFile(path.join(root, 'data/categories.json'), 'utf8'), registry);
  const repeated = await importBatch(batch, root, true);
  assert.equal(repeated.unchanged, true);
  assert.equal(repeated.added, 0);
  assert.deepEqual(JSON.parse(await readFile(categoryFile, 'utf8')), second);
});

test('a batch containing only additions merges into an existing category and cannot replace old objects', async (t) => {
  const { root, batch, manifest, source } = await fixture(t, 1);
  await mkdir(path.join(root, 'data/categories'), { recursive: true });
  await writeFile(path.join(root, 'data/categories.json'), '[]');
  await saveImage(batch, '001-shell.png', source);
  await importBatch(batch, root);
  const categoryFile = path.join(root, 'data/categories/shells.json');
  const firstJson = await readFile(categoryFile, 'utf8');
  manifest.objects[0].title = 'Changed old title';
  await writeFile(path.join(batch, 'collection.json'), JSON.stringify(manifest));
  await assert.rejects(() => importBatch(batch, root, true), /замен|измен|отлич/);
  manifest.objects[0].title = 'Shell 1';
  await writeFile(path.join(batch, 'collection.json'), JSON.stringify(manifest));
  await sharp({ create: { width: 30, height: 40, channels: 4, background: { r: 0, g: 200, b: 0, alpha: 0.5 } } }).png().toFile(path.join(batch, 'images/001-shell.png'));
  await assert.rejects(() => importBatch(batch, root, true), /замен|измен|отлич/);
  assert.equal(await readFile(categoryFile, 'utf8'), firstJson);
  const additions = path.join(root, 'additions');
  await mkdir(additions);
  manifest.objects = [{ filename: '031-nautilus.png', title: 'Nautilus', description: 'A watercolor nautilus.', tags: ['shell'], prompt: 'One watercolor nautilus.' }];
  await writeFile(path.join(additions, 'collection.json'), JSON.stringify(manifest));
  await saveImage(additions, '031-nautilus.png', source);
  await importBatch(additions, root, true);
  const records = JSON.parse(await readFile(categoryFile, 'utf8'));
  assert.equal(records.length, 2);
  assert.deepEqual(records[0], JSON.parse(firstJson)[0]);
  assert.equal(records[1].id, 'shells-031-nautilus');
});

test('continuation context reserves existing and planned numbers and returns bounded style examples', async (t) => {
  const { root, batch, manifest } = await fixture(t, 30);
  await mkdir(path.join(root, 'data/categories'), { recursive: true });
  await writeFile(path.join(root, 'data/categories.json'), '[]');
  const planned = await categoryContext('shells', batch, root);
  assert.equal(planned.nextNumber, 31);
  assert.equal(planned.count, 0);
  assert.equal(planned.examples.length, 3);
  assert.equal(planned.examples[0].prompt, manifest.objects[0].prompt);
  await writeFile(path.join(root, 'data/categories.json'), '[{"id":"shells","title":"Раковины"}]');
  await writeFile(path.join(root, 'data/categories/shells.json'), '[{"id":"shells-040-shell","filename":"040-shell.png","title":"Shell","original":"originals/040-shell.png"}]');
  assert.equal((await categoryContext('shells', batch, root)).nextNumber, 41);
  const legacy = await categoryContext('shells', path.join(root, 'missing-batch'), root);
  assert.equal(legacy.nextNumber, 41);
  assert.equal(legacy.count, 1);
  assert.equal(legacy.examples[0].title, 'Shell');
  assert.equal(legacy.examples[0].image, path.join(root, 'media/library/originals/040-shell.png'));
});

test('generation waves cap each worker at ten images and resume a large series without repeats', async (t) => {
  const { batch, manifest, source } = await fixture(t, 65);
  const saved = [];
  for (const expectedCount of [30, 30, 5]) {
    const jobs = await createJobs(batch);
    assert.equal(jobs.length, 3);
    const assignments = await Promise.all(jobs.map(async (file) => JSON.parse(await readFile(file, 'utf8'))));
    assert.ok(assignments.every((job) => job.objects.length > 0 && job.objects.length <= 10));
    const filenames = assignments.flatMap((job) => job.objects.map((object) => object.filename));
    assert.equal(filenames.length, expectedCount);
    assert.equal(new Set(filenames).size, expectedCount);
    assert.ok(filenames.every((filename) => !saved.includes(filename)));
    for (const filename of filenames) await saveImage(batch, filename, source);
    saved.push(...filenames);
  }
  assert.deepEqual(saved.sort(), manifest.objects.map((object) => object.filename));
  assert.deepEqual(await createJobs(batch), []);
});

test('one or two workers still receive at most ten assignments each', async (t) => {
  const { batch } = await fixture(t, 35);
  for (const workers of [1, 2]) {
    const jobs = await createJobs(batch, workers);
    assert.equal(jobs.length, workers);
    const assignments = await Promise.all(jobs.map(async (file) => JSON.parse(await readFile(file, 'utf8'))));
    assert.ok(assignments.every((job) => job.objects.length === 10));
    assert.equal(new Set(assignments.flatMap((job) => job.objects.map((object) => object.filename))).size, workers * 10);
  }
});

test('imports date new objects while repeated imports preserve their first addition date', async (t) => {
  const { root, batch, manifest, source } = await fixture(t, 1);
  await mkdir(path.join(root, 'data/categories'), { recursive: true });
  await writeFile(path.join(root, 'data/categories.json'), '[]');
  await saveImage(batch, '001-shell.png', source);
  const started = Date.now();
  await importBatch(batch, root);
  const file = path.join(root, 'data/categories/shells.json');
  const first = JSON.parse(await readFile(file, 'utf8'));
  assert.ok(Date.parse(first[0].addedAt) >= started);
  assert.ok(Date.parse(first[0].addedAt) <= Date.now());
  first[0].addedAt = '2000-01-01T00:00:00.000Z';
  await writeFile(file, JSON.stringify(first));
  assert.equal((await importBatch(batch, root)).unchanged, true);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), first);
  manifest.objects.push({ filename: '002-new.png', title: 'New shell', description: 'A new shell.', tags: ['shell'], prompt: 'One shell.' });
  await writeFile(path.join(batch, 'collection.json'), JSON.stringify(manifest));
  await saveImage(batch, '002-new.png', source);
  const appendedAt = Date.now();
  await importBatch(batch, root, true);
  const appended = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(appended[0], first[0]);
  assert.ok(Date.parse(appended[1].addedAt) >= appendedAt);
  assert.ok(Date.parse(appended[1].addedAt) <= Date.now());
  assert.equal((await importBatch(batch, root, true)).unchanged, true);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), appended);
});

test('batch import records original PNG dimensions and byte size', async (t) => {
  const { root, batch, source } = await fixture(t, 1);
  await mkdir(path.join(root, 'data/categories'), { recursive: true });
  await writeFile(path.join(root, 'data/categories.json'), '[]');
  await saveImage(batch, '001-shell.png', source);
  await importBatch(batch, root);
  const [record] = JSON.parse(await readFile(path.join(root, 'data/categories/shells.json'), 'utf8'));
  const original = await readFile(path.join(root, 'media/library', record.original));
  const metadata = await sharp(original).metadata();
  assert.equal(record.width, metadata.width);
  assert.equal(record.height, metadata.height);
  assert.equal(record.originalBytes, original.length);
  assert.equal((await importBatch(batch, root)).unchanged, true);
});
