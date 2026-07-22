#!/usr/bin/env node
/**
 * Free CONTROL_PORT (default 4400) only when the listener is a CONTROL daemon.
 *
 * Used by `pnpm kill:daemon` and before `pnpm dev` / daemon `dev` so a stale
 * Node process (e.g. tray Quit left an adopted daemon) cannot block bind —
 * without murdering unrelated services that happen to use the same port.
 *
 * Identification (either is enough):
 *   1. GET /api/health → JSON `{ ok: true, version }`
 *   2. Process command line looks like the CONTROL daemon
 */
import { spawnSync } from 'node:child_process'
import { createConnection } from 'node:net'

const DEFAULT_PORT = 4400
const port = Number(process.env.CONTROL_PORT ?? DEFAULT_PORT)

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`[control] invalid CONTROL_PORT: ${process.env.CONTROL_PORT}`)
  process.exit(1)
}

/** Cmdline fingerprints for the CONTROL daemon (tsx / bundled / staged). */
const DAEMON_CMDLINE_RE =
  /(?:apps[/\\]daemon[/\\](?:src[/\\]index\.ts|dist[/\\]index\.js)|@control[/\\]daemon|control[/\\]apps[/\\]daemon)/i

function uniquePids(values) {
  return [...new Set(values.map(Number).filter((pid) => Number.isInteger(pid) && pid > 0))]
}

function listeningPidsWindows(p) {
  const ps = [
    `Get-NetTCPConnection -LocalPort ${p} -State Listen -ErrorAction SilentlyContinue |`,
    'Select-Object -ExpandProperty OwningProcess -Unique',
  ].join(' ')
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (r.error) throw r.error
  return uniquePids((r.stdout ?? '').split(/\r?\n/))
}

function listeningPidsUnix(p) {
  const r = spawnSync('lsof', [`-tiTCP:${p}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
  if (r.error && r.error.code === 'ENOENT') {
    const ss = spawnSync('ss', ['-lptn', `sport = :${p}`], { encoding: 'utf8' })
    if (ss.error) throw ss.error
    const pids = []
    for (const match of (ss.stdout ?? '').matchAll(/pid=(\d+)/g)) {
      pids.push(match[1])
    }
    return uniquePids(pids)
  }
  if (r.status !== 0 && !(r.stdout ?? '').trim()) return []
  return uniquePids((r.stdout ?? '').split(/\r?\n/))
}

function listeningPids(p) {
  return process.platform === 'win32' ? listeningPidsWindows(p) : listeningPidsUnix(p)
}

function cmdlineFor(pid) {
  if (process.platform === 'win32') {
    const ps = `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`
    const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], {
      encoding: 'utf8',
      windowsHide: true,
    })
    return (r.stdout ?? '').trim()
  }
  const r = spawnSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' })
  return (r.stdout ?? '').trim()
}

function looksLikeControlDaemon(pid) {
  const cmd = cmdlineFor(pid)
  return cmd.length > 0 && DAEMON_CMDLINE_RE.test(cmd)
}

async function probeControlHealth(p) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 800)
  try {
    const res = await fetch(`http://127.0.0.1:${p}/api/health`, {
      signal: ac.signal,
    })
    if (!res.ok) return false
    const body = await res.json()
    return body?.ok === true && typeof body.version === 'string'
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function killPid(pid) {
  if (process.platform === 'win32') {
    const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      encoding: 'utf8',
      windowsHide: true,
    })
    // 128 = process not found — treat as already gone.
    if (r.status !== 0 && r.status !== 128) {
      const detail = (r.stderr || r.stdout || '').trim()
      throw new Error(`taskkill PID ${pid} failed${detail ? `: ${detail}` : ''}`)
    }
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch (err) {
    if (err.code === 'ESRCH') return
    throw err
  }
}

function portFree(p, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port: p })
    socket.once('connect', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(true))
  })
}

async function waitUntilFree(p, ms = 3000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await portFree(p)) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return portFree(p)
}

const pids = listeningPids(port)
if (pids.length === 0) {
  console.log(`[control] no listener on :${port}`)
  process.exit(0)
}

const healthOk = await probeControlHealth(port)
const controlPids = pids.filter((pid) => looksLikeControlDaemon(pid))
const isControl = healthOk || controlPids.length > 0

if (!isControl) {
  console.error(
    `[control] :${port} is in use by PID(s) ${pids.join(', ')}, but it is not a CONTROL daemon.`,
  )
  console.error(
    '  Refusing to kill it. Stop that process yourself, or set CONTROL_PORT to a free port.',
  )
  process.exit(1)
}

const targets = controlPids.length > 0 ? controlPids : pids
console.log(`[control] killing CONTROL daemon PID(s) on :${port}: ${targets.join(', ')}`)
for (const pid of targets) {
  killPid(pid)
}

const free = await waitUntilFree(port)
if (!free) {
  console.error(`[control] port :${port} still in use after kill`)
  process.exit(1)
}
console.log(`[control] port :${port} is free`)
