import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { Hono } from 'hono'
import {
  createGroupBodySchema,
  createEnvironmentBodySchema,
  createProjectBodySchema,
  patchActionBodySchema,
  patchEnvironmentBodySchema,
  patchGroupBodySchema,
  patchModuleBodySchema,
  patchProjectBodySchema,
  patchSettingsBodySchema,
  startWithEnvBodySchema,
} from '@control/shared'
import {
  HttpError,
  createAction,
  createEnvironment,
  createGroup,
  createProject,
  deleteEnvironment,
  deleteGroup,
  deleteProject,
  getAction,
  getActiveRun,
  getGroup,
  getProjectTree,
  getRun,
  listActiveRuns,
  listEnvironments,
  listGroups,
  listProjectTrees,
  listProjects,
  listRunsForAction,
  getTrayCounts,
  patchAction,
  patchEnvironment,
  patchModule,
  patchProject,
  rescanProject,
  resolveActionCwd,
  updateGroup,
} from './registry.js'
import { listEnvFileCandidates } from './envFile.js'
import { supervisor } from './supervisor.js'
import { startGroup, stopGroup } from './groupRunner.js'
import { startProjectPower, stopProjectPower } from './projectPower.js'
import { claimedPorts, getPortMap } from './ports.js'
import {
  getDockerStatus,
  listContainers,
  startDockerEngine,
  stopDockerEngine,
} from './docker.js'
import { buildComposeProjectMatcher } from './registry.js'
import { getSettings, patchSettings } from './settings.js'
import { version } from './version.js'
import { getHostMetrics } from './hostMetrics.js'
import { getProjectMetrics } from './projectMetrics.js'

const TAIL_READ_MAX = 256 * 1024

function tailFile(path: string, lines: number): string {
  try {
    const fd = openSync(path, 'r')
    try {
      const { size } = fstatSync(fd)
      const readSize = Math.min(size, TAIL_READ_MAX)
      const buf = Buffer.alloc(readSize)
      readSync(fd, buf, 0, readSize, Math.max(0, size - readSize))
      const parts = buf.toString('utf8').split('\n')
      return parts.slice(Math.max(0, parts.length - lines)).join('\n')
    } finally {
      closeSync(fd)
    }
  } catch {
    return ''
  }
}

export const api = new Hono()

api.get('/health', (c) => c.json({ ok: true, version }))

api.get('/tray', async (c) => {
  const host = getHostMetrics()
  const { projectCount, activeRunCount } = getTrayCounts()
  const docker = await getDockerStatus()
  return c.json({
    online: true,
    cpu: Math.round(host.cpu),
    memory: Math.round(host.memory),
    projectCount,
    activeRuns: activeRunCount,
    dockerAvailable: docker.available,
  })
})

api.get('/host/metrics', (c) => c.json(getHostMetrics()))

// --- projects --------------------------------------------------------------

api.get('/projects', (c) => c.json(listProjects()))

api.get('/projects/trees', (c) => c.json(listProjectTrees()))

api.get('/projects/metrics', (c) => c.json(getProjectMetrics()))

api.post('/projects', async (c) => {
  const body = createProjectBodySchema.parse(await c.req.json())
  return c.json(createProject(body.rootPath, body.name), 201)
})

api.post('/projects/:id/scan', (c) => {
  rescanProject(c.req.param('id'))
  return c.json(getProjectTree(c.req.param('id')))
})

api.get('/projects/:id/tree', (c) => c.json(getProjectTree(c.req.param('id'))))

api.patch('/projects/:id', async (c) => {
  const body = patchProjectBodySchema.parse(await c.req.json())
  return c.json(patchProject(c.req.param('id'), body))
})

api.delete('/projects/:id', (c) => {
  deleteProject(c.req.param('id'))
  return c.body(null, 204)
})

api.post('/projects/:id/power/start', async (c) => {
  await startProjectPower(c.req.param('id'))
  return c.json({ ok: true })
})

api.post('/projects/:id/power/stop', async (c) => {
  await stopProjectPower(c.req.param('id'))
  return c.json({ ok: true })
})

api.get('/projects/:id/environments', (c) => c.json(listEnvironments(c.req.param('id'))))

api.post('/projects/:id/environments', async (c) => {
  const body = createEnvironmentBodySchema.parse(await c.req.json())
  return c.json(createEnvironment(c.req.param('id'), body), 201)
})

// --- environments ----------------------------------------------------------

api.patch('/environments/:id', async (c) => {
  const body = patchEnvironmentBodySchema.parse(await c.req.json())
  return c.json(patchEnvironment(c.req.param('id'), body))
})

api.delete('/environments/:id', (c) => {
  deleteEnvironment(c.req.param('id'))
  return c.body(null, 204)
})

// --- modules & actions -----------------------------------------------------

api.patch('/modules/:id', async (c) => {
  const body = patchModuleBodySchema.parse(await c.req.json())
  return c.json(patchModule(c.req.param('id'), body))
})

