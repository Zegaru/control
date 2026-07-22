import {useEffect, useMemo, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {X} from '@phosphor-icons/react';
import {LOG_RETENTION_STEPS} from '@control/shared';
import {api} from '../api.js';
import {Chip, Led, Panel, RockerToggle, RotaryKnob, Button, TextInput} from '../components/kit.js';
import {isTauri} from '../lib/tauri.js';

export function SettingsView() {
  const qc = useQueryClient();
  const settingsQ = useQuery({queryKey: ['settings'], queryFn: api.getSettings});
  const [draftGlob, setDraftGlob] = useState('');
  const [inShell, setInShell] = useState(false);
  const [autostartOn, setAutostartOn] = useState(false);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const [autostartError, setAutostartError] = useState<string | null>(null);

  const patch = useMutation({
    mutationFn: api.patchSettings,
    onSuccess: (data) => {
      qc.setQueryData(['settings'], data);
    },
  });

  useEffect(() => {
    setInShell(isTauri());
    if (!isTauri()) return;
    let cancelled = false;
    void import('@tauri-apps/plugin-autostart')
      .then((m) => m.isEnabled())
      .then((on) => {
        if (!cancelled) setAutostartOn(on);
      })
      .catch(() => {
        if (!cancelled) setAutostartError('Autostart unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const settings = settingsQ.data;
  const retentionSteps = LOG_RETENTION_STEPS as readonly number[];
  const retentionIndex = useMemo(() => {
    if (!settings) return 2;
    const i = retentionSteps.indexOf(settings.logRetention);
    if (i >= 0) return i;
    // Snap to nearest step for the dial.
    let best = 0;
    let bestDist = Infinity;
    retentionSteps.forEach((v, idx) => {
      const d = Math.abs(v - settings.logRetention);
      if (d < bestDist) {
        best = idx;
        bestDist = d;
      }
    });
    return best;
  }, [settings, retentionSteps]);

  const addGlob = () => {
    const g = draftGlob.trim();
    if (!g || !settings) return;
    if (settings.ignoreGlobs.includes(g)) {
      setDraftGlob('');
      return;
    }
    patch.mutate({ignoreGlobs: [...settings.ignoreGlobs, g]});
    setDraftGlob('');
  };

  const removeGlob = (g: string) => {
    if (!settings) return;
    patch.mutate({ignoreGlobs: settings.ignoreGlobs.filter((x) => x !== g)});
  };

  const toggleAutostart = () => {
    if (!inShell || autostartBusy) return;
    setAutostartBusy(true);
    setAutostartError(null);
    const next = !autostartOn;
    void import('@tauri-apps/plugin-autostart')
      .then(async (m) => {
        if (next) await m.enable();
        else await m.disable();
        setAutostartOn(await m.isEnabled());
      })
      .catch((err: unknown) => {
        setAutostartError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setAutostartBusy(false));
  };

  return (
    <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
      <h1 className="sr-only">Settings</h1>

      <Panel title="Scanner · Ignore">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 overflow-visible">
            <Led status="healthy" ring />
            <div>
              <div className="font-ui text-[12px] font-semibold uppercase tracking-[0.14em] text-ink">
                Path Filters
              </div>
              <div className="mt-0.5 font-ui text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                Skip these names / globs while scanning
              </div>
            </div>
          </div>

          <div className="bezel-recessed flex min-h-30 flex-wrap content-start gap-1.5 rounded-md border border-panel-edge/60 px-3 py-3">
            {(settings?.ignoreGlobs ?? []).length === 0 ? (
              <span className="text-xs text-ink-faint">No ignore patterns.</span>
            ) : (
              (settings?.ignoreGlobs ?? []).map((g) => (
                <button
                  key={g}
                  type="button"
                  title={`Remove ${g}`}
                  onClick={() => removeGlob(g)}
                  className="group inline-flex items-center gap-1.5 rounded border border-panel-edge bg-bezel px-2 py-0.5 font-mono text-[11px] text-ink-dim hover:border-danger/50 hover:text-danger"
                >
                  {g}
                  <X size={10} className="text-ink-faint group-hover:text-danger" />
                </button>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <TextInput
              value={draftGlob}
              onChange={(e) => setDraftGlob(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addGlob();
                }
              }}
              placeholder="node_modules · **/.cache · *.tmp"
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <Button
              variant="primary"
              size="sm"
              disabled={!draftGlob.trim() || patch.isPending}
              onClick={addGlob}
            >
              Add
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-ink-faint">
            Exact folder names or simple globs (<code>*</code>, <code>**</code>). Click a tag to
            remove it. Re-scan projects to apply.
          </p>
        </div>
      </Panel>

      <Panel title="Logs · Retention">
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-4 overflow-visible">
            <div className="flex min-w-0 items-center gap-3 overflow-visible">
              <Led status={settings ? 'healthy' : 'starting'} pulse={!settings} ring />
              <div>
                <div className="font-ui text-[12px] font-semibold uppercase tracking-[0.14em] text-ink">
                  Keep Last
                </div>
                <div className="mt-0.5 font-ui text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                  Run records &amp; log files per action
                </div>
              </div>
            </div>
            <RotaryKnob
              size="md"
              value={retentionIndex}
              steps={retentionSteps.length}
              label={`${retentionSteps[retentionIndex]} runs`}
              onChange={(i) => {
                const n = retentionSteps[i];
                if (n == null || n === settings?.logRetention) return;
                patch.mutate({logRetention: n});
              }}
            />
          </div>

          <div className="bezel-recessed flex items-end justify-between overflow-visible rounded-md border border-panel-edge/60 px-4 py-3.5">
            <div>
              <div className="font-ui text-[9px] uppercase tracking-[0.22em] text-ink-faint">
                Dial Position
              </div>
              <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-phosphor text-glow">
                {retentionSteps[retentionIndex]}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5 overflow-visible py-1">
              {retentionSteps.map((n, i) => (
                <Chip key={n} tone={i === retentionIndex ? 'phosphor' : 'default'}>
                  {n}
                </Chip>
              ))}
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-ink-faint">
            Turn the dial to set how many finished runs stay on disk. Older log files are purged
            when a run ends or when you change this value. Active runs are never deleted.
          </p>
        </div>
      </Panel>

      <Panel title="Shell · Autostart" className="lg:col-span-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Led
              status={
                !inShell ? 'idle' : autostartBusy ? 'starting' : autostartOn ? 'healthy' : 'idle'
              }
              pulse={autostartBusy}
              ring={inShell && (autostartOn || autostartBusy)}
            />
            <div>
              <div className="font-ui text-[12px] font-semibold uppercase tracking-[0.14em] text-ink">
                Start On Login
              </div>
              <div className="mt-0.5 font-ui text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                {inShell
                  ? autostartOn
                    ? 'CONTROL launches with Windows'
                    : 'Manual launch only'
                  : 'Open the CONTROL desktop app to use this'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end overflow-visible sm:self-center">
            {!inShell && (
              <span className="font-ui text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                Desktop app only
              </span>
            )}
            <div className="overflow-visible p-2">
              <RockerToggle
                on={autostartOn}
                busy={autostartBusy}
                disabled={!inShell || autostartBusy}
                onToggle={toggleAutostart}
              />
            </div>
          </div>
        </div>
        {autostartError && (
          <p className="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {autostartError}
          </p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Same setting as the tray menu. Flip the rocker to turn login launch on or off.
        </p>
      </Panel>
    </div>
  );
}
