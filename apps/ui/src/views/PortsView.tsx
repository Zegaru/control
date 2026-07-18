import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PortOwner } from '@control/shared'
import { api } from '../api.js'
import { Chip, Panel } from '../components/kit.js'

const ownerTone = (owner: PortOwner['owner']) =>
  owner === 'run' ? 'phosphor' : owner === 'container' ? 'amber' : 'default'

export function PortsView({ onOpenRun }: { onOpenRun: (runId: string) => void }) {
  const ports = useQuery({ queryKey: ['ports'], queryFn: api.ports, refetchInterval: 3000 })
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects })
  const [showExternal, setShowExternal] = useState(true)
  const projName = (id: string | null | undefined) =>
    id ? (projects.data?.find((p) => p.id === id)?.name ?? null) : null

  const all = ports.data ?? []
  const managed = all.filter((o) => o.owner !== 'external')
  const external = all.filter((o) => o.owner === 'external')
  const rows = showExternal ? all : managed

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Port Map</h1>
        <label className="flex items-center gap-2 text-xs text-[var(--color-ink-dim)]">
          <input
            type="checkbox"
            checked={showExternal}
            onChange={(e) => setShowExternal(e.target.checked)}
          />
          Show external / system ports ({external.length})
        </label>
      </div>
      <p className="text-sm text-[var(--color-ink-dim)]">
        Every listening port attributed to a CONTROL-managed run, a Docker container, or an external
        host process. Docker-forwarded ports are attributed via the Docker API, not netstat, so WSL2
        relay processes never masquerade as the owner.
      </p>

      <div className="flex gap-2">
        <Chip tone="phosphor">{all.filter((o) => o.owner === 'run').length} runs</Chip>
        <Chip tone="amber">{all.filter((o) => o.owner === 'container').length} containers</Chip>
        <Chip>{external.length} external</Chip>
      </div>

      <Panel>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-ink-faint)]">No ports in use.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                <th className="pb-2">Port</th>
                <th className="pb-2">Owner</th>
                <th className="pb-2">Label</th>
                <th className="pb-2">PID</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={`${o.port}-${o.owner}`} className="border-t border-[var(--color-panel-edge)]">
                  <td className="py-2 font-bold text-[var(--color-phosphor)]">{o.port}</td>
                  <td className="py-2">
                    <Chip tone={ownerTone(o.owner)}>{o.owner}</Chip>
                  </td>
                  <td className="py-2">
                    {o.label ?? o.processName ?? '—'}
                    {projName(o.projectId) && (
                      <span className="ml-2 text-[11px] text-[var(--color-phosphor-dim)]">
                        · {projName(o.projectId)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-[var(--color-ink-faint)]">{o.pid ?? '—'}</td>
                  <td className="py-2 text-right">
                    <a
                      href={`http://localhost:${o.port}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mr-3 text-[var(--color-phosphor)]"
                    >
                      open ↗
                    </a>
                    {o.runId && (
                      <button onClick={() => onOpenRun(o.runId!)} className="text-[var(--color-ink-dim)]">
                        logs
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
