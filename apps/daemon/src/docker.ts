import { Writable } from 'node:stream'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import Docker from 'dockerode'
import type {
  ContainerHealth,
  ContainerInfo,
  ContainerState,
  DockerStatus,
} from '@control/shared'
import { bus } from './events.js'

/**
 * Docker bridge. Containers give us state, health, ports, and log streams for
 * free (dockerode → Engine API), so compose stacks are observed here rather
 * than supervised as host processes (DESIGN §6). CONTROL never runs
 * `docker compose up` through this file — that stays a CLI action. Stop of
 * project-attributed containers (project power OFF) goes through dockerode.
 */

let client: Docker | null = null
let lastError: string | null = null

type DockerStats = {
  cpu_stats: {
    cpu_usage: {total_usage: number}
    system_cpu_usage?: number
    online_cpus?: number
  }
  precpu_stats: {
    cpu_usage: {total_usage: number}
    system_cpu_usage?: number
  }
  memory_stats: {usage?: number; limit?: number}
}

function calcCpuPercent(stats: DockerStats): number {
  const cpu = stats.cpu_stats.cpu_usage.total_usage
  const prevCpu = stats.precpu_stats.cpu_usage.total_usage
  const sys = stats.cpu_stats.system_cpu_usage ?? 0
  const prevSys = stats.precpu_stats.system_cpu_usage ?? 0
  const cpus = stats.cpu_stats.online_cpus ?? 1
  const cpuDelta = cpu - prevCpu
  const sysDelta = sys - prevSys
  if (cpuDelta <= 0 || sysDelta <= 0) return 0
  return (cpuDelta / sysDelta) * cpus * 100
}

function getClient(): Docker {
  if (client) return client
  // dockerode auto-reads DOCKER_HOST; otherwise use the platform default
  // (Windows named pipe for Docker Desktop, unix socket elsewhere).
  if (process.env.DOCKER_HOST) {
    client = new Docker()
  } else if (process.platform === 'win32') {
    client = new Docker({ socketPath: '\\\\.\\pipe\\docker_engine' })
  } else {
    client = new Docker({ socketPath: '/var/run/docker.sock' })
  }
  return client
}

export async function getDockerStatus(): Promise<DockerStatus> {
  try {
    await getClient().ping()
    lastError = null
    return { available: true, error: null }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    return { available: false, error: lastError }
  }
}

function dockerDesktopWindowsPaths(): string[] {
  const paths: string[] = []
  for (const root of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
    if (root) paths.push(`${root}\\Docker\\Docker\\Docker Desktop.exe`)
  }
  paths.push('C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe')
  return paths
}

/**
 * Launch Docker Desktop (Windows/macOS) or `systemctl start docker` (Linux).
 * Fire-and-forget — the engine may take tens of seconds to become reachable.
 */
export async function startDockerEngine(): Promise<void> {
  const status = await getDockerStatus()
  if (status.available) return

  if (process.platform === 'win32') {
    const exe = dockerDesktopWindowsPaths().find((p) => existsSync(p))
    if (!exe) {
      throw new Error('Docker Desktop not found. Install it or set DOCKER_HOST.')
    }
    spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    return
  }

  if (process.platform === 'darwin') {
    spawn('open', ['-a', 'Docker'], { detached: true, stdio: 'ignore' }).unref()
    return
  }

  spawn('systemctl', ['start', 'docker'], { detached: true, stdio: 'ignore' }).unref()
}

function mapState(state: string): ContainerState {
  const known: ContainerState[] = [
    'created',
    'running',
    'paused',
    'restarting',
    'removing',
    'exited',
    'dead',
  ]
  return (known as string[]).includes(state) ? (state as ContainerState) : 'dead'
}

function dedupePorts(ports: ContainerInfo['ports']): ContainerInfo['ports'] {
  const seen = new Map<string, ContainerInfo['ports'][number]>()
  for (const p of ports) {
    seen.set(`${p.privatePort}/${p.publicPort}/${p.protocol}`, p)
  }
  return [...seen.values()]
}

function parseHealth(status: string): ContainerHealth {
  const s = status.toLowerCase()
  if (s.includes('(healthy)')) return 'healthy'
  if (s.includes('(unhealthy)')) return 'unhealthy'
  if (s.includes('(health: starting)') || s.includes('starting')) return 'starting'
  return 'none'
}

