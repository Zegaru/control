/** Client-side mirror of daemon `ptySanitize` for snapshots / live stream defense. */
export function sanitizeConPtyWrap(
  chunk: string,
  carry: string = '',
): {text: string; carry: string} {
  let s = carry === '\r' ? `\r${chunk}` : chunk

  if (carry === 'break' || carry === '\r') {
    s = s.replace(/^[ \t]{8,}(?=\S)/, '')
  }

  s = s.replace(/\r[ \t]+(?=\S)/g, '\n')
  s = s.replace(/\r\n[ \t]{8,}(?=\S)/g, '\n')
  s = s.replace(/\n[ \t]{8,}(?=\S)/g, '\n')

  let nextCarry = ''
  if (s.endsWith('\r') && !s.endsWith('\r\n')) {
    nextCarry = '\r'
    s = s.slice(0, -1)
  } else if (s.endsWith('\n')) {
    nextCarry = 'break'
  }

  return {text: s, carry: nextCarry}
}

export function sanitizeConPtySnapshot(text: string): string {
  return sanitizeConPtyWrap(text).text
}
