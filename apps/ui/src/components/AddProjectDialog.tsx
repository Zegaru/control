import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api.js'

export function AddProjectDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!path.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.createProject(path.trim(), name.trim() || undefined)
      qc.invalidateQueries({ queryKey: ['projects'] })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add project')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[480px] rounded-lg border border-panel-edge bg-panel-raised p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-ink-dim">
          Add Project
        </h2>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-ink-dim">Folder path</span>
          <input
            autoFocus
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="C:\Users\you\Documents\Projects\my-app"
            className="w-full rounded border border-panel-edge bg-bezel px-3 py-2 text-sm outline-none focus:border-phosphor-dim"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs text-ink-dim">Name (optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="defaults to folder name"
            className="w-full rounded border border-panel-edge bg-bezel px-3 py-2 text-sm outline-none focus:border-phosphor-dim"
          />
        </label>
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-xs text-ink-dim">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !path.trim()}
            className="rounded border border-phosphor-dim px-4 py-1.5 text-xs font-bold text-phosphor disabled:opacity-40"
          >
            {busy ? 'Scanning…' : 'Add & Scan'}
          </button>
        </div>
      </div>
    </div>
  )
}
