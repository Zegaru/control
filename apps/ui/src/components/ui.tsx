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

const mechToneCls: Record<ButtonTone, string> = {
  default: '',
  phosphor: 'backlit-btn-phosphor',
  amber: 'backlit-btn-amber',
  danger: 'backlit-btn-danger',
};

/** Shared mechanical key chrome (raised face in recessed well). */
const mechBase =
  'backlit-btn font-ui inline-flex items-center justify-center rounded-[5px] uppercase tracking-widest font-semibold select-none';

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
    return cn(mechBase, sizeCls[size], mechToneCls[tone], focus, disabled, className);
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
      mechBase,
      sizeCls[size],
      'backlit-btn-danger',
      focus,
      'focus-visible:outline-danger',
      disabled,
      className,
    );
  }

  // primary — mechanical key, phosphor accent by default
  return cn(
    mechBase,
    sizeCls[size],
    mechToneCls[tone === 'default' ? 'phosphor' : tone],
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
