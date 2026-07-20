import { describe, expect, it } from 'vitest'
import { DEFAULT_IGNORE_GLOBS } from '@control/shared'
import { matchesIgnore } from './scanner.js'

describe('matchesIgnore', () => {
  it('matches exact basename patterns', () => {
    expect(matchesIgnore('node_modules', 'node_modules', ['node_modules'])).toBe(true)
  })

  it('matches a default ignore glob against a typical path', () => {
    expect(matchesIgnore('.git', '.git', [...DEFAULT_IGNORE_GLOBS])).toBe(true)
  })

  it('does not match unrelated names', () => {
    expect(matchesIgnore('src', 'src', ['node_modules'])).toBe(false)
  })

  it('ignores empty and whitespace-only patterns', () => {
    expect(matchesIgnore('node_modules', 'node_modules', ['', '   '])).toBe(false)
  })
})
