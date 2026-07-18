import { useId, type ReactNode } from 'react'
import type { RunStatus } from '@control/shared'

export function statusColor(status: RunStatus | 'idle'): string {
  switch (status) {
    case 'healthy':
      return 'var(--color-phosphor)'
    case 'running':
      return 'var(--color-phosphor-dim)'
    case 'starting':
      return 'var(--color-amber)'
    case 'unhealthy':
    case 'adopted':
      return 'var(--color-amber)'
    case 'failed':
    case 'killed':
      return 'var(--color-danger)'
    default:
      return 'var(--color-ink-faint)'
  }
}

export function statusLabel(status: RunStatus | 'idle'): string {
  return status.toUpperCase()
}

export function Led({
  status,
  pulse,
  ring,
}: {
  status: RunStatus | 'idle'
  pulse?: boolean
  ring?: boolean
}) {
  const color = statusColor(status)
  return (
    <span
      className={`led inline-block h-2.5 w-2.5 shrink-0 rounded-full ${ring ? 'led-ring' : ''} ${pulse ? 'animate-pulse' : ''}`}
      style={{ backgroundColor: color, color }}
      aria-label={statusLabel(status)}
    />
  )
}

export function Panel({
  title,
  right,
  children,
  className = '',
  crt,
}: {
  title?: string
  right?: ReactNode
  children: ReactNode
  className?: string
  crt?: boolean
}) {
  return (
    <section className={`bezel-raised overflow-hidden rounded-lg ${className}`}>
      {title && (
        <header className="font-ui flex items-center justify-between border-b border-[var(--color-panel-edge)] bg-[var(--color-bezel)] px-4 py-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-dim)]">
            {title}
          </h2>
          {right}
        </header>
      )}
      <div className={crt ? 'crt-frame' : 'p-4'}>
        <div className={crt ? 'crt bezel-recessed rounded-md p-4' : ''}>{children}</div>
      </div>
    </section>
  )
}

/** Chunky on/off rocker. `on` reflects running state; `busy` shows amber. */
export function RockerToggle({
  on,
  busy,
  onToggle,
  disabled,
  labels = ['ON', 'OFF'],
}: {
  on: boolean
  busy?: boolean
  onToggle: () => void
  disabled?: boolean
  labels?: [string, string]
}) {
  const glow = busy ? 'var(--color-amber)' : on ? 'var(--color-phosphor)' : 'transparent'
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      disabled={disabled}
      aria-pressed={on}
      className="rocker-housing font-ui relative flex h-14 w-16 flex-col overflow-hidden rounded-md p-0.5 text-[10px] font-bold disabled:opacity-40"
      style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -2px 4px rgba(0,0,0,0.5), 0 0 14px -2px ${glow}` }}
    >
      <span
        className={`flex flex-1 items-center justify-center rounded-sm transition-colors ${on ? `rocker-segment-on text-black ${busy ? 'busy' : ''}` : 'text-[var(--color-ink-faint)]'}`}
      >
        {labels[0]}
      </span>
      <span
        className={`mt-0.5 flex flex-1 items-center justify-center rounded-sm transition-colors ${!on ? 'rocker-segment-off text-[var(--color-ink)]' : 'text-[var(--color-ink-faint)]'}`}
      >
        {labels[1]}
      </span>
    </button>
  )
}

export function Chip({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: 'default' | 'phosphor' | 'amber' | 'info'
}) {
  const toneCls =
    tone === 'phosphor'
      ? 'border-[var(--color-phosphor-dim)] text-[var(--color-phosphor)] bg-[rgba(125,252,154,0.06)]'
      : tone === 'amber'
        ? 'border-[var(--color-amber)] text-[var(--color-amber)] bg-[rgba(245,179,74,0.06)]'
        : tone === 'info'
          ? 'border-[var(--color-info)] text-[var(--color-info)] bg-[rgba(94,184,255,0.06)]'
          : 'border-[var(--color-panel-edge)] text-[var(--color-ink-dim)] bg-[var(--color-bezel)]'
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] ${toneCls}`}
    >
      {children}
    </span>
  )
}

