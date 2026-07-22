import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ActionWithRun } from '@control/shared'
import { api } from '../api.js'
import { statusColor, statusLabel } from './kit.js'
import { Button, Modal, TextInput } from './ui.js'

/**
 * Edit an action's command + health signals (portHint / healthUrl / env) and
 * review its recent run history. portHint lets the supervisor mark a server
 * "healthy" once the port listens; healthUrl upgrades that to a verified 2xx.
 */
export function ActionEditor({
  open,
  onOpenChange,
  action,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  action: ActionWithRun
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(action.name)
  const [command, setCommand] = useState(action.command)
  const [portHint, setPortHint] = useState(action.portHint ? String(action.portHint) : '')
  const [healthUrl, setHealthUrl] = useState(action.healthUrl ?? '')
  const [env, setEnv] = useState(
    action.envOverrides ? Object.entries(action.envOverrides).map(([k, v]) => `${k}=${v}`).join('\n') : '',
  )
  const [busy, setBusy] = useState(false)

  const history = useQuery({
    queryKey: ['action-runs', action.id],
    queryFn: () => api.actionRuns(action.id),
  })

  const save = async () => {
    setBusy(true)
    const envOverrides: Record<string, string> = {}
    for (const line of env.split('\n')) {
      const idx = line.indexOf('=')
      if (idx > 0) envOverrides[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
    try {
      await api.patchAction(action.id, {
        name: name.trim() || action.name,
        command: command.trim() || action.command,
        portHint: portHint ? Number(portHint) : null,
        healthUrl: healthUrl.trim() || null,
        envOverrides: Object.keys(envOverrides).length ? envOverrides : null,
      })
      qc.invalidateQueries({ queryKey: ['trees'] })
      qc.invalidateQueries({ queryKey: ['tree'] })
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  const field =
    'w-full rounded border border-panel-edge bg-bezel px-3 py-2 text-sm outline-none focus:border-phosphor-dim'

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Action"
      className="max-h-[85vh] w-[560px] overflow-y-auto p-5"
    >
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-ink-dim">
        Edit Action
      </h2>

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-dim">Name</span>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-dim">Command</span>
          <TextInput
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="font-mono"
          />
          {action.source === 'detected' && (
            <span className="mt-1 block text-[12px] text-ink-faint">
              Detected from the project. Your edits stay after a re-scan.
            </span>
          )}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-ink-dim">Port hint</span>
            <TextInput
              value={portHint}
              onChange={(e) => setPortHint(e.target.value.replace(/\D/g, ''))}
              placeholder="3000"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-dim">Health URL</span>
            <TextInput
              value={healthUrl}
              onChange={(e) => setHealthUrl(e.target.value)}
              placeholder="http://localhost:3000/health"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-dim">Env vars (KEY=value per line)</span>
          <textarea
            value={env}
            onChange={(e) => setEnv(e.target.value)}
            rows={3}
            className={`${field} font-mono`}
          />
        </label>
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-[12px] uppercase tracking-widest text-ink-faint">
          Recent runs
        </h3>
        {history.data && history.data.length > 0 ? (
          <div className="space-y-1">
            {history.data.map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-[12px] text-ink-dim">
                <span className="w-16 uppercase" style={{ color: statusColor(r.status) }}>
                  {statusLabel(r.status)}
                </span>
                <span>{new Date(r.startedAt).toLocaleTimeString()}</span>
                {r.exitedAt && <span>· {Math.round((r.exitedAt - r.startedAt) / 1000)}s</span>}
                {r.exitCode != null && <span>· exit {r.exitCode}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-ink-faint">No runs yet.</p>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy} focusableWhenDisabled>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Modal>
  )
}