api.post('/actions', async (c) => {
  return c.json(createAction(await c.req.json()), 201)
})

api.patch('/actions/:id', async (c) => {
  const body = patchActionBodySchema.parse(await c.req.json())
  return c.json(patchAction(c.req.param('id'), body))
})

api.get('/actions/:id/env-files', (c) => {
  const action = getAction(c.req.param('id'))
  if (!action) throw new HttpError(404, 'Action not found')
  const cwd = resolveActionCwd(action)
  return c.json({ candidates: cwd ? listEnvFileCandidates(cwd) : [] })
})

api.get('/actions/:id/runs', (c) => c.json(listRunsForAction(c.req.param('id'))))

api.post('/actions/:id/start', async (c) => {
  const action = getAction(c.req.param('id'))
  if (!action) throw new HttpError(404, 'Action not found')

  const force = c.req.query('force') === 'true'
  const existing = getActiveRun(action.id)
  if (existing && !force) {
    return c.json(
      {
        error: 'already_running',
        runId: existing.id,
        message: 'Action already has an active run',
      },
      409,
    )
  }
  if (existing && force) {
    supervisor.stop(existing.id, true)
  }
  if (action.portHint && !force && (await claimedPorts()).has(action.portHint)) {
    return c.json(
      { error: 'port_conflict', port: action.portHint, message: `Port ${action.portHint} is already in use` },
      409,
    )
  }
  const raw = await c.req.json().catch(() => ({}))
  const body = startWithEnvBodySchema.parse(raw)
  return c.json(supervisor.start(action, body.env), 201)
})

// --- runs ------------------------------------------------------------------

api.get('/runs', (c) => {
  // active=true is the default and only mode in M1.
  return c.json(listActiveRuns())
})

api.get('/runs/:id', (c) => {
  const run = getRun(c.req.param('id'))
  if (!run) throw new HttpError(404, 'Run not found')
  return c.json(run)
})

api.post('/runs/:id/stop', (c) => {
  const force = c.req.query('force') === 'true'
  const ok = supervisor.stop(c.req.param('id'), force)
  if (!ok) throw new HttpError(404, 'No live run with that id')
  return c.json({ ok: true })
})

api.get('/runs/:id/logs', (c) => {
  const id = c.req.param('id')
  const tail = Number(c.req.query('tail') ?? 1000)
  const live = supervisor.getLogSnapshotTail(id, tail)
  if (live !== null) return c.json({ live: true, logs: live })
  const run = getRun(id)
  if (!run) throw new HttpError(404, 'Run not found')
  return c.json({ live: false, logs: run.logFile ? tailFile(run.logFile, tail) : '' })
})

// --- groups ----------------------------------------------------------------

api.get('/groups', (c) => c.json(listGroups()))

api.post('/groups', async (c) => {
  const body = createGroupBodySchema.parse(await c.req.json())
  return c.json(createGroup(body.name, body.steps, body.projectId), 201)
})

api.patch('/groups/:id', async (c) => {
  const body = patchGroupBodySchema.parse(await c.req.json())
  return c.json(updateGroup(c.req.param('id'), body))
})

api.delete('/groups/:id', (c) => {
  deleteGroup(c.req.param('id'))
  return c.body(null, 204)
})

api.post('/groups/:id/start', async (c) => {
  const raw = await c.req.json().catch(() => ({}))
  const body = startWithEnvBodySchema.parse(raw)
  await startGroup(c.req.param('id'), body.env)
  return c.json({ ok: true })
})

api.post('/groups/:id/stop', (c) => {
  const group = getGroup(c.req.param('id'))
  if (!group) throw new HttpError(404, 'Group not found')
  stopGroup(group)
  return c.json({ ok: true })
})

// --- ports -----------------------------------------------------------------

api.get('/ports', async (c) => c.json(await getPortMap()))

// --- docker ----------------------------------------------------------------

api.get('/docker/status', async (c) => c.json(await getDockerStatus()))

api.post('/docker/start', async (c) => {
  try {
    await startDockerEngine()
    return c.json({ ok: true })
  } catch (err) {
    throw new HttpError(500, err instanceof Error ? err.message : String(err))
  }
})

api.post('/docker/stop', async (c) => {
  try {
    await stopDockerEngine()
    return c.json({ ok: true })
  } catch (err) {
    throw new HttpError(500, err instanceof Error ? err.message : String(err))
  }
})

api.get('/docker/containers', async (c) => {
  const matcher = buildComposeProjectMatcher()
  return c.json(await listContainers(matcher))
})

// --- settings --------------------------------------------------------------

api.get('/settings', (c) => c.json(getSettings()))

api.patch('/settings', async (c) => {
  const body = patchSettingsBodySchema.parse(await c.req.json())
  return c.json(patchSettings(body))
})

api.notFound((c) => c.json({error: 'not_found'}, 404))
