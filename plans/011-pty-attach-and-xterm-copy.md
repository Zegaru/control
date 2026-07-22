# Plan 011: Optional PTY attach + fix xterm copy

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 326dd39..HEAD -- packages/shared/src/index.ts apps/daemon/src/supervisor.ts apps/daemon/src/wsHub.ts apps/ui/src/useWs.ts apps/ui/src/components/LogPanel.tsx apps/ui/src/App.tsx apps/ui/src/index.css apps/ui/src/components/RunDrawer.tsx DESIGN.md plans/spikes/pty-attach.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (spike recommended deferring until env-files; operator requested this now)
- **Category**: direction | bug
- **Planned at**: commit `326dd39`, 2026-07-21

## Why this matters

Run logs already stream through xterm over WebSocket, but the panel is output-only and selection cannot be copied: a global `contextmenu` blocker kills right-click copy, and Ctrl+C does nothing useful because xterm selection is not wired to the clipboard. Operators also need a safe way to type into a **live** run (answer prompts, send Ctrl+C to the process) without turning CONTROL into a full terminal product. This plan ships (1) reliable copy/paste from xterm and (2) opt-in **Attach** stdin for live host runs only — matching `plans/spikes/pty-attach.md`.

## Current state

### Copy is broken in two places

`apps/ui/src/App.tsx` globally swallows the context menu (Tauri desktop chrome):

```96:100:apps/ui/src/App.tsx
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('contextmenu', onContextMenu);
    return () => window.removeEventListener('contextmenu', onContextMenu);
  }, []);
```

`apps/ui/src/index.css` sets `user-select: none` on `html, body`, with a narrow `.xterm { user-select: text }` override — enough for browser selection paint, **not** enough for Ctrl+C. `LogPanel` never registers a key handler or clipboard write:

```12:52:apps/ui/src/components/LogPanel.tsx
export function LogPanel({runId, containerId}: {runId?: string; containerId?: string}) {
  // ...
  const term = new Terminal({ /* ... */ });
  // term.write only — no onData, no attachCustomKeyEventHandler
  return <div ref={containerRef} className="h-full w-full" />;
}
```

### PTY write exists only for stop

`apps/daemon/src/supervisor.ts` — `RunHandle.proc` is a live `node-pty` handle; `stop` writes `\x03`, but there is no public `write`/`stdin` API. Adopted runs have `proc: null` (or no handle) — attach must stay live-handle only. `isLive(runId)` already exists.

### WebSocket is subscribe-only today

`packages/shared/src/index.ts`:

```453:458:packages/shared/src/index.ts
export const wsClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe.logs'), runId: z.string() }),
  z.object({ type: z.literal('unsubscribe.logs'), runId: z.string() }),
  z.object({ type: z.literal('subscribe.container'), containerId: z.string() }),
  z.object({ type: z.literal('unsubscribe.container'), containerId: z.string() }),
])
```

`apps/daemon/src/wsHub.ts` handles those four types only. `apps/ui/src/useWs.ts` exposes `subscribeLogs` / `subscribeContainer` and a private `send`; it does not expose a stdin sender. `socket.tsx` re-exports `ReturnType<typeof useDaemonSocket>` — extending the hook return type is enough.

### Attach availability signal (no new API needed)

`runStatusSchema` includes `'adopted'`. UI can disable Attach when `run.status === 'adopted'` or when the run is terminal (`exited` | `failed` | `killed`). Daemon must still no-op `run.stdin` when `handle.proc` is missing (defense in depth).

### Product / design constraints (honor these)

From `DESIGN.md` (non-goals): not a terminal replacement; interactive REPL was out of scope for v1 with “PTY write can come later.” From `plans/spikes/pty-attach.md`:

- Opt-in **Attach** toggle; default **off**
- WS `run.stdin` `{ runId, data }`
- Live PTY only; call out destructive input risk in UI copy
- **Non-goals**: full terminal emulator (resize, alt-screen, scrollback beyond existing xterm), free-standing project shell / cmd.exe REPL panel, container stdin

### Conventions to match

- Commit messages: imperative sentence, no conventional-commit prefix — e.g. `Stop adopted runs after daemon restart and tighten reconcile.`
- Daemon tests: pure Vitest units next to the module — model after `apps/daemon/src/containerSubscribe.test.ts` (small exported helpers, no real PTY).
- UI controls: prefer existing `Button` from `kit.tsx` / `ui.tsx` (ghost / small). Do **not** drop the large `RockerToggle` into the log chrome — it is oversized for a drawer header.
- Package manager: `pnpm`. Do not start `pnpm dev` unless the operator asks.
- Shared schemas live in `packages/shared`; daemon and UI import `@control/shared`.

