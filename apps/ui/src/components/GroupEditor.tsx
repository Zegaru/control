import { useState } from 'react'
import type { Group, GroupStep } from '@control/shared'
import { api } from '../api.js'
import { useAllActions } from '../useAllActions.js'

const WAIT_OPTIONS: GroupStep['waitFor'][] = ['none', 'healthy', 'exit']

export function GroupEditor({
  group,
  onClose,
  onSaved,
}: {
  group: Group | null
  onClose: () => void
  onSaved: () => void
}) {
  const { actions } = useAllActions()
  const [name, setName] = useState(group?.name ?? '')
  const [steps, setSteps] = useState<GroupStep[]>(group?.steps ?? [])
  const [busy, setBusy] = useState(false)

  const addStep = (actionId: string) => {
    if (!actionId) return
    setSteps((s) => [...s, { actionId, waitFor: 'none' }])
  }
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i))
  const setWait = (i: number, waitFor: GroupStep['waitFor']) =>
    setSteps((s) => s.map((step, idx) => (idx === i ? { ...step, waitFor } : step)))
  const move = (i: number, dir: -1 | 1) =>
    setSteps((s) => {
      const j = i + dir
      if (j < 0 || j >= s.length) return s
      const copy = [...s]
      ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
      return copy
    })

  const save = async () => {
    if (!name.trim() || steps.length === 0) return
    setBusy(true)
    try {
      if (group) await api.updateGroup(group.id, { name: name.trim(), steps })
      else await api.createGroup({ name: name.trim(), steps })
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  const label = (id: string) => {
    const fa = actions.find((a) => a.action.id === id)
    return fa ? `${fa.projectName} / ${fa.action.name}` : id
  }
  const field =
    'rounded border border-[var(--color-panel-edge)] bg-[var(--color-bezel)] px-3 py-2 text-sm outline-none focus:border-[var(--color-phosphor-dim)]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-[600px] overflow-y-auto rounded-lg border border-[var(--color-panel-edge)] bg-[var(--color-panel-raised)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-[var(--color-ink-dim)]">
          {group ? 'Edit Group' : 'New Launch Group'}
        </h2>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs text-[var(--color-ink-dim)]">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full stack"
            className={`${field} w-full`}
          />
        </label>

        <div className="mb-2 text-xs text-[var(--color-ink-dim)]">Steps (run top to bottom)</div>
        <ol className="mb-3 space-y-2">
          {steps.map((step, i) => (
            <li
              key={`${step.actionId}-${i}`}
              className="flex items-center gap-2 rounded border border-[var(--color-panel-edge)] px-2 py-1.5"
            >
              <span className="w-5 text-right text-[var(--color-ink-faint)]">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate text-sm">{label(step.actionId)}</span>
              <select
                value={step.waitFor}
                onChange={(e) => setWait(i, e.target.value as GroupStep['waitFor'])}
                className={`${field} py-1 text-xs`}
                title="Wait condition before starting the next step"
              >
                {WAIT_OPTIONS.map((w) => (
                  <option key={w} value={w}>
                    {w === 'none' ? 'no wait' : `wait ${w}`}
                  </option>
                ))}
              </select>
              <button onClick={() => move(i, -1)} className="px-1 text-[var(--color-ink-faint)]" title="Up">
                ↑
              </button>
              <button onClick={() => move(i, 1)} className="px-1 text-[var(--color-ink-faint)]" title="Down">
                ↓
              </button>
              <button onClick={() => removeStep(i)} className="px-1 text-[var(--color-danger)]" title="Remove">
                ✕
              </button>
            </li>
          ))}
          {steps.length === 0 && (
            <li className="text-[11px] text-[var(--color-ink-faint)]">No steps yet — add one below.</li>
          )}
        </ol>

        <select
          value=""
          onChange={(e) => addStep(e.target.value)}
          className={`${field} mb-5 w-full`}
        >
          <option value="">+ Add an action…</option>
          {actions.map((fa) => (
            <option key={fa.action.id} value={fa.action.id}>
              {fa.projectName} / {fa.moduleName} / {fa.action.name}
            </option>
          ))}
        </select>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-xs text-[var(--color-ink-dim)]">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || !name.trim() || steps.length === 0}
            className="rounded border border-[var(--color-phosphor-dim)] px-4 py-1.5 text-xs font-bold text-[var(--color-phosphor)] disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save Group'}
          </button>
        </div>
      </div>
    </div>
  )
}
