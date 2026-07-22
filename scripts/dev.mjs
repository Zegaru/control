#!/usr/bin/env node
/**
 * Root `pnpm dev`: pick one CONTROL_PORT (kill stale CONTROL or bump), then
 * start daemon + UI with the same port so Vite proxies correctly.
 */
import { spawn } from 'node:child_process'
import { ensureDevPort } from './control-port.mjs'

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

const child = spawn(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  [
    'exec',
    'concurrently',
    '-n',
    'daemon,ui',
    '-c',
    'cyan,magenta',
    'pnpm --filter @control/daemon dev',
    'pnpm --filter @control/ui dev',
  ],
  { env, stdio: 'inherit', shell: process.platform === 'win32' },
)

child.on('exit', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 1)
})
