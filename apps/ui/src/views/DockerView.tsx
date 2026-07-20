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
  const [launching, setLaunching] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ['docker-status'],
    queryFn: api.dockerStatus,
    refetchInterval: launching ? 2000 : 5000,
  });
  const containers = useQuery({
    queryKey: ['containers'],
    queryFn: api.containers,
    refetchInterval: 4000,
    enabled: status.data?.available ?? false,
  });
  const projects = useQuery({queryKey: ['projects'], queryFn: api.listProjects});

  useEffect(() => {
    if (status.data?.available) setLaunching(false);
  }, [status.data?.available]);

  const startDocker = () => {
    if (launching) return;
    setLaunching(true);
    setStartError(null);
    void api
      .startDocker()
      .then(() => status.refetch())
      .catch((err: unknown) => {
        setStartError(err instanceof Error ? err.message : String(err));
        setLaunching(false);
      });
  };

  if (status.data && !status.data.available) {
    return (
      <div className="max-w-xl">
        <h1 className="sr-only">Docker</h1>
        <Panel title="Docker Engine">
          <div className="flex flex-col gap-5 pt-1">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Led
                  status={launching ? 'starting' : 'failed'}
                  pulse={launching}
                  ring
                />
                <div>
                  <div className="font-ui text-[13px] font-semibold uppercase tracking-[0.14em] text-ink">
                    {launching ? 'Starting' : 'Offline'}
                  </div>
                  <div className="mt-0.5 font-ui text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                    {launching ? 'Waiting for engine pipe' : 'No connection to Docker Desktop'}
                  </div>
                </div>
              </div>
              <RockerToggle
                on={false}
                busy={launching}
                disabled={launching}
                onToggle={startDocker}
              />
            </div>

            <div className="bezel-recessed rounded-md border border-panel-edge/60 px-3.5 py-3">
              <div className="font-ui text-[9px] uppercase tracking-[0.22em] text-ink-faint">
                Fault
              </div>
              <code className="mt-1.5 block break-all font-mono text-[11px] leading-relaxed text-amber">
                {status.data.error}
              </code>
            </div>

            <p className="text-sm leading-relaxed text-ink-dim">
              {launching
                ? 'Docker Desktop is launching — the engine can take up to a minute to come online.'
                : 'Flip the rocker to start Docker Desktop. If you use a remote engine, set DOCKER_HOST instead.'}
            </p>

            {startError && (
              <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                {startError}
              </p>
            )}
          </div>
        </Panel>
      </div>
    );
  }

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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">Docker</h1>
        <Chip tone="phosphor">{list.filter((c) => c.state === 'running').length} running</Chip>
        <Chip>{list.length} total</Chip>
      </div>

      {list.length === 0 && (
        <Panel>
          <p className="py-6 text-center text-sm text-ink-faint">No containers.</p>
        </Panel>
      )}

      {[...groups.entries()].map(([key, cs]) => (
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
