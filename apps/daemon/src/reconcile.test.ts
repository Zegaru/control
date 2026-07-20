import { describe, expect, it } from 'vitest'
import { decideReconcileStatus } from './reconcile.js'

describe('decideReconcileStatus', () => {
  it('adopts when PID is alive regardless of ports', () => {
    expect(decideReconcileStatus({ pid: 42, alive: true, portsUp: true })).toBe('adopted')
    expect(decideReconcileStatus({ pid: 42, alive: true, portsUp: false })).toBe('adopted')
  })

  it('marks exited when PID is dead even if ports are up', () => {
    expect(decideReconcileStatus({ pid: 42, alive: false, portsUp: true })).toBe('exited')
    expect(decideReconcileStatus({ pid: null, alive: false, portsUp: true })).toBe('exited')
  })

  it('marks exited when PID is dead and ports are down', () => {
    expect(decideReconcileStatus({ pid: 42, alive: false, portsUp: false })).toBe('exited')
  })
})
