import './palettes.css';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { builtInPalettes, readPaletteFile, type NamedPalette, type PaletteDraft } from '../palettes';
import type { Item, Palette } from '../types';
import { Panel } from './Panel';
import { Icon } from './Icon';
import { ColorPicker } from './ColorPicker';
import { PalettePreview, type PaletteScene } from './PalettePreview';

const fields = [
  ...[0, 1, 2].map(index => ({ key: 'background' as const, index })),
  ...[0, 1, 2].map(index => ({ key: 'object_accents' as const, index })),
  { key: 'ink' as const, index: 0 }, { key: 'paper' as const, index: 0 }
];
const colors = (p: Palette) => [...p.background, ...p.object_accents, p.ink, p.paper];
const original = builtInPalettes[0], sources = colors(original);

export function PaletteManager({ palettes, selected, items, scene, busy, error, select, apply, save, exportPalette, close }: {
  palettes: NamedPalette[]; selected: string; items: Item[]; scene: PaletteScene | null; busy: boolean; error: string;
  select: (palette: NamedPalette) => void; apply: (palette: NamedPalette) => void;
  save: (palette: PaletteDraft) => void; exportPalette: (id: string) => void; close: () => void;
}) {
  const initial = palettes.find(p => p.id === selected) || original;
  const [active, setActive] = useState(selected), [draft, setDraft] = useState<PaletteDraft | null>(selected === 'draft' ? { ...initial, id: undefined } : null);
  const [libraryOpen, setLibraryOpen] = useState(false), [picker, setPicker] = useState<{ index: number; left: number; top: number } | null>(null);
  const [valid, setValid] = useState(true), [localError, setLocalError] = useState(''), [naming, setNaming] = useState(false), [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null), workspace = useRef<HTMLDivElement>(null), buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const pickerElement = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!pickerElement.current || !workspace.current) return;
    const body = workspace.current.closest('.panel-body');
    const position = () => {
      if (!pickerElement.current || !workspace.current || !body) return;
      const popup = pickerElement.current.getBoundingClientRect(), area = workspace.current.getBoundingClientRect(), bounds = body.getBoundingClientRect();
      const top = Math.max(bounds.top + 8, Math.min(popup.top, bounds.bottom - popup.height - 8));
      const left = Math.max(bounds.left + 8, Math.min(popup.left, bounds.right - popup.width - 8));
      if (Math.abs(top - popup.top) > .5 || Math.abs(left - popup.left) > .5) setPicker(previous => previous && { ...previous, top: top - area.top, left: left - area.left });
    };
    position(); window.addEventListener('resize', position); body?.addEventListener('scroll', position);
    const observer = new ResizeObserver(position); observer.observe(pickerElement.current);
    return () => { window.removeEventListener('resize', position); body?.removeEventListener('scroll', position); observer.disconnect(); };
  }, [picker?.index]);
  useEffect(() => {
    if (!picker) return;
    const dismiss = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || pickerElement.current?.contains(event.target) || buttons.current.some(button => button?.contains(event.target as Node))) return;
      setPicker(null); setValid(true);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      setPicker(null); setValid(true); buttons.current[picker.index]?.focus();
    };
    document.addEventListener('click', dismiss);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('click', dismiss); document.removeEventListener('keydown', escape, true); };
  }, [picker]);
  const current = palettes.find(p => p.id === active) || original;
  const palette: NamedPalette = draft ? { ...draft, id: 'draft', name: 'Изменённая палитра' } : { ...current, id: active };
  const targetColors = colors(palette);
  const field = picker ? fields[picker.index] : null;
  function create() {
    setDraft({ ...palette, id: undefined, name: 'Новая палитра', background: [...palette.background], object_accents: [...palette.object_accents] });
    setPicker(null); setValid(true); setLibraryOpen(false); setNaming(false); setLocalError('');
  }
  function edit(index: number, button: HTMLButtonElement) {
    if (!draft) setDraft({ ...current, id: builtInPalettes.some(p => p.id === active) || active === 'original' ? undefined : current.id });
    const area = workspace.current!.getBoundingClientRect(), row = button.getBoundingClientRect();
    setPicker({ index, left: Math.max(0, Math.min(area.width - 280, row.left - area.left)), top: Math.max(0, Math.min(row.bottom - area.top + 6, window.innerHeight - area.top - 290)) });
    setValid(true); setLibraryOpen(false); setNaming(false);
  }
  function closePicker() { const index = picker?.index; setPicker(null); setValid(true); if (index !== undefined) buttons.current[index]?.focus(); }
  function requestSave() {
    if (draft?.id) { save(draft); return; }
    setName(draft?.name || current.name + ' · копия'); setNaming(true); setPicker(null);
  }
  return <Panel open title="Оформление композиции" close={close}>
    <div className="palette-workspace" ref={workspace} onKeyDownCapture={event => {
      if (event.key !== 'Escape') return;
      if (picker || libraryOpen || naming) { event.preventDefault(); event.stopPropagation(); if (picker) closePicker(); else if (naming) setNaming(false); else setLibraryOpen(false); }
    }}>
      {(localError || error) && <p className="message error" role="alert">{localError || error}</p>}
      <div className="palette-toolbar">
        <button className="palette-selector" aria-label="Выбор палитры" aria-expanded={libraryOpen} disabled={busy} onClick={() => { setLibraryOpen(!libraryOpen); setPicker(null); setValid(true); }}><span className="palette-swatches">{targetColors.map((color, index) => <i key={index} style={{ background: color }} />)}</span><span>{draft ? 'Изменённая палитра' : active === 'original' ? 'Исходная' : current.name}</span><Icon name="down" /></button>
        <button className="icon-button" aria-label="Создать палитру" title="Создать палитру на основе текущей" disabled={busy} onClick={create}><Icon name="plus" /></button>
        <details className="palette-menu"><summary aria-label="Действия палитры" title="Импорт и экспорт"><Icon name="settings" /></summary><div>
          <button disabled={busy} onClick={event => { input.current?.click(); event.currentTarget.closest('details')!.open = false; }}><Icon name="upload" />Загрузить JSON</button>
          <button disabled={busy || !!draft || active === 'original'} onClick={event => { exportPalette(active); event.currentTarget.closest('details')!.open = false; }}><Icon name="download" />Экспорт JSON</button>
        </div></details>
      </div>
      {libraryOpen && <div className="palette-library" role="group" aria-label="Палитры документа">{[{ ...original, id: 'original', name: 'Исходная' }, ...palettes.filter(p => p.id !== 'draft')].map(p => <button key={p.id} className="palette-list-row" aria-label={`Выбрать палитру: ${p.name}`} aria-pressed={active === p.id && !draft} disabled={busy} onClick={() => { setActive(p.id); setDraft(null); setLibraryOpen(false); setLocalError(''); }}><span className="palette-swatches">{colors(p).map((color, index) => <i key={index} style={{ background: color }} />)}</span><span>{p.name}</span>{active === p.id && !draft && <Icon name="check" />}</button>)}</div>}
      <PalettePreview items={items} scene={scene} palette={active === 'original' && !draft ? undefined : palette} />
      <div className="palette-pairs-heading"><h2>Замена цветов</h2><span>Исходный → Новый</span></div>
      <div className="palette-pairs">{sources.map((source, index) => <button key={source} ref={node => { buttons.current[index] = node; }} aria-label={`Заменить цвет ${source}`} aria-expanded={picker?.index === index} disabled={busy} className="palette-pair" onClick={event => edit(index, event.currentTarget)}>
        <span><i style={{ background: source }} /><small>{source}</small></span><Icon name="chevron" /><span><i style={{ background: targetColors[index] }} /><small>{targetColors[index]}</small></span>{index < 3 && <b title="Разрешён для фона и предметов">Фон</b>}
      </button>)}</div>
      <p className="hint">Первые три цвета доступны для фона. Остальные используются только в предметах</p>
      {picker && field && <div ref={pickerElement} className="palette-picker" role="dialog" aria-label={`Замена цвета ${sources[picker.index]}`} style={{ left: picker.left, top: picker.top }}>
        <ColorPicker key={picker.index} label="Новый цвет" inputLabel="замены" value={targetColors[picker.index]} onValidityChange={setValid} onChange={value => setDraft(previous => {
          const base = previous || { ...current, id: undefined };
          return { ...base, [field.key]: typeof base[field.key] === 'string' ? value : (base[field.key] as string[]).map((color, index) => index === field.index ? value : color) };
        })} />
        <button className="text-button picker-done" disabled={!valid} onClick={closePicker}><Icon name="check" />Готово</button>
      </div>}
      {naming ? <div className="palette-name-form"><label>Название палитры<input autoFocus aria-label="Название палитры" maxLength={100} disabled={busy} value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && name.trim() && !busy) save({ ...(draft || current), id: undefined, name }); }} /></label><div><button disabled={busy} onClick={() => setNaming(false)}>Отмена</button><button className="primary" disabled={busy || !name.trim()} onClick={() => save({ ...(draft || current), id: undefined, name })}>Сохранить</button></div></div> : <div className="palette-footer">
        <button className="text-button" disabled={busy || !valid} onClick={requestSave}><Icon name="save" />{draft?.id ? 'Сохранить изменения' : 'Сохранить как палитру'}</button>
        <button className="primary" disabled={busy || !valid} onClick={() => scene ? apply(palette) : select(palette)}>{scene ? 'Применить' : 'Использовать'}</button>
        {scene && <button className="text-button palette-use-new" disabled={busy || !valid} onClick={() => select(palette)}>Использовать для новых композиций</button>}
      </div>}
      <input ref={input} type="file" aria-label="Файл палитры" accept=".json,application/json" hidden onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        try {
          if (file.size > 65536) throw new Error('Файл палитры слишком большой: максимум 64 КБ');
          setDraft(readPaletteFile(await file.text())); setPicker(null); setValid(true); setNaming(false); setLibraryOpen(false); setLocalError('');
        } catch (error) { setLocalError(error instanceof Error ? error.message : 'Не удалось загрузить палитру'); }
      }} />
    </div>
  </Panel>;
}
