import {useEffect, useId, useRef, useState} from 'react';
import {cn} from '../lib/cn.js';
import {BacklitButton, CircularGauge, MasterPower, Screw} from './kit.js';

export type ControlStripAction = {
  label: string;
  /** Narrow-viewport label; falls back to `label`. */
  shortLabel?: string;
  tone?: 'default' | 'phosphor' | 'amber' | 'danger';
  onClick: () => void;
  /** When set, requires press-and-hold before `onClick` (see BacklitButton `holdMs`). */
  holdMs?: number;
  disabled?: boolean;
};

export type ControlStripGauge = {
  label: string;
  value: number;
  unit?: string;
};

export type ControlStripNotification = {
  message: string;
  tone?: 'phosphor' | 'amber' | 'danger' | 'dim';
  time?: string;
};

/** Decorative radial vent grille for the branding plate. */
function VentGrill({className = ''}: {className?: string}) {
  const faceId = useId();
  const rimId = useId();
  return (
    <svg viewBox="0 0 48 48" className={cn('h-11 w-11 shrink-0', className)} aria-hidden="true">
      <defs>
        <radialGradient id={faceId} cx="38%" cy="32%" r="68%">
          <stop offset="0%" stopColor="#3a3a3a" />
          <stop offset="45%" stopColor="#242424" />
          <stop offset="100%" stopColor="#121212" />
        </radialGradient>
        <linearGradient id={rimId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5a5a5a" />
          <stop offset="40%" stopColor="#2a2a2a" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22.5" fill={`url(#${rimId})`} />
      <circle cx="24" cy="24" r="20.5" fill={`url(#${faceId})`} stroke="#000" strokeWidth="1" />
      {Array.from({length: 12}, (_, i) => (
        <rect
          key={i}
          x="21.5"
          y="5.5"
          width="5"
          height="11"
          rx="2.5"
          fill="#050505"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="0.6"
          transform={`rotate(${i * 30} 24 24)`}
        />
      ))}
      <circle
        cx="24"
        cy="24"
        r="6.5"
        fill="#1c1c1c"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
      <circle cx="24" cy="24" r="6.5" fill="none" stroke="#000" strokeWidth="0.75" />
      <circle
        cx="24"
        cy="24"
        r="2.75"
        fill="#0c0c0c"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="0.5"
      />
    </svg>
  );
}

const BRAND_TAGLINES = [
  'Stay in control.',
  'All systems nominal.',
  'Processes accounted for.',
  'Nothing unsupervised.',
  'Hold the line.',
  'Standing by.',
  'Keep the lights green.',
  'Stack under watch.',
  "Quiet until it isn't.",
  'Local-first. Always.',
  'Nothing left running wild.',
  'Watching the stack.',
] as const;

const LONGEST_TAGLINE = BRAND_TAGLINES.reduce((a, b) => (a.length >= b.length ? a : b));

function pickTagline(exclude?: string): string {
  const pool = exclude ? BRAND_TAGLINES.filter((line) => line !== exclude) : [...BRAND_TAGLINES];
  return pool[Math.floor(Math.random() * pool.length)] ?? BRAND_TAGLINES[0];
}

/** Rotating brand tagline for the ControlStrip plate. */
function BrandTagline() {
  const [line, setLine] = useState(() => pickTagline());
  const [visible, setVisible] = useState(true);
  const lineRef = useRef(line);
  lineRef.current = line;

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    let fadeOut: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      setVisible(false);
      fadeOut = setTimeout(() => {
        setLine(pickTagline(lineRef.current));
        setVisible(true);
      }, 200);
    };

    const id = window.setInterval(tick, 14_000);
    return () => {
      window.clearInterval(id);
      if (fadeOut) clearTimeout(fadeOut);
    };
  }, []);

  return (
    <div className="relative mt-0.5 inline-grid text-[12px] text-ink-dim" aria-live="polite">
      <span className="invisible col-start-1 row-start-1 whitespace-nowrap" aria-hidden="true">
        {LONGEST_TAGLINE}
      </span>
      <span
        className={cn(
          'col-start-1 row-start-1 whitespace-nowrap transition-opacity duration-200 ease-out motion-reduce:transition-none',
          visible ? 'opacity-100' : 'opacity-0'
        )}
      >
        {line}
      </span>
    </div>
  );
}

export function ControlStrip({
  masterOn,
  onMasterToggle,
  actions,
  gauges,
  notifications: _notifications = [],
  version,
  network: _network,
}: {
  masterOn: boolean;
  onMasterToggle: () => void;
  actions: ControlStripAction[];
  gauges: ControlStripGauge[];
  notifications?: ControlStripNotification[];
  version?: string;
  network?: {up: string; down: string};
}) {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <div className="bezel-raised w-full min-w-0 shrink-0 overflow-visible rounded-lg p-2">
      <div
        className={cn(
          'bezel-recessed min-w-0 overflow-visible rounded-md bg-bezel',
          compact ? 'px-1.5 py-1' : 'py-2.5 pl-5 pr-3'
        )}
      >
        <div
          className={cn(
            'flex min-w-0 items-center overflow-visible',
            compact ? 'justify-between gap-1.5' : 'gap-6'
          )}
        >
          <div className="flex shrink-0 items-center gap-3 overflow-visible">
            <MasterPower on={masterOn} onToggle={onMasterToggle} size={compact ? 'sm' : 'md'} />
            {!compact && (
              <span className="font-ui text-[12px] uppercase tracking-widest text-ink-faint">
                Master Power
              </span>
            )}
          </div>

          <div
            className={cn(
              'flex shrink-0 items-center overflow-visible',
              compact ? 'gap-1' : 'gap-2'
            )}
          >
            {actions.map((a) => (
              <BacklitButton
                key={a.label}
                tone={a.tone}
                size={compact ? 'sm' : 'md'}
                onClick={a.onClick}
                holdMs={a.holdMs}
                disabled={a.disabled}
              >
                {compact ? a.shortLabel ?? a.label : a.label}
              </BacklitButton>
            ))}
          </div>

          <div
            className={cn(
              'flex shrink-0 items-center overflow-visible',
              compact ? 'gap-1.5' : 'ml-auto gap-5'
            )}
          >
            {gauges.map((g) => (
              <CircularGauge
                key={g.label}
                value={g.value}
                label={g.label}
                unit={g.unit}
                size={compact ? 'xs' : 'md'}
              />
            ))}
          </div>

          {!compact && (
            <div className="relative hidden shrink-0 overflow-visible xl:flex">
              <div className="bezel-recessed relative flex items-center gap-3 rounded-md px-4 py-2">
                <Screw className="top-1.5 left-1.5" />
                <Screw className="top-1.5 right-1.5" />
                <Screw className="bottom-1.5 left-1.5" />
                <Screw className="bottom-1.5 right-1.5" />
                <VentGrill className="h-18 w-18" />
                <div className="pr-1">
                  <div className="font-ui text-[12px] font-semibold tracking-[0.12em] text-ink">
                    CONTROL{version ? ` v${version}` : ''}
                  </div>
                  <BrandTagline />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
