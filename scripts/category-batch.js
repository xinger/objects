import { readFile, writeFile, mkdir, access, link, copyFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { z } from 'zod';
import { importCategory } from './import-images.js';
import { preparePreviews } from './prepare-previews.js';
import { findImages, validateUploads } from './deploy-images.js';
import { createCatalog } from '../src/lib/catalog.js';

const text = z.string().trim().min(1);
const manifestSchema = z.object({
  category: z.object({ id: text.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), title: text }),
  objects: z.array(z.object({
    filename: text.regex(/^\d{3,}-[a-z0-9]+(?:-[a-z0-9]+)*\.png$/),
    title: text, description: text, tags: z.array(text), prompt: text,
  })).min(1),
});

export async function createJobs(directory, workers = 3) {
  if (!Number.isInteger(workers) || workers < 1 || workers > 3) throw new Error('Число исполнителей должно быть от 1 до 3.');
  directory = path.resolve(directory);
  const manifest = await readBatch(directory);
  const pending = await pendingImages(directory, manifest);
  const count = Math.min(workers, pending.length);
  const files = [];
  await mkdir(path.join(directory, 'jobs'), { recursive: true });
  for (let index = 0; index < count; index++) {
    const file = path.join(directory, 'jobs', `worker-${index + 1}.json`);
    const objects = pending.filter((_, offset) => offset % count === index).map(({ filename, prompt }) => ({ filename, prompt }));
    await writeJson(file, { directory, objects });
    files.push(file);
  }
  const readable = manifest.objects.map((object) => `${object.filename}\nTitle: ${object.title}\nDescription: ${object.description}\nTags: ${object.tags.join(', ')}\nPrompt: ${object.prompt}`).join('\n\n');
  await writeFile(path.join(directory, 'prompts.txt'), readable + '\n');
  return files;
}

export async function saveImage(directory, filename, source) {
  directory = path.resolve(directory);
  const manifest = await readBatch(directory);
  if (!manifest.objects.some((object) => object.filename === filename)) throw new Error(`Неизвестное имя файла: ${filename}`);
  const bytes = await readFile(source);
  await validateImage(bytes);
  const destination = path.join(directory, 'images', filename);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await link(temporary, destination); // Atomic save; an existing original cannot be replaced.
  } finally {
    await rm(temporary, { force: true });
  }
  return destination;
}

export async function importBatch(directory, repository = process.cwd()) {
  directory = path.resolve(directory);
  const manifest = await readBatch(directory);
  const pending = await pendingImages(directory, manifest);
  if (pending.length) throw new Error(`Серия не завершена: отсутствуют ${pending.length} PNG. Сначала продолжите генерацию.`);
  const imageDirectory = path.join(directory, 'images');
  const images = await findImages(imageDirectory, '.png');
  const filenames = new Set(manifest.objects.map((object) => object.filename));
  if (images.length !== filenames.size || images.some((file) => !filenames.has(file.key))) throw new Error('В серии есть PNG, отсутствующие в collection.json.');
  const data = path.join(repository, 'data');
  const library = path.join(repository, 'media/library');
  const categories = JSON.parse(await readFile(path.join(data, 'categories.json'), 'utf8'));
  const entries = {};
  for (const category of categories) entries[category.id] = JSON.parse(await readFile(path.join(data, 'categories', `${category.id}.json`), 'utf8'));
  createCatalog(categories, entries);
  await verifyLibrary(library, entries);

  const prepared = path.join(directory, 'prepared');
  const records = await importCategory(imageDirectory, manifest.category.id, path.join(prepared, 'originals'));
  for (const record of records) {
    const metadata = manifest.objects.find((object) => object.filename === record.filename);
    record.title = metadata.title;
    record.description = metadata.description;
    record.tags = metadata.tags;
  }
  const existing = categories.find((category) => category.id === manifest.category.id);
  if (existing) {
    if (existing.title !== manifest.category.title || JSON.stringify(entries[existing.id]) !== JSON.stringify(records)) {
      throw new Error(`Категория ${existing.id} уже существует и отличается от серии. Импорт не заменяет прежние категории.`);
    }
    validateUploads(await findImages(path.join(library, 'originals'), '.png'), await findImages(path.join(library, 'previews'), '.webp'));
    return { category: existing.id, count: records.length, unchanged: true };
  }
  categories.push(manifest.category);
  entries[manifest.category.id] = records;
  createCatalog(categories, entries);
  await preparePreviews(path.join(prepared, 'originals'), path.join(prepared, 'previews'));
  for (const record of records) {
    for (const key of [record.original, record.preview]) {
      const destination = path.join(library, key);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(path.join(prepared, key), destination);
    }
  }
  await verifyLibrary(library, entries);
  validateUploads(await findImages(path.join(library, 'originals'), '.png'), await findImages(path.join(library, 'previews'), '.webp'));
  await mkdir(path.join(data, 'categories'), { recursive: true });
  await writeJson(path.join(data, 'categories', `${manifest.category.id}.json`), records);
  await writeJson(path.join(data, 'categories.json'), categories);
  return { category: manifest.category.id, count: records.length, unchanged: false };
}

