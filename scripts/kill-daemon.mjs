#!/usr/bin/env node
/**
 * Free CONTROL_PORT (default 4400) only when the listener is a CONTROL daemon.
 *
 * Used by `pnpm kill:daemon`. Does not bump ports — for that, use `pnpm dev`.
 */
import { killControlOnPort, preferredPort } from './control-port.mjs'

let port
try {
  port = preferredPort()
} catch (err) {
  console.error(`[control] ${err.message}`)
  process.exit(1)
}

try {
  const result = await killControlOnPort(port)
  if (result === 'already-free') {
    console.log(`[control] no listener on :${port}`)
  } else {
    console.log(`[control] port :${port} is free`)
  }
} catch (err) {
  if (err.code === 'NOT_CONTROL') {
    console.error(`[control] ${err.message}`)
    console.error(
      '  Refusing to kill it. Stop that process yourself, or set CONTROL_PORT to a free port.',
    )
    process.exit(1)
  }
  console.error(`[control] ${err.message}`)
  process.exit(1)
}
