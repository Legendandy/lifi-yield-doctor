import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    allowedHosts: [
      '5173--019d775f-a560-7bdd-92ec-eda6053883d9.eu-central-1-01.gitpod.dev'
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
      // Proxy Merkle RPC to fix CORS errors from LI.FI SDK balance fetching.
      // The SDK picks eth.merkle.io as the Ethereum RPC, which blocks browser
      // cross-origin requests. Routing through Vite's proxy avoids the CORS check.
      '/merkle-rpc': {
        target: 'https://eth.merkle.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/merkle-rpc/, ''),
        secure: true,
      },
    },
  },
})