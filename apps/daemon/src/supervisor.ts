import { createWriteStream, type WriteStream } from 'node:fs'
import { join, resolve } from 'node:path'
import pty from 'node-pty'
import treeKill from 'tree-kill'
import { eq } from 'drizzle-orm'
import type { Action, Run, RunStatus } from '@control/shared'
import { isActiveStatus } from '@control/shared'
import { db, schema } from './db/index.js'
import { getAction, getRun, resolveActionCwd } from './registry.js'
import { LOGS_DIR } from './config.js'
import { bus } from './events.js'
import { newId } from './ids.js'
import { RingBuffer } from './ringBuffer.js'
import { isHttpHealthy, isPortListening } from './health.js'
import { HEALTH_GRACE_MS, nextHealthStatus } from './healthStatus.js'
import { pidAlive } from './pid.js'
import { pruneRunsForAction } from './settings.js'

const isWin = process.platform === 'win32'
const GRACEFUL_STOP_MS = 5000
const HEALTH_POLL_MS = 1500

interface RunHandle {
  runId: string
  actionId: string
  proc: pty.IPty | null
  buffer: RingBuffer
  logStream: WriteStream | null
  status: RunStatus
  ports: number[]
  healthTimer: NodeJS.Timeout | null
  stopping: boolean
}

class Supervisor {
  private handles = new Map<string, RunHandle>()

  /** Spawn a fresh run for an action. Returns the created Run row. */
  start(action: Action, runtimeEnv?: Record<string, string>): Run {
    const runId = newId('run')
    const now = Date.now()
    const logFile = join(LOGS_DIR, `${runId}.log`)

    // Persist BEFORE the first byte of output so a daemon crash can't orphan
    // a process we have no record of (crash-safety, DESIGN §6).
    const run: Run = {
      id: runId,
      actionId: action.id,
      pid: null,
      status: 'starting',
      startedAt: now,
      exitedAt: null,
      exitCode: null,
      ports: [],
      logFile,
    }
    db.insert(schema.runs)
      .values({
        id: run.id,
        actionId: run.actionId,
        pid: null,
        status: run.status,
        startedAt: run.startedAt,
        exitedAt: null,
        exitCode: null,
        ports: [],
        logFile,
      })
      .run()

    const env = this.buildEnv(action, runtimeEnv)
    const cwd = resolve(resolveActionCwd(action) ?? process.cwd())

    // Run the command string through a shell so PATH lookups and Windows .cmd
    // shims (pnpm/npm/yarn) resolve correctly. ConPTY preserves colors.
    const file = isWin ? 'cmd.exe' : process.env.SHELL || '/bin/bash'
    const args = isWin ? ['/c', action.command] : ['-lc', action.command]

    let proc: pty.IPty
    try {
      proc = pty.spawn(file, args, {
        name: 'xterm-color',
        cols: 120,
        rows: 30,
        cwd,
        env,
      })
    } catch (err) {
      this.finalize(runId, 'failed', null)
      const message = err instanceof Error ? err.message : String(err)
      this.appendLog(runId, `\r\n[control] failed to spawn: ${message}\r\n`)
      return { ...run, status: 'failed' }
    }

    const handle: RunHandle = {
      runId,
      actionId: action.id,
      proc,
      buffer: new RingBuffer(),
      logStream: createWriteStream(logFile, { flags: 'a' }),
      status: 'starting',
      ports: [],
      healthTimer: null,
      stopping: false,
    }
    this.handles.set(runId, handle)

    db.update(schema.runs).set({ pid: proc.pid }).where(eq(schema.runs.id, runId)).run()
    this.setStatus(runId, 'starting', proc.pid)

    proc.onData((chunk) => this.appendLog(runId, chunk))
    proc.onExit(({ exitCode }) => this.onExit(runId, exitCode))

    this.beginHealthWatch(action, handle)

    return { ...run, pid: proc.pid }
  }

  /** Graceful stop (Ctrl-C, wait, then tree-kill) or immediate force kill. */
  stop(runId: string, force = false): boolean {
    const handle = this.handles.get(runId)
    if (handle?.proc) {
      handle.stopping = true
      const pid = handle.proc.pid

      if (force) {
        this.forceKill(pid)
        return true
      }

      try {
        handle.proc.write('\x03')
      } catch {
        /* ignore — proc may already be gone */
      }
      setTimeout(() => {
        if (this.handles.has(runId)) this.forceKill(pid)
      }, GRACEFUL_STOP_MS)
      return true
    }

    return this.stopAdopted(runId)
  }

  /** Stop a run re-attached after daemon restart (no in-memory PTY handle). */
  private stopAdopted(runId: string): boolean {
    const run = getRun(runId)
    if (!run || !isActiveStatus(run.status)) return false
    if (run.pid == null) return false

    if (!pidAlive(run.pid)) {
      this.finalizeAdopted(runId, run, 'exited')
      return true
    }

    treeKill(run.pid, 'SIGKILL', () => {
      this.finalizeAdopted(runId, run, 'killed')
    })
    return true
  }

  private finalizeAdopted(runId: string, run: Run, status: RunStatus): void {
    db.update(schema.runs)
      .set({ status, exitCode: null, exitedAt: Date.now() })
      .where(eq(schema.runs.id, runId))
      .run()
    bus.emitEvent({
      type: 'run.status',
      runId,
      actionId: run.actionId,
      status,
      ports: run.ports ?? [],
      exitCode: null,
      ...this.actionLabels(run.actionId),
    })
    bus.emitEvent({ type: 'ports.changed' })
    if (run.actionId) pruneRunsForAction(run.actionId)
  }

