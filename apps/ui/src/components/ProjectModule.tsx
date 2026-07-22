import type {ReactNode} from 'react';
import {isActiveStatus, type RunStatus} from '@control/shared';
import {cn} from '../lib/cn.js';
import {Button, Chip, CircularGauge, Led, RockerToggle, RotaryKnob} from './kit.js';

export type ProjectService = {
  key: string;
  name: string;
  status: RunStatus | 'idle';
  ports?: number[];
  pulse?: boolean;
  kind?: 'action' | 'group' | 'container';
  actionId?: string;
  groupId?: string;
  runId?: string | null;
};

/** Environment picker — stepped rotary knob, one position per env. */
function EnvironmentToggleBank({
  environments,
  activeId,
  showFavorites,
  favoritesActive,
  onSelect,
}: {
  environments: {id: string; name: string}[];
  activeId: string | null;
  showFavorites?: boolean;
  favoritesActive?: boolean;
  onSelect: (id: string | null) => void;
}) {
  if (environments.length <= 1) return null;

  const options = showFavorites
    ? [{id: null as string | null, name: 'Favorites'}, ...environments]
    : environments.map((e) => ({id: e.id as string | null, name: e.name}));

  const resolvedId = favoritesActive && showFavorites ? null : activeId;
  const value = Math.max(
    0,
    options.findIndex((o) => o.id === resolvedId)
  );

  if (options.length === 0) return null;

  return (
    <div
      className="flex justify-center border-b border-panel-edge px-4 py-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <RotaryKnob
        value={value}
        steps={options.length}
        onChange={(i) => onSelect(options[i]?.id ?? null)}
        label={options[value]?.name}
        size="sm"
      />
    </div>
  );
}

