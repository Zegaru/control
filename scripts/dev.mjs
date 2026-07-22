#!/usr/bin/env node
/**
 * Root `pnpm dev`: pick one CONTROL_PORT (kill stale CONTROL or bump), then
 * start daemon + UI with the same port so Vite proxies correctly.
 *
 * Uses concurrently's JS API so Windows cmd.exe cannot split command strings
 * on spaces (which broke `pnpm --filter … dev` into bare `dev`).
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import concurrently from 'concurrently'
import { ensureDevPort } from './control-port.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let port
try {
  port = await ensureDevPort()
} catch (err) {
  console.error(`[control] ${err.message}`)
  process.exit(1)
}

const env = {
  ...process.env,
  CONTROL_PORT: String(port),
  CONTROL_DAEMON_URL: `http://127.0.0.1:${port}`,
}

try {
  const { result } = concurrently(
    [
      { name: 'daemon', command: 'pnpm run dev:daemon', env },
      { name: 'ui', command: 'pnpm run dev:ui', env },
    ],
    {
      cwd: root,
      prefixColors: ['cyan', 'magenta'],
    },
  )
  await result
} catch {
  process.exit(1)
}
