import {useEffect, useRef, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api} from './api.js';
import {SocketProvider} from './socket.js';
import {AgentStatus} from './components/AgentStatus.js';
import {NavItem} from './components/kit.js';
import {WindowChrome} from './components/WindowChrome.js';
import {cn} from './lib/cn.js';
import {isTauri} from './lib/tauri.js';
import {Dashboard} from './views/Dashboard.js';
import {ProjectDetail} from './views/ProjectDetail.js';
import {PortsView} from './views/PortsView.js';
import {DockerView} from './views/DockerView.js';
import {GroupsView} from './views/GroupsView.js';
import {SettingsView} from './views/SettingsView.js';
import {RunDrawer} from './components/RunDrawer.js';
import {ContainerDrawer} from './components/ContainerDrawer.js';
import {CommandPalette} from './components/CommandPalette.js';

function DaemonBanner({show}: {show: boolean}) {
  const [mounted, setMounted] = useState(show);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (show) {
      setMounted(true);
      const id = requestAnimationFrame(() => setOpen(true));
      return () => cancelAnimationFrame(id);
    }
    setOpen(false);
    const t = window.setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(t);
  }, [show]);

  if (!mounted) return null;

  return (
    <div
      role="alert"
      className={cn(
        'mb-4 rounded-md border border-danger bg-danger/10 px-4 py-3 text-sm text-danger',
        'transition-[opacity,transform] duration-200 ease-out motion-reduce:duration-150 motion-reduce:transition-opacity',
        open ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0',
      )}
    >
      Cannot reach the CONTROL daemon. Start it with <code>pnpm dev:daemon</code>.
    </div>
  );
}

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
  const navRef = useRef<HTMLElement>(null);

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

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest('.xterm')) return;
      e.preventDefault();
    };
    window.addEventListener('contextmenu', onContextMenu);
    return () => window.removeEventListener('contextmenu', onContextMenu);
  }, []);

  useEffect(() => {
    const centerActive = () => {
      const nav = navRef.current;
      if (!nav || !window.matchMedia('(max-width: 1023px)').matches) return;
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) return;
      active.scrollIntoView({inline: 'center', block: 'nearest', behavior: 'smooth'});
    };
    const id = requestAnimationFrame(() => requestAnimationFrame(centerActive));
    window.addEventListener('resize', centerActive);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', centerActive);
    };
  }, [view]);

  const health = useQuery({queryKey: ['health'], queryFn: api.health, refetchInterval: 5000});
  const daemonUp = health.isSuccess;
  const inShell = isTauri();

  return (
    <SocketProvider>
      <div className={cn('flex h-screen w-screen', inShell ? 'flex-col bg-bezel' : 'p-1.5')}>
        {inShell && <WindowChrome />}
        <div className={cn('flex min-h-0 flex-1', inShell ? '' : 'h-full w-full')}>
          <div
            className={cn(
              'flex h-full w-full gap-2 overflow-hidden bg-panel text-ink max-lg:flex-col',
              inShell ? 'p-2 pt-1' : 'rounded-xl p-2',
            )}
          >
          <aside className="bezel-raised flex w-56 shrink-0 flex-col rounded-xl bg-bezel p-4 max-lg:w-full max-lg:flex-row max-lg:items-center max-lg:gap-2 max-lg:p-2">
            <div className="mb-8 px-2 pt-1 max-lg:mb-0 max-lg:shrink-0 max-lg:px-1 max-lg:pt-0">
              <div className="font-ui text-2xl font-bold tracking-[0.18em] text-phosphor text-glow max-lg:text-lg max-lg:tracking-[0.14em]">
                CONTROL
              </div>
              <div className="font-ui mt-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint max-lg:hidden">
                Local Dev Command Center
              </div>
            </div>

            <nav
              ref={navRef}
              className="nav-bank max-lg:min-w-0 max-lg:flex-1 max-lg:flex-row max-lg:overflow-x-auto"
              aria-label="Main"
            >
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

            <div className="mt-auto pt-4 max-lg:hidden">
              <AgentStatus
                online={daemonUp}
                label={daemonUp ? `Agent v${health.data?.version}` : 'Agent Offline'}
              />
            </div>
          </aside>

          <main
            className={cn(
              'min-h-0 min-w-0 flex-1',
              view.kind === 'overview' || view.kind === 'project'
                ? 'overflow-hidden'
                : 'overflow-y-auto',
            )}
          >
            <DaemonBanner show={!daemonUp} />

            {view.kind === 'overview' && (
              <Dashboard
                onOpenProject={(projectId) => setView({kind: 'project', projectId})}
                onOpenRun={openRun}
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
      </div>
    </SocketProvider>
  );
}
