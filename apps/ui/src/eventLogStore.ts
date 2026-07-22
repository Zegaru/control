import { useCallback, useSyncExternalStore } from 'react'
import type { RunStatus } from '@control/shared'

const MAX_EVENTS = 50

export type EventLogLevel = 'info' | 'warn' | 'error'

export type EventLogEntry = {
  id: string
  at: number
  runId: string
  actionId: string
  project: string
  name: string
  status: RunStatus
  exitCode?: number | null
  ports: number[]
  level: EventLogLevel
}

let eventSeq = 0
let events: EventLogEntry[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function pushEventLog(entry: EventLogEntry) {
  events = [entry, ...events].slice(0, MAX_EVENTS)
  emit()
}

export function clearEventLog() {
  events = []
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot() {
  return events
}

export function nextEventLogId(runId: string) {
  return `${runId}-${++eventSeq}`
}

export function useEventLog(): { events: EventLogEntry[]; clearEvents: () => void } {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const clearEvents = useCallback(() => clearEventLog(), [])
  return { events: snapshot, clearEvents }
}
