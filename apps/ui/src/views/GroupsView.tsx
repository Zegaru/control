import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Group } from '@control/shared'
import { api } from '../api.js'
import { Led, Panel, Button } from '../components/kit.js'
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
    <div className="space-y-2">
      <Panel title="Launch Groups" right={<Button onClick={() => setEditing('new')}>+ New Group</Button>}>
        <p className="mt-1 text-sm text-ink-dim">
          Start several actions in order — e.g. bring up infra, wait until it's healthy, then
          start web + worker.
        </p>
      </Panel>

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
                <Button variant="ghost" onClick={() => setEditing(g)} className="px-2 py-1">
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => remove(g)}
                  className="px-2 py-1 text-danger hover:not-data-disabled:text-danger"
                >
                  Delete
                </Button>
                <Button
                  variant={running ? 'danger' : 'primary'}
                  onClick={() => (running ? stop(g) : start(g))}
                  className="px-3 py-1"
                >
                  {running ? 'STOP ALL' : 'START'}
                </Button>
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
          open
          group={editing === 'new' ? null : editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