### LogPanel call sites (all must keep working)

- `apps/ui/src/components/RunDrawer.tsx` — primary run log drawer
- `apps/ui/src/views/Dashboard.tsx` — inline log when an event row is selected
- `apps/ui/src/components/ContainerDrawer.tsx` — container logs (**Attach must stay hidden/disabled**; copy must still work)

## Commands you will need

| Purpose   | Command                | Expected on success                          |
|-----------|------------------------|----------------------------------------------|
| Typecheck | `pnpm typecheck`       | exit 0                                       |
| Tests     | `pnpm test`            | all pass                                     |
| Lint      | `pnpm lint`            | exit 0                                       |
| Filter    | `pnpm test -- ptyWrite`| new unit tests pass (name may vary; see step) |

## Scope

**In scope** (the only files you should modify / create):

- `packages/shared/src/index.ts` — add `run.stdin` (and optionally `run.attach` is **not** required; UI gates send)
- `apps/daemon/src/supervisor.ts` — public `write(runId, data): boolean`
- `apps/daemon/src/ptyWrite.ts` (create) — tiny pure helper used by supervisor + unit-tested
- `apps/daemon/src/ptyWrite.test.ts` (create)
- `apps/daemon/src/wsHub.ts` — handle `run.stdin`
- `apps/ui/src/useWs.ts` — expose `sendStdin(runId, data)` (or `send` for stdin messages)
- `apps/ui/src/components/LogPanel.tsx` — clipboard keys + Attach toggle + `onData` when attached
- `apps/ui/src/App.tsx` — allow context menu inside `.xterm`
- `apps/ui/src/index.css` — only if needed for selection/cursor inside `.xterm` (prefer minimal)
- `apps/ui/src/components/RunDrawer.tsx` — only if Attach chrome is placed in the drawer header instead of inside `LogPanel` (prefer **inside LogPanel** so Dashboard inline view gets it too; then RunDrawer may stay untouched)
- `DESIGN.md` — one short update: optional attach exists; still not a terminal product
- `plans/spikes/pty-attach.md` — point at this plan / mark implemented intent
- `plans/README.md` — status row

**Out of scope** (do NOT touch):

- Free-standing interactive shell / project cmd panel
- PTY resize / `run.resize` / FitAddon → `proc.resize`
- Container attach / docker exec stdin
- Env-file loading (future plan; unrelated)
- Changing stop semantics, reconcile, or adoption
- Adding `@xterm/addon-clipboard` unless the native Clipboard API path fails in Tauri — prefer `navigator.clipboard` + `term.getSelection()` first; STOP if Tauri blocks clipboard without a permission and report (do not invent shell-side clipboard bridges)
- Refactors of `wsHub` / `useWs` beyond the new message path
- Auth beyond localhost trust (DESIGN NFR-2)

## Git workflow

- Branch: `advisor/011-pty-attach-and-xterm-copy`
- Commits: one logical unit per step group is fine (copy fix, then stdin path, then UI attach). Message style: imperative, matching recent history.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Drift check

Run the drift check command in the executor banner. Confirm excerpts still match.

**Verify**: command exits 0; if `--stat` is non-empty, open each changed file and reconcile excerpts before continuing. On material mismatch → STOP.

---

### Step 1: Fix xterm copy (independent of attach)

**1a. Context menu allowlist** in `apps/ui/src/App.tsx`:

Replace the blanket preventDefault with:

```ts
const onContextMenu = (e: MouseEvent) => {
  const t = e.target
  if (t instanceof Element && t.closest('.xterm')) return
  e.preventDefault()
}
```

**1b. Clipboard key handling** in `LogPanel.tsx` (attach still off in this step):

After `term.open(...)`, register:

```ts
term.attachCustomKeyEventHandler((ev) => {
  if (ev.type !== 'keydown') return true
  const mod = ev.ctrlKey || ev.metaKey
  // Copy: Ctrl/Cmd+C or Ctrl/Cmd+Insert when there is a selection
  if (mod && (ev.key === 'c' || ev.key === 'C' || ev.key === 'Insert')) {
    const sel = term.getSelection()
    if (sel) {
      void navigator.clipboard.writeText(sel)
      return false // prevent default / do not treat as terminal input later
    }
  }
  // Copy: Ctrl/Cmd+Shift+C always attempts copy when selection exists
  if (mod && ev.shiftKey && (ev.key === 'c' || ev.key === 'C')) {
    const sel = term.getSelection()
    if (sel) void navigator.clipboard.writeText(sel)
    return false
  }
  return true
})
```

