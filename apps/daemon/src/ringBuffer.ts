/**
 * Bounded per-run log buffer. Keeps at most `maxBytes` of recent output so a
 * chatty dev server can't grow daemon memory without bound (NFR-4).
 */
export class RingBuffer {
  private chunks: string[] = []
  private bytes = 0

  constructor(private readonly maxBytes: number = 5 * 1024 * 1024) {}

  push(chunk: string): void {
    let data = chunk
    if (data.length > this.maxBytes) {
      data = data.slice(-this.maxBytes)
    }
    this.chunks.push(data)
    this.bytes += data.length
    while (this.bytes > this.maxBytes && this.chunks.length > 1) {
      const dropped = this.chunks.shift()!
      this.bytes -= dropped.length
    }
    if (this.bytes > this.maxBytes && this.chunks.length === 1) {
      const only = this.chunks[0]!
      this.chunks[0] = only.slice(-this.maxBytes)
      this.bytes = this.chunks[0].length
    }
  }

  snapshot(): string {
    return this.chunks.join('')
  }

  /** Last N lines of the buffer without mutating stored chunks. */
  snapshotTail(maxLines: number): string {
    if (maxLines <= 0) return ''
    const text = this.snapshot()
    const lines = text.split('\n')
    return lines.slice(Math.max(0, lines.length - maxLines)).join('\n')
  }

  clear(): void {
    this.chunks = []
    this.bytes = 0
  }
}
