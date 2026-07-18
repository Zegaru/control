import { eq, inArray } from 'drizzle-orm'
import { ACTIVE_RUN_STATUSES } from '@control/shared'
import { db, schema } from './db/index.js'
import { isPortListening } from './health.js'

/** Cross-platform "is this pid still alive?" without sending a real signal. */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // ESRCH = gone; EPERM = alive but not ours (still counts as alive).
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * On daemon start the supervisor has no in-memory handles, but processes it
 * launched may still be running. Reconcile the runs table against reality:
 * survivors become `adopted` (stoppable, port-visible; live log stream lost),
 * dead ones are retroactively marked `exited` (FR-11). Never trust a stored
 * PID without probing.
 */
export async function reconcileRuns(): Promise<void> {
  const active = db
    .select()
    .from(schema.runs)
    .where(inArray(schema.runs.status, ACTIVE_RUN_STATUSES as string[]))
    .all()

  for (const run of active) {
    const alive =
      run.pid != null && pidAlive(run.pid)
    const portsUp = run.ports?.length
      ? (await Promise.all(run.ports.map((p) => isPortListening(p)))).some(Boolean)
      : false

    if (alive || portsUp) {
      db.update(schema.runs).set({ status: 'adopted' }).where(eq(schema.runs.id, run.id)).run()
    } else {
      db.update(schema.runs)
        .set({ status: 'exited', exitedAt: Date.now() })
        .where(eq(schema.runs.id, run.id))
        .run()
    }
  }
}
