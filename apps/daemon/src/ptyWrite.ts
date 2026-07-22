/** Write stdin to a live PTY. Returns false when there is no handle. */
export function writePty(
  proc: { write(data: string): void } | null | undefined,
  data: string,
): boolean {
  if (!proc) return false
  try {
    proc.write(data)
    return true
  } catch {
    return false
  }
}
