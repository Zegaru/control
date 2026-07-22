import {useMemo, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {ArrowLeft, ArrowsClockwise, Star, X} from '@phosphor-icons/react';
import type {Environment} from '@control/shared';
import {api, formatApiError} from '../api.js';
import {Chip, Panel, Button, TextInput, ViewLoading} from '../components/kit.js';
import {cn} from '../lib/cn.js';
import {ActionRow} from '../components/ActionRow.js';
import {AddActionDialog} from '../components/AddActionDialog.js';
import {EnvironmentEditor} from '../components/EnvironmentEditor.js';

export function ProjectDetail({
  projectId,
  onBack,
  onOpenRun,
}: {
  projectId: string;
  onBack: () => void;
  onOpenRun: (runId: string) => void;
}) {
  const qc = useQueryClient();
  const [showSecondary, setShowSecondary] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [claimInput, setClaimInput] = useState('');
  const [portLabelPort, setPortLabelPort] = useState('');
  const [portLabelName, setPortLabelName] = useState('');
  const [portLabelError, setPortLabelError] = useState<string | null>(null);
  const portLabelNameId = `port-label-name-${projectId}`;
  const [addingCommand, setAddingCommand] = useState<
    {moduleId: string} | {projectId: string} | null
  >(null);
  const [editingEnv, setEditingEnv] = useState<Environment | null | 'new'>(null);
  const tree = useQuery({queryKey: ['tree', projectId], queryFn: () => api.projectTree(projectId)});
  const portsQ = useQuery({queryKey: ['ports'], queryFn: api.ports, refetchInterval: 4000});
  const groups = useQuery({queryKey: ['groups'], queryFn: api.listGroups});

  const invalidateTree = () => {
    qc.invalidateQueries({queryKey: ['trees']});
    qc.invalidateQueries({queryKey: ['tree', projectId]});
  };

  const rescan = useMutation({
    mutationFn: () => api.scanProject(projectId),
    onSuccess: () => invalidateTree(),
  });
  const toggleFav = useMutation({
    mutationFn: (fav: boolean) => api.patchProject(projectId, {favorite: fav}),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['tree', projectId]});
      qc.invalidateQueries({queryKey: ['trees']});
      qc.invalidateQueries({queryKey: ['projects']});
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteProject(projectId),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['projects']});
      onBack();
    },
  });
  const setClaims = useMutation({
    mutationFn: (composeProjects: string[]) => api.patchProject(projectId, {composeProjects}),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['tree', projectId]});
      qc.invalidateQueries({queryKey: ['trees']});
      qc.invalidateQueries({queryKey: ['containers']});
      qc.invalidateQueries({queryKey: ['ports']});
    },
  });
  const setPortLabels = useMutation({
    mutationFn: (portLabels: Record<string, string>) => api.patchProject(projectId, {portLabels}),
    onSuccess: () => {
      setPortLabelError(null);
      qc.invalidateQueries({queryKey: ['tree', projectId]});
      qc.invalidateQueries({queryKey: ['trees']});
      qc.invalidateQueries({queryKey: ['projects']});
      qc.invalidateQueries({queryKey: ['ports']});
    },
    onError: (err) => setPortLabelError(formatApiError(err)),
  });
  const setDefaultEnv = useMutation({
    mutationFn: (defaultEnvironmentId: string | null) =>
      api.patchProject(projectId, {defaultEnvironmentId}),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ['tree', projectId]});
      qc.invalidateQueries({queryKey: ['trees']});
      qc.invalidateQueries({queryKey: ['projects']});
    },
  });
  const removeEnv = useMutation({
    mutationFn: (id: string) => api.deleteEnvironment(id),
    onSuccess: () => invalidateTree(),
  });

  const unlabeledListeningPorts = useMemo(() => {
    const byPort = new Map<number, string>();
    for (const o of portsQ.data ?? []) {
      if (o.projectId !== projectId) continue;
      const hint = o.label ?? o.processName ?? o.owner;
      if (!byPort.has(o.port)) byPort.set(o.port, hint);
    }
    const saved = tree.data?.portLabels ?? {};
    return [...byPort.entries()].filter(([port]) => !saved[String(port)]).sort(([a], [b]) => a - b);
  }, [portsQ.data, projectId, tree.data?.portLabels]);

  if (tree.isPending) return <ViewLoading label="Loading project" />;
  if (tree.isError) {
    return (
      <div className="flex flex-col gap-3 p-4" role="alert">
        <p className="text-sm text-danger">
          Could not load this project.{' '}
          {tree.error instanceof Error ? tree.error.message : 'Try going back.'}
        </p>
        <Button variant="ghost" onClick={onBack} className="w-fit">
          <ArrowLeft size={14} />
          Back
        </Button>
      </div>
    );
  }
  if (!tree.data) return <ViewLoading label="Loading project" />;
  const p = tree.data;

  const singleRootModule =
    p.modules.length === 1 && p.modules[0]!.relPath === '' ? p.modules[0]! : null;
  const commandsTitle = singleRootModule ? `${singleRootModule.name} (root)` : 'Commands';

  const modules = showHidden
    ? p.modules.filter((m) => m.hidden || m.actions.some((a) => a.hidden))
    : p.modules.filter((m) => !m.hidden);
  const nothingVisible =
    !showHidden &&
    p.modules.length > 0 &&
    (modules.length === 0 ||
      modules.every((m) => m.actions.every((a) => a.hidden)));

  const portLabelEntries = Object.entries(p.portLabels ?? {}).sort(
    ([a], [b]) => Number(a) - Number(b)
  );

  const pickListeningPort = (port: number) => {
    setPortLabelPort(String(port));
    setPortLabelName('');
    if (portLabelError) setPortLabelError(null);
    document.getElementById(portLabelNameId)?.focus();
  };

  const addPortLabel = async () => {
    const port = portLabelPort.trim();
    const label = portLabelName.trim();
    if (!/^\d+$/.test(port)) {
      setPortLabelError('Port must be a positive number.');
      return;
    }
    if (!label) {
      document.getElementById(portLabelNameId)?.focus();
      return;
    }
    const next = {...(p.portLabels ?? {}), [port]: label};
    try {
      await setPortLabels.mutateAsync(next);
      setPortLabelPort('');
      setPortLabelName('');
    } catch {
      /* onError sets portLabelError */
    }
  };

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      <Panel className="shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Button
              variant="ghost"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1.5 px-0 py-0 text-sm"
            >
              <ArrowLeft size={14} />
              Overview
            </Button>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{p.name}</h1>
              <Button
                variant="icon"
                onClick={() => toggleFav.mutate(!p.favorite)}
                title="Favorite project"
              >
                <Star
                  size={16}
                  weight={p.favorite ? 'fill' : 'regular'}
                  className={p.favorite ? 'text-amber' : 'text-ink-faint'}
                />
              </Button>
            </div>
            <div className="mt-2 rounded-md border border-panel-edge bg-panel px-3 py-2 font-mono text-[12px] text-ink-faint">
              {p.rootPath}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => rescan.mutate()}
              disabled={rescan.isPending}
              focusableWhenDisabled
              className="inline-flex items-center gap-1.5 rounded border border-panel-edge px-3 py-1.5"
            >
              {rescan.isPending ? (
                'Scanning…'
              ) : (
                <>
                  <ArrowsClockwise size={14} />
                  Re-scan
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (confirm(`Remove "${p.name}" from CONTROL? This does not touch the folder.`))
                  remove.mutate();
              }}
              className="rounded border border-panel-edge px-3 py-1.5 text-danger hover:not-data-disabled:text-danger"
            >
              Remove
            </Button>
          </div>
        </div>
      </Panel>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,1fr)_minmax(0,2fr)] gap-2">
        <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
          <Panel title="Compose projects" className="shrink-0">
            <p className="mb-2 text-[12px] text-ink-faint">
              Link compose project names so their containers show up here. Add a name if CONTROL
              guessed wrong from the folder.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {(p.composeProjects ?? []).map((claim) => (
                <span
                  key={claim}
                  className="inline-flex items-center gap-1 rounded border border-phosphor-dim px-2 py-0.5 text-[12px] text-phosphor"
                >
                  {claim}
                  <Button
                    variant="icon"
                    onClick={() =>
                      setClaims.mutate((p.composeProjects ?? []).filter((x) => x !== claim))
                    }
                    className="text-ink-faint hover:not-data-disabled:text-danger"
                  >
                    <X size={12} />
                  </Button>
                </span>
              ))}
              <TextInput
                value={claimInput}
                onChange={(e) => setClaimInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && claimInput.trim()) {
                    const next = [...new Set([...(p.composeProjects ?? []), claimInput.trim()])];
                    setClaims.mutate(next);
                    setClaimInput('');
                  }
                }}
                placeholder="add label + Enter"
                className="w-40 px-2 py-1 text-xs"
              />
            </div>
          </Panel>

          <Panel title="Port labels" className="shrink-0">
            <p className="mb-2 text-[12px] text-ink-faint">
              Rename how listening ports appear on Overview and Port Map for this project (e.g.{' '}
              <code>3000 → frontend</code>).
            </p>
            {portLabelError && <p className="mb-2 text-[12px] text-danger">{portLabelError}</p>}
            {unlabeledListeningPorts.length > 0 && (
              <div className="mb-2">
                <p className="mb-1.5 font-ui text-[12px] uppercase tracking-wider text-ink-faint">
                  Listening now
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {unlabeledListeningPorts.map(([port, hint]) => (
                    <Button
                      key={port}
                      variant="ghost"
                      type="button"
                      onClick={() => pickListeningPort(port)}
                      className="rounded border border-dashed border-panel-edge px-2 py-0.5 text-[12px] text-ink-dim hover:not-data-disabled:border-phosphor-dim hover:not-data-disabled:text-phosphor"
                      title={`Label port ${port}`}
                    >
                      :{port}
                      <span className="ml-1 text-ink-faint">{hint}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {portLabelEntries.map(([port, label]) => (
                <span
                  key={port}
                  className="inline-flex items-center gap-1 rounded border border-phosphor-dim px-2 py-0.5 text-[12px] text-phosphor"
                >
                  {port} · {label}
                  <Button
                    variant="icon"
                    onClick={() => {
                      const next = {...(p.portLabels ?? {})};
                      delete next[port];
                      setPortLabels.mutate(next);
                    }}
                    className="text-ink-faint hover:not-data-disabled:text-danger"
                  >
                    <X size={12} />
                  </Button>
                </span>
              ))}
              <TextInput
                value={portLabelPort}
                onChange={(e) => {
                  setPortLabelPort(e.target.value);
                  if (portLabelError) setPortLabelError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (!portLabelName.trim()) {
                    document.getElementById(portLabelNameId)?.focus();
                    return;
                  }
                  void addPortLabel();
                }}
                placeholder="port"
                inputMode="numeric"
                className="w-16 px-2 py-1 text-xs"
              />
              <TextInput
                id={portLabelNameId}
                value={portLabelName}
                onChange={(e) => {
                  setPortLabelName(e.target.value);
                  if (portLabelError) setPortLabelError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  void addPortLabel();
                }}
                placeholder="label + Enter"
                className="w-32 px-2 py-1 text-xs"
              />
            </div>
          </Panel>

          <Panel title="Environments" className="flex min-h-0 flex-1 flex-col">
            <p className="mb-3 shrink-0 text-[12px] text-ink-faint">
              Named setups for what Overview turns on. Star one as the default; change it from the
              Overview selector.
            </p>
            {p.environments.length === 0 ? (
              <p className="mb-3 text-sm text-ink-faint">No environments yet.</p>
            ) : (
              <div className="mb-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
                {p.environments.map((env) => {
                  const targetLabel =
                    env.targetType === 'group'
                      ? groups.data?.find((g) => g.id === env.targetId)?.name ?? 'launch group'
                      : p.modules.flatMap((m) => m.actions).find((a) => a.id === env.targetId)
                          ?.name ?? 'command';
                  const isDefault = p.defaultEnvironmentId === env.id;
                  return (
                    <div
                      key={env.id}
                      className="flex items-center gap-2 rounded-md border border-panel-edge bg-panel px-3 py-2"
                    >
                      <Button
                        variant="icon"
                        onClick={() => setDefaultEnv.mutate(isDefault ? null : env.id)}
                        title={isDefault ? 'Default for Overview' : 'Set as Overview default'}
                        className={isDefault ? 'text-phosphor' : 'text-ink-faint'}
                      >
                        <Star size={16} weight={isDefault ? 'fill' : 'regular'} />
                      </Button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm text-ink">
                          <span>{env.name}</span>
                          {isDefault && <Chip tone="phosphor">default</Chip>}
                        </div>
                        <div className="truncate text-[12px] text-ink-faint">{targetLabel}</div>
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => setEditingEnv(env)}
                        className="px-2 py-1 text-xs"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete environment "${env.name}"?`))
                            removeEnv.mutate(env.id);
                        }}
                        className="px-2 py-1 text-xs text-danger hover:not-data-disabled:text-danger"
                      >
                        Delete
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            <Button
              variant="ghost"
              onClick={() => setEditingEnv('new')}
              className="shrink-0 rounded border border-panel-edge px-3 py-1.5"
            >
              + Add environment
            </Button>
          </Panel>
        </div>

        <Panel
          title={commandsTitle}
          className="flex min-h-0 flex-col"
          right={
            <div className="flex items-center gap-2">
              {singleRootModule &&
                singleRootModule.detectedStacks.map((s) => <Chip key={s.kind}>{s.kind}</Chip>)}
              <Button
                variant="ghost"
                onClick={() => setShowHidden((v) => !v)}
                className="px-0 py-0 text-[12px] uppercase tracking-wider text-ink-faint hover:not-data-disabled:text-ink-dim"
              >
                {showHidden ? 'Hide hidden' : 'Show hidden'}
              </Button>
            </div>
          }
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            {p.modules.length === 0 ? (
              <>
                <p className="mb-3 text-sm text-ink-faint">
                  No commands found. Add custom commands to run from this project root.
                </p>
                <Button
                  variant="ghost"
                  onClick={() => setAddingCommand({projectId})}
                  className="rounded border border-panel-edge px-3 py-1.5"
                >
                  + Add command
                </Button>
              </>
            ) : nothingVisible ? (
              <p className="text-sm text-ink-faint">
                All commands are hidden. Use Show hidden to restore.
              </p>
            ) : modules.length === 0 ? (
              <p className="text-sm text-ink-faint">No hidden commands.</p>
            ) : (
              <div className="space-y-6">
                {modules.map((mod) => {
                  const visible = mod.actions.filter((a) => (showHidden ? a.hidden : !a.hidden));
                  const primary = visible.filter((a) => a.primary);
                  const secondary = visible.filter((a) => !a.primary);
                  const showModuleHeader = p.modules.length > 1;
                  const actionVariant = showHidden ? 'hidden' : 'default';

                  return (
                    <section key={mod.id}>
                      {showModuleHeader && (
                        <header className="mb-3 flex items-center justify-between gap-3 border-b border-panel-edge pb-2">
                          <h3 className="text-[12px] font-semibold uppercase tracking-[0.2em] text-ink-dim">
                            {mod.relPath === '' ? `${mod.name} (root)` : mod.relPath}
                          </h3>
                          <div className="flex items-center gap-2">
                            {mod.detectedStacks.map((s) => (
                              <Chip key={s.kind}>{s.kind}</Chip>
                            ))}
                            {(!showHidden || mod.hidden) && (
                              <Button
                                variant="ghost"
                                onClick={async () => {
                                  await api.patchModule(mod.id, {hidden: !mod.hidden});
                                  invalidateTree();
                                }}
                                className="px-0 py-0 text-[12px] uppercase tracking-wider text-ink-faint hover:not-data-disabled:text-ink-dim"
                              >
                                {mod.hidden ? 'Unhide module' : 'Hide module'}
                              </Button>
                            )}
                          </div>
                        </header>
                      )}
                      <div className="space-y-2">
                        {primary.length === 0 && secondary.length === 0 && (
                          <p className="text-sm text-ink-faint">No actions detected.</p>
                        )}
                        {primary.map((a) => (
                          <ActionRow
                            key={a.id}
                            action={a}
                            onOpenRun={onOpenRun}
                            variant={actionVariant}
                          />
                        ))}

                        {secondary.length > 0 && (
                          <>
                            <Button
                              variant="ghost"
                              onClick={() => setShowSecondary((v) => !v)}
                              aria-expanded={showSecondary}
                              className="mt-2 block px-0 py-0 text-left text-[12px] uppercase tracking-wider text-ink-faint hover:not-data-disabled:text-ink-dim"
                            >
                              <span
                                className={cn(
                                  'mr-1 inline-block transition-transform duration-160 ease-out motion-reduce:transition-none',
                                  showSecondary && 'rotate-90'
                                )}
                                aria-hidden
                              >
                                ▸
                              </span>
                              {secondary.length} tasks (build, test, lint…)
                            </Button>
                            <div
                              className={cn(
                                'grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:duration-120 motion-reduce:transition-opacity',
                                showSecondary
                                  ? 'grid-rows-[1fr] opacity-100'
                                  : 'pointer-events-none grid-rows-[0fr] opacity-0'
                              )}
                            >
                              <div className="min-h-0 space-y-2 overflow-hidden">
                                {secondary.map((a) => (
                                  <ActionRow
                                    key={a.id}
                                    action={a}
                                    onOpenRun={onOpenRun}
                                    variant={actionVariant}
                                  />
                                ))}
                              </div>
                            </div>
                          </>
                        )}

                        <Button
                          variant="ghost"
                          onClick={() => setAddingCommand({moduleId: mod.id})}
                          className="mt-2 block px-0 py-0 text-left text-[12px] uppercase tracking-wider text-ink-faint hover:not-data-disabled:text-phosphor"
                        >
                          + Add command
                        </Button>
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>
      </div>

      {editingEnv != null && (
        <EnvironmentEditor
          open
          projectId={projectId}
          tree={p}
          environment={editingEnv === 'new' ? null : editingEnv}
          onOpenChange={(open) => {
            if (!open) setEditingEnv(null);
          }}
          onSaved={() => {
            setEditingEnv(null);
            invalidateTree();
          }}
        />
      )}

      {addingCommand && (
        <AddActionDialog
          open
          {...('moduleId' in addingCommand
            ? {moduleId: addingCommand.moduleId}
            : {projectId: addingCommand.projectId})}
          onOpenChange={(open) => {
            if (!open) setAddingCommand(null);
          }}
        />
      )}
    </div>
  );
}
