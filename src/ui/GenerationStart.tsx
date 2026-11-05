import { useState } from 'react';
import type { Item, SetInfo } from '../types';
import type { NamedPalette } from '../palettes';
import type { Direction } from '../generation';
import { CustomSelect } from './CustomSelect';
import { Icon } from './Icon';
import { Panel } from './Panel';

const formats = [
  { value: '1200x630', label: 'Горизонтальный · 1200 × 630', shortLabel: '1200×630', icon: 'landscape' },
  { value: '1080x1080', label: 'Квадрат · 1080 × 1080', shortLabel: '1080×1080', icon: 'square' },
  { value: '1080x1350', label: 'Вертикальный · 1080 × 1350', shortLabel: '1080×1350', icon: 'portrait' }
] as const;

const details = [
  { value: 'default', label: 'Исходная', shortLabel: 'Исх.' },
  { value: 'L', label: 'L · Подробная', shortLabel: 'L' },
  { value: 'S', label: 'S · Упрощённая', shortLabel: 'S' }
] as const;

const counts = Array.from({ length: 12 }, (_, index) => {
  const count = index + 1;
  return { value: String(count), shortLabel: String(count), label: `${count} ${count === 1 ? 'вариант' : count <= 4 ? 'варианта' : 'вариантов'}` };
});

export type PromptDraft = {
  query: string;
  requiredItemIds: string[];
  format: string;
  count: number;
  detail: 'default' | 'L' | 'S';
};

export function GenerationStart({ sets, setId, items, prepareItems, palettes, paletteId, draft, result, busy, change, choose, choosePalette, generate, manual, own, manage, finish }: {
  sets: SetInfo[]; setId: string; items: Item[]; prepareItems: () => void;
  palettes: NamedPalette[]; paletteId: string; draft: PromptDraft; result: Direction[];
  busy: boolean; change: (draft: PromptDraft) => void; choose: (id: string) => void; choosePalette: (id: string) => void;
  generate: () => void; manual: () => void; own: () => void; manage: () => void; finish: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const tagged = draft.requiredItemIds.flatMap(id => items.find(item => item.id === id) || []);
  const matches = items.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()));
  const canGenerate = !busy && Boolean(draft.query.trim() || tagged.length) &&
    Number.isInteger(draft.count) && draft.count >= 1 && draft.count <= 12;

  function openPicker() {
    setSearch('');
    setPickerOpen(true);
    if (!items.length && setId === 'starter') prepareItems();
  }

  function addItem(id: string) {
    change({ ...draft, requiredItemIds: [...tagged.map(item => item.id), id] });
    setPickerOpen(false);
  }

  return <div className="prompt-composer">
    <h1>Новая композиция</h1>
    <p className="intro">Mixer подберёт предметы и соберёт варианты на холсте Figma.</p>
    <div className="prompt-sources">
      <CustomSelect label="Библиотека" triggerIcon="grid" value={setId} disabled={busy} onChange={id => id === '__import__' ? own() : choose(id)}
        options={[
          { value: 'starter', label: 'Стартовый набор', icon: 'grid' },
          ...sets.filter(set => set.id !== 'starter').map(set => ({ value: set.id, label: set.name })),
          { value: '__import__', label: 'Добавить свои элементы…', icon: 'upload' }
        ]} />
      <CustomSelect label="Палитра" triggerIcon="palette" value={paletteId === 'original' ? 'purple' : paletteId} disabled={busy} onChange={choosePalette}
        options={[
          { value: 'auto', label: 'Пусть AI выберет', shortLabel: 'Авто', icon: 'palette' },
          ...palettes.map(p => ({ value: p.id, label: p.name, colors: [...p.background, ...p.object_accents] })),
          { value: '__manage__', label: 'Настроить палитры…', icon: 'edit' }
        ]} />
    </div>
    <div className="prompt-box" role="group" aria-label="Запрос композиции">
      {tagged.length > 0 && <div className="prompt-items" role="group" aria-label="Предметы в запросе">
        {tagged.map(item => <span className="prompt-item" key={item.id}>
          <span>{item.name}</span>
          <button type="button" aria-label={`Убрать предмет ${item.name}`} disabled={busy}
            onClick={() => change({ ...draft, requiredItemIds: draft.requiredItemIds.filter(id => id !== item.id) })}><Icon name="close" /></button>
        </span>)}
      </div>}
      <textarea className="prompt-input" aria-label="Тема или метафора" disabled={busy} maxLength={1500} rows={2}
        value={draft.query} onChange={event => change({ ...draft, query: event.target.value })}
        placeholder="Опишите идею или перечислите предметы" />
      <div className="prompt-toolbar">
        <button className="icon-button prompt-add" type="button" aria-label="Добавить предмет" aria-haspopup="dialog"
          title={tagged.length >= 8 ? 'Можно добавить до восьми предметов' : 'Добавить предмет'}
          disabled={busy || tagged.length >= 8} onClick={openPicker}><Icon name="plus" /></button>
        <div className="prompt-options">
          <CustomSelect label="Количество вариантов" triggerIcon="layers" value={String(draft.count)} disabled={busy}
            onChange={count => change({ ...draft, count: Number(count) })} options={counts} />
          <CustomSelect label="Формат" triggerIcon={formats.find(format => format.value === draft.format)?.icon ?? 'landscape'} value={draft.format} disabled={busy}
            onChange={format => change({ ...draft, format })} options={formats} />
          <CustomSelect label="Детализация" triggerIcon="detail" value={draft.detail} disabled={busy}
            onChange={detail => change({ ...draft, detail })} options={details} />
        </div>
        <button className="primary prompt-send" type="button" aria-label="Создать композиции"
          title="Создать композиции" disabled={!canGenerate} onClick={generate}><Icon name="up" /></button>
      </div>
    </div>
    <div className="prompt-library-actions">
      <button className="text-button" disabled={busy} onClick={manual}>Выбрать предметы вручную</button>
      <button className="text-button" disabled={busy} onClick={manage}>Управление библиотеками</button>
    </div>
    <Panel open={pickerOpen} title="Добавить предмет" close={() => setPickerOpen(false)}>
      {pickerOpen && <>
        {items.length > 0 && <input aria-label="Найти предмет" placeholder="Название предмета" autoFocus
          value={search} onChange={event => setSearch(event.target.value)} />}
        <div className="prompt-item-list">
          {matches.map(item => <button key={item.id} type="button"
            disabled={busy || tagged.some(tag => tag.id === item.id)} onClick={() => addItem(item.id)}>{item.name}</button>)}
        </div>
        {!matches.length && <p className="hint">{busy ? 'Загружаем предметы…' : 'Предметы не найдены.'}</p>}
      </>}
    </Panel>
    {result.length > 0 && <section className="prompt-results">
      <div className="section-heading"><h2>Создано вариантов: {result.length}</h2>
        <button className="text-button" disabled={busy} onClick={finish}>Продолжить в Figma<Icon name="arrow" /></button>
      </div>
      <p className="hint">Варианты рядом на холсте. Новый запуск добавит отдельные фреймы.</p>
    </section>}
  </div>;
}