export function SegmentCounter({
  value,
  label,
  tone = 'phosphor',
}: {
  value: number | string
  label: string
  tone?: 'phosphor' | 'amber' | 'danger' | 'dim'
}) {
  const color =
    tone === 'phosphor'
      ? 'var(--color-phosphor)'
      : tone === 'amber'
        ? 'var(--color-amber)'
        : tone === 'danger'
          ? 'var(--color-danger)'
          : 'var(--color-ink-faint)'
  const glowCls =
    tone === 'phosphor'
      ? 'text-glow'
      : tone === 'amber'
        ? 'text-glow-amber'
        : tone === 'danger'
          ? 'text-glow-danger'
          : ''
  return (
    <div className="bezel-recessed rounded-md px-4 py-3 text-center">
      <div className={`text-3xl font-bold ${glowCls}`} style={{ color }}>
        {value}
      </div>
      <div className="font-ui mt-1 text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
        {label}
      </div>
    </div>
  )
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = {
    x: cx + r * Math.cos(startAngle),
    y: cy + r * Math.sin(startAngle),
  }
  const end = {
    x: cx + r * Math.cos(endAngle),
    y: cy + r * Math.sin(endAngle),
  }
  const large = endAngle - startAngle > Math.PI ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`
}

function DialArc({
  value,
  size,
  strokeWidth,
  color,
}: {
  value: number
  size: number
  strokeWidth: number
  color: string
}) {
  const gradId = useId().replace(/:/g, '')
  const clamped = Math.max(0, Math.min(100, value))
  const cx = size / 2
  const cy = size / 2
  const r = (size - strokeWidth) / 2 - 2
  const start = Math.PI * 0.75
  const sweep = Math.PI * 1.5
  const end = start + (sweep * clamped) / 100
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = start + (sweep * i) / 11
    const inner = r - strokeWidth
    const outer = r + 1
    return {
      x1: cx + inner * Math.cos(a),
      y1: cy + inner * Math.sin(a),
      x2: cx + outer * Math.cos(a),
      y2: cy + outer * Math.sin(a),
    }
  })

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
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
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
  )
}

export function RotaryKnob({
  value,
  label,
  size = 'sm',
}: {
  value: number
  label: string
  size?: 'sm' | 'md'
}) {
  const px = size === 'sm' ? 48 : 64
  const stroke = size === 'sm' ? 3 : 4
  const tone =
    value >= 85 ? 'var(--color-danger)' : value >= 60 ? 'var(--color-amber)' : 'var(--color-phosphor)'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="knob-face bezel-recessed relative rounded-full p-1">
        <DialArc value={value} size={px} strokeWidth={stroke} color={tone} />
        <span
          className="absolute inset-0 flex items-center justify-center text-[9px] font-bold"
          style={{ color: tone }}
        >
          {Math.round(value)}
        </span>
      </div>
      <span className="font-ui text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        {label}
      </span>
    </div>
  )
}

export function CircularGauge({
  value,
  label,
  unit = '%',
}: {
  value: number
  label: string
  unit?: string
}) {
  const px = 72
  const tone =
    value >= 85 ? 'var(--color-danger)' : value >= 60 ? 'var(--color-amber)' : 'var(--color-info)'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="knob-face bezel-recessed relative rounded-full p-1.5">
        <DialArc value={value} size={px} strokeWidth={5} color={tone} />
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold" style={{ color: tone }}>
            {Math.round(value)}
            {unit}
          </span>
        </span>
      </div>
      <span className="font-ui text-[10px] uppercase tracking-wider text-[var(--color-ink-dim)]">
        {label}
      </span>
    </div>
  )
}

export function BacklitButton({
  children,
  onClick,
  tone = 'default',
  size = 'md',
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  tone?: 'default' | 'phosphor' | 'amber' | 'danger'
  size?: 'sm' | 'md'
  disabled?: boolean
}) {
  const border =
    tone === 'phosphor'
      ? 'var(--color-phosphor-dim)'
      : tone === 'amber'
        ? 'var(--color-amber)'
        : tone === 'danger'
          ? 'var(--color-danger)'
          : 'var(--color-panel-edge)'
  const text =
    tone === 'phosphor'
      ? 'var(--color-phosphor)'
      : tone === 'amber'
        ? 'var(--color-amber)'
        : tone === 'danger'
          ? 'var(--color-danger)'
          : 'var(--color-ink-dim)'
  const glow =
    tone === 'phosphor'
      ? 'glow-phosphor'
      : tone === 'amber'
        ? 'glow-amber'
        : tone === 'danger'
          ? 'glow-danger'
          : ''
  const pad = size === 'sm' ? 'px-3 py-1.5 text-[10px]' : 'px-4 py-2 text-[11px]'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`backlit-btn font-ui rounded uppercase tracking-widest font-semibold disabled:opacity-40 ${pad} ${glow}`}
      style={{ borderColor: border, color: text }}
    >
      {children}
    </button>
  )
}

/** Red master power rocker for ALL SYSTEMS. */
export function MasterPower({
  on,
  onToggle,
  disabled,
}: {
  on: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  const glow = on ? 'var(--color-danger-glow)' : 'transparent'
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      disabled={disabled}
      aria-pressed={on}
      className="rocker-housing rocker-danger font-ui relative flex h-16 w-20 flex-col overflow-hidden rounded-md p-0.5 text-[9px] font-bold disabled:opacity-40"
      style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -2px 4px rgba(0,0,0,0.5), 0 0 16px -2px ${glow}` }}
    >
      <span
        className={`flex flex-[2] items-center justify-center rounded-sm transition-colors ${on ? 'rocker-segment-on danger text-black' : 'text-[var(--color-ink-faint)]'}`}
      >
        ON
      </span>
      <span className="font-ui rocker-segment-off mt-0.5 flex flex-1 items-center justify-center rounded-sm text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        All Systems
      </span>
    </button>
  )
}

