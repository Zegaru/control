#!/usr/bin/env node
/**
 * Dev entry for @control/daemon: ensure a usable CONTROL_PORT (kill stale
 * CONTROL or bump past foreign listeners), then start tsx.
 *
 * Spawns Node → tsx directly (no shell / pnpm.cmd) so Windows quoting cannot
 * eat the script args.
 */
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDevPort } from './control-port.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const daemonRoot = join(here, '..', 'apps', 'daemon')
const require = createRequire(join(daemonRoot, 'package.json'))
const tsxCli = require.resolve('tsx/cli')

let port
try {
  port = await ensureDevPort()
} catch (err) {
  console.error(`[control] ${err.message}`)
  process.exit(1)
}

const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
  cwd: daemonRoot,
  env: {
    ...process.env,
    CONTROL_PORT: String(port),
    CONTROL_DAEMON_URL: `http://127.0.0.1:${port}`,
  },
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 1)
})
