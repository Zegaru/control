import type { Group } from '@control/shared'
import { getAction, getActiveRun, getGroup, getRun } from './registry.js'
import { supervisor } from './supervisor.js'

const WAIT_TIMEOUT_MS = 60_000
const POLL_MS = 500

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Start a group's steps in order, honoring each step's waitFor condition. */
export async function startGroup(groupId: string, runtimeEnv?: Record<string, string>): Promise<void> {
  const group = getGroup(groupId)
  if (!group) throw new Error('Group not found')

  for (const step of group.steps) {
    const action = getAction(step.actionId)
    if (!action) continue

    // Don't double-start an action that already has an active run.
    const existing = getActiveRun(action.id)
    const run = existing ?? supervisor.start(action, runtimeEnv)

    if (step.waitFor === 'none') continue
    await waitForStep(run.id, action.id, step.waitFor)
  }
}

async function waitForStep(
  runId: string,
  actionId: string,
  waitFor: 'healthy' | 'exit',
): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const run = getRun(runId)
    if (!run) return
    if (waitFor === 'healthy' && run.status === 'healthy') return
    if (waitFor === 'exit' && (run.status === 'exited' || run.status === 'failed')) return
    if (run.status === 'failed' || run.status === 'killed') return
    await sleep(POLL_MS)
  }
}

/** Stop a group's active runs in reverse order. */
export function stopGroup(group: Group): void {
  for (const step of [...group.steps].reverse()) {
    const run = getActiveRun(step.actionId)
    if (run && supervisor.isLive(run.id)) supervisor.stop(run.id)
  }
}
