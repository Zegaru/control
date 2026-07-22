/**
 * ConPTY soft-wraps long lines by injecting a break plus horizontal padding before
 * the continuation (`\r`/`\n` + spaces). xterm renders that as a right-aligned
 * fragment and it looks like a duplicated character at the wrap edge.
 *
 * Flatten those padding runs. Real progress updates (`\rLoading`) and normal
 * CRLF are left alone. `carry` is `'' | '\r' | 'break'` so padding that arrives
 * in the next chunk still gets stripped.
 */
export function sanitizeConPtyWrap(
  chunk: string,
  carry: string = '',
): {text: string; carry: string} {
  let s = carry === '\r' ? `\r${chunk}` : chunk

  // Previous chunk ended on a line break — strip wrap-padding at the start.
  if (carry === 'break' || carry === '\r') {
    s = s.replace(/^[ \t]{8,}(?=\S)/, '')
  }

  // CR + padding before more text (classic ConPTY wrap paint)
  s = s.replace(/\r[ \t]+(?=\S)/g, '\n')
  // LF / CRLF + long padding (continuation shoved to the right edge)
  s = s.replace(/\r\n[ \t]{8,}(?=\S)/g, '\n')
  s = s.replace(/\n[ \t]{8,}(?=\S)/g, '\n')

  let nextCarry = ''
  if (s.endsWith('\r') && !s.endsWith('\r\n')) {
    nextCarry = '\r'
    s = s.slice(0, -1)
  } else if (s.endsWith('\n')) {
    // Keep the newline in output; remember so leading padding on the next chunk is stripped.
    nextCarry = 'break'
  }

  return {text: s, carry: nextCarry}
}

/** One-shot helper for complete snapshots (no chunk carry). */
export function sanitizeConPtySnapshot(text: string): string {
  return sanitizeConPtyWrap(text).text
}
