import { useQuery } from '@tanstack/react-query'
import type { ContainerHealth, ContainerInfo, ContainerState } from '@control/shared'
import { api } from '../api.js'
import { Chip, Led, Panel } from '../components/kit.js'

function dockerLed(state: ContainerState, health: ContainerHealth) {
  if (state !== 'running') return 'idle'
  if (health === 'unhealthy') return 'unhealthy'
  if (health === 'starting') return 'starting'
  return 'healthy'
}

export function DockerView({ onOpenContainer }: { onOpenContainer: (id: string) => void }) {
  const status = useQuery({ queryKey: ['docker-status'], queryFn: api.dockerStatus, refetchInterval: 5000 })
  const containers = useQuery({
    queryKey: ['containers'],
    queryFn: api.containers,
    refetchInterval: 4000,
    enabled: status.data?.available ?? false,
  })
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects })

  if (status.data && !status.data.available) {
    return (
      <div className="max-w-2xl">
        <h1 className="mb-3 text-xl font-bold">Docker</h1>
        <Panel>
          <div className="flex items-center gap-2 text-sm text-[var(--color-amber)]">
            <Led status="failed" />
            Docker is not reachable.
          </div>
          <p className="mt-2 text-xs text-[var(--color-ink-faint)]">{status.data.error}</p>
          <p className="mt-3 text-sm text-[var(--color-ink-dim)]">
            Start Docker Desktop (or set <code>DOCKER_HOST</code>) and this view will populate
            automatically.
          </p>
        </Panel>
      </div>
    )
  }

  const list = containers.data ?? []
  // Group by mapped project; unmatched containers go into "Other".
  const groups = new Map<string, ContainerInfo[]>()
  for (const c of list) {
    const key = c.projectId ?? '__other__'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }
  const nameFor = (id: string) =>
    id === '__other__' ? 'Other / unmapped' : (projects.data?.find((p) => p.id === id)?.name ?? id)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">Docker</h1>
        <Chip tone="phosphor">{list.filter((c) => c.state === 'running').length} running</Chip>
        <Chip>{list.length} total</Chip>
      </div>

      {list.length === 0 && (
        <Panel>
          <p className="py-6 text-center text-sm text-[var(--color-ink-faint)]">No containers.</p>
        </Panel>
      )}

      {[...groups.entries()].map(([key, cs]) => (
        <Panel key={key} title={nameFor(key)}>
          <div className="space-y-2">
            {cs.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-md border border-[var(--color-panel-edge)] bg-[var(--color-panel)] px-3 py-2"
              >
                <Led status={dockerLed(c.state, c.health)} pulse={c.health === 'starting'} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm">{c.composeService ?? c.name}</span>
                    {c.health !== 'none' && (
                      <Chip tone={c.health === 'healthy' ? 'phosphor' : 'amber'}>{c.health}</Chip>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-[var(--color-ink-faint)]">
                    {c.image} · {c.status}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {c.ports
                    .filter((p) => p.publicPort != null)
                    .map((p) => (
                      <a
                        key={`${p.publicPort}/${p.protocol}`}
                        href={`http://localhost:${p.publicPort}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border border-[var(--color-phosphor-dim)] px-2 py-0.5 text-[11px] text-[var(--color-phosphor)]"
                      >
                        :{p.publicPort}
                      </a>
                    ))}
                </div>
                <button
                  onClick={() => onOpenContainer(c.id)}
                  className="shrink-0 rounded border border-[var(--color-panel-edge)] px-3 py-1 text-xs text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
                >
                  Logs
                </button>
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  )
}
