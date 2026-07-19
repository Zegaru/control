import { basename, join } from 'node:path'
import { existsSync } from 'node:fs'
import { and, desc, eq, inArray } from 'drizzle-orm'
import {
  ACTIVE_RUN_STATUSES,
  type Action,
  type ActionWithRun,
  type CreateActionBody,
  type Group,
  type Module,
  type ModuleWithActions,
  type PatchActionBody,
  type PatchGroupBody,
  type PatchModuleBody,
  type PatchProjectBody,
  type Project,
  type ProjectSummary,
  type ProjectTree,
  type Run,
  type RunStatus,
} from '@control/shared'
import { db, schema } from './db/index.js'
import { newId } from './ids.js'
import { scanProject } from './scanner.js'
import { bus } from './events.js'

// --- row -> domain mappers -------------------------------------------------

type ActionRow = typeof schema.actions.$inferSelect
type RunRow = typeof schema.runs.$inferSelect

function toAction(r: ActionRow): Action {
  return {
    id: r.id,
    moduleId: r.moduleId,
    naturalKey: r.naturalKey,
    name: r.name,
    command: r.command,
    cwd: r.cwd,
    type: r.type as Action['type'],
    source: r.source as Action['source'],
    favorite: r.favorite,
    hidden: r.hidden,
    primary: r.primary,
    envOverrides: r.envOverrides ?? null,
    portHint: r.portHint,
    healthUrl: r.healthUrl,
  }
}

function toRun(r: RunRow): Run {
  return {
    id: r.id,
    actionId: r.actionId,
    pid: r.pid,
    status: r.status as RunStatus,
    startedAt: r.startedAt,
    exitedAt: r.exitedAt,
    exitCode: r.exitCode,
    ports: r.ports ?? [],
    logFile: r.logFile,
  }
}

// --- projects --------------------------------------------------------------

export function listProjects(): ProjectSummary[] {
  const rows = db.select().from(schema.projects).all()
  return rows.map((p) => {
    const moduleIds = db
      .select({ id: schema.modules.id })
      .from(schema.modules)
      .where(eq(schema.modules.projectId, p.id))
      .all()
      .map((m) => m.id)
    const actionRows = moduleIds.length
      ? db.select().from(schema.actions).where(inArray(schema.actions.moduleId, moduleIds)).all()
      : []
    const activeRunCount = actionRows.filter((a) => getActiveRun(a.id)).length
    return {
      id: p.id,
      name: p.name,
      rootPath: p.rootPath,
      favorite: p.favorite,
      icon: p.icon,
      createdAt: p.createdAt,
      lastScanAt: p.lastScanAt,
      composeProjects: p.composeProjects ?? [],
      actionCount: actionRows.length,
      activeRunCount,
    }
  })
}

export function createProject(rootPath: string, name?: string): Project {
  if (!existsSync(rootPath)) {
    throw new HttpError(400, `Path does not exist: ${rootPath}`)
  }
  const existing = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.rootPath, rootPath))
    .get()
  if (existing) throw new HttpError(409, 'Project already registered')

  const project: Project = {
    id: newId('proj'),
    name: name ?? basename(rootPath),
    rootPath,
    favorite: false,
    icon: null,
    createdAt: Date.now(),
    lastScanAt: null,
    composeProjects: [],
  }
  db.insert(schema.projects).values(project).run()
  rescanProject(project.id)
  return db.select().from(schema.projects).where(eq(schema.projects.id, project.id)).get()!
}

export function patchProject(id: string, body: PatchProjectBody): Project {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get()
  if (!project) throw new HttpError(404, 'Project not found')
  db.update(schema.projects)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.favorite !== undefined ? { favorite: body.favorite } : {}),
      ...(body.icon !== undefined ? { icon: body.icon } : {}),
      ...(body.composeProjects !== undefined ? { composeProjects: body.composeProjects } : {}),
    })
    .where(eq(schema.projects.id, id))
    .run()
  return db.select().from(schema.projects).where(eq(schema.projects.id, id)).get()!
}

