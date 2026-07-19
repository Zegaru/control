import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Group } from '@control/shared'
import { api } from '../api.js'
import { Led, Panel } from '../components/kit.js'
import { useAllActions } from '../useAllActions.js'
import { GroupEditor } from '../components/GroupEditor.js'

export function GroupsView() {
  const qc = useQueryClient()
  const groups = useQuery({ queryKey: ['groups'], queryFn: api.listGroups })
  const { byId } = useAllActions()
  const [editing, setEditing] = useState<Group | 'new' | null>(null)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['groups'] })
    qc.invalidateQueries({ queryKey: ['runs'] })
    qc.invalidateQueries({ queryKey: ['tree'] })
  }

  const start = async (g: Group) => {
    await api.startGroup(g.id)
    refresh()
  }
  const stop = async (g: Group) => {
    await api.stopGroup(g.id)
    refresh()
  }
  const remove = async (g: Group) => {
    if (confirm(`Delete group "${g.name}"?`)) {
      await api.deleteGroup(g.id)
      refresh()
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Launch Groups</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Start several actions in order — e.g. bring up infra, wait until it's healthy, then
            start web + worker.
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="rounded border border-phosphor-dim px-4 py-1.5 text-xs font-bold text-phosphor"
        >
          + New Group
        </button>
      </div>

      {(groups.data ?? []).length === 0 && (
        <Panel>
          <p className="py-6 text-center text-sm text-ink-faint">
            No launch groups yet.
          </p>
        </Panel>
      )}

      {(groups.data ?? []).map((g) => {
        const running = g.steps.some((s) => byId.get(s.actionId)?.action.activeRun)
        return (
          <Panel
            key={g.id}
            title={g.name}
            right={
              <div className="flex items-center gap-2">
                <button onClick={() => setEditing(g)} className="text-xs text-ink-dim">
                  Edit
                </button>
                <button onClick={() => remove(g)} className="text-xs text-danger">
                  Delete
                </button>
                <button
                  onClick={() => (running ? stop(g) : start(g))}
                  className={`rounded px-3 py-1 text-xs font-bold ${
                    running
                      ? 'border border-danger text-danger'
                      : 'border border-phosphor-dim text-phosphor'
                  }`}
                >
                  {running ? 'STOP ALL' : 'START'}
                </button>
              </div>
            }
          >
            <ol className="space-y-1">
              {g.steps.map((s, i) => {
                const fa = byId.get(s.actionId)
                return (
                  <li key={`${s.actionId}-${i}`} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-right text-ink-faint">{i + 1}.</span>
                    <Led status={fa?.action.activeRun?.status ?? 'idle'} />
                    <span>
                      {fa ? (
                        <>
                          <span className="text-ink-faint">{fa.projectName} / </span>
                          {fa.action.name}
                        </>
                      ) : (
                        <span className="text-ink-faint">missing action</span>
                      )}
                    </span>
                    {s.waitFor !== 'none' && (
                      <span className="text-[10px] uppercase tracking-wider text-amber">
                        then wait for {s.waitFor}
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          </Panel>
        )
      })}

      {editing && (
        <GroupEditor
          group={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