  getLogSnapshot(runId: string): string | null {
    const handle = this.handles.get(runId)
    return handle ? handle.buffer.snapshot() : null
  }

  isLive(runId: string): boolean {
    return this.handles.has(runId)
  }

  activePorts(): number[] {
    const all = new Set<number>()
    for (const h of this.handles.values()) h.ports.forEach((p) => all.add(p))
    return [...all]
  }

  runIdForPort(port: number): string | null {
    for (const h of this.handles.values()) {
      if (h.ports.includes(port)) return h.runId
    }
    return null
  }

  // -------------------------------------------------------------------------

  private forceKill(pid: number): void {
    treeKill(pid, 'SIGKILL', () => {
      /* onExit handler performs finalize/cleanup */
    })
  }

  private actionLabels(actionId: string): { projectName?: string; actionName?: string } {
    const action = getAction(actionId)
    if (!action) return {}
    const mod = db
      .select()
      .from(schema.modules)
      .where(eq(schema.modules.id, action.moduleId))
      .get()
    const proj = mod
      ? db.select().from(schema.projects).where(eq(schema.projects.id, mod.projectId)).get()
      : undefined
    return {
      projectName: proj?.name,
      actionName: action.name,
    }
  }

  private buildEnv(action: Action, runtimeEnv?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v
    }
    if (runtimeEnv) Object.assign(env, runtimeEnv)
    if (action.envOverrides) Object.assign(env, action.envOverrides)
    // Nudge tools toward emitting color even though stdout is a pipe.
    env.FORCE_COLOR = env.FORCE_COLOR ?? '1'
    return env
  }

  private appendLog(runId: string, chunk: string): void {
    const handle = this.handles.get(runId)
    if (!handle) return
    handle.buffer.push(chunk)
    handle.logStream?.write(chunk)
    bus.emitEvent({ type: 'run.log', runId, chunk })
  }

  private beginHealthWatch(action: Action, handle: RunHandle): void {
    // No health signals declared: treat as "running" shortly after spawn.
    if (!action.portHint && !action.healthUrl) {
      setTimeout(() => {
        if (this.handles.get(handle.runId)?.status === 'starting') {
          this.setStatus(handle.runId, 'running', handle.proc?.pid ?? null)
        }
      }, 1200)
      return
    }

    const watchStartedAt = Date.now()
    const hadHealthSignals = !!(action.portHint || action.healthUrl)

    handle.healthTimer = setInterval(async () => {
      if (!this.handles.has(handle.runId)) return
      let portUp = false
      if (action.portHint) {
        portUp = await isPortListening(action.portHint)
        if (portUp && !handle.ports.includes(action.portHint)) {
          handle.ports.push(action.portHint)
          this.persistPorts(handle.runId, handle.ports)
        }
      }
      let healthy = portUp || !action.portHint
      if (action.healthUrl) healthy = await isHttpHealthy(action.healthUrl)

      const graceElapsed = Date.now() - watchStartedAt >= HEALTH_GRACE_MS
      const next = nextHealthStatus({ healthy, portUp, hadHealthSignals, graceElapsed })
      if (next) {
        this.setStatus(handle.runId, next, handle.proc?.pid ?? null)
      }
    }, HEALTH_POLL_MS)
  }

  private onExit(runId: string, exitCode: number): void {
    const handle = this.handles.get(runId)
    const status: RunStatus = handle?.stopping
      ? 'killed'
      : exitCode === 0
        ? 'exited'
        : 'failed'
    this.finalize(runId, status, exitCode)
  }

  private finalize(runId: string, status: RunStatus, exitCode: number | null): void {
    const handle = this.handles.get(runId)
    if (handle) {
      if (handle.healthTimer) clearInterval(handle.healthTimer)
      handle.logStream?.end()
    }
    db.update(schema.runs)
      .set({ status, exitCode, exitedAt: Date.now() })
      .where(eq(schema.runs.id, runId))
      .run()
    const ports = handle?.ports ?? []
    const actionId = handle?.actionId ?? ''
    this.handles.delete(runId)
    bus.emitEvent({
      type: 'run.status',
      runId,
      actionId,
      status,
      ports,
      exitCode,
      ...this.actionLabels(actionId),
    })
    bus.emitEvent({ type: 'ports.changed' })
    if (actionId) pruneRunsForAction(actionId)
  }

  private setStatus(runId: string, status: RunStatus, pid: number | null): void {
    const handle = this.handles.get(runId)
    if (handle) {
      if (handle.status === status) return
      handle.status = status
    }
    db.update(schema.runs).set({ status }).where(eq(schema.runs.id, runId)).run()
    bus.emitEvent({
      type: 'run.status',
      runId,
      actionId: handle?.actionId ?? '',
      status,
      ports: handle?.ports ?? [],
      pid,
      ...this.actionLabels(handle?.actionId ?? ''),
    })
  }

  private persistPorts(runId: string, ports: number[]): void {
    db.update(schema.runs).set({ ports }).where(eq(schema.runs.id, runId)).run()
    bus.emitEvent({ type: 'ports.changed' })
  }
}

export const supervisor = new Supervisor()
