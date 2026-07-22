/**
 * ConPTY hard-wraps long lines by injecting `\n` plus horizontal padding before
 * the continuation. That shows up in xterm as a right-aligned stub.
 *
 * Only flatten **LF + long padding** (wrap artifact). Do **not** rewrite `\r` —
 * TUIs (ngrok, prompts, progress) use CR + spaces for in-place column updates;
 * turning those into newlines explodes the layout.
 *
 * `carry` is `'' | 'break'` so padding that arrives in the next chunk is stripped.
 */
export function sanitizeConPtyWrap(
  chunk: string,
  carry: string = '',
): {text: string; carry: string} {
  let s = chunk

  // Previous chunk ended on LF — strip wrap-padding at the start of this one.
  if (carry === 'break') {
    s = s.replace(/^[ \t]{20,}(?=\S)/, '')
  }

  // LF / CRLF + long padding (ConPTY wrap continuation shoved to the right edge)
  s = s.replace(/\r\n[ \t]{20,}(?=\S)/g, '\n')
  s = s.replace(/\n[ \t]{20,}(?=\S)/g, '\n')

  const nextCarry = s.endsWith('\n') ? 'break' : ''
  return {text: s, carry: nextCarry}
}

/** One-shot helper for complete snapshots (no chunk carry). */
export function sanitizeConPtySnapshot(text: string): string {
  return sanitizeConPtyWrap(text).text
}
