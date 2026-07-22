import { z } from 'zod'

/**
 * CONTROL shared contracts.
 *
 * Single source of truth for the data model and the daemon <-> UI API.
 * The daemon validates with these schemas; the UI infers its types from them.
 */

export const DEFAULT_DAEMON_PORT = 4400

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0:0:0:0:0:0:0:1'])

/** True when a bind host is restricted to local loopback (NFR-2). */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.toLowerCase())
}

/** Health checks may only target local HTTP(S) endpoints. */
export function isAllowedHealthUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    if (parsed.username || parsed.password) return false
    return isLoopbackHost(parsed.hostname)
  } catch {
    return false
  }
}

const healthUrlFieldSchema = z
  .string()
  .url()
  .nullable()
  .optional()
  .refine((value) => value == null || isAllowedHealthUrl(value), {
    message: 'healthUrl must target localhost (127.0.0.1, localhost, or ::1)',
  })

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const actionTypeSchema = z.enum(['script', 'compose', 'custom'])
export type ActionType = z.infer<typeof actionTypeSchema>

export const actionSourceSchema = z.enum(['detected', 'custom'])
export type ActionSource = z.infer<typeof actionSourceSchema>

/**
 * Run lifecycle:
 *   starting -> running -> healthy | unhealthy
 *   terminal: exited | failed | killed
 *   adopted: a run the daemon re-attached to after a restart (logs lost, stop/port supported)
 */
export const runStatusSchema = z.enum([
  'starting',
  'running',
  'healthy',
  'unhealthy',
  'exited',
  'failed',
  'killed',
  'adopted',
])
export type RunStatus = z.infer<typeof runStatusSchema>

export const ACTIVE_RUN_STATUSES: RunStatus[] = [
  'starting',
  'running',
  'healthy',
  'unhealthy',
  'adopted',
]

export function isActiveStatus(status: RunStatus): boolean {
  return ACTIVE_RUN_STATUSES.includes(status)
}

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export const detectedStackSchema = z.object({
  kind: z.string(), // e.g. node, compose, rust, go, python, dotnet, deno, maven, flutter
  packageManager: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(1),
})
export type DetectedStack = z.infer<typeof detectedStackSchema>

/** Port number (string key) → display label for that project's attributed ports. */
export const portLabelsSchema = z.record(
  z.string().regex(/^\d+$/, 'Port keys must be positive integers'),
  z.string().trim().min(1).max(64),
)
export type PortLabels = z.infer<typeof portLabelsSchema>

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  rootPath: z.string(),
  favorite: z.boolean(),
  icon: z.string().nullable().optional(),
  createdAt: z.number(),
  lastScanAt: z.number().nullable().optional(),
  /** Explicit compose project names this project claims (overrides basename inference). */
  composeProjects: z.array(z.string()).default([]),
  /** Custom display names for ports attributed to this project (Overview + Port Map). */
  portLabels: portLabelsSchema.default({}),
  /** Dashboard ON uses this environment when set. */
  selectedEnvironmentId: z.string().nullable().optional(),
  /** Dashboard ON falls back to this when nothing is explicitly selected. */
  defaultEnvironmentId: z.string().nullable().optional(),
})
export type Project = z.infer<typeof projectSchema>

/** Environment id used for Dashboard ON: explicit selection, then project default. */
export function resolveDashboardEnvironmentId(project: {
  selectedEnvironmentId?: string | null
  defaultEnvironmentId?: string | null
}): string | null {
  return project.selectedEnvironmentId ?? project.defaultEnvironmentId ?? null
}

export const moduleSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  relPath: z.string(), // '' = project root
  name: z.string(),
  detectedStacks: z.array(detectedStackSchema),
  hidden: z.boolean(),
})
export type Module = z.infer<typeof moduleSchema>

