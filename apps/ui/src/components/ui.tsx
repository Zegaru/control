import type {ComponentProps} from 'react';
import {Button as BaseButton} from '@base-ui/react/button';
import {Combobox as BaseCombobox} from '@base-ui/react/combobox';
import {Input as BaseInput} from '@base-ui/react/input';
import {Select as BaseSelect} from '@base-ui/react/select';
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

/** Shared field chrome for inputs and selects. */
export const fieldBase = inputBase;

/** CONTROL-styled Base UI input. */
export function TextInput({className, ...props}: TextInputProps) {
  return <BaseInput className={cn(inputBase, className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

export type SelectSize = 'sm' | 'md';

export type SelectOption = {
  value: string;
  label: string;
};

export type SelectOptionGroup = {
  label: string;
  options: SelectOption[];
};

export type SelectProps = {
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  options?: SelectOption[];
  groups?: SelectOptionGroup[];
  placeholder?: string;
  emptyOption?: {label: string};
  size?: SelectSize;
  disabled?: boolean;
  className?: string;
  name?: string;
  title?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

const selectTriggerSizeCls: Record<SelectSize, string> = {
  md: 'min-h-9 px-3 py-2 text-sm',
  sm: 'min-h-7 px-2 py-1 text-[10px] uppercase tracking-wider',
};

const selectTriggerCls =
  'control-select-trigger font-ui flex w-full min-w-0 items-center justify-between gap-2 rounded border ' +
  'border-panel-edge bg-bezel text-ink outline-none select-none ' +
  'hover:not-data-disabled:border-panel-edge/90 ' +
  'focus-visible:border-phosphor-dim focus-visible:outline focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-phosphor-dim ' +
  'data-disabled:opacity-40 data-popup-open:border-phosphor-dim';

const selectPopupCls =
  'control-select-popup min-w-[var(--anchor-width)] origin-[var(--transform-origin)] ' +
  'overflow-hidden rounded border border-panel-edge bg-panel-raised text-ink shadow-[0_8px_24px_rgba(0,0,0,0.55)] ' +
  'transition-[transform,opacity] duration-100 ease-out ' +
  'data-ending-style:scale-[0.98] data-ending-style:opacity-0 ' +
  'data-starting-style:scale-[0.98] data-starting-style:opacity-0';

const selectItemCls =
  'grid cursor-default grid-cols-[0.875rem_1fr] items-center gap-2 py-1.5 pr-3 pl-2.5 text-sm ' +
  'outline-none select-none data-highlighted:bg-phosphor/10 data-highlighted:text-phosphor ' +
  'data-selected:text-phosphor';

const selectGroupLabelCls =
  'py-1.5 pr-3 pl-2.5 text-[10px] font-semibold uppercase tracking-widest text-ink-faint select-none';

function SelectChevron({className}: {className?: string}) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden
      className={cn('shrink-0 text-ink-faint', className)}
    >
      <path d="M3 4.5 6 8l3-3.5H3z" />
    </svg>
  );
}

function SelectCheck({className}: {className?: string}) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
      className={className}
    >
      <path d="m2 6 2.5 2.5L10 3" />
    </svg>
  );
}

function SelectItems({
  options,
  itemClassName,
}: {
  options: SelectOption[];
  itemClassName?: string;
}) {
  return options.map((opt) => (
    <BaseSelect.Item
      key={opt.value}
      value={opt.value}
      label={opt.label}
      className={cn(selectItemCls, itemClassName)}
    >
      <BaseSelect.ItemIndicator className="col-start-1 flex items-center justify-center">
        <SelectCheck />
      </BaseSelect.ItemIndicator>
      <BaseSelect.ItemText className="col-start-2 truncate">{opt.label}</BaseSelect.ItemText>
    </BaseSelect.Item>
  ));
}

