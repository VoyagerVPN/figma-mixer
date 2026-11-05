import { useId, useRef, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { Icon, type IconName } from './Icon';

type Option<T extends string> = { value: T; label: string; shortLabel?: string; icon?: IconName; colors?: string[] };
type Props<T extends string> = {
  label: string;
  ariaLabel?: string;
  triggerIcon?: IconName;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
};

export function CustomSelect<T extends string>({ label, ariaLabel, triggerIcon, value, options, onChange, disabled }: Props<T>) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null), [open, setOpen] = useState(false);
  const selected = options.find(option => option.value === value);
  // Префикс позволяет сохранить пустое значение «Создать новый набор».
  const encode = (value: string) => 'value:' + value;
  return <div className="select-field">
    {!triggerIcon && <label htmlFor={id}>{label}</label>}
    <Select.Root open={open} onOpenChange={setOpen} value={encode(value)} onValueChange={next => onChange(next.slice(6) as T)} disabled={disabled}>
      <Select.Trigger ref={trigger} id={id} className="select-trigger" aria-label={ariaLabel || label}
        title={triggerIcon ? [label, selected?.label].filter(Boolean).join(' · ') : selected?.shortLabel ? selected.label : undefined}>
        <Select.Value>{triggerIcon && selected
          ? <span className="select-compact-value"><Icon name={triggerIcon} /><span>{selected.shortLabel ?? selected.label}</span></span>
          : selected?.shortLabel}</Select.Value>
        <Select.Icon className="select-chevron"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg></Select.Icon>
      </Select.Trigger>
      <Select.Portal container={trigger.current?.closest('dialog') || undefined}>
        <Select.Content className="select-menu" position="popper" sideOffset={5} collisionPadding={8} aria-label={ariaLabel || label}>
          <Select.Viewport className="select-options">
            <Select.Group>
              {triggerIcon && <Select.Label className="select-menu-heading">{label}</Select.Label>}
              {options.map(option => <Select.Item key={option.value} value={encode(option.value)} className="select-option">
                <Select.ItemText><span className="select-option-label">{option.icon && <Icon name={option.icon} />}{option.colors && <span className="select-color-strip" aria-hidden="true">{option.colors.map((color, index) => <i key={index} style={{ background: color }} />)}</span>}{option.label}</span></Select.ItemText>
                <Select.ItemIndicator className="select-indicator" aria-hidden="true">✓</Select.ItemIndicator>
              </Select.Item>)}
            </Select.Group>
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  </div>;
}
