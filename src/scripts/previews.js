const grid = document.querySelector('.object-grid');
const previewObserver = grid && 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const { target, isIntersecting } of entries) {
    const image = target.querySelector('img');
    if (!image) continue;
    if (isIntersecting && image.hasAttribute('data-preview-suspended')) {
      image.src = image.dataset.previewSource;
      image.removeAttribute('data-preview-suspended');
      image.hidden = false;
      const error = target.querySelector('.image-unavailable');
      if (error) error.hidden = true;
    } else if (!isIntersecting && image.hasAttribute('src')) {
      image.setAttribute('data-preview-suspended', '');
      image.hidden = true;
      image.removeAttribute('src');
    }
  }
}, { rootMargin: `${innerHeight * 2}px 0px` }) : null;

if (grid) observePreviews(grid.querySelectorAll('.object-tile'));

/** @param {Iterable<Element>} tiles */
export function observePreviews(tiles) {
  if (!previewObserver) return;
  for (const tile of tiles) {
    const image = tile.querySelector('img');
    if (!image || image.dataset.previewSource) continue;
    image.dataset.previewSource = image.getAttribute('src');
    previewObserver.observe(tile);
  }
}
