import { readdir, stat, mkdir, mkdtemp, copyFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const maxBytes = 25 * 1024 * 1024;
const maxImages = 19999; // One of the 20,000 assets is the health check.

export function validateUploads(originals, previews) {
  for (const [label, files] of [['PNG', originals], ['WebP', previews]]) {
    if (!files.length) throw new Error(`Папка ${label} пуста; публикация отменена.`);
    if (files.length > maxImages) throw new Error(`${label}: максимум ${maxImages} изображений на бесплатном тарифе.`);
    for (const file of files) {
      if (file.size > maxBytes) throw new Error(`${label}: ${file.key} больше 25 MiB; исходник не будет изменён.`);
    }
  }
  const expected = new Set(originals.map((file) => file.key.replace(/\.png$/i, '.webp')));
  if (expected.size !== originals.length) throw new Error('Два PNG соответствуют одному превью.');
  for (const file of previews) {
    if (!expected.delete(file.key)) throw new Error(`Лишнее или повторное превью: ${file.key}`);
  }
  if (expected.size) throw new Error(`Отсутствует превью: ${expected.values().next().value}`);
}

export async function findImages(directory, extension) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Уберите символическую ссылку из папки изображений: ${source}`);
    if (entry.isDirectory()) {
      files.push(...(await findImages(source, extension)).map((file) => ({ ...file, key: `${entry.name}/${file.key}` })));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
      files.push({ source, key: entry.name, size: (await stat(source)).size });
    }
  }
  return files.sort((a, b) => a.key.localeCompare(b.key));
}

export async function stageAssets(directory, kind, files) {
  await mkdir(directory, { recursive: true });
  await copyFile(path.join(root, `cloudflare/${kind}.headers`), path.join(directory, '_headers'));
  await writeFile(path.join(directory, '_health.txt'), 'objects static assets ready\n');
  for (const file of files) {
    const destination = path.join(directory, kind, file.key);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(file.source, destination);
  }
}

async function deploy(kind, directory, dryRun) {
  const args = [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy',
    '--config', path.join(root, `cloudflare/${kind}.json`), '--assets', directory, '--no-autoconfig'];
  if (dryRun) args.push('--dry-run');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Публикация ${kind} завершилась с кодом ${code}. Повторите команду после устранения ошибки.`)));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const directories = args.filter((arg) => arg !== '--dry-run');
  if (directories.length !== 2) throw new Error('Использование: npm run images:deploy -- <папка PNG> <папка WebP> [--dry-run]');
  const [originals, previews] = await Promise.all([
    findImages(path.resolve(directories[0]), '.png'), findImages(path.resolve(directories[1]), '.webp'),
  ]);
  validateUploads(originals, previews);
  console.log(`Проверено: ${originals.length} PNG и ${previews.length} WebP. ${dryRun ? 'Локальная проверка публикации.' : 'Публикуется полный набор изображений.'}`);
  await mkdir(path.join(root, 'media'), { recursive: true });
  const staging = await mkdtemp(path.join(root, 'media/deploy-'));
  try {
    const originalDirectory = path.join(staging, 'originals');
    const previewDirectory = path.join(staging, 'previews');
    await stageAssets(originalDirectory, 'originals', originals);
    await stageAssets(previewDirectory, 'previews', previews);
    await deploy('originals', originalDirectory, dryRun);
    await deploy('previews', previewDirectory, dryRun);
    console.log(dryRun ? 'Проверка завершена; ничего не опубликовано.' : 'Изображения опубликованы. Теперь можно обновить JSON каталога и сделать push в main.');
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
