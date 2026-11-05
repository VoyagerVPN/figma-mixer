import './palettes.css';
import './flow.css';
import { useEffect, useRef, useState } from 'react';
import { builtInPalettes, type NamedPalette } from '../palettes';
import type { Detail, Item, SceneOptions } from '../types';
import { Preview } from './Preview';
import { CustomSelect } from './CustomSelect';
import { PaletteArtwork } from './PalettePreview';
import { Panel } from './Panel';
import { Icon } from './Icon';
import { ChoiceGroup } from './ChoiceGroup';
import { LayerEditor } from './LayerEditor';
import { canvasFormats, type CanvasFormat } from './canvas-formats';
import { compositionLayouts } from './composition-layouts';
import { reconcileLayers, type LayerStack } from '../layers';

export function Composer({ items, selected, toggle, busy, keyReady, selectByText, create, exportSvg, scene, generation = 0, finish, palettes, paletteId, managePalettes, selectPalette }: {
  items: Item[]; selected: string[]; toggle: (id: string) => void; busy: boolean; keyReady: boolean;
  selectByText: (query: string) => void; create: (options: SceneOptions) => void; exportSvg: () => void;
  scene: string; generation?: number; finish: () => void;
  palettes: NamedPalette[]; paletteId: string; managePalettes: () => void; selectPalette: (id: string) => void;
}) {
  const [query, setQuery] = useState(''), [format, setFormat] = useState<CanvasFormat>(canvasFormats[0].value);
  const [count, setCount] = useState(1), [detail, setDetail] = useState<Detail>('default');
  const [variant, setVariant] = useState(0);
  const [backgroundColor, setBackgroundColor] = useState('#D7CDF5'), [ground, setGround] = useState(false);
  const [style, setStyle] = useState<typeof compositionLayouts[number]['value']>('balanced');
  const [layers, setLayers] = useState<LayerStack>({ background: [], main: [], heroId: '', manual: false });
  const [crop, setCrop] = useState<NonNullable<SceneOptions['crop']>>('accent');
  const [panel, setPanel] = useState<'roles' | 'description' | 'advanced' | null>(null);
  const [step, setStep] = useState<'elements' | 'settings' | 'result'>(selected.length ? 'settings' : 'elements');
  const [search, setSearch] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (generation) setStep('result'); }, [generation]);
  useEffect(() => { heading.current?.closest('main')?.scrollTo(0, 0); heading.current?.focus(); }, [step]);
  const chosen = items.filter(i => selected.includes(i.id));
  const stack = reconcileLayers(layers, chosen.map(item => ({ id: item.id, canBackground: item.variants.some(v => v.role === 'background') })));
  const validBackgrounds = stack.background, validFocus = stack.heroId;
  const hasDetail = chosen.some(i => i.variants.some(v => v.detail !== 'default'));
  const starter = items.every(i => i.origin === 'starter');
  const validCount = Number.isInteger(count) && count >= 1 && count <= 12;
  const palette = palettes.find(p => p.id === paletteId) || builtInPalettes[0];
  const validBackground = palette.background.includes(backgroundColor) ? backgroundColor : palette.background[0];

  function generate() {
    const [width, height] = format.split('x').map(Number);
    create({ ids: selected, detail, palette: paletteId, paletteSnapshot: paletteId === 'draft' ? palette : undefined, width, height, variant, count, background: validBackgrounds.length > 0, backgroundIds: validBackgrounds, heroId: validFocus, layerOrder: stack.manual ? [...stack.background, ...stack.main] : undefined, crop, style, title: query || 'Композиция', backgroundColor: validBackground, ground });
    setVariant(v => v + count);
  }

  if (step === 'result') return <div className="generation-result">
    <div className="result-mark"><Icon name="check" /></div><h1 ref={heading} tabIndex={-1}>Композиции на холсте</h1>
    <p className="intro">{scene}</p><p>Сравните варианты рядом на холсте. Перемещение, вращение и редактирование объектов доступны в Figma.</p>
    <button className="primary with-icon result-continue" disabled={busy} onClick={finish}>Продолжить в Figma<Icon name="arrow" /></button>
    <button className="with-icon" disabled={busy} onClick={() => setStep('settings')}><Icon name="composition" />Создать ещё варианты</button>
    <p className="hint">Новая генерация добавит отдельные фреймы. Уже созданные композиции сохранятся.</p>
    <button className="text-button" disabled={busy} onClick={exportSvg}><Icon name="download" />Экспорт SVG</button>
  </div>;
  return <div className="composer">
    <div className="flow-heading"><span className="meta">{step === 'elements' ? '1 / 2 · Состав' : '2 / 2 · Генерация'}</span><h1 ref={heading} tabIndex={-1}>{step === 'elements' ? 'Выберите предметы' : 'Параметры генерации'}</h1><p className="intro">{step === 'elements' ? 'Выберите до восьми предметов. Один предмет — целый объект со всеми его деталями.' : 'Каждый вариант появится отдельным фреймом на холсте Figma.'}</p></div>
    {step === 'elements' ? <>
      <div className="selection-search"><label>Поиск по библиотеке<input aria-label="Поиск предметов" placeholder="Название предмета" value={search} onChange={event => setSearch(event.target.value)} /></label><button className="text-button" disabled={busy} onClick={() => setPanel('description')}><Icon name="search" />Подобрать по описанию</button></div>
      <div className="compose-items selection-grid">{items.filter(item => item.name.toLowerCase().includes(search.toLowerCase())).map(item => <button key={item.id} className={`compose-pick ${selected.includes(item.id) ? 'chosen' : ''}`} aria-label={item.name} aria-pressed={selected.includes(item.id)} disabled={busy || (!selected.includes(item.id) && selected.length >= 8)} onClick={() => toggle(item.id)}><Preview svg={item.preview} /><span className="item-name">{item.name}</span>{selected.includes(item.id) && <span className="pick-mark"><Icon name="check" /></span>}</button>)}</div>
      {search && !items.some(item => item.name.toLowerCase().includes(search.toLowerCase())) && <p className="hint">Предметы не найдены. Измените поисковый запрос.</p>}
      <div className="bottom-actions"><span aria-live="polite">Выбрано: {selected.length} / 8</span><button className="primary with-icon" disabled={busy || !selected.length} onClick={() => { setStep('settings'); setSearch(''); }}>К параметрам<Icon name="chevron" /></button></div>
    </> : <>
    <section className="elements-section">
      <div className="section-heading"><h2>Состав <span className="meta">{selected.length} / 8</span></h2><div className="text-actions"><button disabled={busy} onClick={() => setStep('elements')}><Icon name="edit" />Изменить</button><button disabled={busy || !chosen.length} onClick={() => setPanel('roles')}><Icon name="layers" />Слои{validBackgrounds.length > 0 && ` · ${validBackgrounds.length} фон.`}</button></div></div>
      <div className="composition-summary">{chosen.map(item => {
        const picked = selected.includes(item.id), background = validBackgrounds.includes(item.id);
        return <div key={item.id} className={`summary-item ${background ? 'background-item' : ''}`}>
          <PaletteArtwork item={item} palette={paletteId === 'original' ? undefined : palette} /><span className="item-name">{item.name}{background && <span className="item-role">фон</span>}</span>{picked && <span className={`pick-mark ${validFocus === item.id ? 'focus-star' : ''}`} aria-label={validFocus === item.id ? 'Главный акцент' : undefined} data-focus={validFocus === item.id}><Icon name={validFocus === item.id ? 'star' : 'check'} /></span>}
        </div>;
      })}</div>
      {!chosen.length && <button className="empty-selection with-icon" onClick={() => setStep('elements')}><Icon name="grid" />Выбрать элементы из набора</button>}
    </section>

    <section className="output-section"><div className="output-controls"><CustomSelect label="Соотношение сторон" value={format} onChange={setFormat} options={canvasFormats} /><div className="quantity-field"><label htmlFor="variant-count">Вариантов</label><div className="quantity-control"><button aria-label="Меньше вариантов" disabled={busy || count <= 1} onClick={() => setCount(c => Math.max(1, (c || 1) - 1))}><Icon name="minus" /></button><input id="variant-count" aria-label="Количество вариантов" type="number" min={1} max={12} value={Number.isNaN(count) ? '' : count} onChange={e => setCount(e.target.value === '' ? NaN : Number(e.target.value))} /><button aria-label="Больше вариантов" disabled={busy || count >= 12} onClick={() => setCount(c => Math.min(12, (c || 0) + 1))}><Icon name="plus" /></button></div></div></div></section>

    <section className="layout-section"><div className="section-heading"><h2>Построение</h2><button className="text-button" onClick={() => setPanel('advanced')} disabled={busy}><Icon name="settings" />Параметры</button></div>
      <div className="segmented layout-options" role="group" aria-label="Построение композиции">{compositionLayouts.map(layout => <button key={layout.value} disabled={busy} aria-pressed={style === layout.value} onClick={() => setStyle(layout.value)}><Icon name={layout.icon} />{layout.label}</button>)}</div>
      <p className="control-description">{compositionLayouts.find(layout => layout.value === style)!.description}</p>
    </section>

    <section className="appearance-section"><div className="section-heading"><h2>Оформление</h2><button className="text-button" disabled={busy} onClick={managePalettes}><Icon name="palette" />Палитры</button></div><div className="appearance-controls">
      <div className="palette-quick-list" role="group" aria-label="Палитра объектов">{[{ ...builtInPalettes[0], id: 'original', name: 'Исходная' }, ...palettes].map(p => <button key={p.id} className="palette-quick" aria-label={`Палитра ${p.name}`} aria-pressed={paletteId === p.id} disabled={busy} onClick={() => selectPalette(p.id)}><span className="palette-swatches">{[...p.background, ...p.object_accents].map((color, index) => <i key={index} style={{ background: color }} />)}</span><span>{p.name}</span></button>)}</div>
      <div className="background-field"><span className="field-caption">Цвет фона</span><div className="background-colors" role="group" aria-label="Цвет фона">{palette.background.map((color, index) => <button key={index} aria-label={`Фон ${index + 1}: ${color}`} title={`Фон ${index + 1}: ${color}`} disabled={busy} aria-pressed={validBackground === color} onClick={() => setBackgroundColor(color)}><span className="color-chip" style={{ background: color }} />{validBackground === color && <Icon name="check" />}</button>)}<span className="meta">{validBackground}</span></div></div>
      {!starter && <p className="hint">У импортированных предметов сохраняются исходные цвета. Палитра перекрашивает предметы стартового набора</p>}
    </div></section>


    <div className="bottom-actions composer-actions"><span className="with-icon"><Icon name="crop" />{crop === 'none' ? 'Без обрезки' : 'С кадрированием'}{validBackgrounds.length > 0 && ` · фоновых: ${validBackgrounds.length}`}</span><button className="primary" disabled={busy || !selected.length || !validCount} onClick={generate}>Создать варианты<Icon name="composition" /></button></div>

    </>}
    <Panel open={panel !== null} title={panel === 'roles' ? 'Слои композиции' : panel === 'description' ? 'Подбор по описанию' : 'Параметры композиции'} close={() => setPanel(null)}>
      {panel === 'roles' && <LayerEditor items={chosen} value={stack} onChange={setLayers} close={() => setPanel(null)} busy={busy} />}
      {panel === 'description' && <><p className="panel-description">Перечислите названия или опишите тему композиции</p><label>Описание<textarea autoFocus value={query} maxLength={1500} onChange={e => setQuery(e.target.value)} placeholder="Рабочее место дизайнера" /></label><p className="hint">{keyReady ? 'Смысловой подбор через AI' : 'По названиям — локально, по смыслу — с подключённым AI'}</p><button className="primary panel-done with-icon" disabled={busy || !query.trim()} onClick={() => { setPanel(null); selectByText(query); }}><Icon name="search" />Подобрать элементы</button></>}
      {panel === 'advanced' && <><ChoiceGroup label="Кадрирование" value={crop} onChange={setCrop} options={[{ value: 'accent', label: 'Выход за края кадра' }, { value: 'none', label: 'Силуэты целиком' }]} />{hasDetail && <><span className="field-label">Версия графики</span><div className="segmented" role="group" aria-label="Версия графики">{(['default', 'L', 'S'] as const).map(value => <button key={value} aria-pressed={detail === value} onClick={() => setDetail(value)}>{value === 'default' ? 'Исходная' : value}</button>)}</div><p className="hint">Готовые авторские версии L и S. Различия зависят от предмета</p></>}<label className="check setting-row"><span className="with-icon"><Icon name="plane" />Диагональная плоскость</span><input aria-label="Диагональная плоскость" type="checkbox" role="switch" checked={ground} onChange={e => setGround(e.target.checked)} /></label><button className="primary panel-done" onClick={() => setPanel(null)}>Готово</button></>}
    </Panel>
  </div>;
}
