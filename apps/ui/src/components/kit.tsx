import {useEffect, useId, useRef, useState, type ReactNode} from 'react';
import {Switch} from '@base-ui/react/switch';
import type {RunStatus} from '@control/shared';
import {cn} from '../lib/cn.js';
import {Button} from './ui.js';

export {Button, TextInput} from './ui.js';
export type {ButtonProps, ButtonVariant, ButtonTone, ButtonSize, TextInputProps} from './ui.js';

export function statusColor(status: RunStatus | 'idle'): string {
  switch (status) {
    case 'healthy':
      return 'var(--color-phosphor)';
    case 'running':
      return 'var(--color-phosphor-dim)';
    case 'starting':
      return 'var(--color-amber)';
    case 'unhealthy':
    case 'adopted':
      return 'var(--color-amber)';
    case 'failed':
    case 'killed':
      return 'var(--color-danger)';
    default:
      return 'var(--color-ink-faint)';
  }
}

export function statusLabel(status: RunStatus | 'idle'): string {
  return status.toUpperCase();
}

export function Screw({className = ''}: {className?: string}) {
  return <div className={`screw ${className}`} aria-hidden="true" />;
}

export function Led({
  status,
  pulse,
  ring,
  className,
}: {
  status: RunStatus | 'idle';
  pulse?: boolean;
  ring?: boolean;
  className?: string;
}) {
  const color = statusColor(status);
  const lit = status !== 'idle';
  return (
    <span
      className={cn(
        'led inline-block h-2.5 w-2.5 shrink-0 rounded-full',
        lit && 'led-lit',
        lit && ring && 'led-ring',
        pulse && 'animate-pulse',
        className
      )}
      style={lit ? {backgroundColor: color, color} : undefined}
      aria-label={statusLabel(status)}
    />
  );
}

export function Panel({
  title,
  right,
  children,
  className = '',
  crt,
  footer,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  crt?: boolean;
  footer?: ReactNode;
}) {
  return (
    <section className={`bezel-raised overflow-hidden rounded-xl p-5 flex flex-col ${className}`}>
      <Screw className="top-2 left-2" />
      <Screw className="top-2 right-2" />
      <Screw className="bottom-2 left-2" />
      <Screw className="bottom-2 right-2" />

      <div className="bezel-recessed flex flex-1 min-h-0 flex-col overflow-hidden rounded-2xl bg-bezel">
        <div className={`flex-1 h-full ${crt ? 'crt-frame p-0' : 'p-4'}`}>
          <div className="bezel-recessed border-0! h-full rounded-2xl bg-bezel p-4">
            <div className={crt ? 'crt bezel-recessed border-0! h-full rounded-xl p-4' : 'h-full'}>
              <div className="relative z-10 h-full flex flex-col">
                {(title || right) && (
                  <header className="font-ui mb-1 flex items-center justify-between gap-3 overflow-visible pb-1">
                    {title ? (
                      typeof title === 'string' ? (
                        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-dim">
                          {title}
                        </h2>
                      ) : (
                        <div className="min-w-0 flex-1">{title}</div>
                      )
                    ) : (
                      <span />
                    )}
                    {right}
                  </header>
                )}
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
      {footer}
    </section>
  );
}

