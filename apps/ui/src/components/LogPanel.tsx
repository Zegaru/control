import '@xterm/xterm/css/xterm.css';
import {useEffect, useRef, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {isActiveStatus} from '@control/shared';
import {api} from '../api.js';
import {sanitizeConPtySnapshot, sanitizeConPtyWrap} from '../lib/ptySanitize.js';
import {useSocket} from '../socket.js';
import {Button} from './kit.js';

/**
 * Live xterm view for one run or one container. Runs seed from the REST log
 * snapshot then stream over WS; containers stream directly (dockerode replays
 * a tail on subscribe). xterm renders raw PTY bytes so colors/spinners survive.
 *
 * Keep the daemon PTY wide (do not sync cols to this pane). Narrow ConPTY widths
 * hard-wrap JSON into the byte stream and produce right-aligned wrap fragments.
 */
export function LogPanel({runId, containerId}: {runId?: string; containerId?: string}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const attachedRef = useRef(false);
  const runIdRef = useRef(runId);
  const sendStdinRef = useRef<(runId: string, data: string) => void>(() => {});
  const sanitizeCarryRef = useRef('');
  const {subscribeLogs, subscribeContainer, sendStdin} = useSocket();
  const subscribeLogsRef = useRef(subscribeLogs);
  const subscribeContainerRef = useRef(subscribeContainer);
  const [attached, setAttached] = useState(false);

  const runs = useQuery({
    queryKey: ['runs'],
    queryFn: api.activeRuns,
    enabled: !!runId,
  });
  const run = runId ? runs.data?.find((r) => r.id === runId) : undefined;
  const canAttach =
    !!runId && !!run && run.status !== 'adopted' && isActiveStatus(run.status);

  runIdRef.current = runId;
  sendStdinRef.current = sendStdin;
  attachedRef.current = attached;
  subscribeLogsRef.current = subscribeLogs;
  subscribeContainerRef.current = subscribeContainer;

  useEffect(() => {
    if (!canAttach && attached) setAttached(false);
  }, [canAttach, attached]);

  useEffect(() => {
    if (!containerRef.current) return;
    sanitizeCarryRef.current = '';
    const term = new Terminal({
      convertEol: true,
      disableStdin: true,
      cursorBlink: false,
      // Force ConPTY wrap heuristics even on Win11 builds that claim native wrap.
      windowsMode: true,
      fontFamily: "'JetBrains Mono', Consolas, monospace",
      fontSize: 12,
      theme: {background: '#0b0d0a', foreground: '#d7e0d2', cursor: '#7dfc9a'},
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fitRef.current = fit;
    termRef.current = term;

    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true;
      const mod = ev.ctrlKey || ev.metaKey;
      const sel = term.getSelection();

      if (mod && (ev.key === 'c' || ev.key === 'C' || ev.key === 'Insert')) {
        if (sel) {
          void navigator.clipboard.writeText(sel);
          return false;
        }
        if (attachedRef.current && (ev.key === 'c' || ev.key === 'C')) return true;
        return false;
      }

      if (mod && ev.shiftKey && (ev.key === 'c' || ev.key === 'C')) {
        if (sel) void navigator.clipboard.writeText(sel);
        return false;
      }

      if (attachedRef.current && runIdRef.current) {
        const id = runIdRef.current;
        if (mod && (ev.key === 'v' || ev.key === 'V')) {
          void navigator.clipboard.readText().then((t) => {
            if (t) sendStdinRef.current(id, t);
          });
          return false;
        }
        if (ev.shiftKey && ev.key === 'Insert') {
          void navigator.clipboard.readText().then((t) => {
            if (t) sendStdinRef.current(id, t);
          });
          return false;
        }
      }

      return true;
    });

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    // Fit the *viewer* only — never shrink the daemon PTY to this pane width.
    const syncView = () => {
      if (!containerRef.current) return;
      fit.fit();
    };
    const scheduleSync = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncView, 50);
    };

    requestAnimationFrame(() => requestAnimationFrame(scheduleSync));

    const ro = new ResizeObserver(scheduleSync);
    ro.observe(containerRef.current);
    window.addEventListener('resize', scheduleSync);

    const writeSanitized = (chunk: string) => {
      const {text, carry} = sanitizeConPtyWrap(chunk, sanitizeCarryRef.current);
      sanitizeCarryRef.current = carry;
      if (text) term.write(text);
    };

    let disposed = false;
    let unsub = () => {};
    if (runId) {
      unsub = subscribeLogsRef.current(runId, (_id, chunk) => writeSanitized(chunk));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (disposed) return;
          syncView();
          api.runLogs(runId).then((res) => {
            if (!disposed && res.logs) term.write(sanitizeConPtySnapshot(res.logs));
          });
        });
      });
    } else if (containerId) {
      unsub = subscribeContainerRef.current(containerId, (_id, chunk) => writeSanitized(chunk));
      requestAnimationFrame(() => requestAnimationFrame(scheduleSync));
    }

    return () => {
      disposed = true;
      unsub();
      if (resizeTimer) clearTimeout(resizeTimer);
      ro.disconnect();
      window.removeEventListener('resize', scheduleSync);
      fitRef.current = null;
      termRef.current = null;
      term.dispose();
    };
  }, [runId, containerId]);

  useEffect(() => {
    requestAnimationFrame(() => fitRef.current?.fit());
  }, [attached]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.disableStdin = !attached;
    term.options.cursorBlink = attached;
    if (!attached) return;
    const d = term.onData((data) => sendStdin(runId!, data));
    requestAnimationFrame(() => term.focus());
    return () => d.dispose();
  }, [runId, attached, sendStdin]);

  const toggleAttach = () => {
    setAttached((v) => {
      const next = !v;
      if (next) {
        requestAnimationFrame(() => termRef.current?.focus());
      }
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {runId ? (
        <div className="flex shrink-0 flex-col gap-0.5 border-b border-panel-edge/50 px-2 py-1">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!canAttach}
              title={
                canAttach
                  ? attached
                    ? 'Stop sending keyboard input to this run'
                    : 'Send keyboard input to this run'
                  : 'Attach only works while this run is live'
              }
              onClick={toggleAttach}
              className="px-2 py-0.5 uppercase tracking-wider"
            >
              {attached ? 'Attached' : 'Attach'}
            </Button>
            {attached ? (
              <span className="text-[12px] text-phosphor">Click log pane, then type</span>
            ) : (
              <span className="text-[12px] text-ink-faint">
                Sends keys for prompts and Ctrl+C. Not a full shell.
              </span>
            )}
          </div>
          {attached ? (
            <span className="text-[12px] text-amber">
              Many dev servers ignore keyboard input. Ctrl+C still interrupts unless text is
              selected.
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        ref={containerRef}
        className="min-h-0 flex-1"
        onClick={() => {
          if (attached) termRef.current?.focus();
        }}
      />
    </div>
  );
}