export const actionSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  /** Stable identity for detected actions so re-scans upsert without clobbering user edits. */
  naturalKey: z.string(),
  name: z.string(),
  command: z.string(),
  cwd: z.string().nullable().optional(),
  type: actionTypeSchema,
  source: actionSourceSchema,
  favorite: z.boolean(),
  hidden: z.boolean(),
  /** Long-running server (dev/start/serve/watch) vs one-shot task (build/test/lint). */
  primary: z.boolean(),
  envOverrides: z.record(z.string()).nullable().optional(),
  /** Relative basenames or module-relative posix paths (e.g. `.env.local`, `config/.env`). */
  envFiles: z.array(z.string().min(1)).nullable().optional(),
  portHint: z.number().int().positive().nullable().optional(),
  healthUrl: healthUrlFieldSchema,
})
export type Action = z.infer<typeof actionSchema>

export const runSchema = z.object({
  id: z.string(),
  actionId: z.string(),
  pid: z.number().int().nullable().optional(),
  status: runStatusSchema,
  startedAt: z.number(),
  exitedAt: z.number().nullable().optional(),
  exitCode: z.number().int().nullable().optional(),
  ports: z.array(z.number().int()),
  logFile: z.string().nullable().optional(),
})
export type Run = z.infer<typeof runSchema>

export const groupStepSchema = z.object({
  actionId: z.string(),
  waitFor: z.enum(['healthy', 'exit', 'none']).default('none'),
})
export type GroupStep = z.infer<typeof groupStepSchema>

export const groupSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable().optional(),
  name: z.string(),
  steps: z.array(groupStepSchema),
})
export type Group = z.infer<typeof groupSchema>

export const environmentTargetTypeSchema = z.enum(['action', 'group'])
export type EnvironmentTargetType = z.infer<typeof environmentTargetTypeSchema>

export const environmentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  env: z.record(z.string()),
  targetType: environmentTargetTypeSchema,
  targetId: z.string(),
})
export type Environment = z.infer<typeof environmentSchema>

// ---------------------------------------------------------------------------
// Composite views
// ---------------------------------------------------------------------------

export const actionWithRunSchema = actionSchema.extend({
  activeRun: runSchema.nullable(),
})
export type ActionWithRun = z.infer<typeof actionWithRunSchema>

export const moduleWithActionsSchema = moduleSchema.extend({
  actions: z.array(actionWithRunSchema),
})
export type ModuleWithActions = z.infer<typeof moduleWithActionsSchema>

export const projectTreeSchema = projectSchema.extend({
  modules: z.array(moduleWithActionsSchema),
  environments: z.array(environmentSchema),
})
export type ProjectTree = z.infer<typeof projectTreeSchema>

export const projectSummarySchema = projectSchema.extend({
  activeRunCount: z.number().int(),
  actionCount: z.number().int(),
})
export type ProjectSummary = z.infer<typeof projectSummarySchema>

export const containerStateSchema = z.enum([
  'created',
  'running',
  'paused',
  'restarting',
  'removing',
  'exited',
  'dead',
])
export type ContainerState = z.infer<typeof containerStateSchema>

/** Docker health, when the image declares a HEALTHCHECK. */
export const containerHealthSchema = z.enum(['starting', 'healthy', 'unhealthy', 'none'])
export type ContainerHealth = z.infer<typeof containerHealthSchema>

export const containerPortSchema = z.object({
  privatePort: z.number().int(),
  publicPort: z.number().int().nullable(),
  protocol: z.string(),
})
export type ContainerPort = z.infer<typeof containerPortSchema>

export const containerInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  state: containerStateSchema,
  status: z.string(), // human string, e.g. "Up 3 minutes (healthy)"
  health: containerHealthSchema,
  ports: z.array(containerPortSchema),
  composeProject: z.string().nullable(),
  composeService: z.string().nullable(),
  /** Registered project this container was matched to, if any. */
  projectId: z.string().nullable(),
  createdAt: z.number(),
})
export type ContainerInfo = z.infer<typeof containerInfoSchema>

