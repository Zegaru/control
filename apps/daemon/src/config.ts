import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { DEFAULT_DAEMON_PORT } from '@control/shared'

/** Root directory for all daemon-owned state (SQLite db + per-run log files). */
export const DATA_DIR =
  process.env.CONTROL_DATA_DIR ?? join(homedir(), '.control')

export const LOGS_DIR = join(DATA_DIR, 'logs')
export const DB_PATH = join(DATA_DIR, 'control.sqlite')

export const PORT = Number(process.env.CONTROL_PORT ?? DEFAULT_DAEMON_PORT)

/** Bind loopback only — this is a single-developer local tool (NFR-2). */
export const HOST = process.env.CONTROL_HOST ?? '127.0.0.1'

export function ensureDataDirs(): void {
  mkdirSync(DATA_DIR, { recursive: true })
  mkdirSync(LOGS_DIR, { recursive: true })
}
