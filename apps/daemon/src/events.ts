import { EventEmitter } from 'node:events'
import type { WsEvent } from '@control/shared'

/**
 * Central event bus. The supervisor, scanner, and docker bridge publish
 * WsEvents here; the WebSocket hub is the sole subscriber that fans them
 * out to connected UI clients.
 */
class Bus extends EventEmitter {
  emitEvent(event: WsEvent): void {
    this.emit('event', event)
  }

  onEvent(listener: (event: WsEvent) => void): () => void {
    this.on('event', listener)
    return () => this.off('event', listener)
  }
}

export const bus = new Bus()
// Many UI clients + internal listeners can attach; lift the default cap.
bus.setMaxListeners(100)
