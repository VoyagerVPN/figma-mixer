import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Item, SetInfo } from '../types';
import type { NamedPalette } from '../palettes';
import type { Direction, LayoutChoice, PromptMode } from '../generation';
import { itemListName, itemListTokens, normalizeItemName, readItemListEntry, resolveItemList, resolveItemMentions } from '../core';
import { CustomSelect } from './CustomSelect';
import { Icon } from './Icon';
import { Panel } from './Panel';
import { canvasFormats, type CanvasFormat } from './canvas-formats';
import { compositionLayouts } from './composition-layouts';
import { textareaTextPoint } from './textarea-anchor';

const details = [
  { value: 'default', label: 'Исходная', shortLabel: 'Исх.' },
  { value: 'L', label: 'L · Подробная', shortLabel: 'L' },
  { value: 'S', label: 'S · Упрощённая', shortLabel: 'S' }
] as const;
const layoutOptions = [
  { value: 'auto', label: 'Авто', icon: 'astroid' },
  ...compositionLayouts
] as const;

export type PromptDraft = {
  mode: PromptMode;
  query: string;
  itemQuery: string;
  itemStyle: Direction['style'];
  metaphorStyle: LayoutChoice;
  format: CanvasFormat;
  count: number;
  detail: 'default' | 'L' | 'S';
};

function itemQueryAt(text: string, caret: number, mode: PromptMode) {
  const before = text.slice(0, caret);
  if (mode === 'items') {
    const token = itemListTokens(text).find(token => caret >= token.start && caret <= token.end);
    if (!token) return null;
    const { name } = readItemListEntry(text.slice(token.start, caret).trim());
    return name ? { term: name, start: token.start, end: token.end } : null;
  }
  const mention = before.match(/(?<![\p{L}\p{N}_.+@-])@([^@\n,;:!?()[\]{}]*)$/u);
  if (!mention) return null;
  return { term: mention[1].trim(), start: mention.index!, end: caret + (text.slice(caret).match(/^[\p{L}\p{N}_-]*/u)?.[0].length || 0) };
}

