/** True when running inside the Tauri shell (including remote UI at 127.0.0.1:4400). */
export function isTauri(): boolean {
  return typeof globalThis !== 'undefined' && Boolean((globalThis as {isTauri?: boolean}).isTauri);
}

/** Open a URL in the system browser (Tauri) or a new tab (web). */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    const {invoke} = await import('@tauri-apps/api/core');
    await invoke('plugin:opener|open_url', {url});
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
