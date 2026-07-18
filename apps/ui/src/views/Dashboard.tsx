import { useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { ActionWithRun, ContainerInfo, ProjectTree } from '@control/shared'
import { isActiveStatus } from '@control/shared'
import { api } from '../api.js'
import { Chip, Led, Panel, SegmentCounter, statusLabel } from '../components/kit.js'
import { ActionRow } from '../components/ActionRow.js'
import { AddProjectDialog } from '../components/AddProjectDialog.js'

function containerLed(c: ContainerInfo) {
  if (c.state !== 'running') return 'idle'
  if (c.health === 'unhealthy') return 'unhealthy'
  if (c.health === 'starting') return 'starting'
  return 'healthy'
}

export function Dashboard({
  projectsOnly,
  onOpenProject,
  onOpenRun,
  onOpenContainer,
}: {
  projectsOnly?: boolean
  onOpenProject: (id: string) => void
  onOpenRun: (runId: string) => void
  onOpenContainer: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects })
  const containersQ = useQuery({
    queryKey: ['containers'],
    queryFn: api.containers,
    refetchInterval: 4000,
  })
  const containers = containersQ.data ?? []
  const portsQ = useQuery({ queryKey: ['ports'], queryFn: api.ports, refetchInterval: 4000 })
  // Dev servers started outside CONTROL, attributed to a project by process path.
  const externalServices = (portsQ.data ?? []).filter((o) => o.owner === 'external' && o.projectId)

  const trees = useQueries({
    queries: (projects.data ?? []).map((p) => ({
      queryKey: ['tree', p.id],
      queryFn: () => api.projectTree(p.id),
    })),
  })
  const treeData = trees.map((t) => t.data).filter(Boolean) as ProjectTree[]

  // Flatten actions for favorites + counts.
  const allActions: { tree: ProjectTree; action: ActionWithRun }[] = []
  for (const tree of treeData) {
    for (const mod of tree.modules) {
      for (const action of mod.actions) {
        if (!action.hidden) allActions.push({ tree, action })
      }
    }
  }
  const favorites = allActions.filter((a) => a.action.favorite)
  const activeRuns = allActions.filter((a) => a.action.activeRun)
  const runningContainers = containers.filter((c) => c.state === 'running')

  // "Running services" = managed runs + Docker containers, unified. Buckets are
  // mutually exclusive so an unhealthy container isn't also counted as running.
  const counts = {
    running:
      activeRuns.filter((a) => ['running', 'healthy'].includes(a.action.activeRun!.status)).length +
      runningContainers.filter((c) => c.health === 'healthy' || c.health === 'none').length +
      externalServices.length,
    starting:
      activeRuns.filter((a) => a.action.activeRun!.status === 'starting').length +
      runningContainers.filter((c) => c.health === 'starting').length,
    failed:
      allActions.filter((a) => a.action.activeRun?.status === 'failed').length +
      runningContainers.filter((c) => c.health === 'unhealthy').length,
  }
  const projectName = (id: string | null) =>
    id ? (projects.data?.find((p) => p.id === id)?.name ?? null) : null

  const totalActive = activeRuns.length + runningContainers.length + externalServices.length

  return (
    <div className="space-y-6">
      {!projectsOnly && (
        <>
          <div className="grid grid-cols-[1fr_1fr] gap-6">
            <Panel title="System Status" crt>
              <div className="mb-4 text-3xl font-bold text-glow" style={{ color: 'var(--color-phosphor)' }}>
                {counts.running + counts.starting} SERVICES {counts.starting ? 'STARTING' : 'RUNNING'}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <SegmentCounter value={counts.running} label="Running" tone="phosphor" />
                <SegmentCounter value={counts.starting} label="Starting" tone="amber" />
                <SegmentCounter
                  value={counts.failed}
                  label={counts.failed ? 'Failed/Unhealthy' : 'Failed'}
                  tone={counts.failed ? 'danger' : 'dim'}
                />
              </div>
            </Panel>

            <Panel title="Active Runs & Containers">
              {totalActive === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--color-ink-faint)]">
                  Nothing running. Start a favorite below.
                </p>
              ) : (
                <div className="space-y-2">
                  {activeRuns.map(({ tree, action }) => (
                    <button
                      key={action.id}
                      onClick={() => onOpenRun(action.activeRun!.id)}
                      className="flex w-full items-center gap-2 rounded border border-[var(--color-panel-edge)] px-3 py-1.5 text-left"
                    >
                      <Led status={action.activeRun!.status} pulse={action.activeRun!.status === 'starting'} />
                      <span className="text-xs text-[var(--color-ink-faint)]">{tree.name}</span>
                      <span className="text-sm">{action.name}</span>
                      <span className="ml-auto flex items-center gap-1">
                        {action.activeRun!.ports.map((p) => (
                          <Chip key={p} tone="phosphor">:{p}</Chip>
                        ))}
                        <span className="text-[10px] uppercase text-[var(--color-ink-faint)]">
                          {statusLabel(action.activeRun!.status)}
                        </span>
                      </span>
                    </button>
                  ))}
                  {runningContainers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onOpenContainer(c.id)}
                      className="flex w-full items-center gap-2 rounded border border-[var(--color-panel-edge)] px-3 py-1.5 text-left"
                    >
                      <Led status={containerLed(c)} pulse={c.health === 'starting'} />
                      <span className="text-xs text-[var(--color-ink-faint)]">
                        {projectName(c.projectId) ?? 'docker'}
                      </span>
                      <span className="text-sm">{c.composeService ?? c.name}</span>
                      <span className="ml-auto flex items-center gap-1">
                        {c.ports
                          .filter((p) => p.publicPort != null)
                          .map((p) => (
                            <Chip key={p.publicPort} tone="amber">:{p.publicPort}</Chip>
                          ))}
                        <span className="text-[10px] uppercase text-[var(--color-ink-faint)]">container</span>
                      </span>
                    </button>
                  ))}
                  {externalServices.map((o) => (
                    <a
                      key={`ext-${o.port}`}
                      href={`http://localhost:${o.port}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-full items-center gap-2 rounded border border-dashed border-[var(--color-panel-edge)] px-3 py-1.5 text-left"
                      title="Started outside CONTROL — open in browser (logs unavailable)"
                    >
                      <Led status="running" />
                      <span className="text-xs text-[var(--color-ink-faint)]">
                        {projectName(o.projectId ?? null) ?? 'external'}
                      </span>
                      <span className="text-sm">{o.processName ?? 'process'}</span>
                      <span className="ml-auto flex items-center gap-1">
                        <Chip tone="phosphor">:{o.port}</Chip>
                        <span className="text-[10px] uppercase text-[var(--color-ink-faint)]">external</span>
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {favorites.length > 0 && (
            <Panel title="Favorites">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                {favorites.map(({ tree, action }) => (
                  <div key={action.id} className="space-y-1">
                    <div className="px-1 text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                      {tree.name}
                    </div>
                    <ActionRow action={action} onOpenRun={onOpenRun} compact />
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}

      {/* Project cards */}
      <div>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-dim)]">
          Projects
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {(projects.data ?? []).map((p) => {
            const tree = treeData.find((t) => t.id === p.id)
            const activeActions = tree
              ? tree.modules.flatMap((m) => m.actions).filter((a) => a.activeRun && isActiveStatus(a.activeRun.status))
              : []
            const projContainers = runningContainers.filter((c) => c.projectId === p.id)
            const projExternal = externalServices.filter((o) => o.projectId === p.id)
            const activeCount = activeActions.length + projContainers.length + projExternal.length
            const anyStarting =
              activeActions.some((a) => a.activeRun!.status === 'starting') ||
              projContainers.some((c) => c.health === 'starting')
            const stackStatus = activeCount === 0 ? 'idle' : anyStarting ? 'starting' : 'healthy'
            return (
              <button
                key={p.id}
                onClick={() => onOpenProject(p.id)}
                className="flex flex-col rounded-lg border border-[var(--color-panel-edge)] bg-[var(--color-panel-raised)] p-4 text-left transition-colors hover:border-[var(--color-phosphor-dim)]"
              >
                <div className="flex items-center gap-2">
                  <Led status={stackStatus} pulse={anyStarting} />
                  <span className="font-semibold">{p.name}</span>
                  {p.favorite && <span style={{ color: 'var(--color-amber)' }}>★</span>}
                </div>
                <div className="mt-1 truncate text-[11px] text-[var(--color-ink-faint)]">{p.rootPath}</div>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-[var(--color-ink-dim)]">
                  <Chip tone={activeCount ? 'phosphor' : 'default'}>{activeCount} running</Chip>
                  <Chip>{p.actionCount} actions</Chip>
                  {projContainers.length > 0 && <Chip tone="amber">{projContainers.length} containers</Chip>}
                  {projExternal.length > 0 && <Chip>{projExternal.length} external</Chip>}
                </div>
              </button>
            )
          })}

          <button
            onClick={() => setAdding(true)}
            className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-panel-edge)] text-[var(--color-ink-faint)] transition-colors hover:border-[var(--color-phosphor-dim)] hover:text-[var(--color-phosphor)]"
          >
            <span className="text-2xl">+</span>
            Add Project
          </button>
        </div>
      </div>

      {adding && <AddProjectDialog onClose={() => setAdding(false)} />}
    </div>
  )
}
