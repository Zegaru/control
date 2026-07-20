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
import {SettingsView} from './views/SettingsView.js';
import {RunDrawer} from './components/RunDrawer.js';
import {ContainerDrawer} from './components/ContainerDrawer.js';
import {CommandPalette} from './components/CommandPalette.js';

export type View =
  | {kind: 'overview'}
  | {kind: 'project'; projectId: string}
  | {kind: 'groups'}
  | {kind: 'docker'}
  | {kind: 'ports'}
  | {kind: 'settings'};

const NAV: {key: Exclude<View['kind'], 'project'>; label: string; icon: string}[] = [
  {key: 'overview', label: 'Overview', icon: '▦'},
  {key: 'groups', label: 'Groups', icon: '⧉'},
  {key: 'docker', label: 'Docker', icon: '⬢'},
  {key: 'ports', label: 'Ports', icon: '⊟'},
  {key: 'settings', label: 'Settings', icon: '⚙'},
];

export function App() {
  const [view, setView] = useState<View>({kind: 'overview'});
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [runDrawerOpen, setRunDrawerOpen] = useState(false);
  const [openContainerId, setOpenContainerId] = useState<string | null>(null);
  const [containerDrawerOpen, setContainerDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openRun = (id: string) => {
    setOpenRunId(id);
    setRunDrawerOpen(true);
  };

  const openContainer = (id: string) => {
    setOpenContainerId(id);
    setContainerDrawerOpen(true);
  };

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

            <nav className="nav-bank" aria-label="Main">
              {NAV.map((item) => {
                const active =
                  view.kind === item.key || (item.key === 'overview' && view.kind === 'project');
                return (
                  <NavItem
                    key={item.key}
                    icon={item.icon}
                    label={item.label}
                    active={active}
                    onClick={() => setView({kind: item.key})}
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

          <main
            className={`flex-1 min-h-0 pl-2 pr-1 ${view.kind === 'project' ? 'overflow-hidden' : 'overflow-y-auto'}`}
          >
            {!daemonUp && (
              <div className="mb-4 rounded-md border border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
                Cannot reach the CONTROL daemon. Start it with <code>pnpm dev:daemon</code>.
              </div>
            )}

            {view.kind === 'overview' && (
              <Dashboard
                onOpenProject={(projectId) => setView({kind: 'project', projectId})}
                onOpenRun={openRun}
                onOpenContainer={openContainer}
              />
            )}
            {view.kind === 'project' && (
              <ProjectDetail
                projectId={view.projectId}
                onBack={() => setView({kind: 'overview'})}
                onOpenRun={openRun}
              />
            )}
            {view.kind === 'groups' && <GroupsView />}
            {view.kind === 'docker' && <DockerView onOpenContainer={openContainer} />}
            {view.kind === 'ports' && <PortsView onOpenRun={openRun} />}
            {view.kind === 'settings' && <SettingsView />}
          </main>

          {openRunId && (
            <RunDrawer
              open={runDrawerOpen}
              runId={openRunId}
              onOpenChange={setRunDrawerOpen}
              onOpenChangeComplete={(isOpen) => {
                if (!isOpen) setOpenRunId(null);
              }}
            />
          )}
          {openContainerId && (
            <ContainerDrawer
              open={containerDrawerOpen}
              containerId={openContainerId}
              onOpenChange={setContainerDrawerOpen}
              onOpenChangeComplete={(isOpen) => {
                if (!isOpen) setOpenContainerId(null);
              }}
            />
          )}
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </div>
      </div>
    </SocketProvider>
  );
}
