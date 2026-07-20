import { describe, expect, it } from 'vitest'
import { ACTIVE_RUN_STATUSES, isActiveStatus, runStatusSchema } from './index.js'

describe('isActiveStatus', () => {
  it('treats healthy and adopted runs as active', () => {
    expect(isActiveStatus('healthy')).toBe(true)
    expect(isActiveStatus('adopted')).toBe(true)
  })

  it('treats terminal runs as inactive', () => {
    expect(isActiveStatus('exited')).toBe(false)
    expect(isActiveStatus('failed')).toBe(false)
    expect(isActiveStatus('killed')).toBe(false)
  })

  it('includes unhealthy and adopted in ACTIVE_RUN_STATUSES', () => {
    expect(ACTIVE_RUN_STATUSES).toContain('unhealthy')
    expect(ACTIVE_RUN_STATUSES).toContain('adopted')
  })
})

describe('runStatusSchema', () => {
  it('accepts known lifecycle values', () => {
    expect(runStatusSchema.parse('healthy')).toBe('healthy')
    expect(runStatusSchema.parse('adopted')).toBe('adopted')
  })
})