/** Chunky on/off rocker. `on` reflects running state; `busy` shows amber. */
export function RockerToggle({
  on,
  busy,
  onToggle,
  disabled,
  labels = ['ON', 'OFF'],
}: {
  on: boolean;
  busy?: boolean;
  onToggle: () => void;
  disabled?: boolean;
  labels?: [string, string];
}) {
  // Half-lit + hinged faces:
  // ON  → top lit green (into well), bottom dark proud
  // BUSY → bottom lit amber (proud), top dark sunk  (matches STARTING ref)
  // OFF → top dark proud, bottom dark sunk
  const topCls = busy ? 'rocker-segment-sunk' : on ? 'rocker-segment-lit' : 'rocker-segment-raised';
  const bottomCls = busy
    ? 'rocker-segment-lit busy'
    : on
    ? 'rocker-segment-raised'
    : 'rocker-segment-sunk';

  return (
    <Switch.Root
      checked={on}
      disabled={disabled}
      nativeButton
      render={<button type="button" />}
      onCheckedChange={() => onToggle()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'rocker-housing font-ui relative flex h-16 w-17 flex-col rounded-md p-1.5 text-[11px] font-bold tracking-wide data-disabled:opacity-40',
        busy ? 'rocker-busy' : on ? 'rocker-on' : 'rocker-off'
      )}
    >
      <span className="rocker-body">
        <span className={cn('rocker-face-on', topCls)}>{labels[0]}</span>
        <span className={cn('rocker-face-off', bottomCls)}>{labels[1]}</span>
      </span>
    </Switch.Root>
  );
}

export function Chip({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'phosphor' | 'amber' | 'info';
}) {
  const toneCls =
    tone === 'phosphor'
      ? 'border-phosphor-dim/70 text-phosphor bg-phosphor/10 text-glow shadow-[inset_0_1px_2px_rgba(0,0,0,0.45),0_0_10px_-2px_var(--color-phosphor)]'
      : tone === 'amber'
      ? 'border-amber text-amber bg-amber/6 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]'
      : tone === 'info'
      ? 'border-info text-info bg-info/6 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]'
      : 'border-panel-edge text-ink-dim bg-bezel shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]';
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${toneCls}`}
    >
      {children}
    </span>
  );
}

export function SegmentCounter({
  value,
  label,
  tone = 'phosphor',
}: {
  value: number | string;
  label: string;
  tone?: 'phosphor' | 'amber' | 'danger' | 'dim';
}) {
  const color =
    tone === 'phosphor'
      ? 'var(--color-phosphor)'
      : tone === 'amber'
      ? 'var(--color-amber)'
      : tone === 'danger'
      ? 'var(--color-danger)'
      : 'var(--color-ink-faint)';
  const glowCls =
    tone === 'phosphor'
      ? 'text-glow'
      : tone === 'amber'
      ? 'text-glow-amber'
      : tone === 'danger'
      ? 'text-glow-danger'
      : '';
  return (
    <div className="crt-well rounded-md px-4 py-2 text-center">
      <div className={`text-2xl font-bold ${glowCls}`} style={{color}}>
        {value}
      </div>
      <div
        className="font-ui mt-1.5 text-[10px] uppercase tracking-widest"
        style={{color, opacity: 0.65}}
      >
        {label}
      </div>
    </div>
  );
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = {
    x: cx + r * Math.cos(startAngle),
    y: cy + r * Math.sin(startAngle),
  };
  const end = {
    x: cx + r * Math.cos(endAngle),
    y: cy + r * Math.sin(endAngle),
  };
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

function gaugeTone(value: number): string {
  if (value >= 85) return 'var(--color-danger)';
  if (value >= 60) return 'var(--color-amber)';
  return 'var(--color-phosphor)';
}

/** Open-arc progress ring — no needle, no knob hub. */
const GAUGE_GLOW_PAD = 10;
const GAUGE_ANIM_MS = 450;

function useAnimatedValue(target: number, durationMs = GAUGE_ANIM_MS): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      displayRef.current = target;
      setDisplay(target);
      return;
    }

    const from = displayRef.current;
    if (Math.abs(from - target) < 0.05) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const next = from + (target - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return display;
}

function DialArc({
  value,
  size,
  strokeWidth,
  color,
}: {
  value: number;
  size: number;
  strokeWidth: number;
  color: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2 - 1;
  // ~270° sweep, open at the bottom (SYSTEM HEALTH reference)
  const start = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  const end = start + (sweep * clamped) / 100;
  const ticks = Array.from({length: 24}, (_, i) => {
    const a = start + (sweep * i) / 23;
    const major = i % 4 === 0;
    const inner = r - (major ? strokeWidth * 0.55 : strokeWidth * 0.35);
    const outer = r + strokeWidth * 0.15;
    return {
      x1: cx + inner * Math.cos(a),
      y1: cy + inner * Math.sin(a),
      x2: cx + outer * Math.cos(a),
      y2: cy + outer * Math.sin(a),
      major,
    };
  });
  const outer = size + GAUGE_GLOW_PAD * 2;

  return (
    <svg
      width={outer}
      height={outer}
      viewBox={`${-GAUGE_GLOW_PAD} ${-GAUGE_GLOW_PAD} ${outer} ${outer}`}
      aria-hidden
      className="block overflow-visible"
    >
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={t.major ? '#3a3a3a' : '#2a2a2a'}
          strokeWidth={t.major ? 1 : 0.6}
        />
      ))}
      <path
        d={arcPath(cx, cy, r, start, start + sweep)}
        fill="none"
        stroke="#141414"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d={arcPath(cx, cy, r, start, start + sweep)}
        fill="none"
        stroke="var(--color-panel-edge)"
        strokeWidth={Math.max(1, strokeWidth - 2)}
        strokeLinecap="round"
        opacity={0.5}
      />
      {clamped > 0 && (
        <path
          className="gauge-arc-fill"
          d={arcPath(cx, cy, r, start, end)}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 8px ${color})`,
          }}
        />
      )}
    </svg>
  );
}

