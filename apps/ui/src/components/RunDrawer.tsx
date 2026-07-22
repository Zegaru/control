import {useQuery, useQueryClient} from '@tanstack/react-query';
import {isActiveStatus} from '@control/shared';
import {api} from '../api.js';
import {LogPanel} from './LogPanel.js';
import {Led, statusColor, statusLabel, Button} from './kit.js';
import {PortLink} from './PortLink.js';
import {SideDrawer} from './ui.js';

export function RunDrawer({
  open,
  runId,
  onOpenChange,
  onOpenChangeComplete,
}: {
  open: boolean;
  runId: string;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const active = useQuery({queryKey: ['runs'], queryFn: api.activeRuns});
  const detail = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api.getRun(runId),
    enabled: !!runId,
  });
  const run = active.data?.find((r) => r.id === runId) ?? detail.data;
  const canStop = !!run && isActiveStatus(run.status);

  const stop = async (force: boolean) => {
    await api.stopRun(runId, force);
    qc.invalidateQueries({queryKey: ['runs']});
  };

  return (
    <SideDrawer
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      title={`Run ${runId.slice(0, 12)}`}
      header={
        <>
          <Led status={run?.status ?? 'idle'} pulse={run?.status === 'starting'} />
          <span>Run {runId.slice(0, 12)}</span>
          <span
            className="text-[12px] uppercase tracking-wider"
            style={{color: statusColor(run?.status ?? 'idle')}}
          >
            {statusLabel(run?.status ?? 'idle')}
          </span>
          {run?.ports.map((p) => (
            <PortLink
              key={p}
              port={p}
              className="rounded border border-phosphor-dim px-2 py-0.5 text-[12px] text-phosphor"
            >
              :{p} ↗
            </PortLink>
          ))}
        </>
      }
      headerRight={
        canStop ? (
          <>
            <Button
              variant="ghost"
              onClick={() => stop(false)}
              className="rounded border border-panel-edge px-2 py-1"
            >
              Stop
            </Button>
            <Button variant="danger" onClick={() => stop(true)} className="px-2 py-1">
              Force Kill
            </Button>
          </>
        ) : undefined
      }
    >
      <div
        className="flex-1 overflow-hidden bg-[#0b0d0a] p-2"
        data-base-ui-swipe-ignore
      >
        <LogPanel runId={runId} />
      </div>
    </SideDrawer>
  );
}
