import { useQuery } from '@tanstack/react-query'
import type { ContainerHealth, ContainerState } from '@control/shared'
import { api } from '../api.js'
import { LogPanel } from './LogPanel.js'
import { Led } from './kit.js'

function dockerLed(state: ContainerState, health: ContainerHealth) {
  if (state !== 'running') return 'idle'
  if (health === 'unhealthy') return 'unhealthy'
  if (health === 'starting') return 'starting'
  return 'healthy'
}

export function ContainerDrawer({ containerId, onClose }: { containerId: string; onClose: () => void }) {
  const containers = useQuery({ queryKey: ['containers'], queryFn: api.containers, refetchInterval: 4000 })
  const c = containers.data?.find((x) => x.id === containerId)

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[640px] max-w-[90vw] flex-col border-l border-[var(--color-panel-edge)] bg-[var(--color-panel)] shadow-2xl">
      <header className="flex items-center justify-between border-b border-[var(--color-panel-edge)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Led status={c ? dockerLed(c.state, c.health) : 'idle'} pulse={c?.health === 'starting'} />
          <span className="truncate text-sm font-semibold">{c?.name ?? containerId.slice(0, 12)}</span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
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
                className="rounded border border-[var(--color-phosphor-dim)] px-2 py-0.5 text-[11px] text-[var(--color-phosphor)]"
              >
                :{p.publicPort} ↗
              </a>
            ))}
        </div>
        <button onClick={onClose} className="px-2 text-lg text-[var(--color-ink-dim)]">
          ✕
        </button>
      </header>
      <div className="flex-1 overflow-hidden bg-[#0b0d0a] p-2">
        <LogPanel containerId={containerId} />
      </div>
    </div>
  )
}
