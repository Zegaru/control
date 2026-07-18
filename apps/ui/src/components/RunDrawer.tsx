import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.js'
import { LogPanel } from './LogPanel.js'
import { Led, statusLabel } from './kit.js'

export function RunDrawer({ runId, onClose }: { runId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const runs = useQuery({ queryKey: ['runs'], queryFn: api.activeRuns })
  const run = runs.data?.find((r) => r.id === runId)

  const stop = async (force: boolean) => {
    await api.stopRun(runId, force)
    qc.invalidateQueries({ queryKey: ['runs'] })
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[640px] max-w-[90vw] flex-col border-l border-[var(--color-panel-edge)] bg-[var(--color-panel)] shadow-2xl">
      <header className="flex items-center justify-between border-b border-[var(--color-panel-edge)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Led status={run?.status ?? 'idle'} pulse={run?.status === 'starting'} />
          <span className="text-sm font-semibold">Run {runId.slice(0, 12)}</span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            {statusLabel(run?.status ?? 'idle')}
          </span>
          {run?.ports.map((p) => (
            <a
              key={p}
              href={`http://localhost:${p}`}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-[var(--color-phosphor-dim)] px-2 py-0.5 text-[11px] text-[var(--color-phosphor)]"
            >
              :{p} ↗
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {run && (
            <>
              <button
                onClick={() => stop(false)}
                className="rounded border border-[var(--color-panel-edge)] px-2 py-1 text-xs text-[var(--color-ink-dim)]"
              >
                Stop
              </button>
              <button
                onClick={() => stop(true)}
                className="rounded border border-[var(--color-danger)] px-2 py-1 text-xs text-[var(--color-danger)]"
              >
                Force Kill
              </button>
            </>
          )}
          <button onClick={onClose} className="px-2 text-lg text-[var(--color-ink-dim)]">
            ✕
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-hidden bg-[#0b0d0a] p-2">
        <LogPanel runId={runId} />
      </div>
    </div>
  )
}
