import type {
  Action,
  ActionWithRun,
  ContainerInfo,
  CreateActionBody,
  CreateGroupBody,
  DockerStatus,
  Group,
  PatchActionBody,
  PatchGroupBody,
  PatchProjectBody,
  PortOwner,
  Project,
  ProjectSummary,
  ProjectTree,
  Run,
} from '@control/shared'

const BASE = '/api'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    let detail: unknown
    try {
      detail = await res.json()
    } catch {
      detail = { error: res.statusText }
    }
    throw new ApiError(res.status, (detail as { error?: string })?.error ?? 'error', detail)
  }
  if (res.status === 204) return undefined as T
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

export const api = {
  health: () => req<{ ok: boolean; version: string }>('/health'),

  listProjects: () => req<ProjectSummary[]>('/projects'),
  createProject: (rootPath: string, name?: string) =>
    req<Project>('/projects', { method: 'POST', body: JSON.stringify({ rootPath, name }) }),
  patchProject: (id: string, body: PatchProjectBody) =>
    req<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteProject: (id: string) => req<void>(`/projects/${id}`, { method: 'DELETE' }),
  scanProject: (id: string) => req<ProjectTree>(`/projects/${id}/scan`, { method: 'POST' }),
  projectTree: (id: string) => req<ProjectTree>(`/projects/${id}/tree`),

  createAction: (body: CreateActionBody) =>
    req<Action>('/actions', { method: 'POST', body: JSON.stringify(body) }),
  patchAction: (id: string, body: PatchActionBody) =>
    req<Action>(`/actions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  actionRuns: (id: string) => req<Run[]>(`/actions/${id}/runs`),
  startAction: (id: string, force = false) =>
    req<Run | { error: string; port: number }>(
      `/actions/${id}/start${force ? '?force=true' : ''}`,
      { method: 'POST' },
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
  startGroup: (id: string) => req<{ ok: boolean }>(`/groups/${id}/start`, { method: 'POST' }),
  stopGroup: (id: string) => req<{ ok: boolean }>(`/groups/${id}/stop`, { method: 'POST' }),

  ports: () => req<PortOwner[]>('/ports'),

  dockerStatus: () => req<DockerStatus>('/docker/status'),
  containers: () => req<ContainerInfo[]>('/docker/containers'),
}

export type { ActionWithRun }
