import type { Run } from '@control/shared'

/** Index active runs by action, keeping the newest row per action (rows pre-sorted desc). */
export function indexActiveRuns(rows: Run[]): Map<string, Run> {
  const map = new Map<string, Run>()
  for (const run of rows) {
    if (!map.has(run.actionId)) map.set(run.actionId, run)
  }
  return map
}
