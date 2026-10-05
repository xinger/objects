import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { validateUploads, findImages, stageAssets } from '../scripts/deploy-images.js';

const png = { key: 'chairs/one.PNG', size: 25 * 1024 * 1024 };
const webp = { key: 'chairs/one.webp', size: 1024 };

test('upload validates both Free limits and every PNG/WebP pair before deployment', () => {
  validateUploads([png], [webp]);
  assert.throws(() => validateUploads([{ ...png, size: png.size + 1 }], [webp]), /25 MiB/);
  assert.throws(() => validateUploads([png], [{ ...webp, size: png.size + 1 }]), /25 MiB/);
  assert.throws(() => validateUploads(Array(20000).fill(png), [webp]), /19999/);
  assert.throws(() => validateUploads([png], Array(20000).fill(webp)), /19999/);
  assert.throws(() => validateUploads([], []), /пуста/);
  assert.throws(() => validateUploads([png, { key: 'two.png', size: 1 }], [webp]), /Отсутствует/);
  assert.throws(() => validateUploads([png], [webp, { key: 'extra.webp', size: 1 }]), /Лишнее/);
  assert.throws(() => validateUploads([png, { ...png, key: 'chairs/one.png' }], [webp]), /одному превью/);
});

test('staging preserves nested PNG bytes and excludes unrelated files; symlinks are rejected', async () => {
  await mkdir('media', { recursive: true });
  const directory = await mkdtemp(path.resolve('media/upload-test-'));
  try {
    const input = path.join(directory, 'input');
    await mkdir(path.join(input, 'chairs'), { recursive: true });
    const bytes = Buffer.from([137, 80, 78, 71, 0, 255, 1]);
    await writeFile(path.join(input, 'chairs/one.PNG'), bytes);
    await writeFile(path.join(input, '.DS_Store'), 'ignored');
    const files = await findImages(input, '.png');
    assert.equal(files.length, 1);
    assert.equal(files[0].key, 'chairs/one.PNG');
    const output = path.join(directory, 'staged');
    await stageAssets(output, 'originals', files);
    assert.deepEqual(await readFile(path.join(output, 'originals/chairs/one.PNG')), bytes);
    assert.deepEqual(await readFile(path.join(input, 'chairs/one.PNG')), bytes);
    assert.match(await readFile(path.join(output, '_headers'), 'utf8'), /Content-Disposition: attachment/);
    assert.match(await readFile(path.join(output, '_health.txt'), 'utf8'), /ready/);
    await assert.rejects(readFile(path.join(output, '.DS_Store')), /ENOENT/);
    await symlink(path.join(input, 'chairs/one.PNG'), path.join(input, 'linked.png'));
    await assert.rejects(findImages(input, '.png'), /символическую ссылку/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
