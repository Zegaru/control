/** True when running inside the Tauri shell (including remote UI at 127.0.0.1:4400). */
export function isTauri(): boolean {
  return typeof globalThis !== 'undefined' && Boolean((globalThis as {isTauri?: boolean}).isTauri);
}
