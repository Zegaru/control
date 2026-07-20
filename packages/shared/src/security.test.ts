import { describe, expect, it } from 'vitest'
import { isAllowedHealthUrl, isLoopbackHost } from './index.js'

describe('isLoopbackHost', () => {
  it('accepts common loopback hosts', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
  })

  it('rejects non-loopback hosts', () => {
    expect(isLoopbackHost('0.0.0.0')).toBe(false)
    expect(isLoopbackHost('192.168.1.1')).toBe(false)
  })
})

describe('isAllowedHealthUrl', () => {
  it('allows localhost HTTP health URLs', () => {
    expect(isAllowedHealthUrl('http://127.0.0.1:3000/health')).toBe(true)
    expect(isAllowedHealthUrl('http://localhost:8080/')).toBe(true)
  })

  it('rejects remote and non-HTTP targets', () => {
    expect(isAllowedHealthUrl('http://example.com/')).toBe(false)
    expect(isAllowedHealthUrl('http://169.254.169.254/')).toBe(false)
    expect(isAllowedHealthUrl('file:///etc/passwd')).toBe(false)
  })
})
