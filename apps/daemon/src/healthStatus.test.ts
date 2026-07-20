import { describe, expect, it } from 'vitest'
import { nextHealthStatus } from './healthStatus.js'

describe('nextHealthStatus', () => {
  it('promotes to healthy when checks pass', () => {
    expect(
      nextHealthStatus({
        healthy: true,
        portUp: true,
        hadHealthSignals: true,
        graceElapsed: true,
      }),
    ).toBe('healthy')
  })

  it('demotes to unhealthy after grace when health signals fail', () => {
    expect(
      nextHealthStatus({
        healthy: false,
        portUp: true,
        hadHealthSignals: true,
        graceElapsed: true,
      }),
    ).toBe('unhealthy')
  })

  it('stays running when port is up before grace elapses', () => {
    expect(
      nextHealthStatus({
        healthy: false,
        portUp: true,
        hadHealthSignals: true,
        graceElapsed: false,
      }),
    ).toBe('running')
  })

  it('returns null when nothing has changed yet', () => {
    expect(
      nextHealthStatus({
        healthy: false,
        portUp: false,
        hadHealthSignals: true,
        graceElapsed: false,
      }),
    ).toBeNull()
  })
})
