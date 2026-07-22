import { execa } from 'execa'

export type HostProcRow = {
  id: number
  parentId: number
  ws: number
  cpu: number
  name: string | null
  cmd: string | null
}

const PROC_CACHE_MS = 2000
let procCache: { at: number; rows: HostProcRow[] } | null = null
let procInFlight: Promise<HostProcRow[]> | null = null

async function fetchHostProcesses(): Promise<HostProcRow[]> {
  if (process.platform === 'win32') {
    const cmd = [
      'Get-CimInstance Win32_Process | ForEach-Object {',
      '[pscustomobject]@{',
      'Id=[int]$_.ProcessId;',
      'ParentId=[int]$_.ParentProcessId;',
      'WS=[int64]$_.WorkingSetSize;',
      'Cpu=[int64]$_.KernelModeTime + [int64]$_.UserModeTime;',
      'Cmd=$_.CommandLine;',
      'Name=$_.Name',
      '}',
      '} | ConvertTo-Json -Compress',
    ].join(' ')
    try {
      const { stdout } = await execa('powershell.exe', ['-NoProfile', '-Command', cmd], {
        timeout: 12000,
      })
      const parsed = JSON.parse(stdout || '[]')
      return (Array.isArray(parsed) ? parsed : [parsed])
        .filter((r) => r && typeof r.Id === 'number')
        .map((r) => ({
          id: r.Id,
          parentId: r.ParentId ?? 0,
          ws: Number(r.WS) || 0,
          cpu: Number(r.Cpu) || 0,
          name: typeof r.Name === 'string' ? r.Name : null,
          cmd: typeof r.Cmd === 'string' ? r.Cmd : null,
        }))
    } catch {
      return []
    }
  }

  try {
    const { stdout } = await execa('ps', ['-eo', 'pid=', 'ppid=', 'rss=', 'pcpu=', 'comm='], {
      timeout: 5000,
    })
    const rows: HostProcRow[] = []
    for (const line of stdout.split('\n')) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 4) continue
      const id = Number(parts[0])
      const parentId = Number(parts[1])
      const ws = Number(parts[2]) * 1024
      const pcpu = Number(parts[3])
      if (!Number.isFinite(id)) continue
      const name = parts.length > 4 ? parts.slice(4).join(' ') : null
      rows.push({ id, parentId, ws, cpu: pcpu, name, cmd: null })
    }
    return rows
  } catch {
    return []
  }
}

/** Shared host process table snapshot (coalesced across metrics sampling). */
export async function loadHostProcesses(): Promise<HostProcRow[]> {
  if (procCache && Date.now() - procCache.at < PROC_CACHE_MS) return procCache.rows
  if (procInFlight) return procInFlight

  procInFlight = fetchHostProcesses()
    .then((rows) => {
      procCache = { at: Date.now(), rows }
      procInFlight = null
      return rows
    })
    .catch((err) => {
      procInFlight = null
      throw err
    })

  return procInFlight
}

/** Test helper — reset module cache between tests. */
export function resetHostProcessSnapshotForTests(): void {
  procCache = null
  procInFlight = null
}
