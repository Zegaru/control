import { useQuery } from '@tanstack/react-query'
import type { ActionWithRun, ProjectTree } from '@control/shared'
import { api } from './api.js'

export interface FlatAction {
  action: ActionWithRun
  projectId: string
  projectName: string
  moduleName: string
}

/** Every non-hidden action across all registered projects, flattened with labels. */
export function useAllActions(options?: { enabled?: boolean }): {
  actions: FlatAction[]
  byId: Map<string, FlatAction>
} {
  const enabled = options?.enabled ?? true
  const treesQ = useQuery({
    queryKey: ['trees'],
    queryFn: api.projectTrees,
    enabled,
  })
  const treeData = (treesQ.data ?? []) as ProjectTree[]

  const actions: FlatAction[] = []
  for (const tree of treeData) {
    for (const mod of tree.modules) {
      for (const action of mod.actions) {
        if (action.hidden) continue
        actions.push({
          action,
          projectId: tree.id,
          projectName: tree.name,
          moduleName: mod.relPath || 'root',
        })
      }
    }
  }
  const byId = new Map(actions.map((a) => [a.action.id, a]))
  return { actions, byId }
}
