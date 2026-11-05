import './palettes.css';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { builtInPalettes, readPaletteFile, type NamedPalette, type PaletteDraft } from '../palettes';
import type { Item, Palette } from '../types';
import { Panel } from './Panel';
import { Icon } from './Icon';
import { ColorPicker } from './ColorPicker';
import { PalettePreview } from './PalettePreview';

const fields = [
  ...[0, 1, 2].map(index => ({ key: 'background' as const, index })),
  ...[0, 1, 2].map(index => ({ key: 'object_accents' as const, index })),
  { key: 'ink' as const, index: 0 }, { key: 'paper' as const, index: 0 }
];
const colors = (p: Palette | PaletteDraft) => [...p.background, ...p.object_accents, p.ink, p.paper];
const original = builtInPalettes[0], sources = colors(original);
type Action = { type: 'close' } | { type: 'switch'; id: string } | { type: 'new' } | { type: 'import'; palette: PaletteDraft };

export function PaletteManager({ palettes, selected, items, frameIds, preview, busy, error, select, apply, save, exportPalette, close }: {
  palettes: NamedPalette[]; selected: string; items: Item[]; frameIds?: string[]; preview: (ids: string[], palette: NamedPalette | 'original') => void; busy: boolean; error: string;
  select: (palette: NamedPalette) => void; apply: (palette: NamedPalette) => void;
  save: (palette: PaletteDraft) => Promise<NamedPalette>; exportPalette: (id: string) => void; close: () => void;
}) {
  const initial = palettes.find(p => p.id === selected) || original;
  const [active, setActive] = useState(selected);
  const [draft, setDraft] = useState<PaletteDraft | null>(selected === 'draft' ? { ...initial, id: undefined } : null);
  const [fresh, setFresh] = useState(selected === 'draft'), [index, setIndex] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(false), [valid, setValid] = useState(true), [colorRevision, setColorRevision] = useState(0);
  const [localError, setLocalError] = useState(''), [pending, setPending] = useState<Action | null>(null);
  const [naming, setNaming] = useState(false), [name, setName] = useState(''), [copy, setCopy] = useState(false);
  const input = useRef<HTMLInputElement>(null), selector = useRef<HTMLDivElement>(null), stay = useRef<HTMLButtonElement>(null);
  const current = palettes.find(p => p.id === active) || original;
  const currentName = active === 'original' ? 'Исходная' : current.name;
  const dirty = !!draft && (fresh || draft.name !== currentName || colors(draft).some((color, i) => color !== colors(current)[i]));
  const palette: NamedPalette = dirty && draft ? { ...draft, id: 'draft' } : { ...current, id: active, name: currentName };
  const targetColors = colors(palette), field = fields[index];
  const displayName = palette.name;
  const previewRequest = frameIds && valid && !busy ? JSON.stringify([frameIds, active === 'original' && !dirty ? 'original' : palette]) : '';
  useEffect(() => {
    if (!previewRequest) return;
    const timer = setTimeout(() => {
      const [ids, palette] = JSON.parse(previewRequest) as [string[], NamedPalette | 'original'];
      preview(ids, palette);
    }, 80);
    return () => clearTimeout(timer);
  }, [preview, previewRequest]);
  const locked = !!pending || naming;
  useLayoutEffect(() => {
    if (!libraryOpen) return;
    const anchor = selector.current, menu = anchor?.querySelector<HTMLElement>('.palette-library'), body = anchor?.closest('.panel-body');
    if (!anchor || !menu || !body) return;
    const fit = () => { menu.style.maxHeight = Math.max(0, body.getBoundingClientRect().bottom - anchor.getBoundingClientRect().bottom - 12) + 'px'; };
    fit(); window.addEventListener('resize', fit); body.addEventListener('scroll', fit);
    const observer = new ResizeObserver(fit); observer.observe(body);
    return () => { window.removeEventListener('resize', fit); body.removeEventListener('scroll', fit); observer.disconnect(); };
  }, [libraryOpen]);
  useEffect(() => {
    if (!libraryOpen) return;
    const dismiss = (event: MouseEvent) => { if (event.target instanceof Node && !selector.current?.contains(event.target)) setLibraryOpen(false); };
    document.addEventListener('click', dismiss);
    return () => document.removeEventListener('click', dismiss);
  }, [libraryOpen]);
  useEffect(() => { if (pending && !naming) stay.current?.focus(); }, [pending, naming]);

  function perform(action: Action, base = palette) {
    setPending(null); setNaming(false); setLibraryOpen(false); setValid(true); setLocalError(''); setColorRevision(v => v + 1);
    if (action.type === 'close') { close(); return; }
    if (action.type === 'switch') { setActive(action.id); setDraft(null); setFresh(false); setIndex(0); return; }
    setDraft(action.type === 'import' ? action.palette : { ...base, id: undefined, name: 'Новая палитра' });
    setFresh(true);
  }
  function request(action: Action) {
    if (busy) return;
    setLibraryOpen(false);
    if (dirty || !valid) setPending(action); else perform(action);
  }
  function requestClose() {
    if (busy) return;
    if (locked) { setPending(null); setNaming(false); return; }
    if (frameIds) close();
    else request({ type: 'close' });
  }
  function requestSave(asCopy = false) {
    setCopy(asCopy); setName(draft?.name || displayName + (current.id.startsWith('custom-') ? '' : ' · копия'));
    setNaming(true); setLibraryOpen(false); setLocalError('');
  }
  async function persist() {
    if (!name.trim() || !valid || busy) return;
    try {
      const saved = await save({ ...(draft || current), id: !copy && current.id.startsWith('custom-') && !fresh ? current.id : undefined, name: name.trim() });
      setActive(saved.id); setDraft(null); setFresh(false); setNaming(false); setLocalError('');
      // Продолжаем исходное действие только после подтверждения записи от Figma.
      const next = pending; setPending(null);
      if (next) perform(next, saved);
    } catch (error) { setLocalError(error instanceof Error ? error.message : 'Не удалось сохранить палитру'); }
  }
  function changeColor(value: string) {
    if (value === targetColors[index]) return;
    setDraft(previous => {
      const base = previous || { ...current, name: currentName, id: current.id.startsWith('custom-') ? current.id : undefined };
      return { ...base, [field.key]: typeof base[field.key] === 'string' ? value : (base[field.key] as string[]).map((color, i) => i === field.index ? value : color) };
    });
  }
  function pairs(indices: number[]) {
    return <div className="palette-pairs">{indices.map(i => <button key={sources[i]} aria-label={`Заменить цвет ${sources[i]}`} aria-pressed={index === i} disabled={busy}
      className="palette-pair" onClick={() => { setIndex(i); setValid(true); setColorRevision(v => v + 1); }}>
      <span><i style={{ background: sources[i] }} /><small>{sources[i]}</small></span><Icon name="chevron" /><span><i style={{ background: targetColors[i] }} /><small>{targetColors[i]}</small></span>
    </button>)}</div>;
  }
  const footer = naming ? <form className="palette-save-form" onSubmit={event => { event.preventDefault(); void persist(); }}>
    <label>Название палитры<input autoFocus aria-label="Название палитры" maxLength={100} disabled={busy} value={name} onChange={event => setName(event.target.value)} /></label>
    <div className="palette-footer-actions"><button type="button" disabled={busy} onClick={() => setNaming(false)}>Назад</button><button type="submit" className="primary" disabled={busy || !valid || !name.trim()}><Icon name="save" />Сохранить</button></div>
    {(localError || error) && <p className="color-error" role="alert">{localError || error}</p>}
  </form> : pending ? <div className="palette-confirm" role="alertdialog" aria-label="Сохранить изменения палитры?" aria-describedby="palette-confirm-description">
    <h2>Сохранить изменения палитры?</h2><p id="palette-confirm-description">Изменения в «{displayName}» ещё не сохранены в файле.</p>
    <div className="palette-footer-actions"><button ref={stay} disabled={busy} onClick={() => setPending(null)}>Продолжить редактирование</button><button disabled={busy} onClick={() => perform(pending)}>Не сохранять</button><button className="primary" disabled={busy || !valid} onClick={() => requestSave()}>Сохранить</button></div>
    {!valid && <p className="color-error">Исправьте HEX или выберите «Не сохранять».</p>}
  </div> : <div className="palette-footer">
    <span className="palette-save-state" role="status">{dirty ? 'Есть несохранённые изменения' : 'Палитра готова к использованию'}</span>
    <div className="palette-footer-actions"><button disabled={busy || !valid || !dirty} onClick={() => requestSave()}><Icon name="save" />{current.id.startsWith('custom-') && !fresh ? 'Сохранить изменения' : 'Сохранить палитру'}</button>
      {frameIds && <button type="button" disabled={busy} onClick={requestClose}>Отмена</button>}
      <button className="primary" disabled={busy || !valid} onClick={() => frameIds ? apply(palette) : select(palette)}>{frameIds ? frameIds.length > 1 ? 'Применить к ' + frameIds.length + ' вариантам' : 'Применить' : 'Использовать'}</button></div>
  </div>;

  return <Panel open title="Оформление композиции" className="palette-panel" close={requestClose} footer={footer}>
    <div className="palette-workspace" inert={locked || undefined} onKeyDownCapture={event => {
      if (event.key === 'Escape' && libraryOpen) { event.preventDefault(); event.stopPropagation(); setLibraryOpen(false); }
    }}>
      {(localError || error) && !naming && <p className="message error" role="alert">{localError || error}</p>}
      <div className="palette-toolbar">
        <div className="palette-selector-wrap" ref={selector}>
          <button className="palette-selector" aria-label="Выбор палитры" aria-expanded={libraryOpen} disabled={busy} onClick={() => setLibraryOpen(v => !v)}>
            <span className="palette-swatches">{targetColors.map((color, i) => <i key={i} style={{ background: color }} />)}</span><span>{displayName}{dirty && <small>Изменена</small>}</span><Icon name="down" />
          </button>
          {libraryOpen && <div className="palette-library">
            <div className="palette-library-options" role="group" aria-label="Палитры документа">
              {dirty && <button className="palette-list-row" aria-label="Текущая изменённая палитра" aria-pressed onClick={() => setLibraryOpen(false)}><span className="palette-swatches">{targetColors.map((color, i) => <i key={i} style={{ background: color }} />)}</span><span>{displayName}<small>Изменена</small></span><Icon name="check" /></button>}
              {[{ ...original, id: 'original', name: 'Исходная' }, ...palettes.filter(p => p.id !== 'draft')].map(p => <button key={p.id} className="palette-list-row" aria-label={`Выбрать палитру: ${p.name}`} aria-pressed={active === p.id && !dirty} disabled={busy} onClick={() => request({ type: 'switch', id: p.id })}><span className="palette-swatches">{colors(p).map((color, i) => <i key={i} style={{ background: color }} />)}</span><span>{p.name}</span>{active === p.id && !dirty && <Icon name="check" />}</button>)}
            </div>
            <div className="palette-library-actions">
              <button disabled={busy} onClick={() => request({ type: 'new' })}><Icon name="plus" />Создать палитру</button>
              <button disabled={busy || !valid} onClick={() => requestSave(true)}><Icon name="save" />Сохранить как новую</button>
              {current.id.startsWith('custom-') && !fresh && <button disabled={busy || !valid} onClick={() => requestSave()}><Icon name="edit" />Переименовать палитру</button>}
            </div>
          </div>}
        </div>
        <button className="icon-button" aria-label="Импорт палитры" title="Импорт JSON" disabled={busy} onClick={() => input.current?.click()}><Icon name="upload" /></button>
        <button className="icon-button" aria-label="Экспорт JSON" title={dirty ? 'Сначала сохраните изменения' : 'Экспорт JSON'} disabled={busy || dirty || active === 'original' || active === 'current-frame'} onClick={() => exportPalette(active)}><Icon name="download" /></button>
      </div>
      <div className="palette-layout">
        <div className="palette-mapping">
          {!frameIds && <PalettePreview items={items} palette={active === 'original' && !dirty ? undefined : palette} />}
          <h2 className="palette-pairs-heading">Замена цветов</h2>
          <div role="group" aria-label="Фон и предметы" className="palette-color-group"><h3>Фон и предметы</h3>{pairs([0, 1, 2])}</div>
          <div role="group" aria-label="Только предметы" className="palette-color-group"><h3>Только предметы</h3>{pairs([3, 4, 5, 6, 7])}</div>
        </div>
        <div className="palette-editor" role="group" aria-label="Редактор цвета">
          <h2>Новый цвет</h2>
          <ColorPicker key={index + '-' + colorRevision} inputLabel="замены" value={targetColors[index]} onValidityChange={setValid} onChange={changeColor} />
        </div>
      </div>
      <input ref={input} type="file" aria-label="Файл палитры" accept=".json,application/json" hidden onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        try {
          if (file.size > 65536) throw new Error('Файл палитры слишком большой: максимум 64 КБ');
          request({ type: 'import', palette: readPaletteFile(await file.text()) });
        } catch (error) { setLocalError(error instanceof Error ? error.message : 'Не удалось загрузить палитру'); }
      }} />
    </div>
  </Panel>;
}
