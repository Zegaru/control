# Spike: Optional PTY attach (stdin to runs)

## Evidence

- `DESIGN.md`: interactive REPL out of scope v1; PTY write can come later.
- `supervisor.stop` sends `\x03` via PTY; `LogPanel` is read-only (no stdin WS).
- Adopted runs have no PTY handle — attach must be live-handle only.

## Proposal

1. WS message `run.stdin` `{ runId, data }` gated behind explicit **Attach** toggle in LogPanel.
2. Daemon writes to `handle.proc` only when attach enabled and run is live.
3. Default: attach off; destructive input risk called out in UI copy.

## Non-goals

- Full terminal emulator (resize, alt-screen, scrollback beyond xterm).

## Recommendation

**Defer until env-files** — valuable but larger surface (L effort); design API in plan 012 after env spike ships.
