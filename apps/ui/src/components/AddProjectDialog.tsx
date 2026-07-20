import {useEffect, useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {api, ApiError} from '../api.js';
import {Button, Modal, TextInput} from './ui.js';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function AddProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canBrowse, setCanBrowse] = useState(false);

  useEffect(() => {
    setCanBrowse(isTauri());
  }, []);

  useEffect(() => {
    if (!open) {
      setPath('');
      setName('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const browse = async () => {
    try {
      const {open: pick} = await import('@tauri-apps/plugin-dialog');
      const selected = await pick({
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
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add project');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add Project" className="w-[480px] p-5">
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
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy || !path.trim()} focusableWhenDisabled>
          {busy ? 'Scanning…' : 'Add & Scan'}
        </Button>
      </div>
    </Modal>
  );
}
