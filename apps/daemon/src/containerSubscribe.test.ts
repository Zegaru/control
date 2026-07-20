import { describe, expect, it } from 'vitest'
import { canSubscribeContainer } from './containerSubscribe.js'

describe('canSubscribeContainer', () => {
  it('allows containers attributed to a project', () => {
    expect(
      canSubscribeContainer('abc', [{ id: 'abc', projectId: 'proj-1' }]),
    ).toBe(true)
  })

  it('denies unknown or unattributed containers', () => {
    expect(canSubscribeContainer('abc', [{ id: 'other', projectId: 'proj-1' }])).toBe(false)
    expect(canSubscribeContainer('abc', [{ id: 'abc', projectId: null }])).toBe(false)
  })
})
