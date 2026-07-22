import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import type {PortOwner} from '@control/shared';
import {api} from '../api.js';
import {Chip, Panel, Button} from '../components/kit.js';
import {cn} from '../lib/cn.js';

const ownerTone = (owner: PortOwner['owner']) =>
  owner === 'run' ? 'phosphor' : owner === 'container' ? 'amber' : 'default';

export function PortsView({onOpenRun}: {onOpenRun: (runId: string) => void}) {
  const ports = useQuery({queryKey: ['ports'], queryFn: api.ports, refetchInterval: 3000});
  const projects = useQuery({queryKey: ['projects'], queryFn: api.listProjects});
  const [showExternal, setShowExternal] = useState(true);
  const projName = (id: string | null | undefined) =>
    id ? projects.data?.find((p) => p.id === id)?.name ?? null : null;

  const all = ports.data ?? [];
  const managed = all.filter((o) => o.owner !== 'external');
  const external = all.filter((o) => o.owner === 'external');
  const rows = showExternal ? all : managed;

  return (
    <div className="max-w-3xl h-full">
      <Panel
      className="h-full flex flex-col"
        title="Port Map"
        right={
          <button
            type="button"
            role="switch"
            aria-checked={showExternal}
            onClick={() => setShowExternal((v) => !v)}
            className={cn(
              'font-ui flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em]',
              showExternal
                ? 'border-phosphor-dim/70 bg-phosphor/10 text-phosphor shadow-[0_0_12px_-4px_var(--color-phosphor)]'
                : 'border-panel-edge bg-bezel text-ink-faint'
            )}
          >
            <span
              className={cn(
                'inline-block h-1.5 w-1.5 rounded-full',
                showExternal
                  ? 'bg-phosphor shadow-[0_0_6px_var(--color-phosphor)]'
                  : 'bg-ink-faint/50'
              )}
            />
            External · {external.length}
          </button>
        }
      >
        <p className="text-sm leading-relaxed text-ink-dim">
          Listening ports attributed to a CONTROL-managed run, a Docker container, or an external
          host process. Docker-forwarded ports come from the Engine API so WSL2 relays never
          masquerade as the owner.
        </p>

        <div className="mt-3 flex flex-wrap gap-2 overflow-visible py-0.5">
          <Chip tone="phosphor">{all.filter((o) => o.owner === 'run').length} runs</Chip>
          <Chip tone="amber">{all.filter((o) => o.owner === 'container').length} containers</Chip>
          <Chip>{external.length} external</Chip>
        </div>

        <div className="mt-4 border-t border-panel-edge pt-3 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">No ports in use.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-ui text-[10px] uppercase tracking-wider text-ink-faint">
                  <th className="pb-2">Port</th>
                  <th className="pb-2">Owner</th>
                  <th className="pb-2">Label</th>
                  <th className="pb-2">PID</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={`${o.port}-${o.owner}`} className="border-t border-panel-edge">
                    <td className="py-2 font-bold text-phosphor">{o.port}</td>
                    <td className="py-2">
                      <Chip tone={ownerTone(o.owner)}>{o.owner}</Chip>
                    </td>
                    <td className="py-2">
                      {o.label ?? o.processName ?? '—'}
                      {projName(o.projectId) && (
                        <span className="ml-2 text-[11px] text-phosphor-dim">
                          · {projName(o.projectId)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 font-mono text-ink-faint">{o.pid ?? '—'}</td>
                    <td className="py-2 text-right">
                      <a
                        href={`http://localhost:${o.port}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mr-3 text-phosphor"
                      >
                        open ↗
                      </a>
                      {o.runId && (
                        <Button
                          variant="ghost"
                          onClick={() => onOpenRun(o.runId!)}
                          className="px-0 py-0 text-ink-dim"
                        >
                          logs
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>
    </div>
  );
}
