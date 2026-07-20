/** Cross-platform "is this pid still alive?" without sending a real signal. */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // ESRCH = gone; EPERM = alive but not ours (still counts as alive).
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}
