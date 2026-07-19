import {useCallback, useEffect, useMemo, useState} from 'react';
import {useQueries, useQuery, useQueryClient} from '@tanstack/react-query';
import type {ActionWithRun, ContainerInfo, ProjectTree, RunStatus} from '@control/shared';
import {isActiveStatus} from '@control/shared';
import {api} from '../api.js';
import {
  BacklitButton,
  Chip,
  ControlStrip,
  Led,
  Panel,
  ProjectModule,
  SegmentCounter,
  Sparkline,
  TerminalScreen,
  statusLabel,
  type ControlStripNotification,
  type ProjectService,
} from '../components/kit.js';
import {AddProjectDialog} from '../components/AddProjectDialog.js';

function containerLed(c: ContainerInfo): RunStatus | 'idle' {
  if (c.state !== 'running') return 'idle';
  if (c.health === 'unhealthy') return 'unhealthy';
  if (c.health === 'starting') return 'starting';
  return 'healthy';
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function placeholderMetrics(id: string, activeCount: number) {
  const h = hashId(id);
  const base = 12 + (h % 18) + activeCount * 7;
  return {
    cpu: Math.min(92, base + ((h >> 3) % 14)),
    mem: Math.min(88, base - 4 + ((h >> 5) % 16)),
    disk: Math.min(75, 18 + ((h >> 7) % 28)),
  };
}

function sparkSeries(seed: number, points: number, level: number) {
  const out: number[] = [];
  let v = level;
  for (let i = 0; i < points; i++) {
    v += ((seed + i * 17) % 11) - 5;
    v = Math.max(5, Math.min(95, v));
    out.push(v);
  }
  return out;
}

type LogRow = {
  id: string;
  project: string;
  name: string;
  status: RunStatus | 'idle';
  ports: number[];
  kind: 'run' | 'container' | 'external';
};

export function Dashboard({
  projectsOnly,
  onOpenProject,
  onOpenRun,
  onOpenContainer,
}: {
  projectsOnly?: boolean;
  onOpenProject: (id: string) => void;
  onOpenRun: (runId: string) => void;
  onOpenContainer: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [clearedLogs, setClearedLogs] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  const projects = useQuery({queryKey: ['projects'], queryFn: api.listProjects});
  const health = useQuery({queryKey: ['health'], queryFn: api.health, refetchInterval: 5000});
  const containersQ = useQuery({
    queryKey: ['containers'],
    queryFn: api.containers,
    refetchInterval: 4000,
  });
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
  const favorites = allActions.filter((a) => a.action.favorite);
  const activeRuns = allActions.filter((a) => a.action.activeRun);
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

  const projectName = (id: string | null) =>
    id ? projects.data?.find((p) => p.id === id)?.name ?? null : null;

  const totalActive = activeRuns.length + runningContainers.length + externalServices.length;
  const masterOn = totalActive > 0;

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({queryKey: ['tree']});
    qc.invalidateQueries({queryKey: ['projects']});
    qc.invalidateQueries({queryKey: ['runs']});
    qc.invalidateQueries({queryKey: ['containers']});
    qc.invalidateQueries({queryKey: ['ports']});
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

  const sparkCpu = useMemo(
    () => sparkSeries(tick, 16, 20 + counts.running * 6 + counts.starting * 3),
    [tick, counts.running, counts.starting]
  );
  const sparkMem = useMemo(
    () => sparkSeries(tick + 7, 16, 30 + counts.running * 4),
    [tick, counts.running]
  );
  const sparkDisk = useMemo(
    () => sparkSeries(tick + 13, 16, 22 + counts.running * 2),
    [tick, counts.running]
  );

  const logRows: LogRow[] = useMemo(() => {
    const rows: LogRow[] = [];
    for (const {tree, action} of activeRuns) {
      rows.push({
        id: `run-${action.activeRun!.id}`,
        project: tree.name,
        name: action.name,
        status: action.activeRun!.status,
        ports: action.activeRun!.ports,
        kind: 'run',
      });
    }
    for (const c of runningContainers) {
      rows.push({
        id: `ctr-${c.id}`,
        project: projectName(c.projectId) ?? 'docker',
        name: c.composeService ?? c.name,
        status: containerLed(c),
        ports: c.ports.filter((p) => p.publicPort != null).map((p) => p.publicPort!),
        kind: 'container',
      });
    }
    for (const o of externalServices) {
      rows.push({
        id: `ext-${o.port}`,
        project: projectName(o.projectId ?? null) ?? 'external',
        name: o.processName ?? 'process',
        status: 'running',
        ports: [o.port],
        kind: 'external',
      });
    }
    return rows.filter((r) => !clearedLogs.has(r.id));
  }, [activeRuns, runningContainers, externalServices, clearedLogs, projects.data]);

  const stopAll = useCallback(async () => {
    for (const {action} of activeRuns) {
      if (action.activeRun) await api.stopRun(action.activeRun.id);
    }
    invalidate();
  }, [activeRuns, invalidate]);

  const startFavorites = useCallback(async () => {
    const targets = favorites.length > 0 ? favorites : allActions;
    for (const {action} of targets) {
      if (!action.activeRun) await api.startAction(action.id);
    }
    invalidate();
  }, [favorites, allActions, invalidate]);

  const restartFavorites = useCallback(async () => {
    await stopAll();
    await startFavorites();
  }, [stopAll, startFavorites]);

  const toggleProject = useCallback(
    async (tree: ProjectTree) => {
      const actions = tree.modules.flatMap((m) => m.actions).filter((a) => !a.hidden);
      const targets =
        actions.filter((a) => a.favorite).length > 0 ? actions.filter((a) => a.favorite) : actions;
      const running = targets.filter((a) => a.activeRun && isActiveStatus(a.activeRun.status));
      if (running.length > 0) {
        for (const a of running) {
          if (a.activeRun) await api.stopRun(a.activeRun.id);
        }
      } else {
        for (const a of targets) {
          if (!a.activeRun) await api.startAction(a.id);
        }
      }
      invalidate();
    },
    [invalidate]
  );

  const buildServices = (tree: ProjectTree, projectId: string): ProjectService[] => {
    const services: ProjectService[] = [];
    for (const mod of tree.modules) {
      for (const action of mod.actions) {
        if (action.hidden) continue;
        if (action.activeRun && isActiveStatus(action.activeRun.status)) {
          services.push({
            name: action.name,
            status: action.activeRun.status,
            ports: action.activeRun.ports,
            pulse: action.activeRun.status === 'starting',
          });
        }
      }
    }
    for (const c of runningContainers.filter((c) => c.projectId === projectId)) {
      services.push({
        name: c.composeService ?? c.name,
        status: containerLed(c),
        ports: c.ports.filter((p) => p.publicPort != null).map((p) => p.publicPort!),
        pulse: c.health === 'starting',
      });
    }
    for (const o of externalServices.filter((o) => o.projectId === projectId)) {
      services.push({
        name: o.processName ?? 'process',
        status: 'running',
        ports: [o.port],
      });
    }
    return services;
  };

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

  const hostGauge = (base: number) => Math.min(90, base + (tick % 5));

  return (
    <div className="space-y-6">
      {!projectsOnly && (
        <>
          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <Panel title="System Status" crt>
              <div className="mb-4 text-3xl font-bold text-phosphor text-glow">
                {counts.running + counts.starting} SERVICES{' '}
                {counts.starting ? 'STARTING' : 'RUNNING'}
              </div>
              <div className="grid grid-cols-4 gap-3">
                <SegmentCounter value={counts.running} label="Running" tone="phosphor" />
                <SegmentCounter value={counts.starting} label="Starting" tone="amber" />
                <SegmentCounter value={counts.stopped} label="Stopped" tone="phosphor" />
                <SegmentCounter value={counts.failed} label="Failed" tone="danger" />
              </div>
              <div className="mt-4 border-t border-[rgba(125,252,154,0.12)] pt-3">
                <div className="font-ui mb-2 text-[10px] uppercase tracking-[0.2em] text-ink-dim">
                  Resource Usage
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Sparkline data={sparkCpu} label="CPU" unit="%" />
                  <Sparkline data={sparkMem} label="Memory" unit="%" />
                  <Sparkline data={sparkDisk} label="Disk" unit="%" />
                </div>
              </div>
              {activePorts.length > 0 && (
                <div className="mt-4 border-t border-[rgba(125,252,154,0.12)] pt-3">
                  <div className="font-ui mb-2 text-[10px] uppercase tracking-[0.2em] text-ink-dim">
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
            </Panel>

            <Panel
              title="Event Logs"
              crt
              footer={
                <div className="flex items-center gap-2 pt-2">
                  <BacklitButton
                    size="sm"
                    onClick={() => setClearedLogs(new Set(logRows.map((r) => r.id)))}
                  >
                    Clear
                  </BacklitButton>
                  <span className="flex items-center gap-2">
                    <Led status="healthy" ring /> INFO
                    <Led status="starting" ring /> WARN
                    <Led status="failed" ring /> ERROR
                  </span>
                </div>
              }
            >
              {logRows.length === 0 ? (
                <p className="text-ink-faint">No active events.</p>
              ) : (
                <table className="w-full text-left">
                  <tbody>
                    {logRows.map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-b border-panel-edge/50 hover:bg-phosphor/4"
                        onClick={() => {
                          if (row.kind === 'run') onOpenRun(row.id.replace('run-', ''));
                          else if (row.kind === 'container')
                            onOpenContainer(row.id.replace('ctr-', ''));
                        }}
                      >
                        <td className="py-1 pr-3 text-ink-faint">
                          {new Date().toLocaleTimeString()}
                        </td>
                        <td className="py-1 pr-3 text-ink-dim">{row.project}</td>
                        <td className="py-1 pr-3">{row.name}</td>
                        <td className="py-1 pr-3">
                          <span
                            style={{
                              color:
                                row.status === 'failed' || row.status === 'unhealthy'
                                  ? 'var(--color-danger)'
                                  : row.status === 'starting'
                                  ? 'var(--color-amber)'
                                  : 'var(--color-phosphor)',
                            }}
                          >
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td className="py-1">
                          {row.ports.map((p) => (
                            <span key={p} className="mr-1 text-info">
                              :{p}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>

          <ControlStrip
            masterOn={masterOn}
            onMasterToggle={() => {
              if (masterOn) void stopAll();
            }}
            actions={[
              {label: 'Start All', tone: 'phosphor', onClick: () => void startFavorites()},
              {label: 'Stop All', tone: 'danger', onClick: () => void stopAll()},
              {label: 'Restart All', tone: 'amber', onClick: () => void restartFavorites()},
              {label: 'Health Check', onClick: () => invalidate()},
            ]}
            gauges={[
              {label: 'CPU', value: hostGauge(18 + counts.running * 5)},
              {label: 'Memory', value: hostGauge(28 + counts.running * 4)},
              {label: 'Disk', value: hostGauge(22 + counts.running * 2)},
            ]}
            notifications={notifications}
            version={health.data?.version}
            network={{up: '—', down: '—'}}
          />
        </>
      )}

      <div>
        <h2 className="font-ui mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-dim">
          Projects
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
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

            return (
              <ProjectModule
                key={p.id}
                name={p.name}
                path={p.rootPath}
                favorite={p.favorite}
                on={activeCount > 0}
                busy={anyStarting}
                onClick={() => onOpenProject(p.id)}
                onToggle={tree ? () => void toggleProject(tree) : undefined}
                services={tree ? buildServices(tree, p.id) : []}
                metrics={placeholderMetrics(p.id, activeCount)}
              />
            );
          })}

          <ProjectModule variant="add" onClick={() => setAdding(true)} />
        </div>
      </div>

      {adding && <AddProjectDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
