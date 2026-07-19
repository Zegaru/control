import {statfs} from 'node:fs/promises'
import os from 'node:os'
import {homedir} from 'node:os'

export type HostMetrics = {
  cpu: number
  memory: number
  disk: number
  /** Unix ms when this sample was taken. */
  at: number
}

type CpuSnapshot = {idle: number; total: number}

function readCpu(): CpuSnapshot {
  let idle = 0
  let total = 0
  for (const c of os.cpus()) {
    const t = c.times
    idle += t.idle
    total += t.user + t.nice + t.sys + t.idle + t.irq
  }
  return {idle, total}
}

function memoryPercent(): number {
  const total = os.totalmem()
  if (total <= 0) return 0
  return Math.round(((total - os.freemem()) / total) * 100)
}

/** Prefer the drive that holds the user home directory. */
function diskRoot(): string {
  if (process.platform === 'win32') {
    const home = homedir()
    const m = /^[A-Za-z]:/.exec(home)
    return m ? `${m[0]}\\` : 'C:\\'
  }
  return '/'
}

async function diskPercent(): Promise<number> {
  try {
    const s = await statfs(diskRoot())
    const blocks = Number(s.blocks)
    const avail = Number(s.bavail)
    if (blocks <= 0) return 0
    return Math.round(((blocks - avail) / blocks) * 100)
  } catch {
    return 0
  }
}

function cpuPercent(prev: CpuSnapshot, cur: CpuSnapshot): number {
  const idle = cur.idle - prev.idle
  const total = cur.total - prev.total
  if (total <= 0) return 0
  return Math.round(Math.min(100, Math.max(0, (1 - idle / total) * 100)))
}

let prevCpu = readCpu()
let latest: HostMetrics = {
  cpu: 0,
  memory: memoryPercent(),
  disk: 0,
  at: Date.now(),
}
let timer: NodeJS.Timeout | null = null

async function sample(): Promise<HostMetrics> {
  const cur = readCpu()
  const cpu = cpuPercent(prevCpu, cur)
  prevCpu = cur
  const memory = memoryPercent()
  const disk = await diskPercent()
  latest = {cpu, memory, disk, at: Date.now()}
  return latest
}

/** Take one sample now (used by the HTTP handler). */
export async function sampleNow(): Promise<HostMetrics> {
  return sample()
}

/** Start background sampling (CPU needs a delta between ticks). */
export function startHostMetrics(intervalMs = 1500): void {
  if (timer) return
  void sample()
  timer = setInterval(() => {
    void sample()
  }, intervalMs)
  // Don't keep the process alive solely for metrics.
  timer.unref?.()
}

export function getHostMetrics(): HostMetrics {
  return latest
}
