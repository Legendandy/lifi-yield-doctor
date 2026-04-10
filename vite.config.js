import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    allowedHosts: [
      '5173--019d74c9-91b5-7369-9f52-1bbfe65e8c0f.eu-central-1-01.gitpod.dev'
    ],
    proxy: {
      '/earn-api': {
        target: 'https://earn.li.fi',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/earn-api/, ''),
        secure: true,
      },
      '/lifi-api': {
        target: 'https://li.quest',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lifi-api/, ''),
        secure: true,
      },
    },
  },
})