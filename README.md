# Objects

A collection of transparent PNG images, organized by category. Browse the gallery,
view individual objects, and download original images.

[Visit Objects](https://objects.xinger.net)

Built with [Astro](https://astro.build), with light and dark themes and infinite
scrolling. The site is static; images are hosted separately on Cloudflare.

## Getting started

Requires Node.js 24.

```sh
npm ci
npm run dev
```

Open [localhost:4321](http://localhost:4321).

## Commands

```sh
npm run build     # Build the site
npm run preview   # Preview the build
npm run check     # Check types
npm test          # Run tests
```

## Catalog

Category definitions and object metadata live in `data/`. Image files are stored
outside Git and loaded from the configured media URLs.