export function CircularGauge({
  value,
  label,
  unit = '%',
  size = 'md',
  detail,
  formatValue,
}: {
  value: number;
  label: string;
  unit?: string;
  size?: 'sm' | 'md';
  /** Replaces the numeric readout (e.g. network up/down). */
  detail?: ReactNode;
  formatValue?: (value: number) => ReactNode;
}) {
  const px = size === 'sm' ? 56 : 72;
  const stroke = size === 'sm' ? 4 : 5;
  const animated = useAnimatedValue(value);
  const color = gaugeTone(animated);
  const readout =
    detail ??
    (formatValue ? (
      formatValue(animated)
    ) : (
      <>
        {Math.round(animated)}
        {unit ? <span className="text-[0.65em] opacity-70">{unit}</span> : null}
      </>
    ));

  return (
    <div className="flex flex-col items-center overflow-visible">
      <div className="gauge-face relative overflow-visible rounded-full">
        <DialArc value={animated} size={px} strokeWidth={stroke} color={color} />
        <div
          className="pointer-events-none absolute flex flex-col items-center justify-center px-2"
          style={{inset: GAUGE_GLOW_PAD}}
        >
          <span className="font-ui text-[9px] font-medium uppercase tracking-[0.14em] text-ink-dim">
            {label}
          </span>
          <span
            className={cn(
              'gauge-readout font-ui mt-0.5 font-semibold leading-none text-ink tabular-nums',
              size === 'sm' ? 'text-sm' : 'text-base',
              detail && 'mt-1 flex flex-col items-center gap-0.5 text-[10px] font-medium'
            )}
          >
            {readout}
          </span>
        </div>
      </div>
    </div>
  );
}

