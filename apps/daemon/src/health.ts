import net from 'node:net'

/** True if something is accepting TCP connections on 127.0.0.1:port. */
export function isPortListening(port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false
    const done = (result: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, '127.0.0.1')
  })
}

/** True if healthUrl responds with a 2xx/3xx status within the timeout. */
export async function isHttpHealthy(url: string, timeoutMs = 2000): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'manual' })
    return res.status < 400
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