export function GenerationStart({ sets, setId, items, prepareItems, loadingItems, palettes, paletteId, draft, result, busy, change, choose, choosePalette, generate, exportSvg, own, manage, finish }: {
  sets: SetInfo[]; setId: string; items: Item[]; prepareItems: () => void; loadingItems: boolean;
  palettes: NamedPalette[]; paletteId: string; draft: PromptDraft; result: Direction[];
  busy: boolean; change: (draft: PromptDraft) => void; choose: (id: string) => void; choosePalette: (id: string) => void;
  generate: () => void; exportSvg: () => void; own: () => void; manage: () => void; finish: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const listId = useId();
  const itemMode = draft.mode === 'items';
  const layout = itemMode ? draft.itemStyle : draft.metaphorStyle;
  const text = itemMode ? draft.itemQuery : draft.query;
  const named = itemMode ? resolveItemList(text, items) : resolveItemMentions(text, items);
  const backgroundItems = new Set(itemMode ? items.filter(item => item.variants.some(v => v.role === 'background')).map(item => item.id) : []);
  const matches = items.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()));
  const caret = selection.start;
  const completion = caret === selection.end ? itemQueryAt(text, caret, draft.mode) : null;
  const term = normalizeItemName(completion?.term || '');
  const otherIds = new Set(named.ranges.filter(range => !completion || range.end <= completion.start || range.start >= completion.end).map(range => range.id));
  const suggestions = completion ? items.filter(item => !otherIds.has(item.id) &&
    normalizeItemName(item.name).includes(term))
    .sort((a, b) => Number(normalizeItemName(b.name).startsWith(term)) - Number(normalizeItemName(a.name).startsWith(term)))
    .slice(0, 8) : [];
  const activeOption = suggestions[highlight] || suggestions[0];
  const wordStart = completion ? completion.start + (text.slice(completion.start).match(/^\s*/)?.[0].length ?? 0) : 0;
  const resolvedMention = !itemMode && named.ranges.find(range => range.start === wordStart && range.end <= caret);
  const showSuggestions = focused && !dismissed && !!completion && otherIds.size < 8 &&
    (!busy || loadingItems) && (!resolvedMention || suggestions.some(item => item.id !== resolvedMention.id));
  const canGenerate = !busy && Boolean(text.trim()) &&
    Number.isInteger(draft.count) && draft.count >= 1 && draft.count <= 12;

  useLayoutEffect(() => {
    const field = input.current, menu = popup.current;
    if (!showSuggestions || !field || !menu) return;

    const update = () => {
      const { x, y, bounds } = textareaTextPoint(field, wordStart);
      const gap = 5, edge = 8;
      menu.style.left = Math.max(edge, Math.min(x, window.innerWidth - menu.offsetWidth - edge)) + 'px';
      menu.style.bottom = window.innerHeight - y + gap + 'px';
      menu.style.maxHeight = Math.min(190, Math.max(0, y - gap - edge)) + 'px';
      menu.style.visibility = y > edge + gap && y >= bounds.top && y < bounds.bottom ? 'visible' : 'hidden';
    };

    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !menu.contains(event.target)) update();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(field);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [showSuggestions, text, wordStart, loadingItems]);

  useLayoutEffect(() => {
    const field = input.current, layer = preview.current;
    if (!field || !layer) return;
    const sync = () => {
      layer.style.width = field.clientWidth + 'px';
      layer.scrollTop = field.scrollTop;
      layer.scrollLeft = field.scrollLeft;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(field);
    field.addEventListener('scroll', sync);
    return () => { observer.disconnect(); field.removeEventListener('scroll', sync); };
  }, [text, itemMode, named.ranges.length]);

  function setText(value: string) {
    change({ ...draft, ...(itemMode ? { itemQuery: value } : { query: value }) });
  }

  function readSelection(field: HTMLTextAreaElement) {
    setSelection({ start: field.selectionStart, end: field.selectionEnd });
  }

  function ensureItems() {
    if (!busy && !items.length && setId === 'starter') prepareItems();
  }

  function openPicker() {
    setSearch('');
    setPickerOpen(true);
    ensureItems();
  }

  function addItem(item: Item, background = false) {
    const base = text.trimEnd();
    const separator = !base ? '' : itemMode && !/[,;]$/.test(base) ? ', ' : ' ';
    const value = base + separator + (itemMode ? itemListName(item.name, background) + ', ' : '@' + item.name + ' ');
    if (value.length > 1500) return;
    setText(value);
    setPickerOpen(false);
  }

  function switchMode(mode: PromptMode) {
    if (mode === draft.mode) return;
    change({ ...draft, mode, metaphorStyle: 'auto' });
    setDismissed(true);
    setHighlight(0);
    if (mode === 'items') ensureItems();
    requestAnimationFrame(() => input.current?.focus());
  }

  function selectSuggestion(item: Item, background = false) {
    if (!completion || busy || otherIds.size >= 8) return;
    const before = text.slice(0, completion.start);
    const after = text.slice(completion.end);
    const spacing = itemMode ? text.slice(completion.start).match(/^[ \t]*/)?.[0] || '' : '';
    const inserted = itemMode
      ? spacing + itemListName(item.name, background) + (after ? '' : ', ')
      : '@' + item.name + (after ? '' : ' ');
    const next = before + inserted + after;
    if (next.length > 1500) return;
    setText(next);
    const position = before.length + inserted.length;
    setSelection({ start: position, end: position });
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
          { value: 'auto', label: 'Авто', icon: 'palette' },
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
          <Icon name="astroid" />Идеи
        </button>
      </div>
      <div className="prompt-editor-line">
          {named.ranges.length > 0 && <div ref={preview} className="prompt-text-preview" aria-hidden="true">
            {named.ranges.map(({ start, end }, index) => <span key={start}>
              {text.slice(named.ranges[index - 1]?.end ?? 0, start)}
              <mark className="prompt-inline-item">{text.slice(start, end)}</mark>
            </span>)}
            {text.slice(named.ranges[named.ranges.length - 1].end) + '\u200b'}
          </div>}
          <textarea ref={input} className={named.ranges.length ? 'prompt-input has-inline-items' : 'prompt-input'}
            aria-label={itemMode ? 'Названия предметов' : 'Идея или заголовок'}
            aria-autocomplete="list" aria-controls={showSuggestions ? listId : undefined}
            aria-activedescendant={showSuggestions && activeOption ? listId + '-' + activeOption.id : undefined}
            disabled={busy && !loadingItems} maxLength={1500} rows={2} value={text}
            onFocus={event => { setFocused(true); readSelection(event.currentTarget); }}
            onBlur={() => setFocused(false)}
            onSelect={event => readSelection(event.currentTarget)}
            onChange={event => {
              const { value, selectionStart } = event.currentTarget;
              setText(value);
              readSelection(event.currentTarget);
              setDismissed(false);
              setHighlight(0);
              if (itemQueryAt(value, selectionStart, draft.mode)) ensureItems();
            }}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter' && event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
                event.preventDefault();
                if (canGenerate && !event.repeat) generate();
                return;
              }
              if (!showSuggestions) return;
              if (event.key === 'Escape') {
                event.preventDefault();
                setDismissed(true);
              } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                const next = (highlight + step + suggestions.length) % suggestions.length;
                setHighlight(next);
                document.getElementById(listId + '-' + suggestions[next].id)?.scrollIntoView({ block: 'nearest' });
              } else if (event.key === 'Tab' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey &&
                !busy && activeOption && backgroundItems.has(activeOption.id)) {
                event.preventDefault();
                selectSuggestion(activeOption, true);
              } else if ((event.key === 'Enter' || event.key === 'Tab') && activeOption &&
                !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && !busy) {
                event.preventDefault();
                selectSuggestion(activeOption);
              }
            }}
            placeholder={itemMode
              ? text ? undefined : 'Начните вводить название предмета'
              : 'Опишите идею. Введите @, чтобы добавить предмет'} />
          {showSuggestions && createPortal(<div ref={popup} className="prompt-suggestions">
            <div id={listId} role="listbox" aria-label="Подсказки из библиотеки">
              {suggestions.map(item => <div key={item.id} className="prompt-suggestion-row" role="presentation" onMouseDown={event => event.preventDefault()}>
                <div id={listId + '-' + item.id} role="option" aria-selected={item.id === activeOption?.id}
                  onClick={() => selectSuggestion(item)}>{item.name}</div>
                {backgroundItems.has(item.id) && <button type="button" className="prompt-background-action" tabIndex={-1}
                  aria-label={'Добавить фоном: ' + item.name} aria-keyshortcuts="Shift+Tab" title="Добавить фоном (Shift+Tab)" disabled={busy}
                  onClick={() => selectSuggestion(item, true)}><Icon name="layers" /></button>}
              </div>)}
            </div>
            {!suggestions.length && <p role="status">{loadingItems ? 'Загружаем предметы…' : 'Совпадений в библиотеке нет'}</p>}
          </div>, document.body)}
      </div>
      <div className="prompt-toolbar">
        <button className="icon-button prompt-add" type="button" aria-label="Добавить предмет" aria-haspopup="dialog"
          title={named.ids.length >= 8 ? 'Можно добавить до восьми предметов' : 'Добавить предмет'}
          disabled={busy || named.ids.length >= 8} onClick={openPicker}><Icon name="plus" /></button>
        <div className="prompt-options">
          <div className="prompt-count" role="group" aria-label="Количество вариантов">
            <button type="button" aria-label="Меньше вариантов" title="Меньше вариантов" disabled={busy || draft.count <= 1}
              onClick={() => change({ ...draft, count: draft.count - 1 })}><Icon name="minus" /></button>
            <output title="Количество вариантов">{draft.count} вар.</output>
            <button type="button" aria-label="Больше вариантов" title="Больше вариантов" disabled={busy || draft.count >= 12}
              onClick={() => change({ ...draft, count: draft.count + 1 })}><Icon name="plus" /></button>
          </div>
          <CustomSelect label="Соотношение сторон" triggerIcon={canvasFormats.find(format => format.value === draft.format)?.icon ?? canvasFormats[0].icon} value={draft.format} disabled={busy}
            onChange={format => change({ ...draft, format })} options={canvasFormats} />
          <CustomSelect label="Детализация" triggerIcon="detail" value={draft.detail} disabled={busy}
            onChange={detail => change({ ...draft, detail })} options={details} />
          <CustomSelect label="Построение" triggerIcon={layout === 'auto' ? 'astroid' : layout} value={layout} disabled={busy}
            onChange={value => {
              if (!itemMode) change({ ...draft, metaphorStyle: value });
              else if (value !== 'auto') change({ ...draft, itemStyle: value });
            }} options={itemMode ? compositionLayouts : layoutOptions} />
        </div>
        <button className="primary prompt-send" type="button" aria-label="Создать композиции" aria-keyshortcuts="Control+Enter"
          title="Создать композиции (Ctrl+Enter)" disabled={!canGenerate} onClick={generate}><Icon name="up" /></button>
      </div>
    </div>
    <div className="prompt-library-actions">
      <button className="text-button" disabled={busy} onClick={manage}>Управление библиотеками</button>
    </div>
    <Panel open={pickerOpen} title="Добавить предмет" close={() => setPickerOpen(false)}>
      {pickerOpen && <>
        {items.length > 0 && <input aria-label="Найти предмет" placeholder="Название предмета" autoFocus
          value={search} onChange={event => setSearch(event.target.value)} />}
        <div className="prompt-item-list">
          {matches.map(item => <div key={item.id} className="prompt-picker-row">
            <button type="button" disabled={busy || named.ids.includes(item.id)} onClick={() => addItem(item)}>{item.name}</button>
            {backgroundItems.has(item.id) && <button type="button" className="prompt-background-action"
              aria-label={'Добавить фоном: ' + item.name} title="Добавить фоном" disabled={busy || named.ids.includes(item.id)}
              onClick={() => addItem(item, true)}><Icon name="layers" /></button>}
          </div>)}
        </div>
        {!matches.length && <p className="hint">{busy ? 'Загружаем предметы…' : 'Предметы не найдены.'}</p>}
      </>}
    </Panel>
    {result.length > 0 && <section className="prompt-results">
      <div className="section-heading"><h2>Создано вариантов: {result.length}</h2>
        <button className="text-button" disabled={busy} onClick={finish}>Продолжить в Figma<Icon name="arrow" /></button>
      </div>
      <p className="hint">Варианты рядом на холсте. Для экспорта выберите нужный фрейм.</p>
      <button className="text-button with-icon" disabled={busy} onClick={exportSvg}><Icon name="download" />Экспорт SVG</button>
    </section>}
  </div>;
}
