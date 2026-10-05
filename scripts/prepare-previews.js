import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

export async function preparePreviews(inputDirectory, outputDirectory = 'media/previews', filenames) {
  const input = path.resolve(inputDirectory);
  const output = path.resolve(outputDirectory);
  const files = (await findPngs(input)).filter((file) => !filenames || filenames.has(path.relative(input, file)));
  const destinations = new Set();
  for (const file of files) {
    const destination = path.join(output, path.relative(input, file).replace(/\.png$/i, '.webp'));
    if (destinations.has(destination)) throw new Error(`Два PNG создают одно превью: ${destination}`);
    destinations.add(destination);
  }
  const results = [];
  for (let offset = 0; offset < files.length; offset += 4) {
    results.push(...await Promise.all(files.slice(offset, offset + 4).map(async (file) => {
      const destination = path.join(output, path.relative(input, file).replace(/\.png$/i, '.webp'));
      await mkdir(path.dirname(destination), { recursive: true });
      const preview = await sharp(file)
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, alphaQuality: 100, effort: 5 })
        .toFile(destination);
      return { original: file, preview: destination, originalBytes: (await stat(file)).size, previewBytes: preview.size };
    })));
  }
  return results;
}

async function findPngs(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findPngs(file));
    else if (entry.isFile() && /\.png$/i.test(entry.name)) files.push(file);
  }
  return files.sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error('Использование: npm run images:preview -- <папка PNG> [папка WebP]');
    process.exitCode = 1;
  } else {
    try {
      const results = await preparePreviews(input, output);
      const originalBytes = results.reduce((sum, item) => sum + item.originalBytes, 0);
      const previewBytes = results.reduce((sum, item) => sum + item.previewBytes, 0);
      console.log(`Превью: ${results.length}. PNG: ${(originalBytes / 1024 / 1024).toFixed(2)} МБ → WebP: ${(previewBytes / 1024 / 1024).toFixed(2)} МБ.`);
      console.log(`Папка: ${path.resolve(output || 'media/previews')}`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