Also handle right-click copy via the now-allowed browser menu **or** add a minimal `term.element` `contextmenu` listener that copies selection when present (optional; browser menu is enough once App.tsx allowlists `.xterm`).

Keep Attach / `onData` for Step 4 — this step must already make copy work for container and run views.

**Verify**: `pnpm --filter @control/ui typecheck` → exit 0.

**Manual smoke (required before marking done)**: with UI open, select log text in a run or container panel → Ctrl+C (or Cmd+C) puts text on clipboard; right-click on `.xterm` is not swallowed by the app-level handler. If Tauri clipboard write fails silently, STOP and report — do not add native plugin dependencies without operator approval.

---

### Step 2: Shared WS schema — `run.stdin`

In `packages/shared/src/index.ts`, extend `wsClientMessageSchema`:

```ts
z.object({
  type: z.literal('run.stdin'),
  runId: z.string().min(1),
  data: z.string(), // raw PTY bytes as JS string (same encoding as run.log chunks)
}),
```

Cap abuse lightly without inventing a new protocol: reject empty `runId`. Do **not** add max length in Zod unless you also document it; if you add a max, use something large (e.g. 16 KiB) and document it in a one-line comment. Prefer no max for v1 (localhost trust).

**Verify**: `pnpm --filter @control/shared typecheck` → exit 0 (or workspace `pnpm typecheck` later).

---

### Step 3: Daemon write path + characterization test

**3a. Create** `apps/daemon/src/ptyWrite.ts`:

```ts
/** Write stdin to a live PTY. Returns false when there is no handle. */
export function writePty(
  proc: { write(data: string): void } | null | undefined,
  data: string,
): boolean {
  if (!proc) return false
  try {
    proc.write(data)
    return true
  } catch {
    return false
  }
}
```

**3b. Create** `apps/daemon/src/ptyWrite.test.ts` modeled on `containerSubscribe.test.ts`:

- returns `false` when `proc` is null/undefined
- calls `write` with the given data when present
- returns `false` when `write` throws

**3c. Add** `Supervisor.write(runId: string, data: string): boolean` in `supervisor.ts`:

```ts
write(runId: string, data: string): boolean {
  const handle = this.handles.get(runId)
  return writePty(handle?.proc ?? null, data)
}
```

Export `supervisor` singleton unchanged. Do not change `stop`.

**3d. Wire** `wsHub.ts` message branch:

```ts
} else if (msg.type === 'run.stdin') {
  supervisor.write(msg.runId, msg.data)
}
```

No ack/event required for v1 (localhost; fire-and-forget). Invalid/missing runs silently no-op.

**Verify**: `pnpm test -- ptyWrite` → all new tests pass; `pnpm --filter @control/daemon typecheck` → exit 0.

---

### Step 4: UI send + Attach UX

**4a. `useWs.ts`** — add to the returned API:

```ts
const sendStdin = (runId: string, data: string) => {
  send({ type: 'run.stdin', runId, data })
}
// return { ..., sendStdin }
```

**4b. `LogPanel.tsx`** — structure:

- Props stay `{ runId?: string; containerId?: string }`.
- Local state: `attached` boolean, default `false`.
- Load run status when `runId` is set: `useQuery({ queryKey: ['runs'], queryFn: api.activeRuns })` and find the run (same pattern as `RunDrawer`).
- `canAttach = !!runId && !!run && run.status !== 'adopted' && isActiveStatus(run.status)` — import `isActiveStatus` from `@control/shared`. When the run leaves an active status, force `attached` to `false`.
- Render a thin chrome row above the terminal **only when `runId` is set**:
  - Label: `Attach` button (ghost/small) or toggle text `ATTACH` / `DETACHED`
  - When `!canAttach`: button disabled; title/tooltip: `Attach requires a live PTY (not available for adopted or stopped runs)`
  - When `attached`: short warning text, e.g. `Input goes to the process — Ctrl+C interrupts unless text is selected`
- When `attached && runId`:
  - `term.onData((data) => sendStdin(runId, data))` — store disposable and dispose on cleanup / detach
  - Cursor should look focused/writable (`term.focus()` on attach)
- When not attached: do **not** register `onData` (keeps read-only semantics).
- **Ctrl+C semantics** (update the key handler from Step 1):
  1. If selection non-empty → copy to clipboard, return `false` (do not send `\x03`)
  2. Else if attached → return `true` so xterm emits `\x03` via `onData` → stdin
  3. Else → return `false` or `true` harmlessly (no onData); prefer `false` only when you already handled the key
