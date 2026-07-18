import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const DAEMON = process.env.CONTROL_DAEMON_URL ?? 'http://127.0.0.1:4400'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: DAEMON, changeOrigin: true },
      '/ws': { target: DAEMON, ws: true, changeOrigin: true },
    },
  },
})
