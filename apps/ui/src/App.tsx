import {useEffect, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api} from './api.js';
import {SocketProvider} from './socket.js';
import {AgentStatus, NavItem} from './components/kit.js';
import {Dashboard} from './views/Dashboard.js';
import {ProjectDetail} from './views/ProjectDetail.js';
import {PortsView} from './views/PortsView.js';
import {DockerView} from './views/DockerView.js';
import {GroupsView} from './views/GroupsView.js';
import {RunDrawer} from './components/RunDrawer.js';
import {ContainerDrawer} from './components/ContainerDrawer.js';
import {CommandPalette} from './components/CommandPalette.js';

export type View =
  | {kind: 'overview'}
  | {kind: 'projects'}
  | {kind: 'project'; projectId: string}
  | {kind: 'groups'}
  | {kind: 'docker'}
  | {kind: 'ports'}
  | {kind: 'settings'};

const NAV: {key: View['kind']; label: string; icon: string}[] = [
  {key: 'overview', label: 'Overview', icon: '▦'},
  {key: 'projects', label: 'Projects', icon: '▤'},
  {key: 'groups', label: 'Groups', icon: '⧉'},
  {key: 'docker', label: 'Docker', icon: '⬢'},
  {key: 'ports', label: 'Ports', icon: '⊟'},
  {key: 'settings', label: 'Settings', icon: '⚙'},
];

export function App() {
  const [view, setView] = useState<View>({kind: 'overview'});
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [openContainerId, setOpenContainerId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const health = useQuery({queryKey: ['health'], queryFn: api.health, refetchInterval: 5000});
  const daemonUp = health.isSuccess;

  return (
    <SocketProvider>
      <div className="flex h-screen w-screen p-2">
        <div className="flex h-full w-full overflow-hidden text-ink p-2 bg-panel rounded-xl">
          <aside className="bezel-raised flex w-56 shrink-0 flex-col rounded-xl bg-bezel p-4">
            <div className="mb-8 px-2 pt-1">
              <div className="font-ui text-2xl font-bold tracking-[0.18em] text-phosphor text-glow">
                CONTROL
              </div>
              <div className="font-ui mt-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                Local Dev Command Center
              </div>
            </div>

            <nav className="flex flex-col gap-1.5">
              {NAV.map((item) => {
                const active =
                  view.kind === item.key || (item.key === 'projects' && view.kind === 'project');
                return (
                  <NavItem
                    key={item.key}
                    icon={item.icon}
                    label={item.label}
                    active={active}
                    onClick={() => setView({kind: item.key} as View)}
                  />
                );
              })}
            </nav>

            <div className="mt-auto pt-4">
              <AgentStatus
                online={daemonUp}
                label={daemonUp ? `Agent v${health.data?.version}` : 'Agent Offline'}
              />
            </div>
          </aside>

          <main className="flex-1 overflow-y-auto pl-2 pr-1">
            {!daemonUp && (
              <div className="mb-4 rounded-md border border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
                Cannot reach the CONTROL daemon. Start it with <code>pnpm dev:daemon</code>.
              </div>
            )}

            {view.kind === 'overview' && (
              <Dashboard
                onOpenProject={(projectId) => setView({kind: 'project', projectId})}
                onOpenRun={setOpenRunId}
                onOpenContainer={setOpenContainerId}
              />
            )}
            {view.kind === 'projects' && (
              <Dashboard
                projectsOnly
                onOpenProject={(projectId) => setView({kind: 'project', projectId})}
                onOpenRun={setOpenRunId}
                onOpenContainer={setOpenContainerId}
              />
            )}
            {view.kind === 'project' && (
              <ProjectDetail
                projectId={view.projectId}
                onBack={() => setView({kind: 'projects'})}
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
            <ContainerDrawer
              containerId={openContainerId}
              onClose={() => setOpenContainerId(null)}
            />
          )}
          {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
        </div>
      </div>
    </SocketProvider>
  );
}

function SettingsView() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-xl font-bold">Settings</h1>
      <p className="text-sm text-ink-dim">
        Scan roots, ignore globs, log retention, and daemon port live here in a later milestone. For
        now the daemon binds <code>127.0.0.1:4400</code> and stores state in <code>~/.control</code>
        .
      </p>
    </div>
  );
}
