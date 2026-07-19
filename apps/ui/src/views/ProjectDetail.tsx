import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Environment } from '@control/shared'
import { api } from '../api.js'
import { Chip, Led, Panel, Button, TextInput } from '../components/kit.js'
import { ActionRow } from '../components/ActionRow.js'
import { AddActionDialog } from '../components/AddActionDialog.js'
import { EnvironmentEditor } from '../components/EnvironmentEditor.js'

export function ProjectDetail({
  projectId,
  onBack,
  onOpenRun,
}: {
  projectId: string
  onBack: () => void
  onOpenRun: (runId: string) => void
}) {
  const qc = useQueryClient()
  const [showSecondary, setShowSecondary] = useState(false)
  const [claimInput, setClaimInput] = useState('')
  const [addingCommand, setAddingCommand] = useState<
    { moduleId: string } | { projectId: string } | null
  >(null)
  const [editingEnv, setEditingEnv] = useState<Environment | null | 'new'>(null)
  const tree = useQuery({ queryKey: ['tree', projectId], queryFn: () => api.projectTree(projectId) })
  const groups = useQuery({ queryKey: ['groups'], queryFn: api.listGroups })

  const rescan = useMutation({
    mutationFn: () => api.scanProject(projectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tree', projectId] }),
  })
  const toggleFav = useMutation({
    mutationFn: (fav: boolean) => api.patchProject(projectId, { favorite: fav }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tree', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
  const remove = useMutation({
    mutationFn: () => api.deleteProject(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      onBack()
    },
  })
  const setClaims = useMutation({
    mutationFn: (composeProjects: string[]) => api.patchProject(projectId, { composeProjects }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tree', projectId] })
      qc.invalidateQueries({ queryKey: ['containers'] })
      qc.invalidateQueries({ queryKey: ['ports'] })
    },
  })
  const setDefaultEnv = useMutation({
    mutationFn: (defaultEnvironmentId: string | null) =>
      api.patchProject(projectId, { defaultEnvironmentId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tree', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
  const removeEnv = useMutation({
    mutationFn: (id: string) => api.deleteEnvironment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tree', projectId] }),
  })

  const invalidateTree = () => qc.invalidateQueries({ queryKey: ['tree', projectId] })

  if (!tree.data) return <div className="text-sm text-ink-dim">Loading…</div>
  const p = tree.data

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onBack} className="px-0 py-0 text-sm">
          ← Projects
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{p.name}</h1>
            <Button variant="icon" onClick={() => toggleFav.mutate(!p.favorite)} title="Favorite project">
              <span className={p.favorite ? 'text-amber' : 'text-ink-faint'}>
                {p.favorite ? '★' : '☆'}
              </span>
            </Button>
          </div>
          <div className="mt-1 text-[11px] text-ink-faint">{p.rootPath}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => rescan.mutate()}
            disabled={rescan.isPending}
            focusableWhenDisabled
            className="rounded border border-panel-edge px-3 py-1.5"
          >
            {rescan.isPending ? 'Scanning…' : '↻ Re-scan'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm(`Remove "${p.name}" from CONTROL? This does not touch the folder.`))
                remove.mutate()
            }}
            className="rounded border border-panel-edge px-3 py-1.5 text-danger hover:not-data-disabled:text-danger"
          >
            Remove
          </Button>
        </div>
      </div>

      <Panel title="Docker compose projects claimed by this project">
        <p className="mb-2 text-[11px] text-ink-faint">
          Containers with these <code>com.docker.compose.project</code> labels are attributed here.
          Useful when a repo's infra splits into multiple compose projects (CONTROL otherwise
          guesses from folder names).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {(p.composeProjects ?? []).map((claim) => (
            <span
              key={claim}
              className="inline-flex items-center gap-1 rounded border border-phosphor-dim px-2 py-0.5 text-[11px] text-phosphor"
            >
              {claim}
              <Button
                variant="icon"
                onClick={() => setClaims.mutate((p.composeProjects ?? []).filter((x) => x !== claim))}
                className="text-ink-faint hover:not-data-disabled:text-danger"
              >
                ✕
              </Button>
            </span>
          ))}
          <TextInput
            value={claimInput}
            onChange={(e) => setClaimInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && claimInput.trim()) {
                const next = [...new Set([...(p.composeProjects ?? []), claimInput.trim()])]
                setClaims.mutate(next)
                setClaimInput('')
              }
            }}
            placeholder="add label + Enter"
            className="w-40 px-2 py-1 text-xs"
          />
        </div>
      </Panel>

      <Panel title="Environments">
        <p className="mb-3 text-[11px] text-ink-faint">
          Named env + startup target for Dashboard ON. Star one as the default; override it from the
          Dashboard selector.
        </p>
        {p.environments.length === 0 ? (
          <p className="mb-3 text-sm text-ink-faint">No environments yet.</p>
        ) : (
          <div className="mb-3 space-y-2">
            {p.environments.map((env) => {
              const targetLabel =
                env.targetType === 'group'
                  ? (groups.data?.find((g) => g.id === env.targetId)?.name ?? 'launch group')
                  : p.modules.flatMap((m) => m.actions).find((a) => a.id === env.targetId)?.name ??
                    'command'
              const isDefault = p.defaultEnvironmentId === env.id
              return (
                <div
                  key={env.id}
                  className="flex items-center gap-2 rounded-md border border-panel-edge bg-panel px-3 py-2"
                >
                  <Button
                    variant="icon"
                    onClick={() => setDefaultEnv.mutate(isDefault ? null : env.id)}
                    title={isDefault ? 'Default for Dashboard' : 'Set as Dashboard default'}
                    className={isDefault ? 'text-phosphor' : 'text-ink-faint'}
                  >
                    {isDefault ? '★' : '☆'}
                  </Button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm text-ink">
                      <span>{env.name}</span>
                      {isDefault && <Chip tone="phosphor">default</Chip>}
                    </div>
                    <div className="truncate text-[10px] text-ink-faint">{targetLabel}</div>
                  </div>
                  <Button variant="ghost" onClick={() => setEditingEnv(env)} className="px-2 py-1 text-xs">
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete environment "${env.name}"?`)) removeEnv.mutate(env.id)
                    }}
                    className="px-2 py-1 text-xs text-danger hover:not-data-disabled:text-danger"
                  >
                    Delete
                  </Button>
                </div>
              )
            })}
          </div>
        )}
        <Button
          variant="ghost"
          onClick={() => setEditingEnv('new')}
          className="rounded border border-panel-edge px-3 py-1.5"
        >
          + Add environment
        </Button>
      </Panel>

      {editingEnv != null && (
        <EnvironmentEditor
          projectId={projectId}
          tree={p}
          environment={editingEnv === 'new' ? null : editingEnv}
          onClose={() => setEditingEnv(null)}
          onSaved={() => {
            setEditingEnv(null)
            invalidateTree()
          }}
        />
      )}

      {addingCommand && (
        <AddActionDialog
          {...('moduleId' in addingCommand
            ? { moduleId: addingCommand.moduleId }
            : { projectId: addingCommand.projectId })}
          onClose={() => setAddingCommand(null)}
        />
      )}

      {p.modules.length === 0 ? (
        <Panel title="Commands">
          <p className="mb-3 text-sm text-ink-faint">
            No stack markers found. Add custom commands to run from this project root.
          </p>
          <Button
            variant="ghost"
            onClick={() => setAddingCommand({ projectId })}
            className="rounded border border-panel-edge px-3 py-1.5"
          >
            + Add command
          </Button>
        </Panel>
      ) : (
        p.modules.map((mod) => {
          const primary = mod.actions.filter((a) => !a.hidden && a.primary)
          const secondary = mod.actions.filter((a) => !a.hidden && !a.primary)
          return (
            <Panel
              key={mod.id}
              title={mod.relPath === '' ? `${mod.name} (root)` : mod.relPath}
              right={
                <div className="flex gap-1">
                  {mod.detectedStacks.map((s) => (
                    <Chip key={s.kind}>{s.kind}</Chip>
                  ))}
                </div>
              }
            >
              <div className="space-y-2">
                {primary.length === 0 && secondary.length === 0 && (
                  <p className="text-sm text-ink-faint">No actions detected.</p>
                )}
                {primary.map((a) => (
                  <ActionRow key={a.id} action={a} onOpenRun={onOpenRun} />
                ))}

                {secondary.length > 0 && (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => setShowSecondary((v) => !v)}
                      className="mt-2 px-0 py-0 text-[11px] uppercase tracking-wider text-ink-faint hover:not-data-disabled:text-ink-dim"
                    >
                      {showSecondary ? '▾' : '▸'} {secondary.length} tasks (build, test, lint…)
                    </Button>
                    {showSecondary &&
                      secondary.map((a) => <ActionRow key={a.id} action={a} onOpenRun={onOpenRun} />)}
                  </>
                )}

                <Button
                  variant="ghost"
                  onClick={() => setAddingCommand({ moduleId: mod.id })}
                  className="mt-2 px-0 py-0 text-[11px] uppercase tracking-wider text-ink-faint hover:not-data-disabled:text-phosphor"
                >
                  + Add command
                </Button>
              </div>
            </Panel>
          )
        })
      )}
    </div>
  )
}
