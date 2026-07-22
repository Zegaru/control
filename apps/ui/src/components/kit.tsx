import {useEffect, useId, useRef, useState, type PointerEvent, type ReactNode} from 'react';
import {Switch} from '@base-ui/react/switch';
import {isActiveStatus, type RunStatus} from '@control/shared';
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
                crt ? 'crt bezel-recessed h-full min-h-0 rounded-xl border-0! p-4' : 'h-full min-h-0'
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

/** Environment picker — stepped rotary knob, one position per env. */
export function EnvironmentToggleBank({
  environments,
  activeId,
  showFavorites,
  favoritesActive,
  onSelect,
}: {
  environments: {id: string; name: string}[];
  activeId: string | null;
  showFavorites?: boolean;
  favoritesActive?: boolean;
  onSelect: (id: string | null) => void;
}) {
  if (environments.length <= 1) return null;

  const options = showFavorites
    ? [{id: null as string | null, name: 'Favorites'}, ...environments]
    : environments.map((e) => ({id: e.id as string | null, name: e.name}));

  const resolvedId = favoritesActive && showFavorites ? null : activeId;
  const value = Math.max(
    0,
    options.findIndex((o) => o.id === resolvedId),
  );

  if (options.length === 0) return null;

  return (
    <div
      className="flex justify-center border-b border-panel-edge px-4 py-2.5"
      onClick={(e) => e.stopPropagation()}
    >
      <RotaryKnob
        value={value}
        steps={options.length}
        onChange={(i) => onSelect(options[i]?.id ?? null)}
        label={options[value]?.name}
        size="sm"
      />
    </div>
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
    [],
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
        <svg className="knob-arc pointer-events-none absolute inset-0" viewBox="0 0 40 40" aria-hidden>
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
        compact
          ? 'h-12 w-14 p-1 text-[8px]'
          : 'h-18 w-21 p-1.5 text-[10px]',
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
  const waveRef = useRef<SVGPolylineElement>(null);

  useEffect(() => {
    if (!online) return;
    const samples = Array.from({length: AGENT_WAVE_SAMPLES}, () => AGENT_WAVE_MID);
    let frame = 0;
    let lastTick = 0;

    const tick = (now: number) => {
      if (now - lastTick >= 55) {
        lastTick = now;
        samples.push(nextAgentSample(samples[samples.length - 1] ?? AGENT_WAVE_MID));
        samples.shift();
        waveRef.current?.setAttribute('points', agentSamplesToPoints(samples));
      }
      frame = requestAnimationFrame(tick);
    };

    waveRef.current?.setAttribute('points', agentSamplesToPoints(samples));
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
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
              ref={waveRef}
              points={agentSamplesToPoints(
                Array.from({length: AGENT_WAVE_SAMPLES}, () => AGENT_WAVE_MID)
              )}
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
  key: string;
  name: string;
  status: RunStatus | 'idle';
  ports?: number[];
  pulse?: boolean;
  kind?: 'action' | 'group' | 'container';
  actionId?: string;
  groupId?: string;
  runId?: string | null;
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
  environments = [],
  selectedEnvironmentId = null,
  defaultEnvironmentId = null,
  onSelectEnvironment,
  onOpenRun,
  onToggleService,
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
  environments?: { id: string; name: string }[];
  selectedEnvironmentId?: string | null;
  defaultEnvironmentId?: string | null;
  onSelectEnvironment?: (id: string | null) => void;
  onOpenRun?: (runId: string) => void;
  onToggleService?: (service: ProjectService) => void;
  children?: ReactNode;
}) {
  if (variant === 'add') {
    return (
      <Button
        variant="ghost"
        onClick={onClick}
        className="bezel-raised flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-panel-edge text-ink-faint hover:not-data-disabled:border-phosphor-dim hover:not-data-disabled:text-phosphor"
      >
        <span className="text-3xl">+</span>
        <span className="font-ui text-[11px] uppercase tracking-wider">Add Project</span>
      </Button>
    );
  }

  const projectStatus: RunStatus | 'idle' = busy ? 'starting' : on ? 'healthy' : 'idle';
  const activeEnvironmentId = selectedEnvironmentId ?? defaultEnvironmentId ?? null;
  const favoritesActive = activeEnvironmentId === null;

  return (
    <div className="bezel-raised flex h-full min-h-0 flex-col overflow-visible rounded-lg p-1.5">
      <div className="bezel-recessed flex min-h-0 flex-1 flex-col overflow-visible rounded-md bg-bezel">
        <div className="flex shrink-0 items-start justify-between gap-3 overflow-visible border-b border-panel-edge px-4 py-3">
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

        <div className="flex min-h-0 flex-1 flex-col">
          {environments.length > 0 && onSelectEnvironment && (
            <div className="shrink-0">
              <EnvironmentToggleBank
                environments={environments}
                activeId={activeEnvironmentId}
                showFavorites={!defaultEnvironmentId}
                favoritesActive={favoritesActive}
                onSelect={onSelectEnvironment}
              />
            </div>
          )}
          {services.length > 0 && (
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {services.map((svc) => {
                const active =
                  svc.status !== 'idle' && isActiveStatus(svc.status);
                const canToggle = !!(svc.actionId || svc.groupId) && onToggleService;
                return (
                  <li key={svc.key} className="flex items-center gap-2 text-[12px] text-ink-dim">
                    <Led status={svc.status} pulse={svc.pulse} ring={active} />
                    <Button
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (svc.runId) onOpenRun?.(svc.runId);
                      }}
                      disabled={!svc.runId}
                      className="min-w-0 flex-1 justify-start truncate px-0 py-0 text-left hover:not-data-disabled:text-ink"
                      title={svc.kind === 'group' ? 'Open logs (first active step)' : undefined}
                    >
                      {svc.name}
                      {svc.kind === 'group' && (
                        <span className="ml-1.5 text-[9px] uppercase tracking-wider text-ink-faint">
                          group
                        </span>
                      )}
                    </Button>
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
                    {canToggle && (
                      <Button
                        variant={active ? 'danger' : 'primary'}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleService(svc);
                        }}
                        className="shrink-0 px-2 py-0.5 text-[9px]"
                      >
                        {active ? 'STOP' : 'START'}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {children}

          {metrics && (
            <div className="mt-auto flex shrink-0 justify-around overflow-visible border-t border-panel-edge px-2 py-3">
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
          compact ? 'px-2 py-1.5' : 'py-2.5 pl-5 pr-3'
        )}
      >
        <div
          className={cn(
            'flex min-w-0 items-center overflow-visible',
            compact ? 'justify-between gap-1.5' : 'gap-6'
          )}
        >
          <div className="flex shrink-0 items-center gap-3 overflow-visible">
            <MasterPower
              on={masterOn}
              onToggle={onMasterToggle}
              size={compact ? 'sm' : 'md'}
            />
            {!compact && (
              <span className="font-ui text-[9px] uppercase tracking-widest text-ink-faint">
                Master Power
              </span>
            )}
          </div>

          <div className={cn('flex shrink-0 items-center overflow-visible', compact ? 'gap-1' : 'gap-2')}>
            {actions.map((a) => (
              <BacklitButton
                key={a.label}
                tone={a.tone}
                size={compact ? 'sm' : 'md'}
                onClick={a.onClick}
                holdMs={a.holdMs}
                disabled={a.disabled}
              >
                {compact ? (a.shortLabel ?? a.label) : a.label}
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
                  <div className="font-ui text-[11px] font-semibold tracking-[0.12em] text-ink">
                    CONTROL{version ? ` v${version}` : ''}
                  </div>
                  <div className="mt-0.5 text-[10px] text-ink-dim">Stay in control.</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
