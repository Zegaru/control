import { execa } from 'execa'
import { loadHostProcesses } from './hostProcessSnapshot.js'

export interface HostPort {
  port: number
  pid: number
  name: string | null
  /** Full command line of the owning process (used to attribute to a project). */
  cmd: string | null
}

// Dynamic/ephemeral range — almost never a dev server, and very noisy.
const EPHEMERAL_FLOOR = 49152

// One PowerShell spawn per call is ~500ms; cache briefly so the port view's
// polling and start-time conflict checks don't hammer it.
const CACHE_TTL_MS = 2000
let cache: { at: number; ports: HostPort[] } | null = null
let portsInFlight: Promise<HostPort[]> | null = null

const LISTEN_PORTS_PS = [
  'Get-NetTCPConnection -State Listen |',
  'Select-Object LocalPort,OwningProcess -Unique |',
  'ForEach-Object { [pscustomobject]@{ port=$_.LocalPort; pid=$_.OwningProcess } } |',
  'ConvertTo-Json -Compress',
].join(' ')

async function fetchHostListeningPorts(): Promise<HostPort[]> {
  if (process.platform !== 'win32') return []

  const processes = await loadHostProcesses()
  const byPid = new Map(processes.map((p) => [p.id, p]))

  try {
    const { stdout } = await execa(
      'powershell.exe',
      ['-NoProfile', '-Command', LISTEN_PORTS_PS],
      { timeout: 10000 },
    )
    const parsed = JSON.parse(stdout || '[]')
    const rows: { port: number; pid: number }[] = Array.isArray(parsed) ? parsed : [parsed]

    const byPort = new Map<number, HostPort>()
    for (const r of rows) {
      if (!r || typeof r.port !== 'number') continue
      if (r.port >= EPHEMERAL_FLOOR) continue
      if (r.pid === process.pid) continue
      if (!byPort.has(r.port)) {
        const proc = byPid.get(r.pid)
        byPort.set(r.port, {
          port: r.port,
          pid: r.pid,
          name: proc?.name ?? null,
          cmd: proc?.cmd ?? null,
        })
      }
    }
    return [...byPort.values()]
  } catch {
    return []
  }
}

/**
 * Host processes with listening TCP ports (Windows only). Used to attribute the
 * "external / unknown" slice of the port map — ports held by something that
 * isn't a CONTROL-managed run or a Docker container.
 *
 * NOTE (WSL2): Docker Desktop forwards container host ports through a relay
 * process (wslrelay / com.docker.backend), so those ports appear here owned by
 * the relay, not the container. Callers must attribute container ports via the
 * Docker API first and let those win — never trust netstat for them. See
 * DESIGN §6.
 */
export async function getHostListeningPorts(): Promise<HostPort[]> {
  if (process.platform !== 'win32') return []
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.ports
  if (portsInFlight) return portsInFlight

  portsInFlight = fetchHostListeningPorts()
    .then((ports) => {
      cache = { at: Date.now(), ports }
      portsInFlight = null
      return ports
    })
    .catch(() => {
      portsInFlight = null
      return []
    })

  return portsInFlight
}

/** Test helper — reset module cache between tests. */
export function resetHostListeningPortsForTests(): void {
  cache = null
  portsInFlight = null
}
