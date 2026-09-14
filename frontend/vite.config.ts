import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // shared/ lives one level up from the frontend root.
    fs: { allow: ['..'] },
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
})
