import { observePreviews } from './previews.js';

const grid = document.querySelector('.object-grid');
const pagination = document.querySelector('.pagination');
const loader = document.querySelector('[data-scroll-loader]');
const retry = loader?.querySelector('[data-scroll-retry]');
const loadStatus = loader?.querySelector('[data-scroll-status]');
let next = pagination?.querySelector('a[rel="next"]')?.getAttribute('href');
let loading = false;
let failed = false;
const loadedPages = new Set([location.pathname]);
const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) loadNextPage();
}, { rootMargin: '900px 0px' }) : null;

if (grid && pagination && observer) {
  pagination.hidden = true;
  if (next && loader && retry && loadStatus) {
    loader.hidden = false;
    observer.observe(loader);
    retry.addEventListener('click', () => {
      failed = false;
      loadNextPage();
    });
  }
}

async function loadNextPage() {
  if (!next || loading || failed || !grid || !loader || !retry || !loadStatus) return;
  loading = true;
  retry.hidden = true;
  loader.setAttribute('aria-busy', 'true');
  loadStatus.textContent = 'Loading images';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const path = next;
    const response = await fetch(path, { signal: controller.signal });
    if (!response.ok) throw new Error(`Page failed: ${response.status}`);
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    const tiles = Array.from(page.querySelectorAll('.object-grid > .object-tile'));
    const following = page.querySelector('.pagination a[rel="next"]')?.getAttribute('href');
    if (!tiles.length || loadedPages.has(path) || following && (following === path || loadedPages.has(following))) {
      throw new Error('Invalid catalog page');
    }
    tiles.forEach((tile) => tile.querySelectorAll('img').forEach((image) => { image.loading = 'lazy'; }));
    observePreviews(tiles);
    grid.append(...tiles);
    loadedPages.add(path);
    next = following;
    loadStatus.textContent = `Images added: ${tiles.length}`;
    if (!next) {
      observer.disconnect();
      loader.hidden = true;
    } else {
      observer.unobserve(loader);
      observer.observe(loader);
    }
  } catch {
    failed = true;
    retry.hidden = false;
    loadStatus.textContent = 'Failed to load images';
  } finally {
    clearTimeout(timeout);
    loading = false;
    loader.removeAttribute('aria-busy');
  }
}
