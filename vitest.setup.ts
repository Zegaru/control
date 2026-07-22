import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Isolate SQLite per Vitest worker — parallel runs otherwise contend on ~/.control.
const worker = process.env.VITEST_WORKER_ID ?? '0'
process.env.CONTROL_DATA_DIR = mkdtempSync(join(tmpdir(), `control-test-w${worker}-`))
