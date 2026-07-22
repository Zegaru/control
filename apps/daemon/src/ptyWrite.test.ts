import { describe, expect, it, vi } from 'vitest'
import { writePty } from './ptyWrite.js'

describe('writePty', () => {
  it('returns false when proc is null or undefined', () => {
    expect(writePty(null, 'x')).toBe(false)
    expect(writePty(undefined, 'x')).toBe(false)
  })

  it('calls write with the given data when proc is present', () => {
    const write = vi.fn()
    expect(writePty({ write }, 'hello')).toBe(true)
    expect(write).toHaveBeenCalledWith('hello')
  })

  it('returns false when write throws', () => {
    const write = vi.fn(() => {
      throw new Error('gone')
    })
    expect(writePty({ write }, 'x')).toBe(false)
  })
})
