import { execa } from 'execa'

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

// Resolve every listening TCP port to its owning process — name via Get-Process,
// command line via Win32_Process (so we can match it to a project by path).
const PS_COMMAND = [
  '$names=@{}; Get-Process | ForEach-Object { $names[$_.Id]=$_.ProcessName };',
  '$cmds=@{}; Get-CimInstance Win32_Process | ForEach-Object { $cmds[[int]$_.ProcessId]=$_.CommandLine };',
  'Get-NetTCPConnection -State Listen |',
  'Select-Object LocalPort,OwningProcess -Unique |',
  'ForEach-Object { [pscustomobject]@{ port=$_.LocalPort; pid=$_.OwningProcess; name=$names[[int]$_.OwningProcess]; cmd=$cmds[[int]$_.OwningProcess] } } |',
  'ConvertTo-Json -Compress',
].join(' ')

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

  try {
    const { stdout } = await execa('powershell.exe', ['-NoProfile', '-Command', PS_COMMAND], {
      timeout: 10000,
    })
    const parsed = JSON.parse(stdout || '[]')
    const rows: { port: number; pid: number; name: string | null; cmd: string | null }[] =
      Array.isArray(parsed) ? parsed : [parsed]

    const byPort = new Map<number, HostPort>()
    for (const r of rows) {
      if (!r || typeof r.port !== 'number') continue
      if (r.port >= EPHEMERAL_FLOOR) continue
      // Don't report CONTROL's own daemon process as an external service.
      if (r.pid === process.pid) continue
      if (!byPort.has(r.port)) {
        byPort.set(r.port, { port: r.port, pid: r.pid, name: r.name ?? null, cmd: r.cmd ?? null })
      }
    }
    const ports = [...byPort.values()]
    cache = { at: Date.now(), ports }
    return ports
  } catch {
    return []
  }
}
