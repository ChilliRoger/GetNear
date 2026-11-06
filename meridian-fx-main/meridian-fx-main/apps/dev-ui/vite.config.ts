import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 58173,
    strictPort: true,
    allowedHosts: ['dev.omnipass.world'],
    proxy: {
      '/api/fynd': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fynd/, ''),
      },
      '/api/oracle': {
        target: 'http://localhost:38174',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/oracle/, ''),
      },
    },
  },
})
