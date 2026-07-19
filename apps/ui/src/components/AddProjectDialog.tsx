import {useEffect, useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {api, ApiError} from '../api.js';
import {Button, TextInput} from './ui.js';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function AddProjectDialog({onClose}: {onClose: () => void}) {
  const qc = useQueryClient();
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canBrowse, setCanBrowse] = useState(false);

  useEffect(() => {
    setCanBrowse(isTauri());
  }, []);

  const browse = async () => {
    try {
      const {open} = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select project folder',
      });
      if (typeof selected === 'string') setPath(selected);
    } catch {
      setError('Folder picker unavailable');
    }
  };

  const submit = async () => {
    if (!path.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createProject(path.trim(), name.trim() || undefined);
      qc.invalidateQueries({queryKey: ['projects']});
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add project');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[480px] rounded-lg border border-panel-edge bg-panel-raised p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-ink-dim">
          Add Project
        </h2>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-ink-dim">Folder path</span>
          <div className="flex gap-2">
            <TextInput
              autoFocus
              className="min-w-0 flex-1"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="C:\Users\you\Documents\Projects\my-app"
            />
            {canBrowse && (
              <Button variant="ghost" type="button" onClick={browse} className="shrink-0">
                Browse…
              </Button>
            )}
          </div>
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs text-ink-dim">Name (optional)</span>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="defaults to folder name"
          />
        </label>
        {error && <p className="mb-3 text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !path.trim()} focusableWhenDisabled>
            {busy ? 'Scanning…' : 'Add & Scan'}
          </Button>
        </div>
      </div>
    </div>
  );
}
