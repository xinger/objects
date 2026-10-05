document.addEventListener('click', async (event) => {
  if (!(event.target instanceof Element) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[data-download]');
  if (!(link instanceof HTMLAnchorElement)) return;
  event.preventDefault();
  if (link.getAttribute('aria-busy') === 'true') return;
  const container = link.closest('.object-tile, .object-detail');
  const error = container?.querySelector('.download-error');
  if (error instanceof HTMLElement) error.hidden = true;
  link.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(link.href);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const url = URL.createObjectURL(await response.blob());
    const download = document.createElement('a');
    download.href = url;
    download.download = link.download;
    document.body.append(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    if (error instanceof HTMLElement) error.hidden = false;
  } finally {
    link.removeAttribute('aria-busy');
  }
});
