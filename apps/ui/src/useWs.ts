import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { WsClientMessage, WsEvent } from '@control/shared'

type LogListener = (runId: string, chunk: string) => void

/**
 * Single shared WebSocket to the daemon. Status/scan/port events invalidate the
 * relevant React Query caches so the UI reflects state in < 500ms (NFR-5).
 * Log chunks are pushed to registered per-run listeners (the run log view).
 */
export function useDaemonSocket(): {
  subscribeLogs: (runId: string, cb: LogListener) => () => void
  subscribeContainer: (containerId: string, cb: LogListener) => () => void
} {
  const qc = useQueryClient()
  const socketRef = useRef<WebSocket | null>(null)
  const logListeners = useRef<Map<string, Set<LogListener>>>(new Map())
  const containerListeners = useRef<Map<string, Set<LogListener>>>(new Map())

  useEffect(() => {
    let closed = false
    let ws: WebSocket

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws`)
      socketRef.current = ws

      ws.onmessage = (ev) => {
        let event: WsEvent
        try {
          event = JSON.parse(ev.data as string)
        } catch {
          return
        }
        switch (event.type) {
          case 'run.status':
            qc.invalidateQueries({ queryKey: ['projects'] })
            qc.invalidateQueries({ queryKey: ['runs'] })
            qc.invalidateQueries({ queryKey: ['tree'] })
            qc.invalidateQueries({ queryKey: ['ports'] })
            break
          case 'ports.changed':
            qc.invalidateQueries({ queryKey: ['ports'] })
            break
          case 'docker.event':
            qc.invalidateQueries({ queryKey: ['containers'] })
            qc.invalidateQueries({ queryKey: ['ports'] })
            break
          case 'scan.done':
            qc.invalidateQueries({ queryKey: ['tree'] })
            qc.invalidateQueries({ queryKey: ['projects'] })
            break
          case 'run.log': {
            const set = logListeners.current.get(event.runId)
            set?.forEach((cb) => cb(event.runId, event.chunk))
            break
          }
          case 'container.log': {
            const set = containerListeners.current.get(event.containerId)
            set?.forEach((cb) => cb(event.containerId, event.chunk))
            break
          }
        }
      }

      ws.onclose = () => {
        if (!closed) setTimeout(connect, 1000)
      }
    }
    connect()

    return () => {
      closed = true
      ws?.close()
    }
  }, [qc])

  const subscribeLogs = (runId: string, cb: LogListener) => {
    let set = logListeners.current.get(runId)
    if (!set) {
      set = new Set()
      logListeners.current.set(runId, set)
    }
    set.add(cb)
    send({ type: 'subscribe.logs', runId })

    return () => {
      set!.delete(cb)
      if (set!.size === 0) {
        logListeners.current.delete(runId)
        send({ type: 'unsubscribe.logs', runId })
      }
    }
  }

  const subscribeContainer = (containerId: string, cb: LogListener) => {
    let set = containerListeners.current.get(containerId)
    if (!set) {
      set = new Set()
      containerListeners.current.set(containerId, set)
    }
    set.add(cb)
    send({ type: 'subscribe.container', containerId })

    return () => {
      set!.delete(cb)
      if (set!.size === 0) {
        containerListeners.current.delete(containerId)
        send({ type: 'unsubscribe.container', containerId })
      }
    }
  }

  const send = (msg: WsClientMessage) => {
    const ws = socketRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  return { subscribeLogs, subscribeContainer }
}
