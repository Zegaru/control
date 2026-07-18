import { eq, inArray } from 'drizzle-orm'
import { ACTIVE_RUN_STATUSES, type ContainerInfo, type PortOwner } from '@control/shared'
import { db, schema } from './db/index.js'
import { buildComposeProjectMatcher, buildPathProjectMatcher } from './registry.js'
import { listContainers } from './docker.js'
import { getHostListeningPorts } from './hostPorts.js'

/** Ports owned by CONTROL-managed host runs. */
function runPorts(): PortOwner[] {
  const runs = db
    .select()
    .from(schema.runs)
    .where(inArray(schema.runs.status, ACTIVE_RUN_STATUSES as string[]))
    .all()

  const owners: PortOwner[] = []
  for (const run of runs) {
    for (const port of run.ports ?? []) {
      const action = db.select().from(schema.actions).where(eq(schema.actions.id, run.actionId)).get()
      owners.push({ port, owner: 'run', runId: run.id, pid: run.pid, label: action?.name ?? null })
    }
  }
  return owners
}

/** Published host ports from running Docker containers. */
function containerPorts(containers: ContainerInfo[]): PortOwner[] {
  const owners: PortOwner[] = []
  for (const c of containers) {
    if (c.state !== 'running') continue
    for (const p of c.ports) {
      if (p.publicPort == null) continue
      owners.push({
        port: p.publicPort,
        owner: 'container',
        containerId: c.id,
        label: c.composeService ?? c.name,
      })
    }
  }
  return owners
}

/**
 * Unified port map, in precedence order:
 *   1. CONTROL-managed host runs
 *   2. Docker container host bindings (dockerode)
 *   3. External/unknown host processes (Get-NetTCPConnection, Windows only)
 *
 * Precedence is load-bearing for WSL2: Docker forwards container ports through
 * a host relay process, so those ports ALSO appear in the external scan owned
 * by the relay. Adding container owners before external, and never overwriting
 * an existing port, keeps them attributed to the container — never the relay.
 * See DESIGN §6.
 */
export async function getPortMap(): Promise<PortOwner[]> {
  const matcher = buildComposeProjectMatcher()
  const pathMatcher = buildPathProjectMatcher()
  const containers = await listContainers(matcher)
  const host = await getHostListeningPorts()

  const byPort = new Map<number, PortOwner>()
  // 1. runs (highest precedence) — a managed run wins any coincidental match.
  for (const o of runPorts()) byPort.set(o.port, o)
  // 2. containers — fill ports not already owned by a run.
  for (const o of containerPorts(containers)) if (!byPort.has(o.port)) byPort.set(o.port, o)
  // 3. external host processes — only ports nothing above claimed. Attribute to
  //    a project by matching the process command line to a project root path.
  for (const h of host) {
    if (byPort.has(h.port)) continue
    byPort.set(h.port, {
      port: h.port,
      owner: 'external',
      pid: h.pid,
      processName: h.name,
      label: h.name,
      projectId: pathMatcher(h.cmd) ?? null,
    })
  }
  return [...byPort.values()].sort((a, b) => a.port - b.port)
}

/** Ports currently claimed by managed runs or containers (conflict warnings, FR-14). */
export async function claimedPorts(): Promise<Set<number>> {
  return new Set((await getPortMap()).map((o) => o.port))
}
