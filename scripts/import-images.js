import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { findImages, validateUploads } from './deploy-images.js';
import { preparePreviews } from './prepare-previews.js';
import { createCatalog } from '../src/lib/catalog.js';

export function parsePrompts(text) {
  const matches = [...text.matchAll(/^(?:(\d+):\s*|(\d+-[^\r\n]+\.png)\s*\r?\n)/gm)];
  const prompts = new Map();
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const key = match[2] || `number:${Number(match[1])}`;
    if (prompts.has(key)) throw new Error(`Duplicate prompt: ${key}`);
    const body = text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length).trim();
    prompts.set(key, body);
  }
  return prompts;
}

export function sourceMetadata(filename, prompts) {
  const fallback = capitalize(path.basename(filename, path.extname(filename)).replace(/^\d+-/, '').replace(/[-_]+/g, ' '));
  const number = filename.match(/^(\d+)-/)?.[1];
  const prompt = prompts.get(filename) || (number ? prompts.get(`number:${Number(number)}`) : undefined);
  if (!prompt) return { title: fallback, description: '', tags: [] };
  const body = prompt.replace(/^Use case:\s*[^.]+\.\s*/i, '').replace(/HAND-DRAWN/g, 'Hand-drawn');
  const sentences = body.match(/[^.!?]+[.!?]?/g) || [];
  const description = sentences.slice(0, 3)
    .map((sentence) => sentence.trim())
    .filter((sentence) => !/^(?:No\b|Absolutely\b|Strict\b|Directly\b|Perfect\b|Centered\b|Entire\b|One complete\b|Single complete\b|Complete\b|Whole\b|Genuine\b|Genuinely\b|Real transparent\b|Truly\b|Clean\b|Realistic clean\b)/i.test(sentence)
      && !/generous\b[^.]*\bmargins?\b|transparent(?: outer)? margins?|\b(?:canvas|uncropped|alpha background|alpha transparency)\b|\bno (?:paper|text|watermark|metal|jewels|3D)\b/i.test(sentence))
    .map((sentence) => sentence.replace(/^(?:Generate\s+)?exactly ONE\s+(?:butterfly,\s*a beautifully detailed\s+)?/i, '')
      .replace(/,?\s*isolated on (?:a )?(?:truly )?transparent background.*$/i, '.')
      .replace(/^(?:a|an)\s+/i, ''))
    .map(capitalize).join(' ');
  if (!description) throw new Error(`Не удалось извлечь описание из промпта: ${filename}`);
  let title = description.split(/[.,:]/)[0];
  if (/^butterfly(?: with\b|$)/i.test(title)) {
    const colors = /white|blue|yellow|orange|pink|red|green|black|brown|gray|grey|cream|ivory|peach|teal|purple|violet|gold|silver|mint|jade|periwinkle|lilac|ochre|mauve|plum|coral|indigo|burgundy|maroon|sienna|chocolate|aqua|turquoise|magenta|copper|bronze|crimson|vermilion|apricot|rose/i;
    const clause = description.split(',').find((part) => /\b(?:forewings|hindwings|wings)\b/i.test(part) && colors.test(part));
    if (clause) {
      const beforeWings = clause.split(/\b(?:forewings|hindwings|wings)\b/i)[0].trim().replace(/^butterfly with\s+/i, '')
        .split(/\b(?:bands|spots|patches|borders|margins|edges|panels|streaks|across|on|with|following)\b/i)[0]
        .replace(/\b(?:outer|inner|lower|upper|broad|narrow)\s*$/i, '').trim();
      if (colors.test(beforeWings)) title = `${beforeWings} butterfly`;
      else title = `${fallback} butterfly`;
    }
  }
  const tags = ['acanthus', 'palmette', 'rosette', 'vine', 'floral', 'watercolor', 'gouache', 'ink', 'hand-drawn', 'butterfly']
    .filter((tag) => new RegExp(`\\b${tag}(?:s)?\\b`, 'i').test(description));
  return { title: capitalize(title), description, tags };
}

export async function importCategory(directory, categoryId, originalsDirectory) {
  let prompts = new Map();
  try { prompts = parsePrompts(await readFile(path.join(directory, 'prompts.txt'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const files = await findImages(directory, '.png');
  if (!files.length) throw new Error(`Нет PNG: ${directory}`);
  const records = [];
  for (const file of files) {
    if (file.size > 25 * 1024 * 1024) throw new Error(`PNG больше 25 MiB: ${file.source}`);
    const id = `${categoryId}-${file.key.replace(/\.png$/i, '').replace(/\//g, '-')}`;
    if (!/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/i.test(id)) throw new Error(`Неподдерживаемое имя PNG: ${file.key}`);
    const bytes = await readFile(file.source);
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const metadata = await sharp(bytes).metadata();
    const key = `${id}-${hash}`;
    await mkdir(originalsDirectory, { recursive: true });
    await copyFile(file.source, path.join(originalsDirectory, `${key}.png`));
    records.push({
      id,
      original: `originals/${key}.png`,
      preview: `previews/${key}.webp`,
      width: metadata.width,
      height: metadata.height,
      ...sourceMetadata(path.basename(file.key), prompts),
      filename: path.basename(file.key),
      originalBytes: bytes.length,
    });
  }
  return records;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function main() {
  const [source, output = 'media/library'] = process.argv.slice(2);
  if (!source) throw new Error('Использование: npm run images:import -- <папка с категориями> [новая папка результата]');
  const destination = path.resolve(output);
  try {
    if ((await readdir(destination)).length) throw new Error(`Папка результата не пуста: ${destination}. Укажите новую папку, чтобы не смешать коллекции.`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const categories = JSON.parse(await readFile('data/categories.json', 'utf8'));
  const entries = {};
  for (const category of categories) {
    entries[category.id] = await importCategory(path.join(source, category.id), category.id, path.join(destination, 'originals'));
    console.log(`${category.title}: ${entries[category.id].length} PNG`);
  }
  const catalog = createCatalog(categories, entries);
  console.log(`Создание WebP для ${catalog.objects.length} изображений…`);
  const previews = await preparePreviews(path.join(destination, 'originals'), path.join(destination, 'previews'));
  validateUploads(await findImages(path.join(destination, 'originals'), '.png'), await findImages(path.join(destination, 'previews'), '.webp'));
  await mkdir('data/categories', { recursive: true });
  for (const category of categories) {
    await writeFile(`data/categories/${category.id}.json`, JSON.stringify(entries[category.id], null, 2) + '\n');
  }
  const bytes = previews.reduce((sum, item) => sum + item.previewBytes, 0);
  console.log(`Готово: ${previews.length} превью, ${(bytes / 1024 / 1024).toFixed(2)} MiB. Исходные папки не изменены.`);
  console.log(`Для публикации: npm run images:deploy -- "${path.join(destination, 'originals')}" "${path.join(destination, 'previews')}"`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
