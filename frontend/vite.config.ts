import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
