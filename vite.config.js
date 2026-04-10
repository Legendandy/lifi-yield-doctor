import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,                  // allows network access
    port: 5173,                  // optional, default 5173
    strictPort: false,           // optional, allows fallback if 5173 is busy
    allowedHosts: [
      '5173--019d74c9-91b5-7369-9f52-1bbfe65e8c0f.eu-central-1-01.gitpod.dev'
    ]
  }
})