/** CONTROL-styled Base UI select. */
export function Select({
  value,
  defaultValue,
  onValueChange,
  options = [],
  groups = [],
  placeholder,
  emptyOption,
  size = 'md',
  disabled,
  className,
  name,
  title,
  onClick,
}: SelectProps) {
  const flatOptions = [
    ...(emptyOption ? [{value: null as string | null, label: emptyOption.label}] : []),
    ...options,
    ...groups.flatMap((g) => g.options),
  ];
  const itemClassName = size === 'sm' ? 'text-[10px] uppercase tracking-wider' : undefined;

  return (
    <BaseSelect.Root
      name={name}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      items={flatOptions}
      onValueChange={(next) => onValueChange?.(next as string | null)}
    >
      <BaseSelect.Trigger
        title={title}
        onClick={onClick}
        className={cn(selectTriggerCls, selectTriggerSizeCls[size], className)}
      >
        <BaseSelect.Value
          className="min-w-0 flex-1 truncate text-left data-placeholder:text-ink-faint"
          placeholder={placeholder}
        />
        <BaseSelect.Icon>
          <SelectChevron />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal>
        <BaseSelect.Positioner className="z-[70] outline-none select-none" sideOffset={6} alignItemWithTrigger={false}>
          <BaseSelect.Popup className={selectPopupCls}>
            <BaseSelect.List className="max-h-60 overflow-y-auto py-1 outline-none">
              {emptyOption && (
                <BaseSelect.Item value={null} label={emptyOption.label} className={cn(selectItemCls, itemClassName)}>
                  <BaseSelect.ItemIndicator className="col-start-1 flex items-center justify-center">
                    <SelectCheck />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText className="col-start-2 truncate">{emptyOption.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              )}
              {options.length > 0 && <SelectItems options={options} itemClassName={itemClassName} />}
              {groups.map((group) => (
                <BaseSelect.Group key={group.label}>
                  <BaseSelect.GroupLabel className={selectGroupLabelCls}>{group.label}</BaseSelect.GroupLabel>
                  <SelectItems options={group.options} itemClassName={itemClassName} />
                </BaseSelect.Group>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

// ---------------------------------------------------------------------------
// Combobox (searchable select)
// ---------------------------------------------------------------------------

export type ComboboxOption = SelectOption;
export type ComboboxOptionGroup = SelectOptionGroup;

type ComboboxItem = ComboboxOption;
type ComboboxGroupItems = {value: string; items: ComboboxItem[]};

export type ComboboxProps = {
  value?: string | null;
  onValueChange?: (value: string | null) => void;
  options?: ComboboxOption[];
  groups?: ComboboxOptionGroup[];
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
};

function buildComboboxItems(
  options: ComboboxOption[],
  groups: ComboboxOptionGroup[],
): ComboboxItem[] | ComboboxGroupItems[] {
  if (groups.length > 0) {
    return groups.map((group) => ({value: group.label, items: group.options}));
  }
  return options;
}

function findComboboxItem(
  value: string | null | undefined,
  options: ComboboxOption[],
  groups: ComboboxOptionGroup[],
): ComboboxItem | null {
  if (!value) return null;
  for (const option of options) {
    if (option.value === value) return option;
  }
  for (const group of groups) {
    for (const option of group.options) {
      if (option.value === value) return option;
    }
  }
  return null;
}

const comboboxInputGroupCls =
  'flex w-full min-w-0 items-center rounded border border-panel-edge bg-bezel ' +
  'focus-within:border-phosphor-dim data-disabled:opacity-40';

const comboboxInputCls =
  'min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint';

const comboboxTriggerCls =
  'inline-flex shrink-0 items-center justify-center px-2 py-2 text-ink-faint outline-none hover:text-ink';

const comboboxEmptyCls = 'px-3 py-2 text-xs text-ink-faint';

function ComboboxOptionRow({
  item,
  className,
}: {
  item: ComboboxItem;
  className?: string;
}) {
  return (
    <BaseCombobox.Item value={item} className={cn(selectItemCls, className)}>
      <BaseCombobox.ItemIndicator className="col-start-1 flex items-center justify-center">
        <SelectCheck />
      </BaseCombobox.ItemIndicator>
      <span className="col-start-2 truncate">{item.label}</span>
    </BaseCombobox.Item>
  );
}

/** CONTROL-styled searchable combobox for long option lists. */
export function Combobox({
  value,
  onValueChange,
  options = [],
  groups = [],
  placeholder = 'Search…',
  emptyMessage = 'No matches.',
  disabled,
  className,
}: ComboboxProps) {
  const items = buildComboboxItems(options, groups);
  const selectedItem = findComboboxItem(value, options, groups);
  const hasGroups = groups.length > 0;

  return (
    <BaseCombobox.Root
      items={items}
      value={selectedItem}
      disabled={disabled}
      isItemEqualToValue={(a, b) => a.value === b.value}
      onValueChange={(next) => onValueChange?.((next as ComboboxItem | null)?.value ?? null)}
    >
      <BaseCombobox.InputGroup className={cn(comboboxInputGroupCls, className)}>
        <BaseCombobox.Input placeholder={placeholder} className={comboboxInputCls} />
        <BaseCombobox.Trigger className={comboboxTriggerCls} aria-label="Open list">
          <SelectChevron />
        </BaseCombobox.Trigger>
      </BaseCombobox.InputGroup>

      <BaseCombobox.Portal>
        <BaseCombobox.Positioner className="z-[70] outline-none select-none" sideOffset={6}>
          <BaseCombobox.Popup className={selectPopupCls}>
            <BaseCombobox.Empty className={comboboxEmptyCls}>{emptyMessage}</BaseCombobox.Empty>
            <BaseCombobox.List className="max-h-60 overflow-y-auto py-1 outline-none">
              {hasGroups
                ? (group: ComboboxGroupItems) => (
                    <BaseCombobox.Group key={group.value} items={group.items}>
                      <BaseCombobox.GroupLabel className={selectGroupLabelCls}>
                        {group.value}
                      </BaseCombobox.GroupLabel>
                      <BaseCombobox.Collection>
                        {(item: ComboboxItem) => (
                          <ComboboxOptionRow key={item.value} item={item} />
                        )}
                      </BaseCombobox.Collection>
                    </BaseCombobox.Group>
                  )
                : (item: ComboboxItem) => <ComboboxOptionRow key={item.value} item={item} />}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}
