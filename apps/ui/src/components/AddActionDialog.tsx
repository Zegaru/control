import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, formatApiError } from '../api.js'
import { Button, Modal, TextInput } from './ui.js'

export function AddActionDialog({
  open,
  onOpenChange,
  moduleId,
  projectId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  moduleId?: string
  projectId?: string
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
      onOpenChange(false)
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add Command" className="w-[560px] p-5">
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
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
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
    </Modal>
  )
}
