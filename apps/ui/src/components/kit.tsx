import {useEffect, useId, useRef, useState, type PointerEvent, type ReactNode} from 'react';
import {Switch} from '@base-ui/react/switch';
import type {Icon} from '@phosphor-icons/react';
import type {RunStatus} from '@control/shared';
import {cn} from '../lib/cn.js';
import {Button} from './ui.js';

export {Button, TextInput, Select, Combobox, fieldBase} from './ui.js';
export type {
  ButtonProps,
  ButtonVariant,
  ButtonTone,
  ButtonSize,
  TextInputProps,
  SelectProps,
  SelectOption,
  SelectOptionGroup,
  SelectSize,
  ComboboxProps,
  ComboboxOption,
  ComboboxOptionGroup,
} from './ui.js';

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
    <span className="inline-flex shrink-0 items-center justify-center overflow-visible p-2">
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
    </span>
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
    <section
      className={`bezel-raised flex min-w-0 flex-col overflow-visible rounded-xl p-5 max-lg:p-3 ${className}`}
    >
      <Screw className="top-2 left-2" />
      <Screw className="top-2 right-2" />
      <Screw className="bottom-2 left-2" />
      <Screw className="bottom-2 right-2" />

      <div className="bezel-recessed flex min-h-0 flex-1 flex-col overflow-visible rounded-2xl bg-bezel">
        <div className={`h-full min-h-0 flex-1 ${crt ? 'crt-frame p-0' : 'p-0'}`}>
          <div className="bezel-recessed h-full min-h-0 rounded-2xl border-0! bg-bezel p-4">
            <div
              className={
                crt
                  ? 'crt bezel-recessed h-full min-h-0 rounded-xl border-0! p-4'
                  : 'h-full min-h-0'
              }
            >
              <div className="relative z-10 flex h-full min-h-0 flex-col overflow-visible">
                {(title || right) && (
                  <header className="font-ui mb-1 flex shrink-0 items-center justify-between gap-3 overflow-visible pb-1">
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
                <div className="flex min-h-0 flex-1 flex-col overflow-visible">{children}</div>
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
      ? 'border-phosphor-dim/70 text-phosphor bg-phosphor/10 text-glow shadow-[inset_0_1px_2px_rgba(0,0,0,0.45),0_0_8px_-1px_var(--color-phosphor)]'
      : tone === 'amber'
      ? 'border-amber text-amber bg-amber/6 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]'
      : tone === 'info'
      ? 'border-info text-info bg-info/6 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]'
      : 'border-panel-edge text-ink-dim bg-bezel shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]';
  return (
    <span
      className={`inline-flex items-center overflow-visible rounded px-2 py-0.5 text-[11px] font-medium ${toneCls}`}
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
  size?: 'xs' | 'sm' | 'md';
  /** Replaces the numeric readout (e.g. network up/down). */
  detail?: ReactNode;
  formatValue?: (value: number) => ReactNode;
}) {
  const px = size === 'xs' ? 40 : size === 'sm' ? 56 : 72;
  const stroke = size === 'xs' ? 3 : size === 'sm' ? 4 : 5;
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
          className="pointer-events-none absolute flex flex-col items-center justify-center px-1.5"
          style={{inset: GAUGE_GLOW_PAD}}
        >
          <span
            className={cn(
              'font-ui font-medium uppercase tracking-[0.14em] text-ink-dim',
              size === 'xs' ? 'text-[7px]' : 'text-[9px]'
            )}
          >
            {label}
          </span>
          <span
            className={cn(
              'gauge-readout font-ui mt-0.5 font-semibold leading-none text-ink tabular-nums',
              size === 'xs' ? 'text-[11px]' : size === 'sm' ? 'text-sm' : 'text-base',
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
  /** Press-and-hold duration (ms) before `onClick` fires. Omit for instant click. */
  holdMs,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'phosphor' | 'amber' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  holdMs?: number;
}) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const clearHold = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
  };

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    []
  );

  if (holdMs == null || holdMs <= 0) {
    return (
      <Button variant="backlit" tone={tone} size={size} disabled={disabled} onClick={onClick}>
        {children}
      </Button>
    );
  }

  const startHold = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    firedRef.current = false;
    setHolding(true);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ms = reduce ? Math.min(holdMs, 800) : holdMs;
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true;
      timerRef.current = null;
      setHolding(false);
      onClick?.();
    }, ms);
  };

  const endHold = () => {
    if (firedRef.current) return;
    clearHold();
  };

  return (
    <Button
      variant="backlit"
      tone={tone}
      size={size}
      disabled={disabled}
      className="hold-confirm-btn"
      data-holding={holding ? '' : undefined}
      title="Hold to confirm"
      onPointerDown={startHold}
      onPointerUp={endHold}
      onPointerLeave={endHold}
      onPointerCancel={endHold}
      onClick={(e) => e.preventDefault()}
    >
      <span className="hold-confirm-fill" aria-hidden />
      <span className="hold-confirm-label">{children}</span>
    </Button>
  );
}