export function deleteProject(id: string): void {
  const moduleIds = db
    .select({ id: schema.modules.id })
    .from(schema.modules)
    .where(eq(schema.modules.projectId, id))
    .all()
    .map((m) => m.id)
  if (moduleIds.length) {
    db.delete(schema.actions).where(inArray(schema.actions.moduleId, moduleIds)).run()
  }
  db.delete(schema.modules).where(eq(schema.modules.projectId, id)).run()
  db.delete(schema.groups).where(eq(schema.groups.projectId, id)).run()
  db.delete(schema.projects).where(eq(schema.projects.id, id)).run()
}

// --- scanning (override-preserving upsert, FR-3) ---------------------------

export function rescanProject(projectId: string): void {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get()
  if (!project) throw new HttpError(404, 'Project not found')

  const detected = scanProject(project.rootPath)
  const seenModuleIds = new Set<string>()

  for (const dm of detected) {
    const moduleCwd = dm.relPath ? join(project.rootPath, dm.relPath) : project.rootPath
    let moduleRow = db
      .select()
      .from(schema.modules)
      .where(and(eq(schema.modules.projectId, projectId), eq(schema.modules.relPath, dm.relPath)))
      .get()

    if (!moduleRow) {
      const id = newId('mod')
      db.insert(schema.modules)
        .values({
          id,
          projectId,
          relPath: dm.relPath,
          name: dm.name,
          detectedStacks: dm.stacks,
          hidden: false,
        })
        .run()
      moduleRow = db.select().from(schema.modules).where(eq(schema.modules.id, id)).get()!
    } else {
      // Refresh detected stacks; never touch user-controlled `hidden`/`name`.
      db.update(schema.modules)
        .set({ detectedStacks: dm.stacks })
        .where(eq(schema.modules.id, moduleRow.id))
        .run()
    }
    seenModuleIds.add(moduleRow.id)

    const seenKeys = new Set<string>()
    for (const da of dm.actions) {
      seenKeys.add(da.naturalKey)
      const existing = db
        .select()
        .from(schema.actions)
        .where(
          and(
            eq(schema.actions.moduleId, moduleRow.id),
            eq(schema.actions.naturalKey, da.naturalKey),
          ),
        )
        .get()
      if (existing) {
        // Upsert ONLY the derived-from-source fields. Preserve favorite,
        // hidden, a renamed name, envOverrides, healthUrl, portHint overrides.
        db.update(schema.actions)
          .set({ command: da.command, type: da.type, primary: da.primary, cwd: moduleCwd })
          .where(eq(schema.actions.id, existing.id))
          .run()
      } else {
        db.insert(schema.actions)
          .values({
            id: newId('act'),
            moduleId: moduleRow.id,
            naturalKey: da.naturalKey,
            name: da.name,
            command: da.command,
            cwd: moduleCwd,
            type: da.type,
            source: 'detected',
            favorite: false,
            hidden: false,
            primary: da.primary,
            envOverrides: null,
            portHint: da.portHint ?? null,
            healthUrl: null,
          })
          .run()
      }
    }

    // Drop detected actions whose source markers are gone (custom untouched).
    const detectedRows = db
      .select()
      .from(schema.actions)
      .where(and(eq(schema.actions.moduleId, moduleRow.id), eq(schema.actions.source, 'detected')))
      .all()
    for (const row of detectedRows) {
      if (!seenKeys.has(row.naturalKey) && !getActiveRun(row.id)) {
        db.delete(schema.actions).where(eq(schema.actions.id, row.id)).run()
      }
    }
  }

  // Remove modules no longer detected that hold no custom actions.
  const allModules = db.select().from(schema.modules).where(eq(schema.modules.projectId, projectId)).all()
  for (const m of allModules) {
    if (seenModuleIds.has(m.id)) continue
    const customCount = db
      .select()
      .from(schema.actions)
      .where(and(eq(schema.actions.moduleId, m.id), eq(schema.actions.source, 'custom')))
      .all().length
    if (customCount === 0) {
      db.delete(schema.actions).where(eq(schema.actions.moduleId, m.id)).run()
      db.delete(schema.modules).where(eq(schema.modules.id, m.id)).run()
    }
  }

  db.update(schema.projects).set({ lastScanAt: Date.now() }).where(eq(schema.projects.id, projectId)).run()
  bus.emitEvent({ type: 'scan.done', projectId })
}

// --- tree ------------------------------------------------------------------

