import { describe, expect, it } from 'vitest'
import { evaluateWaitStep } from './groupRunner.js'

describe('evaluateWaitStep', () => {
  it('completes when healthy is reached', () => {
    expect(evaluateWaitStep({ status: 'healthy' }, 'healthy')).toBe('done')
  })

  it('fails when a run dies while waiting for healthy', () => {
    expect(evaluateWaitStep({ status: 'failed' }, 'healthy')).toBe('fail')
    expect(evaluateWaitStep({ status: 'killed' }, 'healthy')).toBe('fail')
  })

  it('completes exit waits on exited or failed one-shot runs', () => {
    expect(evaluateWaitStep({ status: 'exited' }, 'exit')).toBe('done')
    expect(evaluateWaitStep({ status: 'failed' }, 'exit')).toBe('done')
  })

  it('fails exit waits when the run was killed', () => {
    expect(evaluateWaitStep({ status: 'killed' }, 'exit')).toBe('fail')
  })
})
