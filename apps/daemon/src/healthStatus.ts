import type { RunStatus } from '@control/shared'

const HEALTH_GRACE_MS = 5000

export { HEALTH_GRACE_MS }

export function nextHealthStatus(input: {
  healthy: boolean
  portUp: boolean
  hadHealthSignals: boolean
  graceElapsed: boolean
}): Extract<RunStatus, 'healthy' | 'running' | 'unhealthy'> | null {
  if (input.healthy) return 'healthy'
  if (input.hadHealthSignals && input.graceElapsed) return 'unhealthy'
  if (input.portUp) return 'running'
  return null
}