/** Soft resistance past a boundary (Apple rubber-band). */
function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/**
 * Rubber-band past a knob end stop, capped so the pointer never crosses
 * middle-bottom (±180°). Without the cap, large drags wrap into the opposite half.
 */
function cappedRubberband(overshoot: number, maxOvershoot: number): number {
  if (maxOvershoot <= 0) return 0;
  const sign = Math.sign(overshoot) || 1;
  return sign * Math.min(Math.abs(rubberband(overshoot, maxOvershoot)), maxOvershoot);
}

/** Stepped rotary for discrete hardware filters (e.g. log level). */
export function RotaryKnob({
  value,
  steps,
  onChange,
  label,
  size = 'sm',
  disabled,
}: {
  value: number;
  steps: number;
  onChange: (value: number) => void;
  label?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  const clamped = Math.max(0, Math.min(steps - 1, value));
  const px = size === 'sm' ? 28 : 36;
  const ring = size === 'sm' ? 40 : 50;
  // Sweep from ~-120° to +120° across steps
  const stepAngle = (i: number) => (steps <= 1 ? 0 : -120 + (240 * i) / (steps - 1));
  // 60° past either end stop ⇒ middle-bottom; expressed in step units.
  const maxOvershoot = steps <= 1 ? 0 : 0.25 * (steps - 1);
  const dragRef = useRef<{startY: number; startValue: number} | null>(null);
  const movedRef = useRef(false);
  const [dragStep, setDragStep] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const displayStep = dragStep ?? clamped;
  const visualStep =
    displayStep < 0
      ? cappedRubberband(displayStep, maxOvershoot)
      : displayStep > steps - 1
      ? steps - 1 + cappedRubberband(displayStep - (steps - 1), maxOvershoot)
      : displayStep;
  const angle = stepAngle(visualStep);

  const setFromDelta = (deltaY: number) => {
    if (disabled || !dragRef.current) return;
    const raw = dragRef.current.startValue + deltaY / -18;
    setDragStep(raw);
    const snapped = Math.max(0, Math.min(steps - 1, Math.round(raw)));
    if (snapped !== clamped) onChange(snapped);
  };

  const endDrag = () => {
    if (dragRef.current && dragStep != null) {
      const snapped = Math.max(0, Math.min(steps - 1, Math.round(dragStep)));
      if (snapped !== clamped) onChange(snapped);
    }
    dragRef.current = null;
    setDragStep(null);
    setIsDragging(false);
  };

  return (
    <div className={cn('flex flex-col items-center', disabled && 'opacity-40')}>
      <div className="knob-wrap relative shrink-0" style={{width: ring, height: ring}}>
        {/* Travel arc −120°…+120° (CSS angles from top); dead zone at bottom stays open */}
        <svg
          className="knob-arc pointer-events-none absolute inset-0"
          viewBox="0 0 40 40"
          aria-hidden
        >
          <path className="knob-arc-path" d="M 4.41 29 A 18 18 0 1 1 35.59 29" fill="none" />
        </svg>
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
          disabled={disabled}
          aria-label={label ?? 'Filter'}
          aria-valuemin={0}
          aria-valuemax={steps - 1}
          aria-valuenow={clamped}
          className={cn(
            'knob absolute inset-0 rounded-full',
            disabled ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
          )}
          onPointerDown={(e) => {
            if (disabled) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = {startY: e.clientY, startValue: clamped};
            movedRef.current = false;
            setIsDragging(true);
          }}
          onPointerMove={(e) => {
            if (!dragRef.current || disabled) return;
            const dy = e.clientY - dragRef.current.startY;
            if (Math.abs(dy) > 4) movedRef.current = true;
            setFromDelta(dy);
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={() => {
            if (disabled) return;
            if (movedRef.current) {
              movedRef.current = false;
              return;
            }
            onChange((clamped + 1) % steps);
          }}
        >
          <span
            className={cn(
              'knob-face absolute left-1/2 top-1/2 rounded-full',
              isDragging && 'knob-face-dragging'
            )}
            style={{
              width: px,
              height: px,
              transform: `translate(-50%, -50%) rotate(${angle}deg)`,
            }}
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
  size = 'md',
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const compact = size === 'sm';
  return (
    <Switch.Root
      checked={on}
      disabled={disabled}
      nativeButton
      render={<button type="button" />}
      onCheckedChange={() => onToggle()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'rocker-housing rocker-danger font-ui relative flex flex-col rounded-md font-bold tracking-wide data-disabled:opacity-40',
        compact ? 'h-12 w-10 p-1 text-[8px]' : 'h-18 w-21 p-1.5 text-[10px]',
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
            'rocker-face-off font-ui uppercase tracking-wider',
            compact ? 'text-[6px]' : 'text-[8px]',
            on ? 'rocker-segment-raised' : 'rocker-segment-sunk'
          )}
        >
          {compact ? 'All' : 'All Systems'}
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
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: Icon;
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
        <Icon size={18} weight={active ? 'fill' : 'regular'} />
      </span>
      {label}
    </Button>
  );
}