export function getProjectTree(projectId: string): ProjectTree {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get()
  if (!project) throw new HttpError(404, 'Project not found')

  const moduleRows = db.select().from(schema.modules).where(eq(schema.modules.projectId, projectId)).all()
  const modules: ModuleWithActions[] = moduleRows.map((m) => {
    const actionRows = db.select().from(schema.actions).where(eq(schema.actions.moduleId, m.id)).all()
    const actions: ActionWithRun[] = actionRows.map((a) => ({
      ...toAction(a),
      activeRun: getActiveRun(a.id),
    }))
    const mod: Module = {
      id: m.id,
      projectId: m.projectId,
      relPath: m.relPath,
      name: m.name,
      detectedStacks: m.detectedStacks ?? [],
      hidden: m.hidden,
    }
    return { ...mod, actions }
  })

  return {
    id: project.id,
    name: project.name,
    rootPath: project.rootPath,
    favorite: project.favorite,
    icon: project.icon,
    createdAt: project.createdAt,
    lastScanAt: project.lastScanAt,
    composeProjects: project.composeProjects ?? [],
    modules,
  }
}

// --- modules & actions -----------------------------------------------------

export function patchModule(id: string, body: PatchModuleBody): Module {
  const row = db.select().from(schema.modules).where(eq(schema.modules.id, id)).get()
  if (!row) throw new HttpError(404, 'Module not found')
  db.update(schema.modules)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.hidden !== undefined ? { hidden: body.hidden } : {}),
    })
    .where(eq(schema.modules.id, id))
    .run()
  const updated = db.select().from(schema.modules).where(eq(schema.modules.id, id)).get()!
  return {
    id: updated.id,
    projectId: updated.projectId,
    relPath: updated.relPath,
    name: updated.name,
    detectedStacks: updated.detectedStacks ?? [],
    hidden: updated.hidden,
  }
}

function ensureRootModule(projectId: string): string {
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get()
  if (!project) throw new HttpError(404, 'Project not found')

  const existing = db
    .select()
    .from(schema.modules)
    .where(and(eq(schema.modules.projectId, projectId), eq(schema.modules.relPath, '')))
    .get()
  if (existing) return existing.id

  const id = newId('mod')
  db.insert(schema.modules)
    .values({
      id,
      projectId,
      relPath: '',
      name: project.name,
      detectedStacks: [],
      hidden: false,
    })
    .run()
  return id
}

function parseCreateActionBody(input: unknown): CreateActionBody {
  if (typeof input !== 'object' || input === null) throw new HttpError(400, 'Invalid request body')
  const raw = input as Record<string, unknown>

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const command = typeof raw.command === 'string' ? raw.command.trim() : ''
  if (!name) throw new HttpError(400, 'name is required')
  if (!command) throw new HttpError(400, 'command is required')

  const moduleId = typeof raw.moduleId === 'string' ? raw.moduleId : undefined
  const projectId = typeof raw.projectId === 'string' ? raw.projectId : undefined
  if (Boolean(moduleId) === Boolean(projectId)) {
    throw new HttpError(400, 'Provide exactly one of moduleId or projectId')
  }

  let portHint: number | null | undefined
  if (raw.portHint === null || raw.portHint === undefined) {
    portHint = raw.portHint ?? undefined
  } else if (typeof raw.portHint === 'number' && Number.isInteger(raw.portHint) && raw.portHint > 0) {
    portHint = raw.portHint
  } else {
    throw new HttpError(400, 'portHint must be a positive integer')
  }

  let healthUrl: string | null | undefined
  if (raw.healthUrl === null || raw.healthUrl === undefined) {
    healthUrl = raw.healthUrl ?? undefined
  } else if (typeof raw.healthUrl === 'string') {
    try {
      healthUrl = new URL(raw.healthUrl).toString()
    } catch {
      throw new HttpError(400, 'healthUrl must be a valid URL')
    }
  } else {
    throw new HttpError(400, 'healthUrl must be a valid URL')
  }

  let envOverrides: Record<string, string> | null | undefined
  if (raw.envOverrides === null || raw.envOverrides === undefined) {
    envOverrides = raw.envOverrides ?? undefined
  } else if (typeof raw.envOverrides === 'object') {
    envOverrides = {}
    for (const [k, v] of Object.entries(raw.envOverrides as Record<string, unknown>)) {
      if (typeof v === 'string') envOverrides[k] = v
    }
  } else {
    throw new HttpError(400, 'envOverrides must be an object')
  }

  const cwd =
    raw.cwd === null || raw.cwd === undefined
      ? raw.cwd ?? undefined
      : typeof raw.cwd === 'string'
        ? raw.cwd
        : (() => {
            throw new HttpError(400, 'cwd must be a string')
          })()

  return {
    ...(moduleId ? { moduleId } : { projectId: projectId! }),
    name,
    command,
    ...(cwd !== undefined ? { cwd } : {}),
    ...(portHint !== undefined ? { portHint } : {}),
    ...(healthUrl !== undefined ? { healthUrl } : {}),
    ...(envOverrides !== undefined ? { envOverrides } : {}),
  }
}

