import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://objects.xinger.net',
  output: 'static',
  trailingSlash: 'always',
  publicDir: process.env.PREVIEW_PUBLIC_DIR || './public',
  devToolbar: { enabled: false },
});
