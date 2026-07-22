import type {
  Action,
  ActionWithRun,
  ContainerInfo,
  CreateActionBody,
  CreateEnvironmentBody,
  CreateGroupBody,
  DockerStatus,
  Environment,
  Group,
  HostMetrics,
  Module,
  ProjectMetricsSnapshot,
  PatchActionBody,
  PatchEnvironmentBody,
  PatchGroupBody,
  PatchModuleBody,
  PatchProjectBody,
  PatchSettingsBody,
  PortOwner,
  Project,
  ProjectSummary,
  ProjectTree,
  Run,
  Settings,
} from '@control/shared'

const BASE = '/api'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {'content-type': 'application/json', ...(init?.headers ?? {})},
  })
  if (!res.ok) {
    let detail: unknown
    try {
      detail = await res.json()
    } catch {
      detail = {error: res.statusText}
    }
    throw new ApiError(res.status, (detail as {error?: string})?.error ?? 'error', detail)
  }
  if (res.status === 204) return undefined as T
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) {
    throw new ApiError(res.status, `expected json from ${path}, got ${ct || 'unknown'}`, null)
  }
  return (await res.json()) as T
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail: unknown,
  ) {
    super(message)
  }
}

export function formatApiError(err: unknown): string {
  if (err instanceof ApiError) {
    const issues = (err.detail as { issues?: Array<{ path: (string | number)[]; message: string }> })
      ?.issues
    if (issues?.length) {
      return issues
        .map((i) => {
          const field = i.path.length ? i.path.join('.') : 'request'
          return `${field}: ${i.message}`
        })
        .join('; ')
    }
    return err.message
  }
  return err instanceof Error ? err.message : 'Request failed'
}

export const api = {
  health: () => req<{ ok: boolean; version: string }>('/health'),
  hostMetrics: () => req<HostMetrics>('/host/metrics'),
  projectMetrics: () => req<ProjectMetricsSnapshot>('/projects/metrics'),

  listProjects: () => req<ProjectSummary[]>('/projects'),
  createProject: (rootPath: string, name?: string) =>
    req<Project>('/projects', { method: 'POST', body: JSON.stringify({ rootPath, name }) }),
  patchProject: (id: string, body: PatchProjectBody) =>
    req<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteProject: (id: string) => req<void>(`/projects/${id}`, { method: 'DELETE' }),
  scanProject: (id: string) => req<ProjectTree>(`/projects/${id}/scan`, { method: 'POST' }),
  projectTree: (id: string) => req<ProjectTree>(`/projects/${id}/tree`),
  projectTrees: () => req<ProjectTree[]>('/projects/trees'),
  startProjectPower: (id: string) =>
    req<{ ok: boolean }>(`/projects/${id}/power/start`, { method: 'POST' }),
  stopProjectPower: (id: string) =>
    req<{ ok: boolean }>(`/projects/${id}/power/stop`, { method: 'POST' }),

  listEnvironments: (projectId: string) =>
    req<Environment[]>(`/projects/${projectId}/environments`),
  createEnvironment: (projectId: string, body: CreateEnvironmentBody) =>
    req<Environment>(`/projects/${projectId}/environments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  patchEnvironment: (id: string, body: PatchEnvironmentBody) =>
    req<Environment>(`/environments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteEnvironment: (id: string) => req<void>(`/environments/${id}`, { method: 'DELETE' }),

  patchModule: (id: string, body: PatchModuleBody) =>
    req<Module>(`/modules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  createAction: (body: CreateActionBody) =>
    req<Action>('/actions', { method: 'POST', body: JSON.stringify(body) }),
  patchAction: (id: string, body: PatchActionBody) =>
    req<Action>(`/actions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  actionRuns: (id: string) => req<Run[]>(`/actions/${id}/runs`),
  startAction: (id: string, force = false, env?: Record<string, string>) =>
    req<Run | { error: string; port: number }>(
      `/actions/${id}/start${force ? '?force=true' : ''}`,
      { method: 'POST', body: JSON.stringify(env ? { env } : {}) },
    ),

  activeRuns: () => req<Run[]>('/runs'),
  stopRun: (id: string, force = false) =>
    req<{ ok: boolean }>(`/runs/${id}/stop${force ? '?force=true' : ''}`, { method: 'POST' }),
  runLogs: (id: string, tail = 1000) =>
    req<{ live: boolean; logs: string }>(`/runs/${id}/logs?tail=${tail}`),

  listGroups: () => req<Group[]>('/groups'),
  createGroup: (body: CreateGroupBody) =>
    req<Group>('/groups', { method: 'POST', body: JSON.stringify(body) }),
  updateGroup: (id: string, body: PatchGroupBody) =>
    req<Group>(`/groups/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteGroup: (id: string) => req<void>(`/groups/${id}`, { method: 'DELETE' }),
  startGroup: (id: string, env?: Record<string, string>) =>
    req<{ ok: boolean }>(`/groups/${id}/start`, {
      method: 'POST',
      body: JSON.stringify(env ? { env } : {}),
    }),
  stopGroup: (id: string) => req<{ ok: boolean }>(`/groups/${id}/stop`, { method: 'POST' }),

  ports: () => req<PortOwner[]>('/ports'),

  dockerStatus: () => req<DockerStatus>('/docker/status'),
  startDocker: () => req<{ ok: boolean }>('/docker/start', { method: 'POST' }),
  stopDocker: () => req<{ ok: boolean }>('/docker/stop', { method: 'POST' }),
  containers: () => req<ContainerInfo[]>('/docker/containers'),

  getSettings: () => req<Settings>('/settings'),
  patchSettings: (body: PatchSettingsBody) =>
    req<Settings>('/settings', { method: 'PATCH', body: JSON.stringify(body) }),
}

export type { ActionWithRun }