export function createAction(input: unknown): Action {
  const body = parseCreateActionBody(input)
  const moduleId = body.moduleId ?? ensureRootModule(body.projectId!)
  const mod = db.select().from(schema.modules).where(eq(schema.modules.id, moduleId)).get()
  if (!mod) throw new HttpError(404, 'Module not found')
  const id = newId('act')
  db.insert(schema.actions)
    .values({
      id,
      moduleId,
      naturalKey: `custom:${id}`,
      name: body.name,
      command: body.command,
      cwd: body.cwd ?? null,
      type: 'custom',
      source: 'custom',
      favorite: false,
      hidden: false,
      primary: true,
      envOverrides: body.envOverrides ?? null,
      portHint: body.portHint ?? null,
      healthUrl: body.healthUrl ?? null,
    })
    .run()
  return toAction(db.select().from(schema.actions).where(eq(schema.actions.id, id)).get()!)
}

export function patchAction(id: string, body: PatchActionBody): Action {
  const row = db.select().from(schema.actions).where(eq(schema.actions.id, id)).get()
  if (!row) throw new HttpError(404, 'Action not found')
  db.update(schema.actions)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.command !== undefined ? { command: body.command } : {}),
      ...(body.favorite !== undefined ? { favorite: body.favorite } : {}),
      ...(body.hidden !== undefined ? { hidden: body.hidden } : {}),
      ...(body.portHint !== undefined ? { portHint: body.portHint } : {}),
      ...(body.healthUrl !== undefined ? { healthUrl: body.healthUrl } : {}),
      ...(body.envOverrides !== undefined ? { envOverrides: body.envOverrides } : {}),
    })
    .where(eq(schema.actions.id, id))
    .run()
  return toAction(db.select().from(schema.actions).where(eq(schema.actions.id, id)).get()!)
}

export function getAction(id: string): Action | null {
  const row = db.select().from(schema.actions).where(eq(schema.actions.id, id)).get()
  return row ? toAction(row) : null
}

/** Working directory for a run: explicit cwd, else the module's directory under the project root. */
export function resolveActionCwd(action: Action): string | null {
  if (action.cwd) return action.cwd
  const mod = db.select().from(schema.modules).where(eq(schema.modules.id, action.moduleId)).get()
  if (!mod) return null
  const project = db.select().from(schema.projects).where(eq(schema.projects.id, mod.projectId)).get()
  if (!project) return null
  return mod.relPath ? join(project.rootPath, mod.relPath) : project.rootPath
}

// --- runs ------------------------------------------------------------------

export function getActiveRun(actionId: string): Run | null {
  const row = db
    .select()
    .from(schema.runs)
    .where(
      and(
        eq(schema.runs.actionId, actionId),
        inArray(schema.runs.status, ACTIVE_RUN_STATUSES as string[]),
      ),
    )
    .orderBy(desc(schema.runs.startedAt))
    .get()
  return row ? toRun(row) : null
}

export function listActiveRuns(): Run[] {
  return db
    .select()
    .from(schema.runs)
    .where(inArray(schema.runs.status, ACTIVE_RUN_STATUSES as string[]))
    .orderBy(desc(schema.runs.startedAt))
    .all()
    .map(toRun)
}

export function getRun(id: string): Run | null {
  const row = db.select().from(schema.runs).where(eq(schema.runs.id, id)).get()
  return row ? toRun(row) : null
}

