import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, formatApiError } from '../api.js'
import { Button, TextInput } from './ui.js'

export function AddActionDialog({
  moduleId,
  projectId,
  onClose,
}: {
  moduleId?: string
  projectId?: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [portHint, setPortHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const trimmedName = name.trim()
    const trimmedCommand = command.trim()
    if (!trimmedName || !trimmedCommand) return

    setBusy(true)
    setError(null)
    try {
      await api.createAction({
        ...(moduleId ? { moduleId } : { projectId: projectId! }),
        name: trimmedName,
        command: trimmedCommand,
        ...(portHint ? { portHint: Number(portHint) } : {}),
      })
      qc.invalidateQueries({ queryKey: ['tree'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      onClose()
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[560px] rounded-lg border border-panel-edge bg-panel-raised p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-ink-dim">
          Add Command
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
            <span className="mb-1 block text-xs text-ink-dim">Command</span>
            <TextInput
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="dotnet watch --project Slate.csproj run"
              className="font-mono"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-dim">Port hint (optional)</span>
            <TextInput
              value={portHint}
              onChange={(e) => setPortHint(e.target.value.replace(/\D/g, ''))}
              placeholder="3000"
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
            disabled={busy || !name.trim() || !command.trim()}
            focusableWhenDisabled
          >
            {busy ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </div>
    </div>
  )
}
