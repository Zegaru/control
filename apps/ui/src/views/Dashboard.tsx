import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useQueries, useQuery, useQueryClient} from '@tanstack/react-query';
import type {ActionWithRun, ContainerInfo, ProjectTree, RunStatus} from '@control/shared';
import {isActiveStatus, resolveDashboardEnvironmentId} from '@control/shared';
import {api} from '../api.js';
import {
  BacklitButton,
  Chip,
  Led,
  Panel,
  RotaryKnob,
  SegmentCounter,
  Sparkline,
  statusLabel,
} from '../components/kit.js';
import {AddProjectDialog} from '../components/AddProjectDialog.js';
import {
  ControlStrip,
  type ControlStripNotification,
} from '../components/ControlStrip.js';
import {LogPanel} from '../components/LogPanel.js';
import {ProjectModule, type ProjectService} from '../components/ProjectModule.js';
import {useSocket} from '../socket.js';
import type {EventLogLevel} from '../useWs.js';

type LogFilter = 'all' | EventLogLevel;
const LOG_FILTERS: LogFilter[] = ['all', 'info', 'warn', 'error'];

function containerLed(c: ContainerInfo): RunStatus | 'idle' {
  if (c.state !== 'running') return 'idle';
  if (c.health === 'unhealthy') return 'unhealthy';
  if (c.health === 'starting') return 'starting';
  return 'healthy';
}

const EMPTY_SPARK = [0];

function projectActions(tree: ProjectTree): ActionWithRun[] {
  return tree.modules.flatMap((m) => m.actions).filter((a) => !a.hidden);
}

function buildPowerItems(tree: ProjectTree, recentRuns: Record<string, string>): ProjectService[] {
  return projectActions(tree)
    .filter((a) => a.favorite)
    .map((action) => {
      const run = action.activeRun;
      return {
        key: `action:${action.id}`,
        name: action.name,
        kind: 'action' as const,
        actionId: action.id,
        status: run?.status ?? 'idle',
        ports: run?.ports,
        pulse: run?.status === 'starting',
        runId: run?.id ?? recentRuns[action.id] ?? null,
      };
    });
}

function buildRuntimeServices(
  projectId: string,
  runningContainers: ContainerInfo[],
  externalServices: {
    projectId?: string | null
    label?: string | null
    processName?: string | null
    port: number
  }[]
): ProjectService[] {
  const services: ProjectService[] = [];
  for (const c of runningContainers.filter((c) => c.projectId === projectId)) {
    services.push({
      key: `container:${c.id}`,
      name: c.composeService ?? c.name,
      kind: 'container',
      status: containerLed(c),
      ports: c.ports.filter((p) => p.publicPort != null).map((p) => p.publicPort!),
      pulse: c.health === 'starting',
    });
  }
  for (const o of externalServices.filter((o) => o.projectId === projectId)) {
    services.push({
      key: `external:${o.port}`,
      name: o.label ?? o.processName ?? 'process',
      kind: 'container',
      status: 'running',
      ports: [o.port],
    });
  }

  return services;
}

