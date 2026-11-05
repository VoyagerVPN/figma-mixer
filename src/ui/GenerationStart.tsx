import { useId, useRef, useState } from 'react';
import type { Item, SetInfo } from '../types';
import type { NamedPalette } from '../palettes';
import type { Direction, PromptMode } from '../generation';
import { normalizeItemName } from '../core';
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
  mode: PromptMode;
  query: string;
  itemQuery: string;
  requiredItemIds: string[];
  format: string;
  count: number;
  detail: 'default' | 'L' | 'S';
};

function itemQueryAt(text: string, caret: number, mode: PromptMode) {
  const before = text.slice(0, caret);
  if (mode === 'items') {
    const fragment = before.match(/[^,;\n]*$/)![0];
    if (!fragment.trim()) return null;
    return {
      term: fragment.trim(),
      start: caret - fragment.length,
      end: caret + (text.slice(caret).match(/^[^,;\n]*/)?.[0].length || 0)
    };
  }
  const mention = before.match(/(?<![\p{L}\p{N}_.+@-])@([^@\n,;:!?()[\]{}]*)$/u);
  if (!mention) return null;
  return { term: mention[1].trim(), start: mention.index!, end: caret + (text.slice(caret).match(/^[\p{L}\p{N}_-]*/u)?.[0].length || 0) };
}

export function GenerationStart({ sets, setId, items, prepareItems, loadingItems, palettes, paletteId, draft, result, busy, change, choose, choosePalette, generate, manual, own, manage, finish }: {
  sets: SetInfo[]; setId: string; items: Item[]; prepareItems: () => void; loadingItems: boolean;
  palettes: NamedPalette[]; paletteId: string; draft: PromptDraft; result: Direction[];
  busy: boolean; change: (draft: PromptDraft) => void; choose: (id: string) => void; choosePalette: (id: string) => void;
  generate: () => void; manual: () => void; own: () => void; manage: () => void; finish: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const itemMode = draft.mode === 'items';
  const text = itemMode ? draft.itemQuery : draft.query;
  const tagged = draft.requiredItemIds.flatMap(id => items.find(item => item.id === id) || []);
  const matches = items.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()));
  const completion = itemQueryAt(text, caret, draft.mode);
  const term = normalizeItemName(completion?.term || '');
  const suggestions = completion ? items.filter(item => !draft.requiredItemIds.includes(item.id) &&
    normalizeItemName(item.name).includes(term))
    .sort((a, b) => Number(normalizeItemName(b.name).startsWith(term)) - Number(normalizeItemName(a.name).startsWith(term)))
    .slice(0, 8) : [];
  const showSuggestions = focused && !dismissed && !!completion && tagged.length < 8 && (!busy || loadingItems);
  const activeOption = suggestions[highlight] || suggestions[0];
  const canGenerate = !busy && Boolean(text.trim() || tagged.length) &&
    Number.isInteger(draft.count) && draft.count >= 1 && draft.count <= 12;

  function ensureItems() {
    if (!busy && !items.length && setId === 'starter') prepareItems();
  }

  function openPicker() {
    setSearch('');
    setPickerOpen(true);
    ensureItems();
  }

  function addItem(id: string) {
    change({ ...draft, requiredItemIds: [...tagged.map(item => item.id), id] });
    setPickerOpen(false);
  }

  function switchMode(mode: PromptMode) {
    if (mode === draft.mode) return;
    change({ ...draft, mode });
    setDismissed(true);
    setHighlight(0);
    if (mode === 'items') ensureItems();
    requestAnimationFrame(() => input.current?.focus());
  }

  function selectSuggestion(item: Item) {
    if (!completion || busy || tagged.length >= 8) return;
    const before = text.slice(0, completion.start);
    const after = text.slice(completion.end);
    const inserted = itemMode ? '' : item.name + (after ? '' : ' ');
    const next = before + inserted + after;
    if (next.length > 1500) return;
    change({
      ...draft,
      ...(itemMode ? { itemQuery: next } : { query: next }),
      requiredItemIds: [...tagged.map(tag => tag.id), item.id]
    });
    const position = before.length + inserted.length;
    setCaret(position);
    setDismissed(true);
    requestAnimationFrame(() => input.current?.setSelectionRange(position, position));
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
      <div className="prompt-mode" role="group" aria-label="Режим генерации">
        <button type="button" aria-pressed={itemMode} disabled={busy} onClick={() => switchMode('items')}>
          <Icon name="edit" />Предметы
        </button>
        <button type="button" aria-pressed={!itemMode} disabled={busy} onClick={() => switchMode('metaphor')}>
          <Icon name="palette" />Метафора
        </button>
      </div>
      <div className={itemMode ? 'prompt-editor prompt-editor-items' : 'prompt-editor'}>
        <div className="prompt-editor-line">
          {tagged.length > 0 && <div className="prompt-items" role="group" aria-label="Предметы в запросе">
            {tagged.map(item => <span className="prompt-item" key={item.id}>
              <span>{item.name}</span>
              <button type="button" aria-label={`Убрать предмет ${item.name}`} disabled={busy}
                onClick={() => change({ ...draft, requiredItemIds: draft.requiredItemIds.filter(id => id !== item.id) })}><Icon name="close" /></button>
            </span>)}
          </div>}
          <textarea ref={input} className="prompt-input" aria-label={itemMode ? 'Названия предметов' : 'Тема или метафора'}
            aria-autocomplete="list" aria-controls={showSuggestions ? listId : undefined}
            aria-activedescendant={showSuggestions && activeOption ? listId + '-' + activeOption.id : undefined}
            disabled={busy && !loadingItems} maxLength={1500} rows={2} value={text}
            onFocus={event => { setFocused(true); setCaret(event.currentTarget.selectionStart); }}
            onBlur={() => setFocused(false)}
            onSelect={event => setCaret(event.currentTarget.selectionStart)}
            onChange={event => {
              const { value, selectionStart } = event.currentTarget;
              change({ ...draft, ...(itemMode ? { itemQuery: value } : { query: value }) });
              setCaret(selectionStart);
              setDismissed(false);
              setHighlight(0);
              if (itemQueryAt(value, selectionStart, draft.mode)) ensureItems();
            }}
            onKeyDown={event => {
              if (!showSuggestions || event.nativeEvent.isComposing) return;
              if (event.key === 'Escape') {
                event.preventDefault();
                setDismissed(true);
              } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                const next = (highlight + step + suggestions.length) % suggestions.length;
                setHighlight(next);
                document.getElementById(listId + '-' + suggestions[next].id)?.scrollIntoView({ block: 'nearest' });
              } else if (event.key === 'Enter' && activeOption && !event.shiftKey && !busy) {
                event.preventDefault();
                selectSuggestion(activeOption);
              }
            }}
            placeholder={itemMode ? 'Начните вводить название предмета' : 'Опишите идею. Введите @, чтобы добавить предмет'} />
          {showSuggestions && <div className="prompt-suggestions">
            <div id={listId} role="listbox" aria-label="Подсказки из библиотеки">
              {suggestions.map(item => <div key={item.id} id={listId + '-' + item.id} role="option"
                aria-selected={item.id === activeOption?.id} onMouseDown={event => event.preventDefault()}
                onClick={() => selectSuggestion(item)}>{item.name}</div>)}
            </div>
            {!suggestions.length && <p role="status">{loadingItems ? 'Загружаем предметы…' : 'Совпадений в библиотеке нет'}</p>}
          </div>}
        </div>
      </div>
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
