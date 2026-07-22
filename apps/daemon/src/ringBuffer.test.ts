import { describe, expect, it } from 'vitest'
import { RingBuffer } from './ringBuffer.js'

describe('RingBuffer', () => {
  it('snapshotTail returns the last N lines', () => {
    const buf = new RingBuffer(1024)
    buf.push('line1\nline2\nline3')
    expect(buf.snapshotTail(2)).toBe('line2\nline3')
    expect(buf.snapshotTail(1)).toBe('line3')
  })

  it('snapshotTail does not mutate stored chunks', () => {
    const buf = new RingBuffer(1024)
    buf.push('a\nb\nc\n')
    buf.snapshotTail(1)
    expect(buf.snapshot()).toBe('a\nb\nc\n')
  })

  it('trims a single chunk larger than maxBytes', () => {
    const buf = new RingBuffer(10)
    buf.push('abcdefghijklmnop')
    expect(buf.snapshot().length).toBe(10)
    expect(buf.snapshot()).toBe('ghijklmnop')
  })
})