export function listRunsForAction(actionId: string, limit = 5): Run[] {
  return db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.actionId, actionId))
    .orderBy(desc(schema.runs.startedAt))
    .limit(limit)
    .all()
    .map(toRun)
}

// --- groups ----------------------------------------------------------------

export function listGroups(): Group[] {
  return db
    .select()
    .from(schema.groups)
    .all()
    .map((g) => ({ id: g.id, projectId: g.projectId, name: g.name, steps: g.steps ?? [] }))
}

export function createGroup(name: string, steps: Group['steps'], projectId?: string | null): Group {
  const id = newId('grp')
  db.insert(schema.groups).values({ id, projectId: projectId ?? null, name, steps }).run()
  const g = db.select().from(schema.groups).where(eq(schema.groups.id, id)).get()!
  return { id: g.id, projectId: g.projectId, name: g.name, steps: g.steps ?? [] }
}

export function updateGroup(id: string, body: PatchGroupBody): Group {
  const g = db.select().from(schema.groups).where(eq(schema.groups.id, id)).get()
  if (!g) throw new HttpError(404, 'Group not found')
  db.update(schema.groups)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.steps !== undefined ? { steps: body.steps } : {}),
    })
    .where(eq(schema.groups.id, id))
    .run()
  const updated = db.select().from(schema.groups).where(eq(schema.groups.id, id)).get()!
  return { id: updated.id, projectId: updated.projectId, name: updated.name, steps: updated.steps ?? [] }
}

export function deleteGroup(id: string): void {
  db.delete(schema.groups).where(eq(schema.groups.id, id)).run()
}

export function getGroup(id: string): Group | null {
  const g = db.select().from(schema.groups).where(eq(schema.groups.id, id)).get()
  return g ? { id: g.id, projectId: g.projectId, name: g.name, steps: g.steps ?? [] } : null
}

// --- docker <-> project mapping --------------------------------------------

/** Docker Compose default project name: lowercased basename, non-[a-z0-9_-] stripped. */
function composeSanitize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_-]/g, '')
}

/**
 * Build a matcher from a container's `com.docker.compose.project` label to a
 * registered project id. Candidates per project: its name, its root folder
 * basename, and the basename of any module directory that has a compose stack —
 * all compose-sanitized. Best-effort; unmatched labels resolve to null.
 */
export function buildComposeProjectMatcher(): (composeProject: string | null) => string | null {
  const table = new Map<string, string>()
  const projects = db.select().from(schema.projects).all()
  // Explicit claims win, so seed them first (a later inference can't overwrite).
  for (const p of projects) {
    for (const claim of p.composeProjects ?? []) {
      const key = composeSanitize(claim)
      if (key) table.set(key, p.id)
    }
  }
  for (const p of projects) {
    const add = (name: string) => {
      const key = composeSanitize(name)
      if (key && !table.has(key)) table.set(key, p.id)
    }
    add(p.name)
    add(basename(p.rootPath))
    const mods = db.select().from(schema.modules).where(eq(schema.modules.projectId, p.id)).all()
    for (const m of mods) {
      const hasCompose = (m.detectedStacks ?? []).some((s) => s.kind === 'compose')
      if (hasCompose) add(basename(m.relPath || p.rootPath))
    }
  }
  return (composeProject) => {
    if (!composeProject) return null
    return table.get(composeSanitize(composeProject)) ?? null
  }
}

/**
 * Build a matcher from an arbitrary string (a process command line or executable
 * path) to a registered project id, by testing whether it contains a project's
 * root path. Longest root wins, so a nested project beats its parent. Used to
 * attribute externally-started dev servers (a `node`/`vite` you ran yourself) to
 * the project they're running out of.
 */
export function buildPathProjectMatcher(): (haystack: string | null) => string | null {
  const norm = (s: string) => s.toLowerCase().replace(/\//g, '\\')
  const entries = db
    .select()
    .from(schema.projects)
    .all()
    .map((p) => ({ id: p.id, root: norm(p.rootPath) }))
    .sort((a, b) => b.root.length - a.root.length)
  return (haystack) => {
    if (!haystack) return null
    const h = norm(haystack)
    return entries.find((e) => h.includes(e.root))?.id ?? null
  }
}

// --- error helper ----------------------------------------------------------

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
