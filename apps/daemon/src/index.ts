import { existsSync } from 'node:fs'
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

const app = new Hono()

// Vite dev server (UI) runs on a different origin; allow it in dev.
app.use('/api/*', cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))

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
if (existsSync(uiDist)) {
  app.use('/*', serveStatic({ root: uiDist }))
  app.get('/*', serveStatic({ path: join(uiDist, 'index.html') }))
}

async function main(): Promise<void> {
  await reconcileRuns()

  const server = serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
    console.log(`\n  CONTROL daemon v${version}`)
    console.log(`  → http://${HOST}:${info.port}`)
    console.log(`  → ws://${HOST}:${info.port}/ws\n`)
  })

  attachWebSocket(server as unknown as import('node:http').Server)
  void watchDockerEvents()
}

main().catch((err) => {
  console.error('[control] fatal', err)
  process.exit(1)
})
