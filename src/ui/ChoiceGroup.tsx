import { useId } from 'react';

export function ChoiceGroup<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  const name = useId();
  return <fieldset className="choice-group"><legend>{label}</legend>{options.map(option => <label className="choice-row" key={option.value}><input type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} /><span>{option.label}</span></label>)}</fieldset>;
}
