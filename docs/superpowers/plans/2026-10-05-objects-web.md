> Hosting update (2026-10-05): R2 was replaced with two Free Workers Static Assets apps.
> Current configuration and image publication commands are documented in README.md.

# Objects Web Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the tasks
> in this chat. The user explicitly requested the web implementation.

**Goal:** Build the approved minimal static image library.

**Architecture:** Category JSON is validated at build time. Astro emits catalogue,
category, object and sitemap routes. CSS and small browser scripts provide theme
and download behavior. No image binaries enter Git.

**Tech Stack:** Astro, Zod, CSS, browser APIs, Node test runner.

**Spec:** ../specs/2026-10-05-objects-design.md

## Global Constraints

- No image borders, card backgrounds or marketing sections.
- One JSON array per category; stable globally unique object IDs.
- 60 objects per generated catalogue page.
- Site origin: https://objects.xinger.net.
- Original bytes remain unchanged; media is outside Git.
- New imports, methods and object entries go at the end when extending a file.

## Review Focus

- Duplicate object IDs across categories must fail a build, not overwrite pages.
- Empty categories must still have usable routes.
- Stored dark mode must survive page navigation without a flash.
- Mobile and keyboard users must reach download controls without hovering.
- R2 CORS failures must end the pending state and permit retry.

### Task 1: Catalogue contract

Files: data/categories.json, src/lib/catalog.js, src/lib/data.js,
tests/catalog.test.js, astro.config.mjs, package.json.

Produces: createCatalog(categories, entries, mediaBaseUrl), paginate(items, size),
getCatalog(), and pageHref(categoryId, page).

- [x] Write focused tests for metadata defaults, stable URLs, duplicates,
      unsafe keys, missing category data, empty pagination and page boundaries.
- [x] Run npm test and observe the missing behaviour.
- [x] Implement build validation and catalogue loading; keep runtime data empty.
- [x] Run npm test; every named data test must pass.

### Task 2: Web interface

Files: src/layouts/Layout.astro, src/components/{Icon,Header,Grid,Pagination}.astro,
src/pages/[...page].astro, src/pages/category/[category]/[...page].astro,
src/pages/object/[id].astro, src/pages/{404.astro,sitemap.xml.ts,robots.txt.ts},
src/styles/global.css, src/scripts/download.js, public/favicon.svg, README.md.

Consumes: Task 1 catalogue and pagination contract.

- [x] Build the unframed responsive grid and static routes.
- [x] Implement persistent theme, accessible download state and original links.
- [x] Add canonical metadata, image sitemap and concise empty/error states.
- [x] Run npm run check, npm test and npm run build.
- [x] Verify temporary PNG fixtures in desktop/mobile browsers, navigation,
      both themes, original download and errors. Confirm no image enters Git.
- [x] Review the whole implementation and resolve material issues.

## Progress

Execution ruling: implement in the existing repository as the user requested;
leave changes uncommitted and undeployed for review. The conversation already
established the architecture, data format and visual direction.

Verification: 6 catalogue tests, 4 Chrome browser scenarios, zero Astro diagnostics.
Temporary real PNG fixtures verified in both themes at 1440px and 390px and on
an object page. Original downloads compare equal byte-for-byte in browser tests.
Independent read-only review found no material issues. Production output contains
no temporary raster media. Synthetic 10,000-object build: 10,338 HTML pages,
10,342 files, 87.48 MB; Astro reported 7.65 seconds on this machine.

Execution rulings: TypeScript 6 matches @astrojs/check's peer range; current
TypeScript 7 does not. Test servers use --ignore-lock because Astro automatically
backgrounds agent-launched servers. Playwright's no-JavaScript stability wait
stalled; the no-JavaScript flow is verified through a native mouse click instead.
Real R2 CORS and production deployment remain outside this implementation.
