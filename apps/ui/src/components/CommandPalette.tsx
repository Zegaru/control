import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api.js'
import { useAllActions } from '../useAllActions.js'
import { Led } from './kit.js'

/** Ctrl/Cmd-K fuzzy launcher: type to filter actions, Enter to start/stop. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { actions } = useAllActions()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)

  const results = useMemo(() => {
    const needle = q.toLowerCase().replace(/\s+/g, '')
    const scored = actions
      .map((fa) => {
        const hay = `${fa.projectName}/${fa.moduleName}/${fa.action.name}`.toLowerCase()
        // Subsequence match (cheap fuzzy).
        let idx = 0
        for (const ch of needle) {
          idx = hay.indexOf(ch, idx)
          if (idx === -1) return null
          idx++
        }
        return fa
      })
      .filter(Boolean)
      .slice(0, 40) as typeof actions
    return scored
  }, [q, actions])

  useEffect(() => setSel(0), [q])

  const run = async (i: number) => {
    const fa = results[i]
    if (!fa) return
    if (fa.action.activeRun) await api.stopRun(fa.action.activeRun.id)
    else await api.startAction(fa.action.id)
    qc.invalidateQueries({ queryKey: ['tree'] })
    qc.invalidateQueries({ queryKey: ['runs'] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 pt-[15vh]" onClick={onClose}>
      <div
        className="w-[600px] overflow-hidden rounded-lg border border-[var(--color-panel-edge)] bg-[var(--color-panel-raised)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, results.length - 1))
            else if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0))
            else if (e.key === 'Enter') void run(sel)
            else if (e.key === 'Escape') onClose()
          }}
          placeholder="Start an action…  (e.g. ent-agi web)"
          className="w-full border-b border-[var(--color-panel-edge)] bg-transparent px-4 py-3 text-sm outline-none"
        />
        <ul className="max-h-[50vh] overflow-y-auto">
          {results.map((fa, i) => (
            <li
              key={fa.action.id}
              onMouseEnter={() => setSel(i)}
              onClick={() => run(i)}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-sm ${
                i === sel ? 'bg-[var(--color-panel)]' : ''
              }`}
            >
              <Led status={fa.action.activeRun?.status ?? 'idle'} />
              <span className="text-[var(--color-ink-faint)]">{fa.projectName} /</span>
              <span>{fa.action.name}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                {fa.action.activeRun ? 'stop' : 'start'}
              </span>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-[var(--color-ink-faint)]">No matches.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
