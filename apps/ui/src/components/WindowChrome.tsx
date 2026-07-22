import {useEffect, useState, type ReactNode} from 'react';
import {X} from '@phosphor-icons/react';
import {cn} from '../lib/cn.js';

async function getWindow() {
  const {getCurrentWindow} = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export function WindowChrome() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      const win = await getWindow();
      setMaximized(await win.isMaximized());
      unlisten = await win.onResized(async () => {
        setMaximized(await win.isMaximized());
      });
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  const minimize = () => void getWindow().then((w) => w.minimize());
  const toggleMaximize = () => void getWindow().then((w) => w.toggleMaximize());
  const close = () => void getWindow().then((w) => w.close());

  return (
    <header className="flex h-9 shrink-0 items-stretch bg-panel">
      <div
        className="window-drag-gutter flex min-w-0 flex-1 items-center px-3"
        onDoubleClick={toggleMaximize}
      >
        <span className="font-ui text-[10px] uppercase tracking-[0.22em] text-ink-faint/70">
          CONTROL
        </span>
      </div>
      <div className="window-controls flex items-stretch">
        <WindowControlButton label="Minimize" onClick={minimize}>
          <span className="block h-px w-2.5 bg-current" />
        </WindowControlButton>
        <WindowControlButton
          label={maximized ? 'Restore' : 'Maximize'}
          onClick={toggleMaximize}
        >
          {maximized ? (
            <span className="relative block h-2 w-2">
              <span className="absolute inset-0 border border-current" />
              <span className="absolute -top-px -right-px block h-2 w-2 border border-current bg-bezel" />
            </span>
          ) : (
            <span className="block h-2 w-2 border border-current" />
          )}
        </WindowControlButton>
        <WindowControlButton label="Close" onClick={close} variant="close">
          <X size={14} weight="bold" />
        </WindowControlButton>
      </div>
    </header>
  );
}

function WindowControlButton({
  label,
  onClick,
  variant = 'default',
  children,
}: {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'close';
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex w-11 items-center justify-center text-ink-faint transition-colors',
        variant === 'close'
          ? 'hover:bg-danger hover:text-bezel'
          : 'hover:bg-panel-raised hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
