import {useQuery} from '@tanstack/react-query';
import type {ContainerHealth, ContainerState} from '@control/shared';
import {api} from '../api.js';
import {LogPanel} from './LogPanel.js';
import {Led} from './kit.js';
import {SideDrawer} from './ui.js';

function dockerLed(state: ContainerState, health: ContainerHealth) {
  if (state !== 'running') return 'idle';
  if (health === 'unhealthy') return 'unhealthy';
  if (health === 'starting') return 'starting';
  return 'healthy';
}

export function ContainerDrawer({
  open,
  containerId,
  onOpenChange,
  onOpenChangeComplete,
}: {
  open: boolean;
  containerId: string;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
}) {
  const containers = useQuery({
    queryKey: ['containers'],
    queryFn: api.containers,
    refetchInterval: 4000,
  });
  const c = containers.data?.find((x) => x.id === containerId);

  return (
    <SideDrawer
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      title={c?.name ?? containerId.slice(0, 12)}
      header={
        <>
          <Led status={c ? dockerLed(c.state, c.health) : 'idle'} pulse={c?.health === 'starting'} />
          <span className="truncate">{c?.name ?? containerId.slice(0, 12)}</span>
          <span className="text-[10px] uppercase tracking-wider text-ink-faint">
            {c?.status ?? ''}
          </span>
          {c?.ports
            .filter((p) => p.publicPort != null)
            .map((p) => (
              <a
                key={p.publicPort}
                href={`http://localhost:${p.publicPort}`}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-phosphor-dim px-2 py-0.5 text-[11px] text-phosphor"
              >
                :{p.publicPort} ↗
              </a>
            ))}
        </>
      }
    >
      <div
        className="flex-1 overflow-hidden bg-[#0b0d0a] p-2"
        data-base-ui-swipe-ignore
      >
        <LogPanel containerId={containerId} />
      </div>
    </SideDrawer>
  );
}
