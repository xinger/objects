import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createJobs, saveImage, importBatch } from '../scripts/category-batch.js';

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
