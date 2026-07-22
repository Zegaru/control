import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { DB_PATH, ensureDataDirs } from '../config.js'
import { CREATE_TABLES_SQL } from './schema.js'
import * as schema from './schema.js'

ensureDataDirs()

const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
sqlite.exec(CREATE_TABLES_SQL)

/** Add a column to an existing table if it's missing (lightweight migration). */
function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    try {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
    } catch (err) {
      // Parallel test workers may race the same migration against a shared DB file.
      if (!(err instanceof Error) || !/duplicate column/i.test(err.message)) throw err
    }
  }
}

// Migrations for databases created before a column existed.
ensureColumn('projects', 'compose_projects', "compose_projects TEXT NOT NULL DEFAULT '[]'")
ensureColumn('projects', 'port_labels', "port_labels TEXT NOT NULL DEFAULT '{}'")
ensureColumn('projects', 'selected_environment_id', 'selected_environment_id TEXT')
ensureColumn('projects', 'default_environment_id', 'default_environment_id TEXT')
ensureColumn('actions', 'env_files', 'env_files TEXT')

export const db = drizzle(sqlite, { schema })
export { schema }
