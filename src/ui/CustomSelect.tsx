import { useId } from 'react';
import * as Select from '@radix-ui/react-select';
import { Icon, type IconName } from './Icon';

type Option<T extends string> = { value: T; label: string; icon?: IconName; colors?: string[] };
type Props<T extends string> = {
  label: string;
  ariaLabel?: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
};

export function CustomSelect<T extends string>({ label, ariaLabel, value, options, onChange, disabled }: Props<T>) {
  const id = useId();
  // Префикс позволяет сохранить пустое значение «Создать новый набор».
  const encode = (value: string) => 'value:' + value;
  return <div className="select-field">
    <label htmlFor={id}>{label}</label>
    <Select.Root value={encode(value)} onValueChange={next => onChange(next.slice(6) as T)} disabled={disabled}>
      <Select.Trigger id={id} className="select-trigger" aria-label={ariaLabel || label}>
        <Select.Value />
        <Select.Icon className="select-chevron"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="select-menu" position="popper" sideOffset={5} collisionPadding={8} aria-label={ariaLabel || label}>
          <Select.Viewport className="select-options">
            {options.map(option => <Select.Item key={option.value} value={encode(option.value)} className="select-option">
              <Select.ItemText><span className="select-option-label">{option.icon && <Icon name={option.icon} />}{option.colors && <span className="select-color-strip" aria-hidden="true">{option.colors.map((color, index) => <i key={index} style={{ background: color }} />)}</span>}{option.label}</span></Select.ItemText>
              <Select.ItemIndicator className="select-indicator" aria-hidden="true">✓</Select.ItemIndicator>
            </Select.Item>)}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  </div>;
}