export const dockerStatusSchema = z.object({
  available: z.boolean(),
  error: z.string().nullable(),
})
export type DockerStatus = z.infer<typeof dockerStatusSchema>

export const portOwnerSchema = z.object({
  port: z.number().int(),
  owner: z.enum(['run', 'container', 'external']),
  runId: z.string().nullable().optional(),
  containerId: z.string().nullable().optional(),
  pid: z.number().int().nullable().optional(),
  processName: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  /** Registered project this port was attributed to (external → by process path). */
  projectId: z.string().nullable().optional(),
})
export type PortOwner = z.infer<typeof portOwnerSchema>

// ---------------------------------------------------------------------------
// REST request bodies
// ---------------------------------------------------------------------------

export const createProjectBodySchema = z.object({
  rootPath: z.string().min(1),
  name: z.string().min(1).optional(),
})
export type CreateProjectBody = z.infer<typeof createProjectBodySchema>

export const patchProjectBodySchema = z.object({
  name: z.string().min(1).optional(),
  favorite: z.boolean().optional(),
  icon: z.string().nullable().optional(),
  composeProjects: z.array(z.string()).optional(),
  portLabels: portLabelsSchema.optional(),
  selectedEnvironmentId: z.string().nullable().optional(),
  defaultEnvironmentId: z.string().nullable().optional(),
})
export type PatchProjectBody = z.infer<typeof patchProjectBodySchema>

export const patchModuleBodySchema = z.object({
  name: z.string().min(1).optional(),
  hidden: z.boolean().optional(),
})
export type PatchModuleBody = z.infer<typeof patchModuleBodySchema>

export const createActionBodySchema = z
  .object({
    moduleId: z.string().optional(),
    /** When no module exists yet (e.g. unscanned project), creates a root module. */
    projectId: z.string().optional(),
    name: z.string().min(1),
    command: z.string().min(1),
    cwd: z.string().nullable().optional(),
    portHint: z.number().int().positive().nullable().optional(),
    healthUrl: healthUrlFieldSchema,
    envOverrides: z.record(z.string()).nullable().optional(),
    envFiles: z.array(z.string().min(1)).nullable().optional(),
  })
  .refine((b) => Boolean(b.moduleId) !== Boolean(b.projectId), {
    message: 'Provide exactly one of moduleId or projectId',
  })
export type CreateActionBody = z.infer<typeof createActionBodySchema>

export const patchActionBodySchema = z.object({
  name: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
  favorite: z.boolean().optional(),
  hidden: z.boolean().optional(),
  portHint: z.number().int().positive().nullable().optional(),
  healthUrl: healthUrlFieldSchema,
  envOverrides: z.record(z.string()).nullable().optional(),
  envFiles: z.array(z.string().min(1)).nullable().optional(),
})
export type PatchActionBody = z.infer<typeof patchActionBodySchema>

export const createGroupBodySchema = z.object({
  projectId: z.string().nullable().optional(),
  name: z.string().min(1),
  steps: z.array(groupStepSchema),
})
export type CreateGroupBody = z.infer<typeof createGroupBodySchema>

export const patchGroupBodySchema = z.object({
  name: z.string().min(1).optional(),
  steps: z.array(groupStepSchema).optional(),
})
export type PatchGroupBody = z.infer<typeof patchGroupBodySchema>

export const createEnvironmentBodySchema = z.object({
  name: z.string().min(1),
  env: z.record(z.string()).default({}),
  targetType: environmentTargetTypeSchema,
  targetId: z.string().min(1),
})
export type CreateEnvironmentBody = z.infer<typeof createEnvironmentBodySchema>

export const patchEnvironmentBodySchema = z.object({
  name: z.string().min(1).optional(),
  env: z.record(z.string()).optional(),
  targetType: environmentTargetTypeSchema.optional(),
  targetId: z.string().min(1).optional(),
})
export type PatchEnvironmentBody = z.infer<typeof patchEnvironmentBodySchema>

