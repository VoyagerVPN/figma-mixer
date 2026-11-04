import { useState } from 'react';
import type { SetInfo } from '../types';
import type { NamedPalette } from '../palettes';
import type { Direction } from '../generation';
import { CustomSelect } from './CustomSelect';
import { Icon } from './Icon';

export type PromptDraft = { query: string; format: string; count: number; detail: 'default' | 'L' | 'S' };
export function GenerationStart({ sets, setId, palettes, paletteId, draft, result, busy, change, choose, choosePalette, generate, manual, own, manage, finish }: {
  sets: SetInfo[]; setId: string; palettes: NamedPalette[]; paletteId: string; draft: PromptDraft; result: Direction[];
  busy: boolean; change: (draft: PromptDraft) => void; choose: (id: string) => void; choosePalette: (id: string) => void;
  generate: () => void; manual: () => void; own: () => void; manage: () => void; finish: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  return <div className="prompt-composer">
    <h1>Новая композиция</h1><p className="intro">Опишите идею. Mixer подберёт предметы и соберёт варианты на холсте Figma.</p>
    <div className="prompt-selectors">
      <CustomSelect label="Библиотека" value={setId} disabled={busy} onChange={id => id === '__import__' ? own() : choose(id)} options={[{ value: 'starter', label: 'Стартовый набор', icon: 'grid' }, ...sets.filter(set => set.id !== 'starter').map(set => ({ value: set.id, label: set.name })), { value: '__import__', label: 'Добавить свои элементы…', icon: 'upload' }]} />
      <CustomSelect label="Палитра" value={paletteId === 'original' ? 'purple' : paletteId} disabled={busy} onChange={choosePalette} options={[{ value: 'auto', label: 'Пусть AI выберет', icon: 'palette' }, ...palettes.map(p => ({ value: p.id, label: p.name, colors: [...p.background, ...p.object_accents] })), { value: '__manage__', label: 'Настроить палитры…', icon: 'edit' }]} />
    </div>
    <label className="prompt-label">Тема или метафора<textarea aria-label="Тема или метафора" disabled={busy} maxLength={1500} value={draft.query} onChange={event => change({ ...draft, query: event.target.value })} placeholder="Например, командная работа над сложной задачей" /></label>
    <div className="prompt-submit"><button className="primary with-icon" disabled={busy || !draft.query.trim() || !Number.isInteger(draft.count) || draft.count < 1 || draft.count > 12} onClick={generate}><Icon name="composition" />Создать композиции</button><span className="meta">{draft.format.replace('x', ' × ')} · вариантов: {Number.isFinite(draft.count) ? draft.count : '—'}</span></div>
    <button className="text-button prompt-advanced" aria-expanded={advanced} disabled={busy} onClick={() => setAdvanced(!advanced)}><Icon name="settings" />Параметры вывода<Icon name={advanced ? 'up' : 'down'} /></button>
    {advanced && <div className="prompt-parameters">
      <CustomSelect label="Формат" value={draft.format} disabled={busy} onChange={format => change({ ...draft, format })} options={[{ value: '1200x630', label: 'Горизонтальный · 1200 × 630' }, { value: '1080x1080', label: 'Квадрат · 1080 × 1080' }, { value: '1080x1350', label: 'Вертикальный · 1080 × 1350' }]} />
      <label>Количество вариантов<input aria-label="Количество вариантов" type="number" min={1} max={12} disabled={busy} value={Number.isNaN(draft.count) ? '' : draft.count} onChange={event => change({ ...draft, count: event.target.value === '' ? NaN : Number(event.target.value) })} /></label>
      <CustomSelect label="Детализация" value={draft.detail} disabled={busy} onChange={detail => change({ ...draft, detail })} options={[{ value: 'default', label: 'Исходная' }, { value: 'L', label: 'L · Подробная' }, { value: 'S', label: 'S · Упрощённая' }]} />
      <div className="prompt-library-actions"><button className="text-button" disabled={busy} onClick={manual}><Icon name="selection" />Выбрать предметы вручную</button><button className="text-button" disabled={busy} onClick={manage}><Icon name="folder" />Управление библиотеками</button></div>
    </div>}
    {result.length > 0 && <section className="prompt-results"><div className="section-heading"><h2>Создано вариантов: {result.length}</h2><button className="text-button" disabled={busy} onClick={finish}>Продолжить в Figma<Icon name="arrow" /></button></div><p className="hint">Варианты рядом на холсте. Новый запуск добавит отдельные фреймы.</p><details><summary>Состав и идея вариантов</summary><ol>{result.map((direction, index) => <li key={index}><strong>{direction.title}</strong><p>{direction.explanation}</p><span className="meta">Палитра: {palettes.find(p => p.id === direction.palette)?.name || direction.palette}</span></li>)}</ol></details></section>}
  </div>;
}
