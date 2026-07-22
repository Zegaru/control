import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { wsClientMessageSchema, type WsEvent } from '@control/shared'
import { bus } from './events.js'
import { supervisor } from './supervisor.js'
import { streamContainerLogs } from './docker.js'
import { listContainers } from './docker.js'
import { buildComposeProjectMatcher } from './registry.js'
import { canSubscribeContainer } from './containerSubscribe.js'

/**
 * Fans daemon events out to connected UI clients. Each client subscribes to the
 * log stream of specific runs and/or containers (log volume is high; status
 * events broadcast to everyone). On run-log subscribe we replay the ring-buffer
 * snapshot so a freshly opened view isn't blank; container logs are streamed
 * live from dockerode per subscribing client.
 */
export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' })
  const logSubs = new Map<WebSocket, Set<string>>()
  // Per-client container log stream stoppers, keyed by containerId.
  const containerStreams = new Map<WebSocket, Map<string, () => void>>()

  const unsubscribeAll = bus.onEvent((event: WsEvent) => {
    const payload = JSON.stringify(event)
    for (const client of wss.clients) {
      if (client.readyState !== client.OPEN) continue
      // Per-run log lines only reach subscribers of that run.
      if (event.type === 'run.log') {
        const subs = logSubs.get(client)
        if (!subs || !subs.has(event.runId)) continue
      }
      // Container log lines are delivered directly by the per-client stream,
      // not via the bus — skip broadcasting them here.
      if (event.type === 'container.log') continue
      client.send(payload)
    }
  })

  wss.on('connection', (ws) => {
    logSubs.set(ws, new Set())
    containerStreams.set(ws, new Map())

    ws.on('message', async (data) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(data.toString())
      } catch {
        return
      }
      const result = wsClientMessageSchema.safeParse(parsed)
      if (!result.success) return
      const msg = result.data

      if (msg.type === 'subscribe.logs') {
        logSubs.get(ws)!.add(msg.runId)
        const snapshot = supervisor.getLogSnapshot(msg.runId)
        if (snapshot) {
          ws.send(JSON.stringify({ type: 'run.log', runId: msg.runId, chunk: snapshot }))
        }
      } else if (msg.type === 'unsubscribe.logs') {
        logSubs.get(ws)!.delete(msg.runId)
      } else if (msg.type === 'subscribe.container') {
        const streams = containerStreams.get(ws)!
        if (streams.has(msg.containerId)) return
        try {
          const matcher = buildComposeProjectMatcher()
          const containers = await listContainers(matcher)
          if (!canSubscribeContainer(msg.containerId, containers)) return
          const stop = await streamContainerLogs(msg.containerId, (chunk) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'container.log', containerId: msg.containerId, chunk }))
            }
          })
          streams.set(msg.containerId, stop)
        } catch {
          /* container gone or Docker unavailable */
        }
      } else if (msg.type === 'unsubscribe.container') {
        const streams = containerStreams.get(ws)!
        streams.get(msg.containerId)?.()
        streams.delete(msg.containerId)
      } else if (msg.type === 'run.stdin') {
        supervisor.write(msg.runId, msg.data)
      }
    })

    ws.on('close', () => {
      logSubs.delete(ws)
      containerStreams.get(ws)?.forEach((stop) => {
        stop()
      })
      containerStreams.delete(ws)
    })
  })

  wss.on('close', () => unsubscribeAll())
}
