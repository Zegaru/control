import { existsSync } from 'node:fs'
import type { Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { ZodError } from 'zod'
import { HOST, PORT } from './config.js'
import { api } from './routes.js'
import { HttpError } from './registry.js'
import { attachWebSocket } from './wsHub.js'
import { reconcileRuns } from './reconcile.js'
import { watchDockerEvents } from './docker.js'
import { version } from './version.js'
import { startHostMetrics } from './hostMetrics.js'
import { startProjectMetrics } from './projectMetrics.js'

const app = new Hono()

// Vite dev server (UI) runs on a different origin; allow it in dev.
app.use(
  '/api/*',
  cors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://tauri.localhost',
      'https://tauri.localhost',
    ],
  }),
)

app.route('/api', api)

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400)
  if (err instanceof ZodError) return c.json({ error: 'validation', issues: err.issues }, 400)
  console.error('[control] unhandled error', err)
  return c.json({ error: 'internal_error' }, 500)
})

// In production the daemon serves the built SPA from apps/ui/dist (one origin).
const here = dirname(fileURLToPath(import.meta.url))
const uiDist = join(here, '..', '..', 'ui', 'dist')
const devNoCache = process.env.CONTROL_DEV === '1' || /[/\\]src$/.test(here)
if (existsSync(uiDist)) {
  if (devNoCache) {
    app.use('/*', async (c, next) => {
      await next()
      const ct = c.res.headers.get('content-type') ?? ''
      if (
        ct.includes('text/html') ||
        ct.includes('javascript') ||
        ct.includes('text/css')
      ) {
        c.header('Cache-Control', 'no-store, must-revalidate')
      }
    })
  }
  app.use('/*', serveStatic({ root: uiDist }))
  app.get('/*', serveStatic({ path: join(uiDist, 'index.html') }))
}

let httpServer: Server | undefined
let shuttingDown = false

function shutdown(): void {
  if (shuttingDown) return
  shuttingDown = true
  if (httpServer) {
    httpServer.close(() => process.exit(0))
    // Force-exit if close hangs (open keep-alive sockets).
    setTimeout(() => process.exit(0), 1500).unref()
    return
  }
  process.exit(0)
}

async function main(): Promise<void> {
  console.log(`[control] starting daemon on ${HOST}:${PORT}…`)
  await reconcileRuns()
  startHostMetrics()
  startProjectMetrics()

  const server = serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
    console.log(`\n  CONTROL daemon v${version}`)
    console.log(`  → http://${HOST}:${info.port}`)
    console.log(`  → ws://${HOST}:${info.port}/ws\n`)
  })
  httpServer = server as unknown as Server

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[control] Port ${PORT} is already in use on ${HOST}.`)
      console.error('  Another CONTROL daemon may be running (Tauri app or a stale node process).')
      console.error('  Quit the tray app or stop the other process, then restart.\n')
    } else {
      console.error('[control] server error', err)
    }
    process.exit(1)
  })

  attachWebSocket(server as unknown as Server)
  void watchDockerEvents()

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error('[control] fatal', err)
  process.exit(1)
})
