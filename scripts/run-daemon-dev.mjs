#!/usr/bin/env node
/**
 * Dev entry for @control/daemon: ensure a usable CONTROL_PORT (kill stale
 * CONTROL or bump past foreign listeners), then start tsx.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDevPort } from './control-port.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const daemonRoot = join(here, '..', 'apps', 'daemon')

let port
try {
  port = await ensureDevPort()
} catch (err) {
  console.error(`[control] ${err.message}`)
  process.exit(1)
}

const child = spawn(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', 'tsx', 'src/index.ts'],
  {
    cwd: daemonRoot,
    env: {
      ...process.env,
      CONTROL_PORT: String(port),
      CONTROL_DAEMON_URL: `http://127.0.0.1:${port}`,
    },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
)

child.on('exit', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 1)
})
