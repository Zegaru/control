import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api.js'
import { SocketProvider } from './socket.js'
import { Led } from './components/kit.js'
import { Dashboard } from './views/Dashboard.js'
import { ProjectDetail } from './views/ProjectDetail.js'
import { PortsView } from './views/PortsView.js'
import { DockerView } from './views/DockerView.js'
import { GroupsView } from './views/GroupsView.js'
import { RunDrawer } from './components/RunDrawer.js'
import { ContainerDrawer } from './components/ContainerDrawer.js'
import { CommandPalette } from './components/CommandPalette.js'

export type View =
  | { kind: 'overview' }
  | { kind: 'projects' }
  | { kind: 'project'; projectId: string }
  | { kind: 'groups' }
  | { kind: 'docker' }
  | { kind: 'ports' }
  | { kind: 'settings' }

const NAV: { key: View['kind']; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: '▦' },
  { key: 'projects', label: 'Projects', icon: '▤' },
  { key: 'groups', label: 'Groups', icon: '⧉' },
  { key: 'docker', label: 'Docker', icon: '⬢' },
  { key: 'ports', label: 'Ports', icon: '⊟' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
]

export function App() {
  const [view, setView] = useState<View>({ kind: 'overview' })
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [openContainerId, setOpenContainerId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const health = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 5000 })
  const daemonUp = health.isSuccess

  return (
    <SocketProvider>
      <div className="flex h-screen w-screen overflow-hidden text-[var(--color-ink)]">
        {/* Sidebar */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--color-panel-edge)] bg-[var(--color-panel)] p-3">
          <div className="mb-6 px-2 pt-2">
            <div className="text-2xl font-bold tracking-[0.15em] text-glow" style={{ color: 'var(--color-phosphor)' }}>
              CONTROL
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
              <Led status={daemonUp ? 'healthy' : 'failed'} />
              Local Dev Command Center
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active =
                view.kind === item.key || (item.key === 'projects' && view.kind === 'project')
              return (
                <button
                  key={item.key}
                  onClick={() => setView({ kind: item.key } as View)}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? 'bg-[var(--color-panel-raised)] text-[var(--color-phosphor)]'
                      : 'text-[var(--color-ink-dim)] hover:bg-[var(--color-panel-raised)]'
                  }`}
                >
                  <span className="w-4 text-center">{item.icon}</span>
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div className="mt-auto rounded-md border border-[var(--color-panel-edge)] p-3 text-[10px] text-[var(--color-ink-faint)]">
            <div className="flex items-center gap-1.5">
              <Led status={daemonUp ? 'running' : 'idle'} pulse={daemonUp} />
              Daemon {daemonUp ? `v${health.data?.version}` : 'offline'}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-6">
          {!daemonUp && (
            <div className="mb-4 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger)]">
              Cannot reach the CONTROL daemon. Start it with <code>pnpm dev:daemon</code>.
            </div>
          )}

          {view.kind === 'overview' && (
            <Dashboard
              onOpenProject={(projectId) => setView({ kind: 'project', projectId })}
              onOpenRun={setOpenRunId}
              onOpenContainer={setOpenContainerId}
            />
          )}
          {view.kind === 'projects' && (
            <Dashboard
              projectsOnly
              onOpenProject={(projectId) => setView({ kind: 'project', projectId })}
              onOpenRun={setOpenRunId}
              onOpenContainer={setOpenContainerId}
            />
          )}
          {view.kind === 'project' && (
            <ProjectDetail
              projectId={view.projectId}
              onBack={() => setView({ kind: 'projects' })}
              onOpenRun={setOpenRunId}
            />
          )}
          {view.kind === 'groups' && <GroupsView />}
          {view.kind === 'docker' && <DockerView onOpenContainer={setOpenContainerId} />}
          {view.kind === 'ports' && <PortsView onOpenRun={setOpenRunId} />}
          {view.kind === 'settings' && <SettingsView />}
        </main>

        {openRunId && <RunDrawer runId={openRunId} onClose={() => setOpenRunId(null)} />}
        {openContainerId && (
          <ContainerDrawer containerId={openContainerId} onClose={() => setOpenContainerId(null)} />
        )}
        {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      </div>
    </SocketProvider>
  )
}

function SettingsView() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-xl font-bold">Settings</h1>
      <p className="text-sm text-[var(--color-ink-dim)]">
        Scan roots, ignore globs, log retention, and daemon port live here in a later milestone.
        For now the daemon binds <code>127.0.0.1:4400</code> and stores state in{' '}
        <code>~/.control</code>.
      </p>
    </div>
  )
}
