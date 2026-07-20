import { describe, expect, it } from 'vitest'
import type { Run } from '@control/shared'
import { indexActiveRuns } from './activeRuns.js'

describe('indexActiveRuns', () => {
  it('keeps the newest run per action', () => {
    const older = { id: 'run-1', actionId: 'a1' } as Run
    const newer = { id: 'run-2', actionId: 'a1' } as Run
    const map = indexActiveRuns([newer, older])
    expect(map.get('a1')?.id).toBe('run-2')
  })
})
