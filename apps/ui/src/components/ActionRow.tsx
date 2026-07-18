import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ActionWithRun } from '@control/shared'
import { api } from '../api.js'
import { Chip, Led, statusLabel } from './kit.js'
import { ActionEditor } from './ActionEditor.js'

export function ActionRow({
  action,
  onOpenRun,
  compact,
}: {
  action: ActionWithRun
  onOpenRun: (runId: string) => void
  compact?: boolean
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const run = action.activeRun
  const active = !!run
  const status = run?.status ?? 'idle'
  const busy = status === 'starting'

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tree'] })
    qc.invalidateQueries({ queryKey: ['projects'] })
    qc.invalidateQueries({ queryKey: ['runs'] })
  }

  const toggle = async () => {
    if (active && run) {
      await api.stopRun(run.id)
    } else {
      const res = await api.startAction(action.id)
      if ('error' in res && res.error === 'port_conflict') {
        const go = confirm(`Port ${res.port} is already in use (another run, container, or process). Start anyway?`)
        if (go) await api.startAction(action.id, true)
        else return
      }
    }
    invalidate()
  }

  const toggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await api.patchAction(action.id, { favorite: !action.favorite })
    invalidate()
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-[var(--color-panel-edge)] bg-[var(--color-panel)] px-3 py-2">
      {editing && <ActionEditor action={action} onClose={() => setEditing(false)} />}
      <Led status={status} pulse={busy} />
      <button
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={() => run && onOpenRun(run.id)}
        disabled={!run}
        title={action.command}
      >
        <span className="truncate text-sm text-[var(--color-ink)]">{action.name}</span>
        {action.primary && !compact && <Chip>server</Chip>}
        {action.portHint && <Chip tone={active ? 'phosphor' : 'default'}>:{action.portHint}</Chip>}
      </button>

      {!compact && (
        <span className="w-16 shrink-0 text-right text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
          {statusLabel(status)}
        </span>
      )}

      <button onClick={toggleFav} className="shrink-0 text-sm" title="Favorite">
        <span style={{ color: action.favorite ? 'var(--color-amber)' : 'var(--color-ink-faint)' }}>
          {action.favorite ? '★' : '☆'}
        </span>
      </button>

      {!compact && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setEditing(true)
          }}
          className="shrink-0 text-sm text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          title="Edit action"
        >
          ⚙
        </button>
      )}

      <button
        onClick={toggle}
        className={`shrink-0 rounded px-3 py-1 text-xs font-bold transition-colors ${
          active
            ? 'border border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10'
            : 'border border-[var(--color-phosphor-dim)] text-[var(--color-phosphor)] hover:bg-[var(--color-phosphor)]/10'
        }`}
      >
        {active ? 'STOP' : 'START'}
      </button>
    </div>
  )
}
