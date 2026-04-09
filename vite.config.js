import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,                  // allows network access
    port: 5173,                  // optional, default 5173
    strictPort: false,           // optional, allows fallback if 5173 is busy
    allowedHosts: [
      '5173--019d73b0-fa12-7a86-ad61-dcea2d8efcf8.eu-central-1-01.gitpod.dev'
    ]
  }
})