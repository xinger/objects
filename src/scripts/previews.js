const grid = document.querySelector('.object-grid');
const observedPreviews = new WeakSet();
const previewObserver = grid && 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const { target, isIntersecting } of entries) {
    if (isIntersecting) restorePreview(target);
  }
}, { rootMargin: `${Math.max(innerHeight * 2, 1600)}px 0px` }) : null;
const retentionObserver = previewObserver ? new IntersectionObserver((entries) => {
  for (const { target, isIntersecting } of entries) {
    if (isIntersecting) continue;
    const image = target.querySelector('img');
    if (!image?.hasAttribute('src')) continue;
    image.setAttribute('data-preview-suspended', '');
    image.hidden = true;
    target.removeAttribute('data-preview-loading');
    image.removeAttribute('src');
  }
}, { rootMargin: `${Math.max(innerHeight * 4, 3200)}px 0px` }) : null;

if (grid) {
  grid.setAttribute('data-previews-active', '');
  observePreviews(grid.querySelectorAll('.object-tile'));
}

/** @param {Iterable<Element>} tiles */
export function observePreviews(tiles) {
  for (const tile of tiles) {
    const image = tile.querySelector('img');
    if (!image || observedPreviews.has(image)) continue;
    observedPreviews.add(image);
    image.dataset.previewSource ||= image.getAttribute('src');
    image.addEventListener('load', () => {
      if (!image.hasAttribute('src') || image.hasAttribute('data-preview-suspended')) return;
      if (!image.complete || image.naturalWidth === 0) return;
      image.hidden = false;
      tile.removeAttribute('data-preview-loading');
    });
    if (image.complete && image.naturalWidth > 0) tile.removeAttribute('data-preview-loading');
    if (!image.hasAttribute('src')) image.setAttribute('data-preview-suspended', '');
    if (previewObserver) {
      previewObserver.observe(tile);
      retentionObserver.observe(tile);
    } else {
      restorePreview(tile);
    }
  }
}

/** @param {Element} tile */
function restorePreview(tile) {
  const image = tile.querySelector('img');
  if (!image || image.hasAttribute('src') || !image.dataset.previewSource) return;
  tile.setAttribute('data-preview-loading', '');
  image.hidden = true;
  image.removeAttribute('data-preview-suspended');
  const error = tile.querySelector('.image-unavailable');
  if (error) error.hidden = true;
  image.src = image.dataset.previewSource;
}
