import type { APIRoute } from 'astro';
import { getCatalog } from '../lib/data.js';
import { paginate, pageHref } from '../lib/catalog.js';

export const GET: APIRoute = ({ site }) => {
  const catalog = getCatalog();
  const paths = paginate(catalog.objects).map((_, index) => pageHref(null, index + 1));
  for (const category of catalog.categories) {
    const objects = catalog.objects.filter((object) => object.categoryId === category.id);
    paths.push(...paginate(objects).map((_, index) => pageHref(category.id, index + 1)));
  }
  const absolute = (path: string) => new URL(path, site).href;
  const escape = (value: string) => value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);
  const urls = paths.map((path) => `<url><loc>${escape(absolute(path))}</loc></url>`);
  urls.push(...catalog.objects.map((object) => `<url><loc>${escape(absolute(object.href))}</loc><image:image><image:loc>${escape(absolute(object.preview))}</image:loc></image:image></url>`));
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls.join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
