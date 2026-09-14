import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

// The public site: static HTML, zero client JS except the hero replay.
// Served by Caddy at the root; the app (Vite SPA) lives under its own
// paths (deploy/Caddyfile). `site` is what the sitemap and canonicals use.
export default defineConfig({
  site: 'https://tezarium.ru',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },   // /pricing → pricing.html, matches Caddy's try_files
  integrations: [sitemap()],
})