export function Sparkline({
  data,
  label,
  unit,
}: {
  data: number[]
  label: string
  unit?: string
}) {
  const w = 120
  const h = 32
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const points = data
    .map((v, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * w
      const y = h - ((v - min) / range) * (h - 4) - 2
      return `${x},${y}`
    })
    .join(' ')
  const latest = data[data.length - 1] ?? 0
  return (
    <div className="bezel-recessed rounded-md px-3 py-2">
      <div className="font-ui mb-1 flex items-baseline justify-between text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        <span>{label}</span>
        <span className="text-[var(--color-phosphor)]">
          {latest}
          {unit}
        </span>
      </div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-phosphor)"
          strokeWidth={1.5}
          style={{ filter: 'drop-shadow(0 0 3px var(--color-phosphor))' }}
        />
      </svg>
    </div>
  )
}

export function TerminalScreen({
  children,
  footer,
  className = '',
}: {
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <div className={`crt bezel-recessed overflow-hidden rounded-md ${className}`}>
      <div className="max-h-64 overflow-y-auto p-3 text-[11px] leading-relaxed">{children}</div>
      {footer && (
        <div className="font-ui flex items-center gap-3 border-t border-[var(--color-panel-edge)] bg-[var(--color-bezel)] px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
          {footer}
        </div>
      )}
    </div>
  )
}

export function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`font-ui flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
        active
          ? 'border-l-2 border-[var(--color-amber)] bg-[var(--color-panel-raised)] pl-[10px] text-[var(--color-amber)]'
          : 'text-[var(--color-ink-dim)] hover:bg-[var(--color-panel-raised)]'
      }`}
    >
      <span className="w-4 shrink-0 text-center">{icon}</span>
      {label}
    </button>
  )
}

export function AgentStatus({
  online,
  label,
}: {
  online: boolean
  label?: string
}) {
  return (
    <div className="bezel-recessed rounded-md p-3">
      <div className="flex items-center gap-2 text-[10px] text-[var(--color-ink-faint)]">
        <Led status={online ? 'healthy' : 'failed'} pulse={online} ring />
        <span className="font-ui uppercase tracking-wider">{label ?? (online ? 'Agent Running' : 'Agent Offline')}</span>
      </div>
      {online && (
        <div className="mt-2 overflow-hidden">
          <svg viewBox="0 0 100 20" className="waveform-track h-5 w-[120%]" aria-hidden>
            <polyline
              points="0,12 8,8 16,14 24,6 32,10 40,4 48,12 56,7 64,11 72,5 80,9 88,13 96,6"
              fill="none"
              stroke="var(--color-phosphor)"
              strokeWidth={1.5}
              style={{ filter: 'drop-shadow(0 0 3px var(--color-phosphor))' }}
            />
          </svg>
        </div>
      )}
    </div>
  )
}

