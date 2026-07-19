import {useEffect, useRef} from 'react';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {api} from '../api.js';
import {useSocket} from '../socket.js';

/**
 * Live xterm view for one run or one container. Runs seed from the REST log
 * snapshot then stream over WS; containers stream directly (dockerode replays
 * a tail on subscribe). xterm renders raw bytes so colors/spinners survive.
 */
export function LogPanel({runId, containerId}: {runId?: string; containerId?: string}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {subscribeLogs, subscribeContainer} = useSocket();

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      convertEol: true,
      fontFamily: "'JetBrains Mono', Consolas, monospace",
      fontSize: 12,
      theme: {background: '#0b0d0a', foreground: '#d7e0d2', cursor: '#7dfc9a'},
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const onResize = () => fit.fit();
    window.addEventListener('resize', onResize);

    let disposed = false;
    let unsub = () => {};
    if (runId) {
      api.runLogs(runId).then((res) => {
        if (!disposed && res.logs) term.write(res.logs);
      });
      unsub = subscribeLogs(runId, (_id, chunk) => term.write(chunk));
    } else if (containerId) {
      unsub = subscribeContainer(containerId, (_id, chunk) => term.write(chunk));
    }

    return () => {
      disposed = true;
      unsub();
      window.removeEventListener('resize', onResize);
      term.dispose();
    };
  }, [runId, containerId, subscribeLogs, subscribeContainer]);

  return <div ref={containerRef} className="h-full w-full" />;
}
