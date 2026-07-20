import type { Group, RunStatus } from '@control/shared'
import { HttpError, getAction, getActiveRun, getGroup, getRun } from './registry.js'
import { supervisor } from './supervisor.js'

const WAIT_TIMEOUT_MS = 60_000
const POLL_MS = 500

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function evaluateWaitStep(
  run: { status: RunStatus } | null,
  waitFor: 'healthy' | 'exit',
): 'done' | 'continue' | 'fail' {
  if (!run) return 'done'
  if (waitFor === 'healthy') {
    if (run.status === 'healthy') return 'done'
    if (run.status === 'failed' || run.status === 'killed') return 'fail'
    return 'continue'
  }
  if (run.status === 'exited' || run.status === 'failed') return 'done'
  if (run.status === 'killed') return 'fail'
  return 'continue'
}

/** Start a group's steps in order, honoring each step's waitFor condition. */
export async function startGroup(groupId: string, runtimeEnv?: Record<string, string>): Promise<void> {
  const group = getGroup(groupId)
  if (!group) throw new Error('Group not found')

  for (const step of group.steps) {
    const action = getAction(step.actionId)
    if (!action) continue

    const existing = getActiveRun(action.id)
    const run = existing ?? supervisor.start(action, runtimeEnv)

    if (step.waitFor === 'none') continue
    await waitForStep(run.id, step.waitFor)
  }
}

async function waitForStep(runId: string, waitFor: 'healthy' | 'exit'): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const outcome = evaluateWaitStep(getRun(runId), waitFor)
    if (outcome === 'done') return
    if (outcome === 'fail') {
      throw new HttpError(400, `Run failed while waiting for ${waitFor}`)
    }
    await sleep(POLL_MS)
  }
  throw new HttpError(408, `Timed out waiting for ${waitFor}`)
}

/** Stop a group's active runs in reverse order. */
export function stopGroup(group: Group): void {
  for (const step of [...group.steps].reverse()) {
    const run = getActiveRun(step.actionId)
    if (run) supervisor.stop(run.id)
  }
}
