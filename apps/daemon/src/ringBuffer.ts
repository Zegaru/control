/**
 * Bounded per-run log buffer. Keeps at most `maxBytes` of recent output so a
 * chatty dev server can't grow daemon memory without bound (NFR-4).
 */
export class RingBuffer {
  private chunks: string[] = []
  private bytes = 0

  constructor(private readonly maxBytes: number = 5 * 1024 * 1024) {}

  push(chunk: string): void {
    this.chunks.push(chunk)
    this.bytes += chunk.length
    while (this.bytes > this.maxBytes && this.chunks.length > 1) {
      const dropped = this.chunks.shift()!
      this.bytes -= dropped.length
    }
  }

  snapshot(): string {
    return this.chunks.join('')
  }

  clear(): void {
    this.chunks = []
    this.bytes = 0
  }
}