export function ProjectModule({
  variant = 'default',
  name,
  path,
  on,
  busy,
  onToggle,
  onClick,
  favorite,
  services = [],
  metrics,
  environments = [],
  selectedEnvironmentId = null,
  defaultEnvironmentId = null,
  onSelectEnvironment,
  onOpenRun,
  onToggleService,
  stacks = [],
  children,
}: {
  variant?: 'default' | 'add';
  name?: string;
  path?: string;
  stacks?: string[];
  on?: boolean;
  busy?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
  favorite?: boolean;
  services?: ProjectService[];
  metrics?: {cpu?: number; mem?: number; disk?: number};
  environments?: {id: string; name: string}[];
  selectedEnvironmentId?: string | null;
  defaultEnvironmentId?: string | null;
  onSelectEnvironment?: (id: string | null) => void;
  onOpenRun?: (runId: string) => void;
  onToggleService?: (service: ProjectService) => void;
  children?: ReactNode;
}) {
  if (variant === 'add') {
    return (
      <Button
        variant="ghost"
        onClick={onClick}
        className="bezel-raised flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-panel-edge text-ink-faint hover:not-data-disabled:border-phosphor-dim hover:not-data-disabled:text-phosphor"
      >
        <span className="text-3xl">+</span>
        <span className="font-ui text-[11px] uppercase tracking-wider">Add Project</span>
      </Button>
    );
  }

  const projectStatus: RunStatus | 'idle' = busy ? 'starting' : on ? 'healthy' : 'idle';
  const activeEnvironmentId = selectedEnvironmentId ?? defaultEnvironmentId ?? null;
  const favoritesActive = activeEnvironmentId === null;

  return (
    <div className="bezel-raised flex h-full min-h-0 flex-col overflow-visible rounded-lg p-1.5">
      <div className="bezel-recessed flex min-h-0 flex-1 flex-col overflow-visible rounded-md bg-bezel">
        <div className="flex shrink-0 items-start justify-between gap-2 overflow-visible border-b border-panel-edge px-2 py-2">
          <Button
            variant="ghost"
            onClick={onClick}
            aria-label={name ? `Open ${name}` : 'Open project'}
            className={cn(
              'group/header -my-0.5 min-h-0 min-w-0 flex-1 items-start justify-start rounded-sm px-2 py-2 text-left',
              'transition-[background-color,box-shadow,transform] duration-150 ease-out',
              'hover:not-data-disabled:bg-phosphor/6 hover:not-data-disabled:shadow-[inset_0_0_0_1px_rgba(125,252,154,0.14),inset_0_0_16px_rgba(125,252,154,0.05)]',
              'active:not-data-disabled:bg-phosphor/10 active:not-data-disabled:shadow-[inset_0_2px_10px_rgba(0,0,0,0.45)]'
            )}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Led status={projectStatus} pulse={busy} ring={!!on || !!busy} />
                <div className="flex min-w-0 items-center gap-2">
                  {favorite && <span className="text-amber">★</span>}
                  <span className="font-ui text-[15px] font-semibold uppercase tracking-[0.08em] leading-none text-ink transition-colors duration-150 group-hover/header:text-phosphor group-active/header:text-phosphor-dim">
                    {name}
                  </span>
                </div>
              </div>
              {path && (
                <div className="mt-1.5 truncate pl-5 text-[10px] leading-tight text-ink-faint transition-colors duration-150 group-hover/header:text-ink-dim group-active/header:text-ink-dim">
                  {path}
                </div>
              )}
              {stacks.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1 pl-5">
                  {stacks.slice(0, 2).map((stack) => (
                    <Chip key={stack}>{stack}</Chip>
                  ))}
                  {stacks.length > 2 && <Chip>+{stacks.length - 2}</Chip>}
                </div>
              )}
            </div>
          </Button>
          {onToggle != null && on != null && (
            <RockerToggle on={on} busy={busy} disabled={busy} onToggle={onToggle} />
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {environments.length > 0 && onSelectEnvironment && (
            <div className="shrink-0">
              <EnvironmentToggleBank
                environments={environments}
                activeId={activeEnvironmentId}
                showFavorites={!defaultEnvironmentId}
                favoritesActive={favoritesActive}
                onSelect={onSelectEnvironment}
              />
            </div>
          )}
          {services.length > 0 && (
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {services.map((svc) => {
                const active = svc.status !== 'idle' && isActiveStatus(svc.status);
                const canToggle = !!(svc.actionId || svc.groupId) && onToggleService;
                return (
                  <li key={svc.key} className="flex items-center gap-2 text-[12px] text-ink-dim">
                    <Led status={svc.status} pulse={svc.pulse} ring={active} />
                    <Button
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (svc.runId) onOpenRun?.(svc.runId);
                      }}
                      disabled={!svc.runId}
                      className="min-w-0 flex-1 justify-start truncate px-0 py-0 text-left hover:not-data-disabled:text-ink"
                      title={svc.kind === 'group' ? 'Open logs (first active step)' : undefined}
                    >
                      {svc.name}
                      {svc.kind === 'group' && (
                        <span className="ml-1.5 text-[9px] uppercase tracking-wider text-ink-faint">
                          group
                        </span>
                      )}
                    </Button>
                    {svc.ports && svc.ports.length > 0 && (
                      <span className="flex shrink-0 gap-1">
                        {svc.ports.map((p) => (
                          <a
                            key={p}
                            href={`http://localhost:${p}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="rounded outline-none hover:brightness-125 focus-visible:ring-1 focus-visible:ring-phosphor"
                          >
                            <Chip tone="phosphor">:{p}</Chip>
                          </a>
                        ))}
                      </span>
                    )}
                    {canToggle && (
                      <Button
                        variant={active ? 'danger' : 'primary'}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleService(svc);
                        }}
                        className="shrink-0 px-2 py-0.5 text-[9px]"
                      >
                        {active ? 'STOP' : 'START'}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {children}

          {metrics && (
            <div className="mt-auto flex shrink-0 justify-around overflow-visible border-t border-panel-edge px-2 py-3">
              {metrics.cpu != null && <CircularGauge size="sm" value={metrics.cpu} label="CPU" />}
              {metrics.mem != null && <CircularGauge size="sm" value={metrics.mem} label="MEM" />}
              {metrics.disk != null && (
                <CircularGauge size="sm" value={metrics.disk} label="DISK" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