export type ProjectService = {
  name: string
  status: RunStatus | 'idle'
  ports?: number[]
  pulse?: boolean
}

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
  variant?: 'default' | 'add'
  name?: string
  path?: string
  on?: boolean
  busy?: boolean
  onToggle?: () => void
  onClick?: () => void
  favorite?: boolean
  services?: ProjectService[]
  metrics?: { cpu?: number; mem?: number; disk?: number }
  children?: ReactNode
}) {
  if (variant === 'add') {
    return (
      <button
        onClick={onClick}
        className="bezel-raised flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border-dashed text-[var(--color-ink-faint)] transition-colors hover:border-[var(--color-phosphor-dim)] hover:text-[var(--color-phosphor)]"
      >
        <span className="text-3xl">+</span>
        <span className="font-ui text-[11px] uppercase tracking-wider">Add Project</span>
      </button>
    )
  }

  return (
    <div className="module-face bezel-raised flex flex-col rounded-lg">
      <div className="flex items-start justify-between gap-2 border-b border-[var(--color-panel-edge)] px-4 py-3">
        <button onClick={onClick} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="font-ui text-sm font-semibold uppercase tracking-wide">{name}</span>
            {favorite && <span style={{ color: 'var(--color-amber)' }}>★</span>}
          </div>
          {path && (
            <div className="mt-0.5 truncate text-[10px] text-[var(--color-ink-faint)]">{path}</div>
          )}
        </button>
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
          <div className="mt-auto flex justify-around border-t border-[var(--color-panel-edge)] pt-3">
            {metrics.cpu != null && <RotaryKnob value={metrics.cpu} label="CPU" />}
            {metrics.mem != null && <RotaryKnob value={metrics.mem} label="MEM" />}
            {metrics.disk != null && <RotaryKnob value={metrics.disk} label="DISK" />}
          </div>
        )}
      </div>
    </div>
  )
}

export type ControlStripAction = {
  label: string
  tone?: 'default' | 'phosphor' | 'amber' | 'danger'
  onClick: () => void
}

export type ControlStripGauge = {
  label: string
  value: number
  unit?: string
}

export type ControlStripNotification = {
  message: string
  tone?: 'phosphor' | 'amber' | 'danger' | 'dim'
  time?: string
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
  masterOn: boolean
  onMasterToggle: () => void
  actions: ControlStripAction[]
  gauges: ControlStripGauge[]
  notifications?: ControlStripNotification[]
  version?: string
  network?: { up: string; down: string }
}) {
  const notifColor = (tone?: string) =>
    tone === 'phosphor'
      ? 'var(--color-phosphor)'
      : tone === 'amber'
        ? 'var(--color-amber)'
        : tone === 'danger'
          ? 'var(--color-danger)'
          : 'var(--color-ink-faint)'

  return (
    <div className="bezel-raised mt-6 rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3">
          <MasterPower on={masterOn} onToggle={onMasterToggle} />
          <span className="font-ui text-[9px] uppercase tracking-widest text-[var(--color-ink-faint)]">
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
            <div className="font-ui mb-1 text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              Network
            </div>
            <div className="text-[var(--color-info)]">↑ {network.up}</div>
            <div className="text-[var(--color-info)]">↓ {network.down}</div>
          </div>
        )}

        {notifications.length > 0 && (
          <ul className="min-w-[140px] space-y-1 text-[10px]">
            {notifications.map((n, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <Led status={n.tone === 'danger' ? 'failed' : n.tone === 'amber' ? 'starting' : n.tone === 'phosphor' ? 'healthy' : 'idle'} />
                <span className="flex-1" style={{ color: notifColor(n.tone) }}>
                  {n.message}
                </span>
                {n.time && <span className="text-[var(--color-ink-faint)]">{n.time}</span>}
              </li>
            ))}
          </ul>
        )}

        {version && (
          <span className="font-ui ml-auto text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            v{version}
          </span>
        )}
      </div>
    </div>
  )
}
