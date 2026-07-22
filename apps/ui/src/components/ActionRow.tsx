import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Eye, EyeSlash, GearSix, Star} from '@phosphor-icons/react';
import type {ActionWithRun} from '@control/shared';
import {api} from '../api.js';
import {Chip, Led, statusColor, statusLabel} from './kit.js';
import {Button} from './ui.js';
import {ActionEditor} from './ActionEditor.js';

export function ActionRow({
  action,
  onOpenRun,
  compact,
  variant = 'default',
}: {
  action: ActionWithRun;
  onOpenRun: (runId: string) => void;
  compact?: boolean;
  variant?: 'default' | 'hidden';
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const run = action.activeRun;
  const active = !!run;
  const status = run?.status ?? 'idle';
  const busy = status === 'starting';
  const isHiddenVariant = variant === 'hidden';

  const invalidate = () => {
    qc.invalidateQueries({queryKey: ['trees']});
    qc.invalidateQueries({queryKey: ['tree']});
    qc.invalidateQueries({queryKey: ['projects']});
    qc.invalidateQueries({queryKey: ['runs']});
  };

  const toggle = async () => {
    if (active && run) {
      await api.stopRun(run.id);
    } else {
      const res = await api.startAction(action.id);
      if ('error' in res && res.error === 'port_conflict') {
        const go = confirm(
          `Port ${res.port} is already in use (another run, container, or process). Start anyway?`,
        );
        if (go) await api.startAction(action.id, true);
        else return;
      }
    }
    invalidate();
  };

  const toggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await api.patchAction(action.id, {favorite: !action.favorite});
    invalidate();
  };

  const toggleHidden = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await api.patchAction(action.id, {hidden: !isHiddenVariant});
    invalidate();
  };

  return (
    <div className="flex items-center gap-3 rounded-md border border-panel-edge bg-panel px-3 py-2">
      <ActionEditor
        open={editing}
        onOpenChange={setEditing}
        action={action}
        onOpenRun={onOpenRun}
      />
      <Led status={status} pulse={busy} />
      <Button
        variant="ghost"
        className="flex min-w-0 flex-1 items-center justify-start gap-2 px-0 py-0 text-left hover:not-data-disabled:text-ink"
        onClick={() => run && onOpenRun(run.id)}
        disabled={!run}
        title={action.command}
      >
        <span className="truncate text-sm text-ink">{action.name}</span>
        {action.primary && !compact && <Chip>server</Chip>}
        {action.portHint && <Chip tone={active ? 'phosphor' : 'default'}>:{action.portHint}</Chip>}
      </Button>

      {!compact && (
        <span
          className="w-16 shrink-0 text-right text-[12px] uppercase tracking-wider"
          style={{color: statusColor(status)}}
        >
          {statusLabel(status)}
        </span>
      )}

      <Button variant="icon" onClick={toggleFav} title="Favorite" className="text-sm">
        <Star
          size={16}
          weight={action.favorite ? 'fill' : 'regular'}
          className={action.favorite ? 'text-amber' : 'text-ink-faint'}
        />
      </Button>

      <Button
        variant="icon"
        onClick={toggleHidden}
        title={isHiddenVariant ? 'Show action' : 'Hide action'}
        className="text-sm"
      >
        {isHiddenVariant ? (
          <Eye size={16} className="text-ink-faint" />
        ) : (
          <EyeSlash size={16} className="text-ink-faint" />
        )}
      </Button>

      {!compact && (
        <Button
          variant="icon"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="text-sm"
          title="Edit action"
        >
          <GearSix size={16} />
        </Button>
      )}

      <Button
        variant={active ? 'danger' : 'primary'}
        onClick={toggle}
        className="shrink-0 px-3 py-1"
      >
        {active ? 'STOP' : 'START'}
      </Button>
    </div>
  );
}
