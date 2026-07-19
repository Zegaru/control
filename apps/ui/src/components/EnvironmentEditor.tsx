import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Environment, ProjectTree } from '@control/shared'
import { api, formatApiError } from '../api.js'
import { Button, Combobox, TextInput, fieldBase } from './ui.js'

type TargetOption =
  | { type: 'action'; id: string; label: string }
  | { type: 'group'; id: string; label: string }

function buildTargetOptions(
  tree: ProjectTree,
  groups: { id: string; name: string; projectId?: string | null; steps: { actionId: string }[] }[],
): { actions: TargetOption[]; projectGroups: TargetOption[] } {
  const projectActionIds = new Set(
    tree.modules.flatMap((m) => m.actions).filter((a) => !a.hidden).map((a) => a.id),
  )

  const actions: TargetOption[] = tree.modules
    .flatMap((m) => m.actions)
    .filter((a) => !a.hidden)
    .map((a) => ({ type: 'action' as const, id: a.id, label: a.name }))

  const projectGroups: TargetOption[] = groups
    .filter((g) => {
      if (g.projectId === tree.id) return true
      if (g.steps.length === 0) return false
      return g.steps.every((step) => projectActionIds.has(step.actionId))
    })
    .map((g) => ({ type: 'group' as const, id: g.id, label: g.name }))

  return { actions, projectGroups }
}

export function EnvironmentEditor({
  projectId,
  tree,
  environment,
  onClose,
  onSaved,
}: {
  projectId: string
  tree: ProjectTree
  environment: Environment | null
  onClose: () => void
  onSaved: () => void
}) {
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api.listGroups() })
  const { actions: actionOptions, projectGroups: groupOptions } = buildTargetOptions(
    tree,
    groups.data ?? [],
  )
  const options = [...actionOptions, ...groupOptions]

  const initialTarget =
    environment != null
      ? `${environment.targetType}:${environment.targetId}`
      : options[0]
        ? `${options[0].type}:${options[0].id}`
        : ''

  const [name, setName] = useState(environment?.name ?? '')
  const [envText, setEnvText] = useState(
    environment?.env
      ? Object.entries(environment.env)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n')
      : '',
  )
  const [targetKey, setTargetKey] = useState(initialTarget)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parseEnv = (): Record<string, string> => {
    const env: Record<string, string> = {}
    for (const line of envText.split('\n')) {
      const idx = line.indexOf('=')
      if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
    return env
  }

  const save = async () => {
    if (!name.trim() || !targetKey) return
    const [targetType, targetId] = targetKey.split(':') as [Environment['targetType'], string]
    if (!targetType || !targetId) return

    setBusy(true)
    setError(null)
    try {
      const body = {
        name: name.trim(),
        env: parseEnv(),
        targetType,
        targetId,
      }
      if (environment) await api.patchEnvironment(environment.id, body)
      else await api.createEnvironment(projectId, body)
      onSaved()
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const field = `${fieldBase} outline-none`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-[560px] overflow-y-auto rounded-lg border border-panel-edge bg-panel-raised p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-ink-dim">
          {environment ? 'Edit Environment' : 'Add Environment'}
        </h2>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-ink-dim">Name</span>
            <TextInput
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="dev"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-ink-dim">Startup target</span>
            {options.length === 0 ? (
              <p className="text-xs text-ink-faint">Add a command or group first.</p>
            ) : (
              <Combobox
                value={targetKey}
                onValueChange={(v) => v && setTargetKey(v)}
                placeholder="Search commands or groups…"
                emptyMessage="No matching targets."
                groups={[
                  ...(actionOptions.length > 0
                    ? [
                        {
                          label: 'Commands',
                          options: actionOptions.map((opt) => ({
                            value: `${opt.type}:${opt.id}`,
                            label: opt.label,
                          })),
                        },
                      ]
                    : []),
                  ...(groupOptions.length > 0
                    ? [
                        {
                          label: 'Launch groups',
                          options: groupOptions.map((opt) => ({
                            value: `${opt.type}:${opt.id}`,
                            label: opt.label,
                          })),
                        },
                      ]
                    : []),
                ]}
              />
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-ink-dim">Env vars (KEY=value per line)</span>
            <textarea
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              rows={4}
              placeholder={'ASPNETCORE_ENVIRONMENT=Development\nDOTNET_ENVIRONMENT=Development'}
              className={`${field} font-mono`}
            />
          </label>
        </div>

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={busy || !name.trim() || !targetKey || options.length === 0}
            focusableWhenDisabled
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
