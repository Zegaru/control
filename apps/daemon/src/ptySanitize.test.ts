import { describe, expect, it } from 'vitest'
import { sanitizeConPtySnapshot, sanitizeConPtyWrap } from './ptySanitize.js'

describe('sanitizeConPtyWrap', () => {
  it('flattens LF + long padding (right-aligned fragment)', () => {
    const wrapped =
      '...5b09f727\n                                                                                                                       709fd'
    expect(sanitizeConPtySnapshot(wrapped)).toBe('...5b09f727\n709fd')
  })

  it('leaves CR + spaces alone (TUI column / in-place updates)', () => {
    const tui = 'Session Status\r                    connecting'
    expect(sanitizeConPtySnapshot(tui)).toBe(tui)
  })

  it('leaves normal CRLF alone', () => {
    expect(sanitizeConPtySnapshot('line one\r\nline two')).toBe('line one\r\nline two')
  })

  it('leaves carriage-return overwrites (progress) alone', () => {
    expect(sanitizeConPtySnapshot('\rLoading...')).toBe('\rLoading...')
  })

  it('strips LF padding that arrives in the next chunk', () => {
    const a = sanitizeConPtyWrap('...f727\n')
    expect(a.text).toBe('...f727\n')
    expect(a.carry).toBe('break')
    const b = sanitizeConPtyWrap(
      '                                                                                                                       709fd',
      a.carry,
    )
    expect(b.text).toBe('709fd')
  })

  it('does not eat short indentation', () => {
    expect(sanitizeConPtySnapshot('{\n  "a": 1\n}')).toBe('{\n  "a": 1\n}')
  })
})
