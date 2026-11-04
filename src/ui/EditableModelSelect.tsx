import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';

export function EditableModelSelect({ id, value, options, disabled, change }: { id: string; value: string; options: string[]; disabled: boolean; change: (value: string) => void }) {
  const listId = useId(), wrapper = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [filter, setFilter] = useState(''), [active, setActive] = useState(-1);
  const matches = options.filter(option => option.toLowerCase().includes(filter.toLowerCase()));
  useEffect(() => { setOpen(false); setFilter(''); setActive(-1); }, [options]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); input.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  useEffect(() => { if (open && active >= 0) document.getElementById(listId + '-' + active)?.scrollIntoView({ block: 'nearest' }); }, [open, active, listId]);
  function choose(option: string) { change(option); setOpen(false); setFilter(''); setActive(-1); input.current?.focus(); }
  return <div ref={wrapper} className="editable-model-select">
    <input ref={input} id={id} role="combobox" aria-label="Модель" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && active >= 0 ? listId + '-' + active : undefined} autoComplete="off" disabled={disabled} value={value} maxLength={200} placeholder="ID модели вашего сервиса" onClick={() => { if (!open && options.length) { setFilter(''); setActive(-1); setOpen(true); } }} onChange={event => { change(event.target.value); setFilter(event.target.value); setActive(-1); setOpen(options.length > 0); }} onKeyDown={event => {
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.length) {
        event.preventDefault();
        if (!open) { setFilter(''); setOpen(true); setActive(event.key === 'ArrowDown' ? 0 : options.length - 1); }
        else if (matches.length) setActive(previous => event.key === 'ArrowDown' ? (previous + 1) % matches.length : previous < 0 ? matches.length - 1 : (previous - 1 + matches.length) % matches.length);
      }
      if (event.key === 'Enter' && open) { event.preventDefault(); event.stopPropagation(); if (active >= 0 && matches[active]) choose(matches[active]); else setOpen(false); }
      if (event.key === 'Tab') setOpen(false);
    }} />
    {options.length > 0 && <span className="model-select-chevron" aria-hidden="true"><Icon name="chevron" /></span>}
    {open && <div className="ai-model-results"><div id={listId} className="ai-model-options" role="listbox" aria-label="Модели API">{matches.map((option, index) => <button key={option} id={listId + '-' + index} type="button" role="option" tabIndex={-1} aria-selected={value === option} data-active={active === index} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>{option}</button>)}</div>{!matches.length && <p className="hint">Нет совпадений. Можно использовать введённый ID.</p>}<p className="hint">Выберите модель для работы с текстом</p></div>}
  </div>;
}
