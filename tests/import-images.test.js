import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { parsePrompts, sourceMetadata, importCategory } from '../scripts/import-images.js';

test('prompt records match exact filenames or numeric headers without leaking generation instructions', () => {
  const prompts = parsePrompts('Generated using imagegen.\n\n001: Use case: photorealistic-natural. Exactly ONE butterfly with pearl white wings, charcoal gray tips and delicate gray veins. Strict overhead view. No text or watermark.\n\n002-blue.png\nUse case: photorealistic-natural. Exactly ONE blue morpho-like butterfly, brilliant blue wings. No shadows.\n');
  const white = sourceMetadata('001-white.png', prompts);
  assert.equal(white.title, 'Pearl white butterfly');
  assert.match(white.description, /charcoal gray tips/);
  assert.doesNotMatch(white.description, /Use case|Exactly ONE|Strict|No text|imagegen/);
  assert.match(sourceMetadata('002-blue.png', prompts).title, /Blue morpho-like butterfly/);
  assert.equal(sourceMetadata('002-other.png', prompts).description, '');
  assert.equal(sourceMetadata('003-coral-rose.png', prompts).title, 'Coral rose');
  assert.throws(() => parsePrompts('001: First.\n\n001: Second.'), /Duplicate prompt/);
});

test('ornament descriptions retain motifs and materials and discard framing and negative constraints', () => {
  const prompts = parsePrompts('001-painted-rosette.png\nUse case: stylized-concept. HAND-DRAWN Byzantine ornament, a circular rosette of acanthus leaves and palmettes. Flat gouache and ink illustration. Airy frame, complete centered motif with wide transparent outer margins. Absolutely no metal, no jewels. Genuine alpha transparency. No paper, text or watermark.');
  const metadata = sourceMetadata('001-painted-rosette.png', prompts);
  assert.match(metadata.title, /Hand-drawn Byzantine ornament/);
  assert.equal(metadata.description, 'Hand-drawn Byzantine ornament, a circular rosette of acanthus leaves and palmettes. Flat gouache and ink illustration.');
  assert.ok(metadata.tags.includes('acanthus'));
});

test('import preserves PNG bytes and uses stable page IDs with versioned asset keys', async () => {
  await mkdir('media', { recursive: true });
  const directory = await mkdtemp(path.resolve('media/import-test-'));
  try {
    const source = path.join(directory, 'source');
    await mkdir(source);
    const original = path.join(source, '001-rose.png');
    await sharp({ create: { width: 40, height: 80, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } }).png().toFile(original);
    await writeFile(path.join(source, 'prompts.txt'), '001: Use case: stylized-concept. A pink rose with delicate petals. No text.');
    const first = await importCategory(source, 'flowers', path.join(directory, 'first'));
    assert.equal(first.length, 1);
    assert.equal(first[0].id, 'flowers-001-rose');
    assert.equal(first[0].title, 'Pink rose with delicate petals');
    assert.equal(first[0].width, 40);
    assert.equal(first[0].height, 80);
    assert.equal(first[0].filename, '001-rose.png');
    assert.equal(first[0].originalBytes, (await readFile(original)).length);
    assert.deepEqual(await readFile(path.join(directory, 'first', first[0].original.replace('originals/', ''))), await readFile(original));
    await sharp({ create: { width: 50, height: 80, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 0 } } }).png().toFile(original);
    const second = await importCategory(source, 'flowers', path.join(directory, 'second'));
    assert.equal(second[0].id, first[0].id);
    assert.notEqual(second[0].original, first[0].original);
    assert.equal(second[0].preview.replace('previews/', '').replace('.webp', ''), second[0].original.replace('originals/', '').replace('.png', ''));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('framing instructions inside a sentence stay out of public descriptions and butterfly names remain specific', () => {
  const prompts = parsePrompts('001: Use case: photorealistic-natural. Exactly ONE butterfly with long slender forewings, creamy ivory wings striped with brown. Centered with generous transparent margins.\n\n002: Use case: photorealistic-natural. Exactly ONE butterfly, velvety midnight blue wings with salmon bands. Perfect overhead view.\n\n003: Use case: photorealistic-natural. Exactly ONE yellow swallowtail-like butterfly with soft yellow wings, black veins. Directly overhead view, fully spread wings.');
  assert.equal(sourceMetadata('001-ivory.png', prompts).title, 'Creamy ivory butterfly');
  assert.equal(sourceMetadata('002-midnight.png', prompts).title, 'Velvety midnight blue butterfly');
  assert.equal(sourceMetadata('003-swallowtail.png', prompts).title, 'Yellow swallowtail-like butterfly with soft yellow wings');
  for (const filename of ['001-ivory.png', '002-midnight.png', '003-swallowtail.png']) {
    assert.doesNotMatch(sourceMetadata(filename, prompts).description, /margin|Centered|Perfect|overhead/);
  }
});

test('butterfly titles use the main wing colors rather than trailing border details', () => {
  const prompts = parsePrompts('001: Use case: photorealistic-natural. Exactly ONE butterfly with deep indigo wings, large orange patches, black outer margins and blue accents on lower wings.\n\n002: Use case: photorealistic-natural. Exactly ONE butterfly with saturated magenta pink inner wings, black veins.\n\n003: Use case: photorealistic-natural. Exactly ONE butterfly with emerald green iridescent bands across velvety black wings, pale spots.');
  assert.equal(sourceMetadata('001-indigo.png', prompts).title, 'Deep indigo butterfly');
  assert.equal(sourceMetadata('002-magenta.png', prompts).title, 'Saturated magenta pink butterfly');
  assert.equal(sourceMetadata('003-emerald.png', prompts).title, 'Emerald green iridescent butterfly');
});
