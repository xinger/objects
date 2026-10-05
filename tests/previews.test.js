import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { preparePreviews } from '../scripts/prepare-previews.js';

test('PNG previews preserve alpha and proportions without changing originals', async () => {
  await mkdir('media', { recursive: true });
  const root = await mkdtemp('media/preview-test-');
  try {
    const input = path.join(root, 'originals');
    const output = path.join(root, 'previews');
    await mkdir(path.join(input, 'nested'), { recursive: true });
    const large = await sharp({ create: { width: 2400, height: 1200, channels: 4, background: { r: 120, g: 90, b: 60, alpha: 0.5 } } }).png().toBuffer();
    const small = await sharp({ create: { width: 40, height: 80, channels: 4, background: { r: 20, g: 70, b: 100, alpha: 0 } } }).png().toBuffer();
    await writeFile(path.join(input, 'nested', 'large.PNG'), large);
    await writeFile(path.join(input, 'small.png'), small);
    await writeFile(path.join(input, 'notes.txt'), 'skip');
    const result = await preparePreviews(input, output);
    assert.equal(result.length, 2);
    const preview = await sharp(path.join(output, 'nested', 'large.webp')).metadata();
    assert.equal(preview.format, 'webp');
    assert.equal(preview.hasAlpha, true);
    assert.equal(preview.width, 1024);
    assert.equal(preview.height, 512);
    const tiny = await sharp(path.join(output, 'small.webp')).metadata();
    assert.equal(tiny.width, 40);
    assert.equal(tiny.height, 80);
    const { data, info } = await sharp(path.join(output, 'small.webp')).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 4);
    assert.equal(data[3], 0);
    assert.deepEqual(await readFile(path.join(input, 'nested', 'large.PNG')), large);
    assert.deepEqual(await readFile(path.join(input, 'small.png')), small);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('selected previews process only added PNGs, ignoring unrelated old inputs', async () => {
  await mkdir('media', { recursive: true });
  const root = await mkdtemp('media/preview-selection-test-');
  try {
    const input = path.join(root, 'originals');
    const output = path.join(root, 'previews');
    await mkdir(input);
    await writeFile(path.join(input, 'old.png'), 'Not a selected image; must not be decoded.');
    await sharp({ create: { width: 30, height: 40, channels: 4, background: { r: 120, g: 60, b: 30, alpha: 0.5 } } }).png().toFile(path.join(input, 'new.png'));
    const result = await preparePreviews(input, output, new Set(['new.png']));
    assert.equal(result.length, 1);
    assert.equal((await sharp(path.join(output, 'new.webp')).metadata()).hasAlpha, true);
    await assert.rejects(() => readFile(path.join(output, 'old.webp')), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
