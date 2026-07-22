#!/usr/bin/env node
/**
 * Shared CONTROL_PORT helpers for kill-daemon and dev startup.
 *
 * Preferred port = CONTROL_PORT env or 4400.
 * Dev ensure: free preferred, or kill a CONTROL daemon on it, else bump
 * preferred+1, preferred+2, … until a free port is found.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join } from 'node:path'

export const DEFAULT_PORT = 4400
export const MAX_PORT_BUMP = 50

export function devPortFilePath(repoRoot) {
  return join(repoRoot, '.control-dev-port')
}

export function writeDevPort(repoRoot, port) {
  writeFileSync(devPortFilePath(repoRoot), `${port}\n`, 'utf8')
}

export function readDevPort(repoRoot) {
  try {
    const raw = readFileSync(devPortFilePath(repoRoot), 'utf8').trim()
    const port = Number(raw)
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null
    return port
  } catch {
    return null
  }
}

/** Cmdline fingerprints for the CONTROL daemon (tsx / bundled / staged). */
const DAEMON_CMDLINE_RE =
  /(?:apps[/\\]daemon[/\\](?:src[/\\]index\.ts|dist[/\\]index\.js)|@control[/\\]daemon|control[/\\]apps[/\\]daemon)/i

export function preferredPort() {
  const raw = process.env.CONTROL_PORT
  const port = Number(raw ?? DEFAULT_PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid CONTROL_PORT: ${raw}`)
  }
  return port
}

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

export function listeningPids(p) {
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

export function looksLikeControlDaemon(pid) {
  const cmd = cmdlineFor(pid)
  return cmd.length > 0 && DAEMON_CMDLINE_RE.test(cmd)
}

export async function probeControlHealth(p) {
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

export async function classifyPort(p) {
  const pids = listeningPids(p)
  if (pids.length === 0) return { state: 'free', pids }
  const healthOk = await probeControlHealth(p)
  const controlPids = pids.filter((pid) => looksLikeControlDaemon(pid))
  if (healthOk || controlPids.length > 0) {
    return {
      state: 'control',
      pids,
      controlPids: controlPids.length > 0 ? controlPids : pids,
    }
  }
  return { state: 'other', pids }
}

export function killPid(pid) {
  if (process.platform === 'win32') {
    const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      encoding: 'utf8',
      windowsHide: true,
    })
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

export function portFree(p, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port: p })
    socket.once('connect', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(true))
  })
}

export async function waitUntilFree(p, ms = 3000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await portFree(p)) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return portFree(p)
}

/**
 * Kill a CONTROL daemon on `port` if present.
 * @returns {'freed'|'already-free'}
 * @throws if the port is held by a non-CONTROL process
 */
export async function killControlOnPort(port) {
  const info = await classifyPort(port)
  if (info.state === 'free') return 'already-free'
  if (info.state === 'other') {
    const err = new Error(
      `:${port} is in use by PID(s) ${info.pids.join(', ')}, but it is not a CONTROL daemon.`,
    )
    err.code = 'NOT_CONTROL'
    err.pids = info.pids
    throw err
  }
  console.log(
    `[control] killing CONTROL daemon PID(s) on :${port}: ${info.controlPids.join(', ')}`,
  )
  for (const pid of info.controlPids) killPid(pid)
  const free = await waitUntilFree(port)
  if (!free) throw new Error(`port :${port} still in use after kill`)
  return 'freed'
}

/**
 * Make a port available for the CONTROL daemon in dev.
 * Prefers `preferred` (kill stale CONTROL). If a foreign process owns it,
 * scans preferred+1 … preferred+MAX_PORT_BUMP for the first free port.
 */
export async function ensureDevPort(preferred = preferredPort()) {
  const first = await classifyPort(preferred)
  if (first.state === 'free') {
    console.log(`[control] using :${preferred}`)
    return preferred
  }
  if (first.state === 'control') {
    await killControlOnPort(preferred)
    console.log(`[control] port :${preferred} is free`)
    return preferred
  }

  console.log(
    `[control] :${preferred} held by non-CONTROL PID(s) ${first.pids.join(', ')}; scanning for a free port…`,
  )
  const end = preferred + MAX_PORT_BUMP
  for (let p = preferred + 1; p <= end; p++) {
    const info = await classifyPort(p)
    if (info.state === 'free') {
      console.log(`[control] using :${p} (preferred :${preferred} busy)`)
      return p
    }
    if (info.state === 'control') {
      await killControlOnPort(p)
      console.log(`[control] using :${p} after clearing stale CONTROL daemon`)
      return p
    }
  }
  throw new Error(
    `no free CONTROL port in :${preferred}–:${end}; stop the other listeners or set CONTROL_PORT`,
  )
}
