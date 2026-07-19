import { isActiveStatus, resolveDashboardEnvironmentId } from '@control/shared'
import { startGroup, stopGroup } from './groupRunner.js'
import {
  getAction,
  getActiveRun,
  getEnvironment,
  getGroup,
  getProjectTree,
  HttpError,
  projectPowerTargets,
} from './registry.js'
import { supervisor } from './supervisor.js'

export async function startProjectPower(projectId: string): Promise<void> {
  const tree = getProjectTree(projectId)
  const activeEnvironmentId = resolveDashboardEnvironmentId(tree)
  if (activeEnvironmentId) {
    const env = getEnvironment(activeEnvironmentId)
    if (!env || env.projectId !== projectId) {
      throw new HttpError(400, 'Selected environment not found')
    }
    if (env.targetType === 'action') {
      const action = getAction(env.targetId)
      if (!action) throw new HttpError(404, 'Environment action not found')
      if (!getActiveRun(action.id)) supervisor.start(action, env.env)
      return
    }
    const group = getGroup(env.targetId)
    if (!group) throw new HttpError(404, 'Environment group not found')
    await startGroup(group.id, env.env)
    return
  }

  for (const action of projectPowerTargets(tree)) {
    if (!action.activeRun) supervisor.start(action)
  }
}

export function stopProjectPower(projectId: string): void {
  const tree = getProjectTree(projectId)
  const activeEnvironmentId = resolveDashboardEnvironmentId(tree)
  if (activeEnvironmentId) {
    const env = getEnvironment(activeEnvironmentId)
    if (!env || env.projectId !== projectId) return
    if (env.targetType === 'action') {
      const run = env.targetId ? tree.modules.flatMap((m) => m.actions).find((a) => a.id === env.targetId)?.activeRun : null
      if (run && supervisor.isLive(run.id)) supervisor.stop(run.id)
      return
    }
    const group = getGroup(env.targetId)
    if (group) stopGroup(group)
    return
  }

  for (const action of projectPowerTargets(tree)) {
    const run = action.activeRun
    if (run && isActiveStatus(run.status) && supervisor.isLive(run.id)) {
      supervisor.stop(run.id)
    }
  }
}

export function isProjectPowerOn(projectId: string): boolean {
  const tree = getProjectTree(projectId)
  const activeEnvironmentId = resolveDashboardEnvironmentId(tree)
  if (activeEnvironmentId) {
    const env = getEnvironment(activeEnvironmentId)
    if (!env) return false
    if (env.targetType === 'action') {
      const action = tree.modules.flatMap((m) => m.actions).find((a) => a.id === env.targetId)
      return !!(action?.activeRun && isActiveStatus(action.activeRun.status))
    }
    const group = getGroup(env.targetId)
    if (!group) return false
    return group.steps.some((step) => {
      const action = tree.modules.flatMap((m) => m.actions).find((a) => a.id === step.actionId)
      return action?.activeRun && isActiveStatus(action.activeRun.status)
    })
  }
  return projectPowerTargets(tree).some(
    (a) => a.activeRun && isActiveStatus(a.activeRun.status),
  )
}
