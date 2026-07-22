/** Client-side mirror of daemon `ptySanitize`. */
export function sanitizeConPtyWrap(
  chunk: string,
  carry: string = '',
): {text: string; carry: string} {
  let s = chunk

  if (carry === 'break') {
    s = s.replace(/^[ \t]{20,}(?=\S)/, '')
  }

  s = s.replace(/\r\n[ \t]{20,}(?=\S)/g, '\n')
  s = s.replace(/\n[ \t]{20,}(?=\S)/g, '\n')

  const nextCarry = s.endsWith('\n') ? 'break' : ''
  return {text: s, carry: nextCarry}
}

export function sanitizeConPtySnapshot(text: string): string {
  return sanitizeConPtyWrap(text).text
}
