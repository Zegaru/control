import type { ReactNode } from 'react'
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

export function Led({ status, pulse }: { status: RunStatus | 'idle'; pulse?: boolean }) {
  const color = statusColor(status)
  return (
    <span
      className={`led inline-block h-2.5 w-2.5 rounded-full ${pulse ? 'animate-pulse' : ''}`}
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
    <section
      className={`rounded-lg border border-[var(--color-panel-edge)] ${crt ? 'crt' : 'bg-[var(--color-panel-raised)]'} shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_2px_8px_rgba(0,0,0,0.4)] ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between border-b border-[var(--color-panel-edge)] px-4 py-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-dim)]">
            {title}
          </h2>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

/** Chunky on/off rocker. `on` reflects running state; `busy` shows amber. */
export function RockerToggle({
  on,
  busy,
  onToggle,
  disabled,
}: {
  on: boolean
  busy?: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  const glow = busy ? 'var(--color-amber)' : on ? 'var(--color-phosphor)' : 'transparent'
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      className="relative flex h-14 w-16 flex-col overflow-hidden rounded-md border border-[var(--color-panel-edge)] bg-[var(--color-bezel)] text-[10px] font-bold disabled:opacity-40"
      style={{ boxShadow: `0 0 12px -2px ${glow}` }}
    >
      <span
        className={`flex flex-1 items-center justify-center transition-colors ${on ? 'text-black' : 'text-[var(--color-ink-faint)]'}`}
        style={{ backgroundColor: on ? (busy ? 'var(--color-amber)' : 'var(--color-phosphor)') : 'transparent' }}
      >
        ON
      </span>
      <span
        className={`flex flex-1 items-center justify-center border-t border-[var(--color-panel-edge)] transition-colors ${!on ? 'bg-[#1c1c1c] text-[var(--color-ink)]' : 'text-[var(--color-ink-faint)]'}`}
      >
        OFF
      </span>
    </button>
  )
}

export function Chip({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'phosphor' | 'amber' }) {
  const toneCls =
    tone === 'phosphor'
      ? 'border-[var(--color-phosphor-dim)] text-[var(--color-phosphor)]'
      : tone === 'amber'
        ? 'border-[var(--color-amber)] text-[var(--color-amber)]'
        : 'border-[var(--color-panel-edge)] text-[var(--color-ink-dim)]'
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] ${toneCls}`}>
      {children}
    </span>
  )
}

export function SegmentCounter({ value, label, tone = 'phosphor' }: { value: number | string; label: string; tone?: 'phosphor' | 'amber' | 'danger' | 'dim' }) {
  const color =
    tone === 'phosphor'
      ? 'var(--color-phosphor)'
      : tone === 'amber'
        ? 'var(--color-amber)'
        : tone === 'danger'
          ? 'var(--color-danger)'
          : 'var(--color-ink-faint)'
  return (
    <div className="rounded-md border border-[var(--color-panel-edge)] bg-[var(--color-bezel)] px-4 py-3 text-center">
      <div className="text-3xl font-bold text-glow" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">{label}</div>
    </div>
  )
}
