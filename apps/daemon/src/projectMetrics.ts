import os from 'node:os'
import {inArray} from 'drizzle-orm'
import type {ProjectMetricsSnapshot} from '@control/shared'
import {db, schema} from './db/index.js'
import {buildComposeProjectMatcher, listActiveRuns} from './registry.js'
import {getContainerStatsBatch, listContainers} from './docker.js'
import {loadHostProcesses, type HostProcRow} from './hostProcessSnapshot.js'
import {pidAlive} from './pid.js'

type ProcRow = HostProcRow

const SAMPLE_MS = 2000

let latest: ProjectMetricsSnapshot = {at: Date.now(), projects: {}}
let timer: NodeJS.Timeout | null = null
let prevCpuByPid: Map<number, number> | null = null
let prevSampleAt = 0
let sampleInFlight: Promise<ProjectMetricsSnapshot> | null = null

function clampPct(n: number): number {
  return Math.round(Math.min(100, Math.max(0, n)))
}

function collectTree(rootPid: number, childrenOf: Map<number, number[]>): Set<number> {
  const out = new Set<number>()
  const stack = [rootPid]
  while (stack.length) {
    const pid = stack.pop()!
    if (out.has(pid)) continue
    out.add(pid)
    for (const child of childrenOf.get(pid) ?? []) stack.push(child)
  }
  return out
}

async function loadProcesses(): Promise<ProcRow[]> {
  return loadHostProcesses()
}

function cpuPercentForTree(
  pids: Set<number>,
  byId: Map<number, ProcRow>,
  wallMs: number,
): number {
  if (wallMs <= 0) return 0
  const cores = os.cpus().length || 1

  if (process.platform === 'win32') {
    if (!prevCpuByPid) return 0
    let delta = 0
    for (const pid of pids) {
      const row = byId.get(pid)
      const prev = prevCpuByPid.get(pid)
      if (!row || prev == null) continue
      const d = row.cpu - prev
      if (d > 0) delta += d
    }
    return clampPct((delta / 10000 / wallMs / cores) * 100)
  }

  let sum = 0
  for (const pid of pids) {
    const row = byId.get(pid)
    if (row) sum += row.cpu
  }
  return clampPct(sum / cores)
}

function memBytesForTree(pids: Set<number>, byId: Map<number, ProcRow>): number {
  let sum = 0
  for (const pid of pids) {
    sum += byId.get(pid)?.ws ?? 0
  }
  return sum
}

function buildActionProjectMap(actionIds: string[]): Map<string, string> {
  if (actionIds.length === 0) return new Map()
  const actions = db
    .select()
    .from(schema.actions)
    .where(inArray(schema.actions.id, actionIds))
    .all()
  const moduleIds = [...new Set(actions.map((a) => a.moduleId))]
  const modules =
    moduleIds.length > 0
      ? db.select().from(schema.modules).where(inArray(schema.modules.id, moduleIds)).all()
      : []
  const projectByModule = new Map(modules.map((m) => [m.id, m.projectId]))
  const out = new Map<string, string>()
  for (const a of actions) {
    const projectId = projectByModule.get(a.moduleId)
    if (projectId) out.set(a.id, projectId)
  }
  return out
}

async function sample(): Promise<ProjectMetricsSnapshot> {
  const now = Date.now()
  const wallMs = prevSampleAt ? now - prevSampleAt : SAMPLE_MS
  const rows = await loadProcesses()
  const byId = new Map(rows.map((r) => [r.id, r]))
  const childrenOf = new Map<number, number[]>()
  for (const r of rows) {
    const list = childrenOf.get(r.parentId) ?? []
    list.push(r.id)
    childrenOf.set(r.parentId, list)
  }

  const totals = new Map<string, {cpu: number; memBytes: number}>()
  const bump = (projectId: string, cpu: number, memBytes: number) => {
    const cur = totals.get(projectId) ?? {cpu: 0, memBytes: 0}
    cur.cpu += cpu
    cur.memBytes += memBytes
    totals.set(projectId, cur)
  }

  const active = listActiveRuns()
  const actionProject = buildActionProjectMap(active.map((r) => r.actionId))

  for (const run of active) {
    if (!run.pid || !pidAlive(run.pid)) continue
    const projectId = actionProject.get(run.actionId)
    if (!projectId) continue
    const tree = collectTree(run.pid, childrenOf)
    bump(projectId, cpuPercentForTree(tree, byId, wallMs), memBytesForTree(tree, byId))
  }

  const mapProject = buildComposeProjectMatcher()
  const containers = (await listContainers(mapProject)).filter(
    (c) => c.state === 'running' && c.projectId,
  )
  const stats = await getContainerStatsBatch(containers.map((c) => c.id))
  const hostMem = os.totalmem()

  for (const c of containers) {
    if (!c.projectId) continue
    const s = stats.get(c.id)
    if (!s) continue
    bump(c.projectId, s.cpu, s.memBytes)
  }

  const projects: ProjectMetricsSnapshot['projects'] = {}
  for (const [projectId, t] of totals) {
    projects[projectId] = {
      cpu: clampPct(t.cpu),
      memory: hostMem > 0 ? clampPct((t.memBytes / hostMem) * 100) : 0,
    }
  }

  prevCpuByPid = new Map(rows.map((r) => [r.id, r.cpu]))
  prevSampleAt = now
  latest = {at: now, projects}
  return latest
}

export function startProjectMetrics(intervalMs = SAMPLE_MS): void {
  if (timer) return
  void sample()
  timer = setInterval(() => {
    if (sampleInFlight) return
    sampleInFlight = sample().finally(() => {
      sampleInFlight = null
    })
  }, intervalMs)
  timer.unref?.()
}

export async function sampleProjectMetricsNow(): Promise<ProjectMetricsSnapshot> {
  if (sampleInFlight) return sampleInFlight
  sampleInFlight = sample().finally(() => {
    sampleInFlight = null
  })
  return sampleInFlight
}

export function getProjectMetrics(): ProjectMetricsSnapshot {
  return latest
}
