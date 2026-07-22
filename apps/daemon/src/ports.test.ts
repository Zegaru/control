import { describe, expect, it } from 'vitest'
import type { PortOwner } from '@control/shared'
import { applyProjectPortLabels } from './ports.js'

describe('applyProjectPortLabels', () => {
  it('applies a custom label when projectId matches', () => {
    const owners: PortOwner[] = [
      {
        port: 3000,
        owner: 'external',
        processName: 'node',
        label: 'node',
        projectId: 'proj-1',
      },
    ]
    const labels = new Map([['proj-1', { '3000': 'frontend' }]])
    const out = applyProjectPortLabels(owners, labels)
    expect(out[0]!.label).toBe('frontend')
    expect(out[0]!.processName).toBe('node')
  })

  it('leaves label unchanged when projectId is missing', () => {
    const owners: PortOwner[] = [
      { port: 3000, owner: 'external', processName: 'node', label: 'node' },
    ]
    const labels = new Map([['proj-1', { '3000': 'frontend' }]])
    const out = applyProjectPortLabels(owners, labels)
    expect(out[0]!.label).toBe('node')
  })

  it('leaves label unchanged when project has no entry for that port', () => {
    const owners: PortOwner[] = [
      {
        port: 4206,
        owner: 'external',
        processName: 'node',
        label: 'node',
        projectId: 'proj-1',
      },
    ]
    const labels = new Map([['proj-1', { '3000': 'frontend' }]])
    const out = applyProjectPortLabels(owners, labels)
    expect(out[0]!.label).toBe('node')
  })

  it('ignores empty or whitespace-only stored labels', () => {
    const owners: PortOwner[] = [
      {
        port: 3000,
        owner: 'external',
        processName: 'node',
        label: 'node',
        projectId: 'proj-1',
      },
    ]
    const labels = new Map([['proj-1', { '3000': '   ' }]])
    const out = applyProjectPortLabels(owners, labels)
    expect(out[0]!.label).toBe('node')
  })
})
