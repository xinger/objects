> Hosting update (2026-10-05): R2 was replaced with two Free Workers Static Assets apps.
> Current configuration and image publication commands are documented in README.md.

# Objects: web interface

Approved direction: a static library at https://objects.xinger.net, with a JSON
array per category, originals and previews outside Git, and future optional
titles, descriptions and tags. The user requested implementation in this chat.

Visual thesis: an unframed collection of transparent objects on a quiet neutral
canvas; photography supplies the colour and hierarchy.

Content: compact Objects wordmark, category links, a theme control, a responsive
image grid, numbered pagination and individual object pages. No marketing copy,
card backgrounds, decorative borders or image crops. Empty catalogue and 404
pages use brief Russian labels. Optional metadata appears on object pages.

Interaction: subtle object hover, download control reveal and brief grid entrance;
all respect reduced motion. Theme follows the system until explicitly selected,
persists across pages and reloads, and does not flash the wrong colour on load.

Data: data/categories.json controls category IDs, titles and order.
data/categories/<id>.json contains objects. IDs are globally unique and stable.
Original and preview keys do not depend on category. Build validation rejects
duplicate IDs, missing category files, invalid dimensions and unsafe media URLs.
Only a page-sized slice reaches each generated HTML page: 60 objects per page.

Stack: Astro static output, plain CSS, small browser scripts; no SPA or backend.
Each object has /object/<id>/, categories have /category/<id>/, pagination has
/page/<n>/ beneath its catalogue route. HTML images, canonical URLs, a sitemap
and ImageObject data make the content discoverable.

Downloads preserve original bytes. Cross-origin originals use fetch + Blob and
require an R2 GET CORS rule for https://objects.xinger.net. A failed download
shows an accessible retryable error. Without JavaScript the original link works;
R2 Content-Disposition: attachment is recommended for this fallback.

Actual catalogue starts empty. Temporary local PNG fixtures validate alpha,
navigation, theme and downloads; fixture data and media are ignored by Git.
Deployment and R2 resource creation are outside this web implementation.

Acceptance: build and type checks pass; data boundaries have focused tests;
desktop and mobile UI, both themes, navigation and a byte-preserving download
are verified. Broken image and empty states must not trap navigation.
