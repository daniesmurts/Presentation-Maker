import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Written by the image build (frontend/Dockerfile) as `{semver} ({date}+{sha})`;
// absent locally, hence 'dev'. Shown in the footer so what's live is visible.
function readBuildVersion(): string {
  try { return readFileSync(resolve(__dirname, '../VERSION'), 'utf8').trim() } catch { return 'dev' }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(readBuildVersion()) },
  plugins: [react()],
  server: {
    // 5174, not Vite's default: the ИСПУМ dev server holds 5173 on this
    // machine and a silent port bump would proxy /api to the wrong backend.
    port: 5174,
    strictPort: true,
    // shared/ lives one level up from the frontend root.
    fs: { allow: ['..'] },
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
})
