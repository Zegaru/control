import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api.js'
import { Chip, Led, Panel } from '../components/kit.js'
import { ActionRow } from '../components/ActionRow.js'

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
  const tree = useQuery({ queryKey: ['tree', projectId], queryFn: () => api.projectTree(projectId) })

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

  if (!tree.data) return <div className="text-sm text-ink-dim">Loading…</div>
  const p = tree.data

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-ink-dim hover:text-ink">
          ← Projects
        </button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{p.name}</h1>
            <button onClick={() => toggleFav.mutate(!p.favorite)} title="Favorite project">
              <span className={p.favorite ? 'text-amber' : 'text-ink-faint'}>
                {p.favorite ? '★' : '☆'}
              </span>
            </button>
          </div>
          <div className="mt-1 text-[11px] text-ink-faint">{p.rootPath}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => rescan.mutate()}
            disabled={rescan.isPending}
            className="rounded border border-panel-edge px-3 py-1.5 text-xs text-ink-dim hover:text-ink"
          >
            {rescan.isPending ? 'Scanning…' : '↻ Re-scan'}
          </button>
          <button
            onClick={() => {
              if (confirm(`Remove "${p.name}" from CONTROL? This does not touch the folder.`)) remove.mutate()
            }}
            className="rounded border border-panel-edge px-3 py-1.5 text-xs text-danger"
          >
            Remove
          </button>
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
              <button
                onClick={() => setClaims.mutate((p.composeProjects ?? []).filter((x) => x !== claim))}
                className="text-ink-faint hover:text-danger"
              >
                ✕
              </button>
            </span>
          ))}
          <input
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
            className="w-40 rounded border border-panel-edge bg-bezel px-2 py-1 text-xs outline-none focus:border-phosphor-dim"
          />
        </div>
      </Panel>

      {p.modules.map((mod) => {
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
                  <button
                    onClick={() => setShowSecondary((v) => !v)}
                    className="mt-2 text-[11px] uppercase tracking-wider text-ink-faint hover:text-ink-dim"
                  >
                    {showSecondary ? '▾' : '▸'} {secondary.length} tasks (build, test, lint…)
                  </button>
                  {showSecondary &&
                    secondary.map((a) => <ActionRow key={a.id} action={a} onOpenRun={onOpenRun} />)}
                </>
              )}
            </div>
          </Panel>
        )
      })}
    </div>
  )
}
