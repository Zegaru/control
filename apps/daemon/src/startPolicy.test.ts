import { describe, expect, it } from 'vitest'
import type { Run } from '@control/shared'

export function shouldRejectDuplicateStart(existing: Run | null, force: boolean): boolean {
  return existing != null && !force
}

describe('shouldRejectDuplicateStart', () => {
  it('allows start when no active run exists', () => {
    expect(shouldRejectDuplicateStart(null, false)).toBe(false)
  })

  it('rejects when an active run exists without force', () => {
    const run = { id: 'run-1' } as Run
    expect(shouldRejectDuplicateStart(run, false)).toBe(true)
  })

  it('allows force restart when an active run exists', () => {
    const run = { id: 'run-1' } as Run
    expect(shouldRejectDuplicateStart(run, true)).toBe(false)
  })
})
