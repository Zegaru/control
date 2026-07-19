import {useId, type ReactNode} from 'react';
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
}: {
  status: RunStatus | 'idle';
  pulse?: boolean;
  ring?: boolean;
}) {
  const color = statusColor(status);
  return (
    <span
      className={`led inline-block h-2.5 w-2.5 shrink-0 rounded-full ${ring ? 'led-ring' : ''} ${
        pulse ? 'animate-pulse' : ''
      }`}
      style={{backgroundColor: color, color}}
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
  title?: string;
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
            <div className={crt ? 'crt bezel-recessed border-0! h-full rounded-2xl p-6' : 'h-full'}>
              <div className="relative z-10 h-full">
                {title && (
                  <header className="font-ui flex items-center justify-between py-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-dim">
                      {title}
                    </h2>
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
  const topCls = busy
    ? 'rocker-segment-sunk'
    : on
      ? 'rocker-segment-lit'
      : 'rocker-segment-raised';
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
        'rocker-housing font-ui relative flex h-16 w-[4.25rem] flex-col rounded-md p-1.5 text-[11px] font-bold tracking-wide data-disabled:opacity-40',
        busy ? 'rocker-busy' : on ? 'rocker-on' : 'rocker-off',
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
      ? 'border-phosphor-dim text-phosphor bg-phosphor/6'
      : tone === 'amber'
      ? 'border-amber text-amber bg-amber/6'
      : tone === 'info'
      ? 'border-info text-info bg-info/6'
      : 'border-panel-edge text-ink-dim bg-bezel';
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] ${toneCls}`}
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
    <div className="crt-well rounded-md px-4 py-3 text-center">
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
  const gradId = useId().replace(/:/g, '');
  const clamped = Math.max(0, Math.min(100, value));
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2 - 2;
  const start = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  const end = start + (sweep * clamped) / 100;
  const ticks = Array.from({length: 12}, (_, i) => {
    const a = start + (sweep * i) / 11;
    const inner = r - strokeWidth;
    const outer = r + 1;
    return {
      x1: cx + inner * Math.cos(a),
      y1: cy + inner * Math.sin(a),
      x2: cx + outer * Math.cos(a),
      y2: cy + outer * Math.sin(a),
    };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {ticks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#444" strokeWidth={0.75} />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.35} fill={`url(#${gradId})`} />
      <defs>
        <radialGradient id={gradId} cx="35%" cy="30%">
          <stop offset="0%" stopColor="#444" />
          <stop offset="60%" stopColor="#1a1a1a" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </radialGradient>
      </defs>
      <path
        d={arcPath(cx, cy, r, start, start + sweep)}
        fill="none"
        stroke="var(--color-panel-edge)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {clamped > 0 && (
        <path
          d={arcPath(cx, cy, r, start, end)}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={{filter: `drop-shadow(0 0 4px ${color})`}}
        />
      )}
      <line
        x1={cx}
        y1={cy}
        x2={cx + r * 0.55 * Math.cos(end)}
        y2={cy + r * 0.55 * Math.sin(end)}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function RotaryKnob({
  value,
  label,
  size = 'sm',
}: {
  value: number;
  label: string;
  size?: 'sm' | 'md';
}) {
  const px = size === 'sm' ? 48 : 64;
  const stroke = size === 'sm' ? 3 : 4;
  const tone =
    value >= 85
      ? 'var(--color-danger)'
      : value >= 60
      ? 'var(--color-amber)'
      : 'var(--color-phosphor)';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="knob-face bezel-recessed relative rounded-full p-1">
        <DialArc value={value} size={px} strokeWidth={stroke} color={tone} />
        <span
          className="absolute inset-0 flex items-center justify-center text-[9px] font-bold"
          style={{color: tone}}
        >
          {Math.round(value)}
        </span>
      </div>
      <span className="font-ui text-[9px] uppercase tracking-wider text-ink-faint">{label}</span>
    </div>
  );
}

export function CircularGauge({
  value,
  label,
  unit = '%',
}: {
  value: number;
  label: string;
  unit?: string;
}) {
  const px = 72;
  const tone =
    value >= 85 ? 'var(--color-danger)' : value >= 60 ? 'var(--color-amber)' : 'var(--color-info)';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="knob-face bezel-recessed relative rounded-full p-1.5">
        <DialArc value={value} size={px} strokeWidth={5} color={tone} />
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold" style={{color: tone}}>
            {Math.round(value)}
            {unit}
          </span>
        </span>
      </div>
      <span className="font-ui text-[10px] uppercase tracking-wider text-ink-dim">{label}</span>
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
        'rocker-housing rocker-danger font-ui relative flex h-[4.5rem] w-[5.25rem] flex-col rounded-md p-1.5 text-[10px] font-bold tracking-wide data-disabled:opacity-40',
        on ? 'rocker-on' : 'rocker-off',
      )}
    >
      <span className="rocker-body">
        <span
          className={cn(
            'rocker-face-on rocker-face-tall',
            on ? 'rocker-segment-lit danger' : 'rocker-segment-raised',
          )}
        >
          ON
        </span>
        <span
          className={cn(
            'rocker-face-off font-ui text-[8px] uppercase tracking-wider',
            on ? 'rocker-segment-raised' : 'rocker-segment-sunk',
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
      <div className="crt bezel-recessed flex h-full flex-col overflow-hidden rounded-xl border border-[#000]">
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
      variant="ghost"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'font-ui relative flex w-full items-center justify-start gap-3 rounded-md px-3 py-2.5 text-left text-sm',
        active
          ? 'bg-amber/12 text-amber text-glow-amber hover:not-data-disabled:text-amber'
          : 'text-ink-dim hover:not-data-disabled:bg-panel-raised/50 hover:not-data-disabled:text-ink',
      )}
    >
      {active && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-amber"
          style={{boxShadow: '0 0 8px var(--color-amber)'}}
          aria-hidden
        />
      )}
      <span
        className={cn(
          'w-4 shrink-0 text-center',
          active && 'drop-shadow-[0_0_6px_var(--color-amber)]',
        )}
      >
        {icon}
      </span>
      {label}
    </Button>
  );
}

