import {useEffect, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import type {ContainerHealth, ContainerInfo, ContainerState} from '@control/shared';
import {api} from '../api.js';
import {Chip, Led, Panel, Button, RockerToggle} from '../components/kit.js';

function dockerLed(state: ContainerState, health: ContainerHealth) {
  if (state !== 'running') return 'idle';
  if (health === 'unhealthy') return 'unhealthy';
  if (health === 'starting') return 'starting';
  return 'healthy';
}

export function DockerView({onOpenContainer}: {onOpenContainer: (id: string) => void}) {
  const [pending, setPending] = useState<'start' | 'stop' | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);

  const busy = pending != null;
  const status = useQuery({
    queryKey: ['docker-status'],
    queryFn: api.dockerStatus,
    refetchInterval: busy ? 2000 : 5000,
  });
  const available = status.data?.available ?? false;
  const containers = useQuery({
    queryKey: ['containers'],
    queryFn: api.containers,
    refetchInterval: 4000,
    enabled: available,
  });
  const projects = useQuery({queryKey: ['projects'], queryFn: api.listProjects});

  useEffect(() => {
    if (pending === 'start' && available) setPending(null);
    if (pending === 'stop' && status.data && !available) setPending(null);
  }, [available, pending, status.data]);

  const toggleDocker = () => {
    if (busy) return;
    const next = available ? 'stop' : 'start';
    setPending(next);
    setEngineError(null);
    const action = next === 'start' ? api.startDocker() : api.stopDocker();
    void action
      .then(() => status.refetch())
      .catch((err: unknown) => {
        setEngineError(err instanceof Error ? err.message : String(err));
        setPending(null);
      });
  };

  const list = containers.data ?? [];
  // Group by mapped project; unmatched containers go into "Other".
  const groups = new Map<string, ContainerInfo[]>();
  for (const c of list) {
    const key = c.projectId ?? '__other__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  const nameFor = (id: string) =>
    id === '__other__' ? 'Other / unmapped' : projects.data?.find((p) => p.id === id)?.name ?? id;

  const engineLed =
    pending === 'start'
      ? 'starting'
      : pending === 'stop'
        ? 'starting'
        : available
          ? 'healthy'
          : 'failed';
  const engineLabel =
    pending === 'start'
      ? 'Starting'
      : pending === 'stop'
        ? 'Stopping'
        : available
          ? 'Online'
          : 'Offline';
  const engineHint =
    pending === 'start'
      ? 'Waiting for engine pipe'
      : pending === 'stop'
        ? 'Quitting Docker Desktop'
        : available
          ? 'Engine reachable'
          : 'No connection to Docker Desktop';

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">Docker</h1>
        {available ? (
          <>
            <Chip tone="phosphor">{list.filter((c) => c.state === 'running').length} running</Chip>
            <Chip>{list.length} total</Chip>
          </>
        ) : (
          status.data && (
            <Chip tone="amber">{pending === 'start' ? 'Starting' : 'Offline'}</Chip>
          )
        )}
      </div>

      <Panel title="Docker Engine">
        <div className="flex flex-col gap-5 pt-1">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Led status={engineLed} pulse={busy} ring={available || busy} />
              <div>
                <div className="font-ui text-[13px] font-semibold uppercase tracking-[0.14em] text-ink">
                  {engineLabel}
                </div>
                <div className="mt-0.5 font-ui text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                  {engineHint}
                </div>
              </div>
            </div>
            <RockerToggle on={available} busy={busy} disabled={busy} onToggle={toggleDocker} />
          </div>

          {!available && status.data && (
            <>
              <div className="bezel-recessed rounded-md border border-panel-edge/60 px-3.5 py-3">
                <div className="font-ui text-[9px] uppercase tracking-[0.22em] text-ink-faint">
                  Fault
                </div>
                <code className="mt-1.5 block break-all font-mono text-[11px] leading-relaxed text-amber">
                  {status.data.error}
                </code>
              </div>

              <p className="text-sm leading-relaxed text-ink-dim">
                {pending === 'start'
                  ? 'Docker Desktop is launching — the engine can take up to a minute to come online.'
                  : 'Flip the rocker to start Docker Desktop. Flip it off to quit. Remote engines (DOCKER_HOST) cannot be started or stopped from here.'}
              </p>
            </>
          )}

          {engineError && (
            <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {engineError}
            </p>
          )}
        </div>
      </Panel>

      {available && list.length === 0 && (
        <Panel>
          <p className="py-6 text-center text-sm text-ink-faint">No containers.</p>
        </Panel>
      )}

      {available &&
        [...groups.entries()].map(([key, cs]) => (
          <Panel key={key} title={nameFor(key)}>
            <div className="space-y-2">
              {cs.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-md border border-panel-edge bg-panel px-3 py-2"
                >
                  <Led status={dockerLed(c.state, c.health)} pulse={c.health === 'starting'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm">{c.composeService ?? c.name}</span>
                      {c.health !== 'none' && (
                        <Chip tone={c.health === 'healthy' ? 'phosphor' : 'amber'}>{c.health}</Chip>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-ink-faint">
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
                          className="rounded border border-phosphor-dim px-2 py-0.5 text-[11px] text-phosphor"
                        >
                          :{p.publicPort}
                        </a>
                      ))}
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => onOpenContainer(c.id)}
                    className="shrink-0 rounded border border-panel-edge px-3 py-1"
                  >
                    Logs
                  </Button>
                </div>
              ))}
            </div>
          </Panel>
        ))}
    </div>
  );
}
