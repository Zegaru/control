import type {ComponentProps} from 'react';
import {Button as BaseButton} from '@base-ui/react/button';
import {Input as BaseInput} from '@base-ui/react/input';
import {cn} from '../lib/cn.js';

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'backlit' | 'icon';
export type ButtonTone = 'default' | 'phosphor' | 'amber' | 'danger';
export type ButtonSize = 'sm' | 'md';

type BaseButtonProps = ComponentProps<typeof BaseButton>;

export type ButtonProps = Omit<BaseButtonProps, 'className'> & {
  variant?: ButtonVariant;
  /** Color accent for `backlit` (and optional tint for `primary`). */
  tone?: ButtonTone;
  size?: ButtonSize;
  className?: string;
};

const sizeCls: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-[10px]',
  md: 'px-4 py-2 text-[11px]',
};

const backlitToneCls: Record<ButtonTone, string> = {
  default: 'border-panel-edge text-ink-dim',
  phosphor: 'border-phosphor-dim text-phosphor glow-phosphor',
  amber: 'border-amber text-amber glow-amber',
  danger: 'border-danger text-danger glow-danger',
};

function buttonClassName({
  variant,
  tone,
  size,
  className,
}: {
  variant: ButtonVariant;
  tone: ButtonTone;
  size: ButtonSize;
  className?: string;
}) {
  const focus =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-phosphor-dim';
  const disabled = 'data-disabled:opacity-40';

  if (variant === 'backlit') {
    return cn(
      'backlit-btn font-ui rounded uppercase tracking-widest font-semibold select-none',
      sizeCls[size],
      backlitToneCls[tone],
      focus,
      disabled,
      className,
    );
  }

  if (variant === 'icon') {
    return cn(
      'inline-flex items-center justify-center rounded p-1 text-ink-faint select-none',
      'hover:not-data-disabled:text-ink',
      focus,
      disabled,
      className,
    );
  }

  if (variant === 'ghost') {
    return cn(
      'rounded px-3 py-1.5 text-xs text-ink-dim select-none',
      'hover:not-data-disabled:text-ink',
      focus,
      disabled,
      className,
    );
  }

  if (variant === 'danger') {
    return cn(
      'rounded border border-danger px-4 py-1.5 text-xs font-bold text-danger select-none',
      'hover:not-data-disabled:bg-danger/10',
      focus,
      'focus-visible:outline-danger',
      disabled,
      className,
    );
  }

  // primary
  return cn(
    'rounded border border-phosphor-dim px-4 py-1.5 text-xs font-bold text-phosphor select-none',
    'hover:not-data-disabled:bg-phosphor/10',
    focus,
    disabled,
    className,
  );
}

/** CONTROL-styled Base UI button. */
export function Button({
  variant = 'primary',
  tone = 'default',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      className={buttonClassName({variant, tone, size, className})}
      {...props}
    />
  );
}

type BaseInputProps = ComponentProps<typeof BaseInput>;

export type TextInputProps = Omit<BaseInputProps, 'className'> & {
  className?: string;
};

const inputBase =
  'w-full rounded border border-panel-edge bg-bezel px-3 py-2 text-sm text-ink outline-none ' +
  'placeholder:text-ink-faint focus:border-phosphor-dim data-disabled:opacity-40';

/** CONTROL-styled Base UI input. */
export function TextInput({className, ...props}: TextInputProps) {
  return <BaseInput className={cn(inputBase, className)} {...props} />;
}