export function Dashboard({
  onOpenProject,
  onOpenRun,
}: {
  onOpenProject: (id: string) => void;
  onOpenRun: (runId: string) => void;
}) {
  const qc = useQueryClient();
  const {events, clearEvents} = useSocket();
  const [adding, setAdding] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  /** Optimistic amber while a project toggle is in flight (esp. stop — daemon has no stopping status). */
  const [pendingToggle, setPendingToggle] = useState<Record<string, 'on' | 'off'>>({});
  const [metricHistory, setMetricHistory] = useState<{
    cpu: number[];
    mem: number[];
    disk: number[];
  }>({cpu: [], mem: [], disk: []});
  const [manualRecentRuns, setManualRecentRuns] = useState<Record<string, string>>({});
  const projectListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = projectListRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (window.matchMedia('(max-width: 1023px)').matches) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, {passive: false});
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const projects = useQuery({queryKey: ['projects'], queryFn: api.listProjects});
  const health = useQuery({queryKey: ['health'], queryFn: api.health, refetchInterval: 5000});
  const hostMetrics = useQuery({
    queryKey: ['host-metrics'],
    queryFn: api.hostMetrics,
    refetchInterval: 1500,
  });
  const projectMetrics = useQuery({
    queryKey: ['project-metrics'],
    queryFn: api.projectMetrics,
    refetchInterval: 2000,
  });
  const containersQ = useQuery({
    queryKey: ['containers'],
    queryFn: api.containers,
    refetchInterval: 4000,
  });
  const groupsQ = useQuery({queryKey: ['groups'], queryFn: api.listGroups});
  const groups = groupsQ.data ?? [];
  const containers = containersQ.data ?? [];
  const portsQ = useQuery({queryKey: ['ports'], queryFn: api.ports, refetchInterval: 4000});
  const externalServices = (portsQ.data ?? []).filter((o) => o.owner === 'external' && o.projectId);

  const trees = useQueries({
    queries: (projects.data ?? []).map((p) => ({
      queryKey: ['tree', p.id],
      queryFn: () => api.projectTree(p.id),
    })),
  });
  const treeData = trees.map((t) => t.data).filter(Boolean) as ProjectTree[];

  const allActions: {tree: ProjectTree; action: ActionWithRun}[] = [];
  for (const tree of treeData) {
    for (const mod of tree.modules) {
      for (const action of mod.actions) {
        if (!action.hidden) allActions.push({tree, action});
      }
    }
  }
  const activeRuns = allActions.filter((a) => a.action.activeRun);

  const recentRuns = useMemo(() => {
    const fromTree: Record<string, string> = {};
    for (const tree of treeData) {
      for (const action of projectActions(tree)) {
        if (action.activeRun?.id) fromTree[action.id] = action.activeRun.id;
      }
    }
    return {...manualRecentRuns, ...fromTree};
  }, [treeData, manualRecentRuns]);

  const runningContainers = containers.filter((c) => c.state === 'running');

  const counts = {
    running:
      activeRuns.filter((a) => ['running', 'healthy'].includes(a.action.activeRun!.status)).length +
      runningContainers.filter((c) => c.health === 'healthy' || c.health === 'none').length +
      externalServices.length,
    starting:
      activeRuns.filter((a) => a.action.activeRun!.status === 'starting').length +
      runningContainers.filter((c) => c.health === 'starting').length,
    stopped: allActions.filter((a) => !a.action.activeRun).length,
    failed:
      allActions.filter((a) => a.action.activeRun?.status === 'failed').length +
      runningContainers.filter((c) => c.health === 'unhealthy').length,
  };

  const totalActive = activeRuns.length + runningContainers.length + externalServices.length;
  const masterOn = totalActive > 0;

  useEffect(() => {
    const m = hostMetrics.data;
    if (!m) return;
    setMetricHistory((h) => ({
      cpu: [...h.cpu, m.cpu].slice(-16),
      mem: [...h.mem, m.memory].slice(-16),
      disk: [...h.disk, m.disk].slice(-16),
    }));
  }, [hostMetrics.data]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({queryKey: ['tree']});
    qc.invalidateQueries({queryKey: ['projects']});
    qc.invalidateQueries({queryKey: ['runs']});
    qc.invalidateQueries({queryKey: ['containers']});
    qc.invalidateQueries({queryKey: ['ports']});
    qc.invalidateQueries({queryKey: ['host-metrics']});
    qc.invalidateQueries({queryKey: ['project-metrics']});
  }, [qc]);

  const activePorts = useMemo(() => {
    const ports = new Set<number>();
    for (const {action} of activeRuns) {
      for (const p of action.activeRun!.ports) ports.add(p);
    }
    for (const c of runningContainers) {
      for (const p of c.ports) {
        if (p.publicPort != null) ports.add(p.publicPort);
      }
    }
    for (const o of externalServices) ports.add(o.port);
    return [...ports].sort((a, b) => a - b);
  }, [activeRuns, runningContainers, externalServices]);

  const sparkCpu = metricHistory.cpu.length ? metricHistory.cpu : EMPTY_SPARK;
  const sparkMem = metricHistory.mem.length ? metricHistory.mem : EMPTY_SPARK;
  const sparkDisk = metricHistory.disk.length ? metricHistory.disk : EMPTY_SPARK;

  const stopAll = useCallback(async () => {
    for (const {action} of activeRuns) {
      if (action.activeRun) await api.stopRun(action.activeRun.id);
    }
    invalidate();
  }, [activeRuns, invalidate]);

  const startFavorites = useCallback(async () => {
    for (const tree of treeData) {
      await api.startProjectPower(tree.id);
    }
    invalidate();
  }, [treeData, invalidate]);

  const restartFavorites = useCallback(async () => {
    await stopAll();
    await startFavorites();
  }, [stopAll, startFavorites]);

  const toggleProject = useCallback(
    async (tree: ProjectTree, groupList: {id: string; steps: {actionId: string}[]}[]) => {
      if (pendingToggle[tree.id]) return;

      const envId = resolveDashboardEnvironmentId(tree);
      const env = envId ? tree.environments.find((e) => e.id === envId) : undefined;
      let powerRunning = false;
      if (env?.targetType === 'action') {
        const action = tree.modules.flatMap((m) => m.actions).find((a) => a.id === env.targetId);
        powerRunning = !!(action?.activeRun && isActiveStatus(action.activeRun.status));
      } else if (env?.targetType === 'group') {
        const group = groupList.find((g) => g.id === env.targetId);
        powerRunning =
          group?.steps.some((step) => {
            const action = tree.modules
              .flatMap((m) => m.actions)
              .find((a) => a.id === step.actionId);
            return !!(action?.activeRun && isActiveStatus(action.activeRun.status));
          }) ?? false;
      } else {
        const actions = tree.modules.flatMap((m) => m.actions).filter((a) => !a.hidden);
        powerRunning = actions
          .filter((a) => a.favorite)
          .some((a) => a.activeRun && isActiveStatus(a.activeRun.status));
      }
      // Compose/infra scripts exit after `up -d`; containers still mean power ON.
      if (runningContainers.some((c) => c.projectId === tree.id)) powerRunning = true;

      const dir = powerRunning ? 'off' : 'on';
      setPendingToggle((p) => ({...p, [tree.id]: dir}));
      try {
        if (dir === 'off') await api.stopProjectPower(tree.id);
        else await api.startProjectPower(tree.id);
        invalidate();
      } catch {
        setPendingToggle((p) => {
          const {[tree.id]: _, ...rest} = p;
          return rest;
        });
      } finally {
        if (dir === 'on') {
          setPendingToggle((p) => {
            const {[tree.id]: _, ...rest} = p;
            return rest;
          });
        }
      }
    },
    [invalidate, pendingToggle, runningContainers]
  );

  // Clear stop-pending once action runs and project containers are gone.
  useEffect(() => {
    const offIds = Object.entries(pendingToggle)
      .filter(([, dir]) => dir === 'off')
      .map(([id]) => id);
    if (offIds.length === 0) return;

    const settled = offIds.filter((id) => {
      const tree = treeData.find((t) => t.id === id);
      if (!tree) return true;
      const actionsLive = tree.modules.some((m) =>
        m.actions.some((a) => a.activeRun && isActiveStatus(a.activeRun.status))
      );
      const containersLive = runningContainers.some((c) => c.projectId === id);
      return !actionsLive && !containersLive;
    });
    if (settled.length === 0) return;

    setPendingToggle((p) => {
      const next = {...p};
      for (const id of settled) delete next[id];
      return next;
    });
  }, [pendingToggle, treeData, runningContainers]);

  const toggleService = useCallback(
    async (svc: ProjectService) => {
      const active = svc.status !== 'idle' && isActiveStatus(svc.status);
      try {
        if (svc.kind === 'group' && svc.groupId) {
          if (active) await api.stopGroup(svc.groupId);
          else await api.startGroup(svc.groupId);
        } else if (svc.actionId) {
          if (active && svc.runId) await api.stopRun(svc.runId);
          else {
            const res = await api.startAction(svc.actionId);
            if (res && 'id' in res) {
              setManualRecentRuns((prev) => ({...prev, [svc.actionId!]: res.id}));
            }
          }
        }
        invalidate();
      } catch {
        /* ignore */
      }
    },
    [invalidate]
  );

  const notifications: ControlStripNotification[] = useMemo(() => {
    const items: ControlStripNotification[] = [];
    if (counts.failed > 0) {
      items.push({message: `${counts.failed} service(s) failed`, tone: 'danger', time: 'now'});
    }
    if (counts.starting > 0) {
      items.push({message: `${counts.starting} starting`, tone: 'amber', time: 'now'});
    }
    if (counts.running > 0) {
      items.push({message: `${counts.running} healthy`, tone: 'phosphor', time: 'now'});
    }
    return items.slice(0, 3);
  }, [counts]);

  const selectedEvent = events.find((e) => e.runId === selectedRunId);
  const filteredEvents = useMemo(
    () => (logFilter === 'all' ? events : events.filter((e) => e.level === logFilter)),
    [events, logFilter]
  );
  const hasLevel = useMemo(
    () => ({
      info: events.some((e) => e.level === 'info'),
      warn: events.some((e) => e.level === 'warn'),
      error: events.some((e) => e.level === 'error'),
    }),
    [events]
  );

  const gauges = [
    {label: 'CPU', value: hostMetrics.data?.cpu ?? 0},
    {label: 'Memory', value: hostMetrics.data?.memory ?? 0},
    {label: 'Disk', value: hostMetrics.data?.disk ?? 0},
  ];

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto lg:grid lg:grid-rows-[minmax(360px,1.35fr)_minmax(120px,1fr)] lg:overflow-hidden">
        <div className="grid min-w-0 grid-cols-1 gap-2 max-lg:shrink-0 lg:min-h-0 lg:grid-cols-8 lg:grid-rows-1">
          <Panel
            title="System Status"
            crt
            className="min-h-0 max-lg:h-auto lg:col-span-3 lg:h-full"
          >
            <div className="overflow-visible">
              <div className="mb-2 text-3xl font-bold text-phosphor text-glow max-lg:text-xl">
                {counts.running + counts.starting}{' '}
                {counts.running + counts.starting !== 1 ? 'SERVICES' : 'SERVICE'}{' '}
                {counts.starting ? 'STARTING' : 'RUNNING'}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <SegmentCounter value={counts.running} label="Running" tone="phosphor" />
                <SegmentCounter value={counts.starting} label="Starting" tone="amber" />
                <SegmentCounter value={counts.stopped} label="Stopped" tone="phosphor" />
                <SegmentCounter value={counts.failed} label="Failed" tone="danger" />
              </div>
              <div className="mt-2 border-t border-[rgba(125,252,154,0.12)] pt-2">
                <div className="font-ui mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-dim">
                  Resource Usage
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Sparkline data={sparkCpu} label="CPU" unit="%" />
                  <Sparkline data={sparkMem} label="Memory" unit="%" />
                  <Sparkline data={sparkDisk} label="Disk" unit="%" />
                </div>
              </div>
              {activePorts.length > 0 && (
                <div className="mt-2 border-t border-[rgba(125,252,154,0.12)] pt-2">
                  <div className="font-ui mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-dim">
                    Active Ports
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activePorts.slice(0, 6).map((p) => (
                      <Chip key={p} tone="phosphor">
                        {p}
                      </Chip>
                    ))}
                    {activePorts.length > 6 && (
                      <span className="opacity-60">
                        <Chip tone="phosphor">+{activePorts.length - 6}</Chip>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Panel
            className="min-h-0 max-lg:h-auto max-lg:min-h-[320px] lg:col-span-5 lg:h-full"
            title={
              selectedRunId && selectedEvent ? (
                <div className="flex min-w-0 items-center gap-3">
                  <BacklitButton size="sm" onClick={() => setSelectedRunId(null)}>
                    ← Back
                  </BacklitButton>
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-[10px] uppercase tracking-wider text-ink-faint">
                    <span className="shrink-0 p-1">
                      <Led
                        status={
                          selectedEvent.level === 'error'
                            ? 'failed'
                            : selectedEvent.level === 'warn'
                              ? 'starting'
                              : 'healthy'
                        }
                      />
                    </span>
                    <span className="min-w-0 truncate">
                      {selectedEvent.project} / {selectedEvent.name}
                    </span>
                    <span className="shrink-0 text-ink-dim">
                      · {statusLabel(selectedEvent.status)}
                      {selectedEvent.exitCode != null ? ` · exit ${selectedEvent.exitCode}` : ''}
                    </span>
                  </span>
                </div>
              ) : (
                'Event Logs'
              )
            }
            crt
            footer={
              <div className="flex h-10 items-center gap-2 px-2 pt-4 sm:gap-3">
                <span className="flex shrink-0 items-center gap-2 font-ui text-[10px] uppercase tracking-[0.16em] text-ink-dim sm:gap-3">
                  <span className="flex items-center gap-1.5">
                    <Led status={hasLevel.info ? 'healthy' : 'idle'} ring={hasLevel.info} />
                    <span className="max-sm:sr-only">INFO</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Led status={hasLevel.warn ? 'starting' : 'idle'} ring={hasLevel.warn} />
                    <span className="max-sm:sr-only">WARN</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Led status={hasLevel.error ? 'failed' : 'idle'} ring={hasLevel.error} />
                    <span className="max-sm:sr-only">ERROR</span>
                  </span>
                </span>

                <div className="chassis-rail mx-1 hidden min-w-0 flex-1 sm:flex" aria-hidden>
                  <span className="chassis-rail-line" />
                  <span className="chassis-rail-rivet" />
                  <span className="chassis-rail-line" />
                  <span className="chassis-rail-rivet" />
                  <span className="chassis-rail-line" />
                  <span className="chassis-rail-rivet" />
                  <span className="chassis-rail-line" />
                </div>

                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                  <RotaryKnob
                    value={LOG_FILTERS.indexOf(logFilter)}
                    steps={LOG_FILTERS.length}
                    label={logFilter}
                    disabled={!!selectedRunId}
                    onChange={(v) => setLogFilter(LOG_FILTERS[v] ?? 'all')}
                  />
                  <BacklitButton
                    size="sm"
                    disabled={!!selectedRunId}
                    onClick={() => {
                      clearEvents();
                      setSelectedRunId(null);
                    }}
                  >
                    Clear
                  </BacklitButton>
                </div>
              </div>
            }
          >
            <div className="min-h-0 flex-1 overflow-hidden max-lg:min-h-[220px]">
              <div key={selectedRunId ?? 'event-list'} className="event-panel-fade h-full min-h-0">
                {selectedRunId ? (
                  <div className="h-full overflow-hidden rounded-lg border border-[rgba(0,0,0,0.6)] bg-[#0b0d0a] p-1">
                    <LogPanel runId={selectedRunId} />
                  </div>
                ) : events.length === 0 ? (
                  <p className="text-ink-faint">No events yet.</p>
                ) : filteredEvents.length === 0 ? (
                  <p className="text-ink-faint">No {logFilter} events.</p>
                ) : (
                  <div className="h-full overflow-y-auto">
                    <ul className="divide-y divide-panel-edge/50">
                      {filteredEvents.map((row) => {
                        const tone =
                          row.level === 'error'
                            ? 'var(--color-danger)'
                            : row.level === 'warn'
                              ? 'var(--color-amber)'
                              : 'var(--color-phosphor)';
                        const time = new Date(row.at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false,
                        });
                        const statusText = `${statusLabel(row.status)}${
                          row.exitCode != null ? ` · exit ${row.exitCode}` : ''
                        }`;
                        return (
                          <li key={row.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedRunId(row.runId)}
                              className="flex w-full flex-col gap-0.5 py-2 text-left hover:bg-phosphor/4 lg:flex-row lg:items-baseline lg:gap-3 lg:py-1.5"
                            >
                              <div className="flex items-baseline justify-between gap-3 lg:contents">
                                <span className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-ink-faint lg:text-[12px]">
                                  {time}
                                </span>
                                <span
                                  className="shrink-0 whitespace-nowrap text-[11px] font-medium lg:order-4 lg:text-[12px]"
                                  style={{color: tone}}
                                >
                                  {statusText}
                                </span>
                              </div>
                              <span className="min-w-0 truncate text-[12px] lg:hidden">
                                <span className="text-ink-dim">{row.project}</span>
                                <span className="text-ink-faint"> / </span>
                                <span>{row.name}</span>
                              </span>
                              <span className="hidden min-w-0 max-w-[9rem] shrink-0 truncate text-ink-dim lg:block">
                                {row.project}
                              </span>
                              <span className="hidden min-w-0 flex-1 truncate lg:order-3 lg:block">
                                {row.name}
                              </span>
                              {row.ports.length > 0 && (
                                <span className="truncate font-mono text-[11px] text-info lg:order-5 lg:shrink-0 lg:text-[12px]">
                                  {row.ports.map((p) => `:${p}`).join(' ')}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </div>

        <div
          ref={projectListRef}
          className="flex min-w-0 gap-2 max-lg:flex-col max-lg:overflow-visible lg:min-h-0 lg:flex-row lg:overflow-x-auto lg:overflow-y-hidden"
        >
          {(projects.data ?? []).map((p) => {
            const tree = treeData.find((t) => t.id === p.id);
            const activeActions = tree
              ? tree.modules
                  .flatMap((m) => m.actions)
                  .filter((a) => a.activeRun && isActiveStatus(a.activeRun.status))
              : [];
            const projContainers = runningContainers.filter((c) => c.projectId === p.id);
            const projExternal = externalServices.filter((o) => o.projectId === p.id);
            const activeCount = activeActions.length + projContainers.length + projExternal.length;
            const anyStarting =
              activeActions.some((a) => a.activeRun!.status === 'starting') ||
              projContainers.some((c) => c.health === 'starting');
            const toggling = pendingToggle[p.id] != null;
            const busy = anyStarting || toggling;
            const pm = projectMetrics.data?.projects[p.id];
            const metrics = activeCount > 0 ? {cpu: pm?.cpu ?? 0, mem: pm?.memory ?? 0} : undefined;
            const moduleServices = tree
              ? [
                  ...buildPowerItems(tree, recentRuns),
                  ...buildRuntimeServices(p.id, runningContainers, externalServices),
                ]
              : [];

            return (
              <div
                key={p.id}
                className="flex w-full shrink-0 flex-col max-lg:h-auto max-lg:min-h-[220px] lg:w-72 lg:min-h-0 lg:self-stretch"
              >
                <ProjectModule
                  name={p.name}
                  path={p.rootPath}
                  favorite={p.favorite}
                  on={activeCount > 0}
                  busy={busy}
                  onClick={() => onOpenProject(p.id)}
                  onToggle={tree ? () => void toggleProject(tree, groups) : undefined}
                  environments={tree?.environments ?? []}
                  selectedEnvironmentId={tree?.selectedEnvironmentId ?? null}
                  defaultEnvironmentId={tree?.defaultEnvironmentId ?? null}
                  onSelectEnvironment={
                    tree
                      ? (id) => {
                          void api.patchProject(p.id, {selectedEnvironmentId: id}).then(() => {
                            qc.invalidateQueries({queryKey: ['tree', p.id]});
                          });
                        }
                      : undefined
                  }
                  services={moduleServices}
                  onOpenRun={onOpenRun}
                  onToggleService={(svc) => void toggleService(svc)}
                  metrics={metrics}
                />
              </div>
            );
          })}

          <div className="flex w-full shrink-0 flex-col max-lg:min-h-[120px] lg:w-72 lg:self-stretch">
            <ProjectModule variant="add" onClick={() => setAdding(true)} />
          </div>
        </div>
      </div>

      <ControlStrip
        masterOn={masterOn}
        onMasterToggle={() => {
          if (masterOn) void stopAll();
        }}
        actions={[
          {
            label: 'Start All',
            shortLabel: 'Start',
            tone: 'phosphor',
            onClick: () => void startFavorites(),
          },
          {
            label: 'Stop All',
            shortLabel: 'Stop',
            tone: 'danger',
            holdMs: 2000,
            disabled: !masterOn,
            onClick: () => void stopAll(),
          },
          {
            label: 'Restart All',
            shortLabel: 'Restart',
            tone: 'amber',
            holdMs: 2000,
            disabled: !masterOn,
            onClick: () => void restartFavorites(),
          },
        ]}
        gauges={gauges}
        notifications={notifications}
        version={health.data?.version}
      />

      <AddProjectDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
