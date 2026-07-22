import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api.js'
import { useAllActions } from '../useAllActions.js'
import { Led } from './kit.js'
import { Modal, TextInput } from './ui.js'

/** Ctrl/Cmd-K fuzzy launcher: type to filter actions, Enter to start/stop. */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const qc = useQueryClient()
  const { actions } = useAllActions({ enabled: open })
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

  useEffect(() => {
    if (!open) {
      setQ('')
      setSel(0)
    }
  }, [open])

  const run = async (i: number) => {
    const fa = results[i]
    if (!fa) return
    if (fa.action.activeRun) await api.stopRun(fa.action.activeRun.id)
    else await api.startAction(fa.action.id)
    qc.invalidateQueries({ queryKey: ['trees'] })
    qc.invalidateQueries({ queryKey: ['tree'] })
    qc.invalidateQueries({ queryKey: ['runs'] })
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      variant="palette"
      className="w-[600px] overflow-hidden"
    >
      <TextInput
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, results.length - 1))
          else if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0))
          else if (e.key === 'Enter') void run(sel)
        }}
        placeholder="Start a command…  (e.g. my-app web)"
        className="rounded-none border-0 border-b border-panel-edge bg-transparent px-4 py-3 focus:border-phosphor-dim"
      />
      <ul className="max-h-[50vh] overflow-y-auto">
        {results.map((fa, i) => (
          <li
            key={fa.action.id}
            onMouseEnter={() => setSel(i)}
            onClick={() => run(i)}
            className={`flex items-center gap-3 px-4 py-2 text-sm ${
              i === sel ? 'bg-panel' : ''
            }`}
          >
            <Led status={fa.action.activeRun?.status ?? 'idle'} />
            <span className="text-ink-faint">{fa.projectName} /</span>
            <span>{fa.action.name}</span>
            <span className="ml-auto text-[10px] uppercase tracking-wider text-ink-faint">
              {fa.action.activeRun ? 'stop' : 'start'}
            </span>
          </li>
        ))}
        {results.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-ink-faint">No matches.</li>
        )}
      </ul>
    </Modal>
  )
}
