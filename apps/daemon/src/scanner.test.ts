import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_IGNORE_GLOBS } from '@control/shared'
import { matchesIgnore, scanProject } from './scanner.js'

describe('matchesIgnore', () => {
  it('matches exact basename patterns', () => {
    expect(matchesIgnore('node_modules', 'node_modules', ['node_modules'])).toBe(true)
  })

  it('matches a default ignore glob against a typical path', () => {
    expect(matchesIgnore('.git', '.git', [...DEFAULT_IGNORE_GLOBS])).toBe(true)
  })

  it('does not match unrelated names', () => {
    expect(matchesIgnore('src', 'src', ['node_modules'])).toBe(false)
  })

  it('ignores empty and whitespace-only patterns', () => {
    expect(matchesIgnore('node_modules', 'node_modules', ['', '   '])).toBe(false)
  })
})

function makeProject(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'control-scan-'))
  for (const [rel, content] of Object.entries(files)) {
    writeFileSync(join(dir, rel), content, 'utf8')
  }
  return dir
}

function stackKinds(dir: string): string[] {
  return scanProject(dir, 1, []).flatMap((m) => m.stacks.map((s) => s.kind))
}

describe('scanProject stack detection', () => {
  it('detects node and compose together', () => {
    const dir = makeProject({
      'package.json': JSON.stringify({ scripts: { dev: 'vite' } }),
      'docker-compose.yml': 'services: {}',
    })
    expect(stackKinds(dir)).toEqual(expect.arrayContaining(['node', 'compose']))
  })

  it('detects dotnet from csproj', () => {
    const dir = makeProject({
      'App.csproj': '<Project Sdk="Microsoft.NET.Sdk"></Project>',
    })
    expect(stackKinds(dir)).toContain('dotnet')
  })

  it('detects maven and gradle markers', () => {
    const maven = makeProject({ 'pom.xml': '<project></project>' })
    const gradle = makeProject({ 'build.gradle.kts': 'plugins {}' })
    expect(stackKinds(maven)).toContain('maven')
    expect(stackKinds(gradle)).toContain('gradle')
  })

  it('detects flutter when mobile folders exist', () => {
    const dir = makeProject({ 'pubspec.yaml': 'name: demo' })
    mkdirSync(join(dir, 'android'))
    expect(stackKinds(dir)).toContain('flutter')
  })

  it('detects deno tasks', () => {
    const dir = makeProject({
      'deno.json': JSON.stringify({ tasks: { dev: 'deno run -A main.ts' } }),
    })
    const modules = scanProject(dir, 1, [])
    expect(stackKinds(dir)).toContain('deno')
    expect(modules[0]?.actions.some((a) => a.name === 'dev')).toBe(true)
  })

  it('detects python from requirements.txt', () => {
    const dir = makeProject({ 'requirements.txt': 'django\n' })
    expect(stackKinds(dir)).toContain('python')
  })

  it('detects auxiliary infra stacks', () => {
    const dir = makeProject({
      'main.tf': 'terraform {}',
      'flake.nix': '{ outputs = {}; }',
      justfile: 'dev:\n\techo hi\n',
    })
    const kinds = stackKinds(dir)
    expect(kinds).toEqual(expect.arrayContaining(['terraform', 'nix', 'just']))
  })
})

describe('scanProject .claude/launch.json', () => {
  function writeLaunchJson(dir: string, content: string) {
    mkdirSync(join(dir, '.claude'))
    writeFileSync(join(dir, '.claude', 'launch.json'), content, 'utf8')
  }

  it('imports two configs as primary actions', () => {
    const dir = makeProject({})
    writeLaunchJson(
      dir,
      JSON.stringify({
        version: '0.0.1',
        configurations: [
          {
            name: 'my-app',
            runtimeExecutable: 'npm',
            runtimeArgs: ['run', 'dev'],
            port: 3000,
          },
          {
            name: 'api server',
            runtimeExecutable: 'node',
            runtimeArgs: ['server.js'],
          },
        ],
      }),
    )
    const modules = scanProject(dir, 1, [])
    expect(modules).toHaveLength(1)
    expect(modules[0]?.stacks.some((s) => s.kind === 'claude-launch')).toBe(true)
    const actions = modules[0]?.actions ?? []
    expect(actions).toHaveLength(2)
    expect(actions[0]).toMatchObject({
      naturalKey: '.:claude-launch:my-app',
      name: 'my-app',
      command: 'npm run dev',
      type: 'script',
      primary: true,
      portHint: 3000,
    })
    expect(actions[1]).toMatchObject({
      naturalKey: '.:claude-launch:api-server',
      name: 'api server',
      command: 'node server.js',
      type: 'script',
      primary: true,
    })
    expect(actions[1]?.portHint).toBeUndefined()
  })

  it('skips url-only configs without runtimeExecutable', () => {
    const dir = makeProject({})
    writeLaunchJson(
      dir,
      JSON.stringify({
        version: '0.0.1',
        configurations: [
          { name: 'preview', url: 'http://localhost:5173' },
          {
            name: 'app',
            runtimeExecutable: 'npm',
            runtimeArgs: ['run', 'dev'],
          },
        ],
      }),
    )
    const actions = scanProject(dir, 1, [])[0]?.actions ?? []
    expect(actions).toHaveLength(1)
    expect(actions[0]?.name).toBe('app')
  })

  it('ignores invalid launch.json without throwing', () => {
    const dir = makeProject({
      'package.json': JSON.stringify({ scripts: { start: 'node .' } }),
    })
    writeLaunchJson(dir, '{ not valid json')
    expect(() => scanProject(dir, 1, [])).not.toThrow()
    const modules = scanProject(dir, 1, [])
    expect(modules[0]?.stacks.some((s) => s.kind === 'claude-launch')).toBe(false)
    expect(modules[0]?.actions.some((a) => a.naturalKey.includes('claude-launch'))).toBe(false)
  })

  it('detects launch-only modules without package.json', () => {
    const dir = makeProject({})
    writeLaunchJson(
      dir,
      JSON.stringify({
        version: '0.0.1',
        configurations: [
          {
            name: 'solo',
            runtimeExecutable: 'pnpm',
            runtimeArgs: ['dev'],
            port: 8080,
          },
        ],
      }),
    )
    const modules = scanProject(dir, 1, [])
    expect(modules).toHaveLength(1)
    expect(modules[0]?.stacks).toEqual([{ kind: 'claude-launch', confidence: 1 }])
    expect(modules[0]?.actions).toEqual([
      {
        naturalKey: '.:claude-launch:solo',
        name: 'solo',
        command: 'pnpm dev',
        type: 'script',
        primary: true,
        portHint: 8080,
      },
    ])
  })
})