export function BacklitButton({
  children,
  onClick,
  tone = 'default',
  size = 'md',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'phosphor' | 'amber' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  return (
    <Button variant="backlit" tone={tone} size={size} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

/** Stepped rotary for discrete hardware filters (e.g. log level). */
export function RotaryKnob({
  value,
  steps,
  onChange,
  label,
  size = 'sm',
}: {
  value: number;
  steps: number;
  onChange: (value: number) => void;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const clamped = Math.max(0, Math.min(steps - 1, value));
  const px = size === 'sm' ? 28 : 36;
  const ring = size === 'sm' ? 40 : 50;
  // Sweep from ~-120° to +120° across steps
  const stepAngle = (i: number) => (steps <= 1 ? 0 : -120 + (240 * i) / (steps - 1));
  const angle = stepAngle(clamped);
  const dragRef = useRef<{startY: number; startValue: number} | null>(null);
  const movedRef = useRef(false);

  const setFromDelta = (deltaY: number) => {
    const next = Math.max(
      0,
      Math.min(steps - 1, dragRef.current!.startValue + Math.round(deltaY / -18))
    );
    if (next !== clamped) onChange(next);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="knob-wrap relative shrink-0" style={{width: ring, height: ring}}>
        <div className="knob-marks pointer-events-none absolute inset-0" aria-hidden>
          {Array.from({length: steps}, (_, i) => (
            <span
              key={i}
              className={cn('knob-mark', i === clamped && 'knob-mark-active')}
              style={{transform: `rotate(${stepAngle(i)}deg)`}}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label={label ?? 'Filter'}
          aria-valuemin={0}
          aria-valuemax={steps - 1}
          aria-valuenow={clamped}
          className="knob absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full active:cursor-grabbing"
          style={{width: px, height: px}}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = {startY: e.clientY, startValue: clamped};
            movedRef.current = false;
          }}
          onPointerMove={(e) => {
            if (!dragRef.current) return;
            const dy = e.clientY - dragRef.current.startY;
            if (Math.abs(dy) > 4) movedRef.current = true;
            setFromDelta(dy);
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onClick={() => {
            if (movedRef.current) {
              movedRef.current = false;
              return;
            }
            onChange((clamped + 1) % steps);
          }}
        >
          <span
            className="knob-face absolute inset-0 rounded-full"
            style={{transform: `rotate(${angle}deg)`}}
          >
            <span className="knob-tick" aria-hidden />
          </span>
        </button>
      </div>
      {label && (
        <span className="font-ui text-[8px] uppercase tracking-[0.18em] text-ink-faint">
          {label}
        </span>
      )}
    </div>
  );
}

/** Red master power rocker for ALL SYSTEMS. */
export function MasterPower({
  on,
  onToggle,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <Switch.Root
      checked={on}
      disabled={disabled}
      nativeButton
      render={<button type="button" />}
      onCheckedChange={() => onToggle()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'rocker-housing rocker-danger font-ui relative flex h-18 w-21 flex-col rounded-md p-1.5 text-[10px] font-bold tracking-wide data-disabled:opacity-40',
        on ? 'rocker-on' : 'rocker-off'
      )}
    >
      <span className="rocker-body">
        <span
          className={cn(
            'rocker-face-on rocker-face-tall',
            on ? 'rocker-segment-lit danger' : 'rocker-segment-raised'
          )}
        >
          ON
        </span>
        <span
          className={cn(
            'rocker-face-off font-ui text-[8px] uppercase tracking-wider',
            on ? 'rocker-segment-raised' : 'rocker-segment-sunk'
          )}
        >
          All Systems
        </span>
      </span>
    </Switch.Root>
  );
}

export function Sparkline({data, label, unit}: {data: number[]; label: string; unit?: string}) {
  const gradId = useId().replace(/:/g, '');
  const w = 72;
  const h = 26;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const coords = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const points = coords.join(' ');
  const area = `${points} ${w},${h} 0,${h}`;
  const latest = data[data.length - 1] ?? 0;
  return (
    <div className="crt-well flex items-end justify-between gap-2 rounded-md px-3 py-2.5">
      <div className="min-w-0">
        <div className="font-ui text-[9px] uppercase tracking-wider text-phosphor opacity-60">
          {label}
        </div>
        <div className="mt-1 text-lg font-bold leading-none text-glow text-phosphor">
          {latest}
          {unit}
        </div>
      </div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block shrink-0" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-phosphor)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-phosphor)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${gradId})`} />
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-phosphor)"
          strokeWidth={1.25}
          style={{filter: 'drop-shadow(0 0 3px var(--color-phosphor))'}}
        />
      </svg>
    </div>
  );
}

export function TerminalScreen({
  children,
  footer,
  className = '',
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`crt-frame mx-2 mb-2 ${className}`}>
      <div className="crt bezel-recessed flex h-full flex-col overflow-hidden rounded-xl border border-black">
        <div className="relative z-10 flex-1 overflow-y-auto p-6 text-[11px] leading-relaxed text-glow-info">
          {children}
        </div>
        {footer && (
          <div className="font-ui relative z-10 flex items-center gap-3 border-t border-panel-edge bg-bezel/80 px-4 py-3 text-[10px] uppercase tracking-wider text-ink-faint backdrop-blur-sm">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="icon"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className="nav-push"
    >
      <span className="nav-push-icon" aria-hidden>
        {icon}
      </span>
      {label}
    </Button>
  );
}

const AGENT_WAVE_W = 120;
const AGENT_WAVE_H = 24;
const AGENT_WAVE_MID = 12;
const AGENT_WAVE_SAMPLES = 56;

function nextAgentSample(prev: number): number {
  const roll = Math.random();
  if (roll < 0.07) return AGENT_WAVE_MID - (5 + Math.random() * 9);
  if (roll < 0.12) return AGENT_WAVE_MID + (4 + Math.random() * 8);
  if (roll < 0.2) return AGENT_WAVE_MID + (Math.random() - 0.5) * 5;
  if (roll < 0.28) return AGENT_WAVE_MID + (prev - AGENT_WAVE_MID) * 0.55;
  return AGENT_WAVE_MID + (prev - AGENT_WAVE_MID) * 0.25 + (Math.random() - 0.5) * 1.4;
}

function agentSamplesToPoints(samples: number[]): string {
  const last = Math.max(samples.length - 1, 1);
  return samples
    .map((y, i) => {
      const x = (i / last) * AGENT_WAVE_W;
      const clamped = Math.min(AGENT_WAVE_H - 1, Math.max(1, y));
      return `${x.toFixed(1)},${clamped.toFixed(1)}`;
    })
    .join(' ');
}

export function AgentStatus({online, label}: {online: boolean; label?: string}) {
  const [wavePoints, setWavePoints] = useState(() =>
    agentSamplesToPoints(Array.from({length: AGENT_WAVE_SAMPLES}, () => AGENT_WAVE_MID))
  );

  useEffect(() => {
    if (!online) return;
    const samples = Array.from({length: AGENT_WAVE_SAMPLES}, () => AGENT_WAVE_MID);
    const id = window.setInterval(() => {
      samples.push(nextAgentSample(samples[samples.length - 1] ?? AGENT_WAVE_MID));
      samples.shift();
      setWavePoints(agentSamplesToPoints(samples));
    }, 55);
    return () => window.clearInterval(id);
  }, [online]);

  return (
    <div className="bezel-recessed rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Led status={online ? 'healthy' : 'failed'} pulse={online} ring />
        <span
          className={cn(
            'font-ui min-w-0 flex-1 truncate text-[10px] uppercase tracking-[0.16em]',
            online ? 'text-phosphor text-glow' : 'text-ink-dim'
          )}
        >
          {label ?? (online ? 'Agent Running' : 'Agent Offline')}
        </span>
        <span
          className={cn(
            'font-ui shrink-0 text-[8px] uppercase tracking-[0.18em]',
            online ? 'text-phosphor/70' : 'text-danger/70'
          )}
        >
          {online ? 'Live' : 'Down'}
        </span>
      </div>
      <div className="crt-well mt-2 overflow-hidden rounded-sm px-1.5 py-1.5">
        {online ? (
          <svg
            viewBox={`0 0 ${AGENT_WAVE_W} ${AGENT_WAVE_H}`}
            preserveAspectRatio="none"
            className="block h-5 w-full"
            aria-hidden
          >
            <polyline
              points={wavePoints}
              fill="none"
              stroke="var(--color-phosphor)"
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{
                filter:
                  'drop-shadow(0 0 3px var(--color-phosphor)) drop-shadow(0 0 8px var(--color-phosphor))',
              }}
            />
          </svg>
        ) : (
          <svg
            viewBox="0 0 80 24"
            preserveAspectRatio="none"
            className="block h-5 w-full"
            aria-hidden
          >
            <line
              x1="0"
              y1="12"
              x2="80"
              y2="12"
              stroke="var(--color-danger)"
              strokeWidth={1.25}
              strokeOpacity={0.35}
              strokeDasharray="3 4"
            />
          </svg>
        )}
      </div>
    </div>
  );
}

export type ProjectService = {
  name: string;
  status: RunStatus | 'idle';
  ports?: number[];
  pulse?: boolean;
};

export function ProjectModule({
  variant = 'default',
  name,
  path,
  on,
  busy,
  onToggle,
  onClick,
  favorite,
  services = [],
  metrics,
  children,
}: {
  variant?: 'default' | 'add';
  name?: string;
  path?: string;
  on?: boolean;
  busy?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
  favorite?: boolean;
  services?: ProjectService[];
  metrics?: {cpu?: number; mem?: number; disk?: number};
  children?: ReactNode;
}) {
  if (variant === 'add') {
    return (
      <Button
        variant="ghost"
        onClick={onClick}
        className="bezel-raised flex min-h-[200px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-panel-edge text-ink-faint hover:not-data-disabled:border-phosphor-dim hover:not-data-disabled:text-phosphor"
      >
        <span className="text-3xl">+</span>
        <span className="font-ui text-[11px] uppercase tracking-wider">Add Project</span>
      </Button>
    );
  }

  const projectStatus: RunStatus | 'idle' = busy ? 'starting' : on ? 'healthy' : 'idle';

  return (
    <div className="bezel-raised flex flex-col rounded-lg p-1.5">
      <div className="bezel-recessed flex flex-1 flex-col overflow-visible rounded-md bg-bezel">
        <div className="flex items-start justify-between gap-3 border-b border-panel-edge px-4 py-3">
          <Button
            variant="ghost"
            onClick={onClick}
            className="flex min-w-0 flex-1 items-start justify-start px-0 py-0 text-left hover:not-data-disabled:text-ink"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <Led status={projectStatus} pulse={busy} ring={!!on || !!busy} />
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-ui text-[15px] font-semibold uppercase tracking-[0.08em] leading-none text-ink">
                    {name}
                  </span>
                  {favorite && <span className="text-amber">★</span>}
                </div>
              </div>
              {path && (
                <div className="mt-1.5 truncate pl-5 text-[10px] leading-tight text-ink-faint">
                  {path}
                </div>
              )}
            </div>
          </Button>
          {onToggle != null && on != null && (
            <RockerToggle on={on} busy={busy} disabled={busy} onToggle={onToggle} />
          )}
        </div>

        <div className="flex flex-1 flex-col">
          {services.length > 0 && (
            <ul className="space-y-2 px-4 py-3">
              {services.map((svc) => (
                <li key={svc.name} className="flex items-center gap-2.5 text-[12px] text-ink-dim">
                  <Led status={svc.status} pulse={svc.pulse} ring />
                  <span className="min-w-0 flex-1 truncate">{svc.name}</span>
                  {svc.ports && svc.ports.length > 0 && (
                    <span className="flex shrink-0 gap-1">
                      {svc.ports.map((p) => (
                        <a
                          key={p}
                          href={`http://localhost:${p}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="rounded outline-none hover:brightness-125 focus-visible:ring-1 focus-visible:ring-phosphor"
                        >
                          <Chip tone="phosphor">:{p}</Chip>
                        </a>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {children}

          {metrics && (
            <div className="mt-auto flex justify-around overflow-visible border-t border-panel-edge px-2 py-3">
              {metrics.cpu != null && <CircularGauge size="sm" value={metrics.cpu} label="CPU" />}
              {metrics.mem != null && <CircularGauge size="sm" value={metrics.mem} label="MEM" />}
              {metrics.disk != null && (
                <CircularGauge size="sm" value={metrics.disk} label="DISK" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type ControlStripAction = {
  label: string;
  tone?: 'default' | 'phosphor' | 'amber' | 'danger';
  onClick: () => void;
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
  const gradId = useId();
  return (
    <svg viewBox="0 0 48 48" className={cn('h-11 w-11 shrink-0', className)} aria-hidden="true">
      <defs>
        <radialGradient id={gradId} cx="42%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#1a1a1a" />
          <stop offset="55%" stopColor="#0c0c0c" />
          <stop offset="100%" stopColor="#050505" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill={`url(#${gradId})`} stroke="#000" strokeWidth="1" />
      {Array.from({length: 12}, (_, i) => (
        <rect
          key={i}
          x="21.5"
          y="5"
          width="5"
          height="11"
          rx="2.5"
          fill="#030303"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="0.5"
          transform={`rotate(${i * 30} 24 24)`}
        />
      ))}
      <circle cx="24" cy="24" r="6" fill="#141414" stroke="#000" strokeWidth="1" />
      <circle cx="24" cy="24" r="2.5" fill="#0a0a0a" />
    </svg>
  );
}

export function ControlStrip({
  masterOn,
  onMasterToggle,
  actions,
  gauges,
  notifications = [],
  version,
  network,
}: {
  masterOn: boolean;
  onMasterToggle: () => void;
  actions: ControlStripAction[];
  gauges: ControlStripGauge[];
  notifications?: ControlStripNotification[];
  version?: string;
  network?: {up: string; down: string};
}) {
  const notifColor = (tone?: string) =>
    tone === 'phosphor'
      ? 'var(--color-phosphor)'
      : tone === 'amber'
      ? 'var(--color-amber)'
      : tone === 'danger'
      ? 'var(--color-danger)'
      : 'var(--color-ink-faint)';

  return (
    <div className="bezel-raised rounded-lg p-2">
      <div className="bezel-recessed rounded-md bg-bezel px-4 py-1">
        <div className="flex flex-wrap items-stretch gap-6">
          <div className="flex items-center gap-3 self-center">
            <MasterPower on={masterOn} onToggle={onMasterToggle} />
            <span className="font-ui text-[9px] uppercase tracking-widest text-ink-faint">
              Master Power
            </span>
          </div>

          <div className="flex flex-wrap gap-2 self-center">
            {actions.map((a) => (
              <BacklitButton key={a.label} tone={a.tone} onClick={a.onClick}>
                {a.label}
              </BacklitButton>
            ))}
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-center gap-5 self-center">
            {gauges.map((g) => (
              <CircularGauge key={g.label} value={g.value} label={g.label} unit={g.unit} />
            ))}
          </div>

          {notifications.length > 0 && (
            <ul className="min-w-[140px] space-y-1 self-center text-[10px]">
              {notifications.map((n, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Led
                    status={
                      n.tone === 'danger'
                        ? 'failed'
                        : n.tone === 'amber'
                        ? 'starting'
                        : n.tone === 'phosphor'
                        ? 'healthy'
                        : 'idle'
                    }
                  />
                  <span className="flex-1" style={{color: notifColor(n.tone)}}>
                    {n.message}
                  </span>
                  {n.time && <span className="text-ink-faint">{n.time}</span>}
                </li>
              ))}
            </ul>
          )}

          <div className="relative ml-auto flex shrink-0 self-stretch">
            <div className="bezel-recessed relative flex h-full min-w-[240px] items-center gap-3 rounded-md px-4 py-2">
              <Screw className="top-1.5 left-1.5" />
              <Screw className="top-1.5 right-1.5" />
              <Screw className="bottom-1.5 left-1.5" />
              <Screw className="bottom-1.5 right-1.5" />
              <VentGrill className="h-full max-h-20 w-auto" />
              <div className="pr-1">
                <div className="font-ui text-[11px] font-semibold tracking-[0.12em] text-ink">
                  CONTROL{version ? ` v${version}` : ''}
                </div>
                <div className="mt-0.5 text-[10px] text-ink-dim">Stay in control.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
