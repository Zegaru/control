# Spike: Optional PTY attach (stdin to runs)

> **Status**: Implementation plan opened — [`plans/011-pty-attach-and-xterm-copy.md`](../011-pty-attach-and-xterm-copy.md) (also fixes xterm copy / blocked context menu). Operator requested this ahead of the env-files deferral.

## Evidence

- `DESIGN.md`: interactive REPL out of scope v1; PTY write can come later.
- `supervisor.stop` sends `\x03` via PTY; `LogPanel` is read-only (no stdin WS).
- Adopted runs have no PTY handle — attach must be live-handle only.
- Copy broken independently: `App.tsx` global `contextmenu` preventDefault; LogPanel has no clipboard key handler for xterm selection.

## Proposal

1. WS message `run.stdin` `{ runId, data }` gated behind explicit **Attach** toggle in LogPanel.
2. Daemon writes to `handle.proc` only when the run has a live PTY (`Supervisor.write`); UI only sends when Attach is on.
3. Default: attach off; destructive input risk called out in UI copy.
4. Fix selection copy: allow context menu on `.xterm`; Ctrl/Cmd+C (and Ctrl/Cmd+Shift+C) copy `term.getSelection()` when non-empty; when Attach is on and selection is empty, Ctrl+C interrupts via stdin.

## Non-goals

- Full terminal emulator (resize, alt-screen, scrollback beyond xterm).
- Free-standing project shell / cmd panel.
- Container stdin.

## Recommendation

**Ship via plan 011** (operator priority). Env-files remains next direction work as plan **012**.
