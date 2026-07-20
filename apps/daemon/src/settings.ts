import { unlinkSync } from 'node:fs'
import { desc, eq } from 'drizzle-orm'
import {
  DEFAULT_IGNORE_GLOBS,
  DEFAULT_LOG_RETENTION,
  isActiveStatus,
  type PatchSettingsBody,
  type RunStatus,
  type Settings,
  settingsSchema,
} from '@control/shared'
import { db, schema } from './db/index.js'

const SETTINGS_ID = 1

function ensureRow(): void {
  const row = db.select().from(schema.settings).where(eq(schema.settings.id, SETTINGS_ID)).get()
  if (row) return
  db.insert(schema.settings)
    .values({
      id: SETTINGS_ID,
      ignoreGlobs: [...DEFAULT_IGNORE_GLOBS],
      logRetention: DEFAULT_LOG_RETENTION,
    })
    .run()
}

function toSettings(row: {
  ignoreGlobs: string[] | null
  logRetention: number
}): Settings {
  return settingsSchema.parse({
    ignoreGlobs: row.ignoreGlobs ?? [...DEFAULT_IGNORE_GLOBS],
    logRetention: row.logRetention,
  })
}

export function getSettings(): Settings {
  ensureRow()
  const row = db.select().from(schema.settings).where(eq(schema.settings.id, SETTINGS_ID)).get()!
  return toSettings(row)
}

export function patchSettings(body: PatchSettingsBody): Settings {
  ensureRow()
  const current = getSettings()
  const next = settingsSchema.parse({
    ignoreGlobs: body.ignoreGlobs ?? current.ignoreGlobs,
    logRetention: body.logRetention ?? current.logRetention,
  })
  // Normalize globs: trim, drop empties, dedupe.
  next.ignoreGlobs = [...new Set(next.ignoreGlobs.map((g) => g.trim()).filter(Boolean))]

  db.update(schema.settings)
    .set({
      ignoreGlobs: next.ignoreGlobs,
      logRetention: next.logRetention,
    })
    .where(eq(schema.settings.id, SETTINGS_ID))
    .run()

  if (body.logRetention != null && body.logRetention !== current.logRetention) {
    pruneAllRunHistory(next.logRetention)
  }

  return next
}

/** Delete older-than-N run rows (and their log files) for one action. */
export function pruneRunsForAction(actionId: string, keep = getSettings().logRetention): void {
  const rows = db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.actionId, actionId))
    .orderBy(desc(schema.runs.startedAt))
    .all()

  const keepIds = new Set(rows.slice(0, keep).map((r) => r.id))
  for (const row of rows) {
    if (keepIds.has(row.id)) continue
    if (isActiveStatus(row.status as RunStatus)) continue
    if (row.logFile) {
      try {
        unlinkSync(row.logFile)
      } catch {
        /* already gone */
      }
    }
    db.delete(schema.runs).where(eq(schema.runs.id, row.id)).run()
  }
}

export function pruneAllRunHistory(keep = getSettings().logRetention): void {
  const actionIds = db.select({ id: schema.actions.id }).from(schema.actions).all()
  for (const { id } of actionIds) pruneRunsForAction(id, keep)
}