/**
 * List containers. `mapProject` resolves a container's compose project label to
 * a registered CONTROL project id (best-effort; unmatched → null).
 */
export async function listContainers(
  mapProject: (composeProject: string | null) => string | null,
): Promise<ContainerInfo[]> {
  let raw: Docker.ContainerInfo[]
  try {
    raw = await getClient().listContainers({ all: true })
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    return []
  }

  return raw.map((c) => {
    const composeProject = c.Labels?.['com.docker.compose.project'] ?? null
    const composeService = c.Labels?.['com.docker.compose.service'] ?? null
    return {
      id: c.Id,
      name: (c.Names?.[0] ?? c.Id).replace(/^\//, ''),
      image: c.Image,
      state: mapState(c.State),
      status: c.Status,
      health: parseHealth(c.Status),
      // Docker reports separate IPv4 (0.0.0.0) and IPv6 ([::]) bindings for the
      // same mapping — collapse them so the UI shows each port once.
      ports: dedupePorts(
        (c.Ports ?? [])
          .filter((p) => p.PrivatePort != null)
          .map((p) => ({
            privatePort: p.PrivatePort,
            publicPort: p.PublicPort ?? null,
            protocol: p.Type ?? 'tcp',
          })),
      ),
      composeProject,
      composeService,
      projectId: mapProject(composeProject),
      createdAt: c.Created * 1000,
    }
  })
}

/** Gracefully stop containers by id. Missing/already-stopped ids are ignored. */
export async function stopContainers(containerIds: string[]): Promise<void> {
  if (containerIds.length === 0) return
  const status = await getDockerStatus()
  if (!status.available) return

  await Promise.all(
    containerIds.map(async (id) => {
      try {
        await getClient().getContainer(id).stop({ t: 10 })
      } catch {
        /* already stopped or gone */
      }
    }),
  )
}

/** One-shot resource usage for running containers (CPU % host-scale, RSS bytes). */
export async function getContainerStatsBatch(
  containerIds: string[],
): Promise<Map<string, {cpu: number; memBytes: number}>> {
  const out = new Map<string, {cpu: number; memBytes: number}>()
  if (containerIds.length === 0) return out

  const status = await getDockerStatus()
  if (!status.available) return out

  await Promise.all(
    containerIds.map(async (id) => {
      try {
        const container = getClient().getContainer(id)
        const stats = (await container.stats({stream: false})) as DockerStats
        const cpu = calcCpuPercent(stats)
        const memBytes = stats.memory_stats.usage ?? 0
        out.set(id, {cpu, memBytes})
      } catch {
        /* container gone or stats unavailable */
      }
    }),
  )

  return out
}

/** Stream a container's logs (follow) to a callback. Returns a stop function. */
export async function streamContainerLogs(
  containerId: string,
  onChunk: (chunk: string) => void,
): Promise<() => void> {
  const container = getClient().getContainer(containerId)
  const info = await container.inspect()
  const tty = info.Config?.Tty ?? false

  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 500,
    timestamps: false,
  })

  const sink = new Writable({
    write(chunk, _enc, cb) {
      onChunk(chunk.toString('utf8'))
      cb()
    },
  })

  if (tty) {
    // TTY containers emit a raw byte stream — no multiplexing header.
    ;(stream as NodeJS.ReadableStream).pipe(sink)
  } else {
    // Non-TTY logs are multiplexed (8-byte stdout/stderr frame headers).
    getClient().modem.demuxStream(stream, sink, sink)
  }

  return () => {
    try {
      ;(stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.()
    } catch {
      /* ignore */
    }
  }
}

/** Subscribe to the Docker event stream and republish onto the CONTROL bus. */
export async function watchDockerEvents(): Promise<void> {
  try {
    const stream = (await getClient().getEvents()) as NodeJS.ReadableStream
    stream.on('data', (buf: Buffer) => {
      for (const line of buf.toString('utf8').split('\n')) {
        if (!line.trim()) continue
        try {
          const evt = JSON.parse(line) as { Type?: string; id?: string; status?: string }
          if (evt.Type === 'container' && evt.id) {
            bus.emitEvent({ type: 'docker.event', containerId: evt.id, status: evt.status ?? '' })
          }
        } catch {
          /* skip malformed line */
        }
      }
    })
    stream.on('error', () => {
      /* Docker went away; a later ping/list will surface the outage */
    })
  } catch {
    // Docker not running at boot — the periodic status check will retry.
  }
}