export const startWithEnvBodySchema = z.object({
  env: z.record(z.string()).optional(),
})
export type StartWithEnvBody = z.infer<typeof startWithEnvBodySchema>

/** Default directory/file patterns skipped while scanning project trees. */
export const DEFAULT_IGNORE_GLOBS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  'vendor',
  'coverage',
] as const

export const DEFAULT_LOG_RETENTION = 5

export const settingsSchema = z.object({
  ignoreGlobs: z.array(z.string().min(1)).default([...DEFAULT_IGNORE_GLOBS]),
  /** Keep the last N run records (+ log files) per action. */
  logRetention: z.number().int().min(1).max(50).default(DEFAULT_LOG_RETENTION),
})
export type Settings = z.infer<typeof settingsSchema>

export const patchSettingsBodySchema = z.object({
  ignoreGlobs: z.array(z.string().min(1)).optional(),
  logRetention: z.number().int().min(1).max(50).optional(),
})
export type PatchSettingsBody = z.infer<typeof patchSettingsBodySchema>

/** Stepped retention values for the Settings dial. */
export const LOG_RETENTION_STEPS = [1, 3, 5, 10, 20, 50] as const

// ---------------------------------------------------------------------------
// WebSocket events (daemon -> UI)
// ---------------------------------------------------------------------------

export const wsEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run.status'),
    runId: z.string(),
    actionId: z.string(),
    status: runStatusSchema,
    ports: z.array(z.number().int()),
    pid: z.number().int().nullable().optional(),
    exitCode: z.number().int().nullable().optional(),
    projectId: z.string().optional(),
    projectName: z.string().optional(),
    actionName: z.string().optional(),
  }),
  z.object({
    type: z.literal('run.log'),
    runId: z.string(),
    chunk: z.string(),
  }),
  z.object({ type: z.literal('ports.changed') }),
  z.object({
    type: z.literal('docker.event'),
    containerId: z.string(),
    status: z.string(),
  }),
  z.object({
    type: z.literal('container.log'),
    containerId: z.string(),
    chunk: z.string(),
  }),
  z.object({ type: z.literal('scan.done'), projectId: z.string() }),
])
export type WsEvent = z.infer<typeof wsEventSchema>

// ---------------------------------------------------------------------------
// Host metrics
// ---------------------------------------------------------------------------

export const hostMetricsSchema = z.object({
  cpu: z.number().min(0).max(100),
  memory: z.number().min(0).max(100),
  disk: z.number().min(0).max(100),
  at: z.number().int().nonnegative(),
})
export type HostMetrics = z.infer<typeof hostMetricsSchema>

export const projectMetricSchema = z.object({
  cpu: z.number().min(0).max(100),
  memory: z.number().min(0).max(100),
})
export type ProjectMetric = z.infer<typeof projectMetricSchema>

export const projectMetricsSnapshotSchema = z.object({
  at: z.number().int().nonnegative(),
  projects: z.record(z.string(), projectMetricSchema),
})
export type ProjectMetricsSnapshot = z.infer<typeof projectMetricsSnapshotSchema>

// Messages UI -> daemon over the same socket (subscription control for log streams).
export const wsClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe.logs'), runId: z.string() }),
  z.object({ type: z.literal('unsubscribe.logs'), runId: z.string() }),
  z.object({ type: z.literal('subscribe.container'), containerId: z.string() }),
  z.object({ type: z.literal('unsubscribe.container'), containerId: z.string() }),
  z.object({
    type: z.literal('run.stdin'),
    runId: z.string().min(1),
    data: z.string(),
  }),
  z.object({
    type: z.literal('run.resize'),
    runId: z.string().min(1),
    cols: z.number().int().min(10).max(500),
    rows: z.number().int().min(2).max(200),
  }),
])
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>