- **Paste when attached**: in the key handler, on Ctrl/Cmd+V (and Shift+Insert), `preventDefault` path: `navigator.clipboard.readText().then((t) => sendStdin(runId, t))` and return `false`. When not attached, ignore paste (or allow paste into nowhere — do nothing).
- Containers: no Attach chrome; copy from Step 1 still works.

Prefer putting chrome **inside** `LogPanel` so Dashboard’s inline `LogPanel` and `RunDrawer` both get Attach without duplicating UI.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0 (fix any new lint in touched files only if the repo’s biome config requires; do not mass-reformat).

---

### Step 5: Docs

**5a. `DESIGN.md`** — update the non-goal bullet so it stays honest, e.g.:

- Keep “Not a terminal replacement”
- Clarify: optional **Attach** sends stdin to a live host run’s PTY; default off; adopted runs unsupported; not a free-standing shell

**5b. `plans/spikes/pty-attach.md`** — add a line at the top: `Implemented by plans/011-pty-attach-and-xterm-copy.md` (or update Recommendation to “shipped in 011”).

**Verify**: files exist and mention Attach / 011; no need for a doc build.

---

### Step 6: Full verification + README status

**Verify** (all must pass):

```bash
pnpm typecheck
pnpm test
pnpm lint
```

Update `plans/README.md` status for 011 → `DONE`.

## Test plan

| Case | Where |
|------|--------|
| `writePty(null)` → false | `ptyWrite.test.ts` |
| `writePty(fake)` calls write | `ptyWrite.test.ts` |
| `writePty` swallows throw → false | `ptyWrite.test.ts` |
| Schema accepts `run.stdin` | optional — not required if typecheck covers inference; do not add a shared-package test harness unless one already exists |
| Manual: copy with selection (Ctrl+C / right-click) | LogPanel run + container |
| Manual: Attach off → typing does not affect process | live run |
| Manual: Attach on → keys reach process; Ctrl+C with no selection interrupts | live run (e.g. `node -e "setInterval(()=>{},1000)"` style action or any prompt) |
| Manual: adopted run → Attach disabled | after daemon restart with surviving process |
| Manual: container drawer → no Attach; copy still works | ContainerDrawer |

No E2E harness is required. Do not spawn real PTYs in Vitest.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; `ptyWrite.test.ts` exists and passes (≥3 cases above)
- [ ] `pnpm lint` exits 0
- [ ] `wsClientMessageSchema` includes `run.stdin`
- [ ] `Supervisor.write` exists and is used from `wsHub` for `run.stdin`
- [ ] `LogPanel` copies selection via Ctrl/Cmd+C (and Ctrl/Cmd+Shift+C); App no longer blocks `contextmenu` inside `.xterm`
- [ ] Attach defaults off; when on, keystrokes go to live PTY via WS; hidden/disabled for containers and adopted/inactive runs
- [ ] No free-standing shell, no resize protocol, no container stdin
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 011 updated
- [ ] `DESIGN.md` non-goal text updated as above

## STOP conditions

Stop and report back (do not improvise) if:

- Drift check shows material mismatch with Current state excerpts.
- Tauri (or browser) blocks `navigator.clipboard.writeText` / `readText` and a permission/capability change in `apps/shell` appears required — report the error; do not expand scope into shell capabilities without operator OK.
- Making Attach work appears to require spawning a shell without `/c` / `-lc` (free-standing shell) — that is out of scope.
- Container stdin or docker exec seems “needed for parity” — refuse; copy-only for containers.
- A step’s verification fails twice after a reasonable fix attempt.
- You need to modify files outside the in-scope list.

## Maintenance notes

- **Reviewer focus**: Ctrl+C must prefer **copy-when-selection** over interrupt; Attach default off; adopted runs cannot attach; no ack storm on stdin.
- If env-file injection (future plan) changes spawn env, Attach is unaffected — it only writes to an existing PTY.
- If resize is ever added, pair `FitAddon` `onResize` with `proc.resize` and a `run.resize` WS message; do not sneak it into a follow-up without a plan.
- Future free-standing shell would be a **new** session type — do not overload Action runs for that.
- Clipboard in Tauri WebViews sometimes needs explicit capability — if copy works in browser dev (`pnpm dev:ui`) but not in the packaged shell, file a follow-up plan under `apps/shell` rather than patching blindly here.