async function readBatch(directory) {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(path.join(directory, 'collection.json'), 'utf8')));
  const names = new Set();
  for (const object of manifest.objects) {
    if (names.has(object.filename)) throw new Error(`Duplicate filename: ${object.filename}`);
    names.add(object.filename);
  }
  return manifest;
}

async function pendingImages(directory, manifest) {
  const pending = [];
  for (const object of manifest.objects) {
    const file = path.join(directory, 'images', object.filename);
    try { await validateImage(await readFile(file)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`${object.filename}: ${error.message}`);
      pending.push(object);
    }
  }
  return pending;
}

async function validateImage(bytes) {
  if (bytes.length > 25 * 1024 * 1024) throw new Error('PNG больше 25 MiB; оригинал не будет изменён.');
  const metadata = await sharp(bytes).metadata();
  if (metadata.format !== 'png' || !metadata.hasAlpha) throw new Error('Нужен PNG с прозрачным фоном.');
  const alpha = (await sharp(bytes).stats()).channels.at(-1);
  if (alpha.min === 255) throw new Error('PNG полностью непрозрачный.');
  if (alpha.max === 0) throw new Error('PNG пуст: все пиксели прозрачные.');
}

async function verifyLibrary(library, entries) {
  for (const record of Object.values(entries).flat()) {
    for (const [kind, key] of [['originals', record.original], ['previews', record.preview]]) {
      if (!key.startsWith(`${kind}/`)) throw new Error(`Ожидается локальный ключ библиотеки: ${key}`);
      try { await access(path.join(library, key)); }
      catch { throw new Error(`Неполная библиотека: ${key}. Восстановите прежние файлы перед импортом и публикацией.`); }
    }
  }
}

async function writeJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}

async function main() {
  const [command, directory, ...args] = process.argv.slice(2);
  if (!directory) throw new Error('Использование: npm run category:batch -- jobs <серия> [1–3] | save <серия> <filename> <PNG> | status <серия> | import <серия>');
  if (command === 'jobs') {
    const jobs = await createJobs(directory, args[0] === undefined ? 3 : Number(args[0]));
    console.log(JSON.stringify({ jobs, workers: jobs.length }));
  } else if (command === 'save') {
    if (args.length !== 2) throw new Error('save: укажите filename и путь к сгенерированному PNG.');
    console.log(await saveImage(directory, args[0], args[1]));
  } else if (command === 'status') {
    const manifest = await readBatch(directory);
    const pending = await pendingImages(path.resolve(directory), manifest);
    console.log(JSON.stringify({ total: manifest.objects.length, saved: manifest.objects.length - pending.length, pending: pending.map((object) => object.filename) }));
  } else if (command === 'import') {
    console.log(JSON.stringify(await importBatch(directory)));
  } else throw new Error(`Неизвестная команда: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