export function AgentStatus({online, label}: {online: boolean; label?: string}) {
  return (
    <div className="bezel-recessed rounded-lg px-3 py-3">
      <div className="flex items-center gap-2.5 text-[10px] text-ink-dim">
        <Led status={online ? 'healthy' : 'failed'} pulse={online} ring />
        <span className="font-ui uppercase tracking-wider">
          {label ?? (online ? 'Agent Running' : 'Agent Offline')}
        </span>
      </div>
      {online && (
        <div className="mt-2.5 overflow-hidden">
          <svg viewBox="0 0 120 24" className="waveform-track h-6 w-[130%]" aria-hidden>
            <polyline
              points="0,14 8,14 12,14 16,3 20,21 24,7 28,17 32,12 40,12 44,2 48,22 52,9 56,14 64,14 68,5 72,19 76,10 80,14 88,14 92,2 96,22 100,8 104,14 112,14 116,6 120,16"
              fill="none"
              stroke="var(--color-phosphor)"
              strokeWidth={1.75}
              strokeLinejoin="round"
              style={{
                filter:
                  'drop-shadow(0 0 3px var(--color-phosphor)) drop-shadow(0 0 8px var(--color-phosphor))',
              }}
            />
          </svg>
        </div>
      )}
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

  return (
    <div className="module-face bezel-raised flex flex-col rounded-lg p-1.5">
      <Screw className="top-2 left-2" />
      <Screw className="top-2 right-2" />
      <Screw className="bottom-2 left-2" />
      <Screw className="bottom-2 right-2" />
      <div className="bezel-recessed flex flex-1 flex-col overflow-hidden rounded-md bg-bezel">
        <div className="flex items-start justify-between gap-2 border-b border-panel-edge px-4 py-3">
          <Button
            variant="ghost"
            onClick={onClick}
            className="min-w-0 flex-1 items-start justify-start px-0 py-0 text-left hover:not-data-disabled:text-ink"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-ui text-sm font-semibold uppercase tracking-wide text-ink">
                  {name}
                </span>
                {favorite && <span className="text-amber">★</span>}
              </div>
              {path && <div className="mt-0.5 truncate text-[10px] text-ink-faint">{path}</div>}
            </div>
          </Button>
          {onToggle != null && on != null && (
            <RockerToggle on={on} busy={busy} onToggle={onToggle} />
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          {services.length > 0 && (
            <ul className="space-y-1.5">
              {services.map((svc) => (
                <li key={svc.name} className="flex items-center gap-2 text-[11px]">
                  <Led status={svc.status} pulse={svc.pulse} ring />
                  <span className="flex-1 truncate">{svc.name}</span>
                  <span className="flex gap-1">
                    {svc.ports?.map((p) => (
                      <Chip key={p} tone="phosphor">
                        :{p}
                      </Chip>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {children}

          {metrics && (
            <div className="mt-auto flex justify-around border-t border-panel-edge pt-3">
              {metrics.cpu != null && <RotaryKnob value={metrics.cpu} label="CPU" />}
              {metrics.mem != null && <RotaryKnob value={metrics.mem} label="MEM" />}
              {metrics.disk != null && <RotaryKnob value={metrics.disk} label="DISK" />}
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
    <div className="bezel-raised mt-2 rounded-lg p-2">
      <Screw className="top-2 left-2" />
      <Screw className="top-2 right-2" />
      <Screw className="bottom-2 left-2" />
      <Screw className="bottom-2 right-2" />
      <div className="bezel-recessed rounded-md bg-bezel p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <MasterPower on={masterOn} onToggle={onMasterToggle} />
            <span className="font-ui text-[9px] uppercase tracking-widest text-ink-faint">
              Master Power
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <BacklitButton key={a.label} tone={a.tone} onClick={a.onClick}>
                {a.label}
              </BacklitButton>
            ))}
          </div>

          <div className="flex flex-1 flex-wrap justify-center gap-6">
            {gauges.map((g) => (
              <CircularGauge key={g.label} value={g.value} label={g.label} unit={g.unit} />
            ))}
          </div>

          {network && (
            <div className="bezel-recessed rounded-md px-3 py-2 text-[10px]">
              <div className="font-ui mb-1 text-[9px] uppercase tracking-wider text-ink-faint">
                Network
              </div>
              <div className="text-info">↑ {network.up}</div>
              <div className="text-info">↓ {network.down}</div>
            </div>
          )}

          {notifications.length > 0 && (
            <ul className="min-w-[140px] space-y-1 text-[10px]">
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

          {version && (
            <span className="font-ui ml-auto text-[10px] uppercase tracking-wider text-ink-faint">
              v{version}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
