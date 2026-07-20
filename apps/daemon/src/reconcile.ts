import { eq, inArray } from 'drizzle-orm'
import { ACTIVE_RUN_STATUSES } from '@control/shared'
import { db, schema } from './db/index.js'
import { isPortListening } from './health.js'
import { pidAlive } from './pid.js'

export function decideReconcileStatus(input: {
  pid: number | null
  alive: boolean
  portsUp: boolean
}): 'adopted' | 'exited' {
  if (input.pid != null && input.alive) return 'adopted'
  return 'exited'
}

/**
 * On daemon start the supervisor has no in-memory handles, but processes it
 * launched may still be running. Reconcile the runs table against reality:
 * survivors with a live PID become `adopted` (stoppable, port-visible; live
 * log stream lost), dead ones are retroactively marked `exited` (FR-11).
 * Port checks are informational only — adoption requires a live PID.
 */
export async function reconcileRuns(): Promise<void> {
  const active = db
    .select()
    .from(schema.runs)
    .where(inArray(schema.runs.status, ACTIVE_RUN_STATUSES as string[]))
    .all()

  for (const run of active) {
    const alive = run.pid != null && pidAlive(run.pid)
    const portsUp = run.ports?.length
      ? (await Promise.all(run.ports.map((p) => isPortListening(p)))).some(Boolean)
      : false

    const next = decideReconcileStatus({ pid: run.pid, alive, portsUp })
    if (next === 'adopted') {
      db.update(schema.runs).set({ status: 'adopted' }).where(eq(schema.runs.id, run.id)).run()
    } else {
      db.update(schema.runs)
        .set({ status: 'exited', exitedAt: Date.now() })
        .where(eq(schema.runs.id, run.id))
        .run()
    }
  }
}
