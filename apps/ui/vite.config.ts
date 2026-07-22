import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function readDevPortFromFile(): number | null {
  try {
    const raw = readFileSync(join(repoRoot, '.control-dev-port'), 'utf8').trim()
    const port = Number(raw)
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null
    return port
  } catch {
    return null
  }
}

function resolveDaemonUrl(): string {
  if (process.env.CONTROL_DAEMON_URL) return process.env.CONTROL_DAEMON_URL
  if (process.env.CONTROL_PORT) return `http://127.0.0.1:${process.env.CONTROL_PORT}`
  const port = readDevPortFromFile()
  if (port) return `http://127.0.0.1:${port}`
  return 'http://127.0.0.1:4400'
}

const DAEMON = resolveDaemonUrl()

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
