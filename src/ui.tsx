import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { resolveNames } from './core';
import type { DraftItem, Item, SetInfo } from './types';
import { ImportWizard } from './ui/ImportWizard';
import { ItemEditor } from './ui/ItemEditor';
import { Composer } from './ui/Composer';
import { Preview } from './ui/Preview';
import { analyzeArtwork } from './ui/analyze-artwork';
import { Panel } from './ui/Panel';
import { Icon } from './ui/Icon';
import { builtInPalettes, type NamedPalette } from './palettes';
import { PaletteManager } from './ui/PaletteManager';
import type { PaletteScene } from './ui/PalettePreview';
import './ui.css';

const post = (type: string, payload = {}) => parent.postMessage({ pluginMessage: { type, ...payload } }, '*');
function App() {
  const [sets, setSets] = useState<SetInfo[]>([]), [items, setItems] = useState<Item[]>([]);
  const [view, setView] = useState<'home' | 'set' | 'import'>('home');
  const [activeId, setActiveId] = useState(''), [targetId, setTargetId] = useState('');
  const [tab, setTab] = useState<'items' | 'compose'>('items');
  const [selected, setSelected] = useState<string[]>([]), [mergeIds, setMergeIds] = useState<string[]>([]);
  const [mergeName, setMergeName] = useState(''), [editing, setEditing] = useState<Item | null>(null);
  const [draft, setDraft] = useState<DraftItem[]>([]), [canSplit, setCanSplit] = useState(false), [skipped, setSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState('Загружаем наборы…'), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [keyReady, setKeyReady] = useState(false), [settings, setSettings] = useState(false), [key, setKey] = useState('');
  const [scene, setScene] = useState('');
  const [palettes, setPalettes] = useState<NamedPalette[]>(builtInPalettes), [paletteId, setPaletteId] = useState('original'), [paletteOpen, setPaletteOpen] = useState(false);
  const [transientPalette, setTransientPalette] = useState<NamedPalette | null>(null), [palettePreview, setPalettePreview] = useState<PaletteScene | null>(null);
  const pendingPalette = useRef<NamedPalette | null>(null);
  const availablePalettes = transientPalette ? [...palettes, transientPalette] : palettes;
  const activeSet = sets.find(s => s.id === activeId);
  const currentItems = useMemo(() => items.filter(i => i.setId === activeId), [items, activeId]);
  const previewItems = useMemo(() => { const picked = currentItems.filter(item => selected.includes(item.id)); return picked.length ? picked : currentItems.slice(0, 3); }, [currentItems, selected]);
  const [search, setSearch] = useState('');
  const main = useRef<HTMLElement>(null);
  useEffect(() => { if (main.current) main.current.scrollTop = 0; }, [view, tab, editing?.id]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const m = event.data?.pluginMessage; if (!m) return;
      if (m.type === 'analyze-artwork') {
        void analyzeArtwork(m.samples).then(profiles => post('artwork-analysis', { requestId: m.requestId, profiles }))
          .catch(error => post('artwork-analysis', { requestId: m.requestId, error: error instanceof Error ? error.message : 'Не удалось проанализировать графику' }));
        return;
      }
      if (m.type === 'catalog') { setSets(m.sets || []); setItems(m.items); if (m.palettes) setPalettes(m.palettes); setKeyReady(m.keyReady); setBusy(''); }
      if (m.type === 'palette-saved') { setTransientPalette(null); setPaletteId(m.id); setPaletteOpen(false); setNotice('Палитра сохранена в этом файле Figma'); }
      if (m.type === 'palette-preview') setPalettePreview(m.preview);
      if (m.type === 'palette-applied' && pendingPalette.current) { usePalette(pendingPalette.current); pendingPalette.current = null; }
      if (m.type === 'error') { pendingPalette.current = null; setError(m.message); setBusy(''); }
      if (m.type === 'idle') setBusy('');
      if (m.type === 'draft') { setDraft(m.items); setCanSplit(m.canSplit); setSkipped(m.skipped); }
      if (m.type === 'saved-set' || m.type === 'open-set') { setActiveId(m.setId); setView('set'); setTab('items'); setSelected([]); setMergeIds([]); setDraft([]); setNotice(m.type === 'saved-set' ? 'Набор сохранён в этом файле Figma' : ''); }
      if (m.type === 'item-updated') { setEditing(null); setNotice('Карточка элемента сохранена'); }
      if (m.type === 'merged') { setMergeIds([]); setMergeName(''); setNotice('Элементы объединены. Назначьте свойства версий в карточке'); }
      if (m.type === 'selection') { setSelected(m.ids); setNotice(m.explanation); }
      if (m.type === 'scene') { setScene(`Создано вариантов: ${m.variants} · ${m.width} × ${m.height}`); setNotice(m.warnings?.join('. ') || ''); }
      if (m.type === 'layer-order') setScene(`Упорядочено композиций: ${m.count}. Предметы расположены по глубине сцены.`);
      if (m.type === 'notice') setNotice(m.message);
      if (m.type === 'key-ready') { setKeyReady(m.ready); setSettings(false); setKey(''); setNotice('Ключ подключён для текущей сессии'); }
      if (m.type === 'download') {
        const url = URL.createObjectURL(new Blob([m.data], { type: m.mime }));
        const a = document.createElement('a'); a.href = url; a.download = m.name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Файл передан на скачивание');
      }
    };
    window.addEventListener('message', handler); post('ready');
    return () => window.removeEventListener('message', handler);
  }, []);

  function usePalette(palette: NamedPalette) { setTransientPalette(palette.id === 'draft' ? palette : null); setPaletteId(palette.id); setPaletteOpen(false); }
  function openPalettes() { setPalettePreview(null); setPaletteOpen(true); command('preview-palette', {}, 'Готовим предпросмотр…'); }

  function command(type: string, payload = {}, label = 'Выполняем…') { setError(''); setNotice(''); setBusy(label); post(type, payload); }
  function openSet(id: string) { setActiveId(id); setView('set'); setTab('items'); setSelected([]); setMergeIds([]); setEditing(null); setSearch(''); setScene(''); setError(''); setNotice(''); }
  function startImport(id = '') { setTargetId(id); setDraft([]); setCanSplit(false); setSkipped([]); setView('import'); setError(''); setNotice(''); }
  function toggle(id: string) { setSelected(current => current.includes(id) ? current.filter(x => x !== id) : current.length < 8 ? [...current, id] : current); }
  function selectText(query: string) {
    const found = resolveNames(query, currentItems);
    if (found.ids.length && !found.missing.length) { setSelected(found.ids.slice(0, 8)); setNotice('Элементы найдены в текущем наборе'); return; }
    if (!keyReady) { setError('Для подбора по смыслу подключите DeepSeek. Можно также выбрать элементы вручную'); setSettings(true); return; }
    command('ai', { setId: activeId, query }, 'Подбираем элементы…');
  }

  return <div className="app">
    <header><div><span className="brand">Mixer</span><span className="version">Композиции из вашей графики</span></div><button className="connection icon-button" aria-label="Настройки DeepSeek" title={keyReady ? 'DeepSeek подключён' : 'Настройки DeepSeek'} onClick={() => setSettings(v => !v)}><Icon name="settings" /></button></header>
    {paletteOpen && <PaletteManager palettes={availablePalettes} selected={paletteId} items={previewItems} scene={palettePreview} busy={Boolean(busy)} error={error} select={usePalette} apply={palette => { pendingPalette.current = palette; command('palette', { palette: palette.id === 'draft' ? palette : palette.id, backgroundColor: palette.background[palettePreview?.backgroundIndex || 0] }, 'Применяем оформление…'); }} save={palette => command('save-palette', { palette }, 'Сохраняем палитру…')} exportPalette={id => command('export-palette', { id }, 'Экспортируем палитру…')} close={() => setPaletteOpen(false)} />}
    <Panel open={settings} title="Подключение DeepSeek" close={() => setSettings(false)}><p className="panel-description">Для подбора по смыслу. Ключ действует до закрытия плагина</p><label>API-ключ<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} /></label><div className="action-row"><label className="file-button with-icon"><Icon name="upload" />Загрузить key.txt<input type="file" accept=".txt" hidden onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) post('key', { key: (await file.text()).trim() }); }} /></label><button className="primary with-icon" disabled={!key.trim()} onClick={() => post('key', { key })}><Icon name="key" />Подключить</button></div></Panel>
    <main ref={main} className={view === 'set' && tab === 'compose' ? 'compose-view' : undefined}>
      {error && <div role="alert" className="message error">{error}</div>}
      {notice && <div role="status" className="message">{notice}</div>}
      {busy && <div role="status" className="progress">{busy}</div>}
      {view === 'home' && <>
        <section className="home-intro"><h1>Наборы графики</h1><p className="intro">Объедините элементы в набор, затем создавайте из них варианты композиций.</p><div className="action-row"><button className="primary with-icon" disabled={Boolean(busy)} onClick={() => startImport()}><Icon name="plus" />Создать набор</button><button className="with-icon" disabled={Boolean(busy)} onClick={() => { startImport(); command('capture-selection', {}, 'Читаем выделение…'); }}><Icon name="selection" />Из выделения Figma</button></div></section>
        {!sets.length && <div className="empty-state"><h2>Ваш первый набор</h2><p>Добавьте целые объекты из Figma или несколько SVG-файлов.</p><button disabled={Boolean(busy)} onClick={() => command('starter', {}, 'Подготавливаем стартовый набор…')}>Попробовать на стартовом наборе</button></div>}
        <div className="set-list">{sets.map(set => { const group = items.filter(i => i.setId === set.id); return <button className="set-card" key={set.id} onClick={() => openSet(set.id)} disabled={Boolean(busy)}><div className="set-previews">{group.slice(0, 3).map(item => <Preview key={item.id} svg={item.preview} />)}</div><div><strong>{set.name}</strong><span>Элементов: {group.length}</span></div><Icon name="chevron" /></button>; })}</div>
        {sets.length > 0 && !sets.some(s => s.id === 'starter') && <button className="link-button" onClick={() => command('starter', {}, 'Подготавливаем стартовый набор…')}>Открыть стартовый набор</button>}
        <p className="hint">Наборы хранятся внутри этого файла Figma. Для переноса используйте экспорт набора.</p>
      </>}
      {view === 'import' && <ImportWizard key="import" sets={sets} items={draft} targetId={targetId} setItems={setDraft} setTargetId={setTargetId} busy={Boolean(busy)} canSplit={canSplit} skipped={skipped} capture={split => command('capture-selection', { split, fresh: !split }, 'Читаем выделение…')} highlight={nodeId => command('highlight', { nodeId })} save={(name, items, setId) => command('save-set', { name, items, setId }, 'Сохраняем набор…')} cancel={() => { setView(activeId ? 'set' : 'home'); setDraft([]); setError(''); }} reportError={setError} />}
      {view === 'set' && activeSet && <>
        {editing ? <ItemEditor key={editing.id} item={editing} busy={Boolean(busy)} cancel={() => setEditing(null)} save={(name, description, variants) => command('update-item', { id: editing.id, name, description, variants }, 'Сохраняем карточку…')} /> : <>
          <div className="set-context"><button className="back" onClick={() => { setView('home'); setNotice(''); setError(''); }}><Icon name="arrow" />Наборы</button><h1>{activeSet.name}</h1>{tab === 'items' && <button className="text-button" disabled={Boolean(busy)} onClick={() => startImport(activeId)}><Icon name="plus" />Добавить</button>}</div>
          <nav aria-label="Раздел набора"><button className={`${tab === 'items' ? 'active' : ''} with-icon`} onClick={() => setTab('items')}><Icon name="grid" />Элементы</button><button className={`${tab === 'compose' ? 'active' : ''} with-icon`} onClick={() => { setTab('compose'); if (!selected.length) setSelected(currentItems.slice(0, 3).map(i => i.id)); }}><Icon name="composition" />Композиция</button></nav>
          {tab === 'items' ? <>
            <label className="search-label"><span className="with-icon"><Icon name="search" />Поиск</span><input placeholder="Название или описание" value={search} onChange={e => setSearch(e.target.value)} /></label>
            {mergeIds.length > 1 && <section className="merge-panel"><label>Общее название элемента<input value={mergeName} onChange={e => setMergeName(e.target.value)} maxLength={100} placeholder="Например, лампа" /></label><button disabled={!mergeName.trim() || Boolean(busy)} className="with-icon" onClick={() => command('merge-items', { ids: mergeIds, name: mergeName }, 'Объединяем варианты…')}><Icon name="layers" />Объединить как варианты</button><p className="hint">Графика сохранится. Выбранные карточки станут версиями одного элемента.</p></section>}
            <div className="library-grid">{currentItems.filter(i => (i.name + ' ' + i.description).toLowerCase().includes(search.toLowerCase())).map(item => <article key={item.id} className="library-card"><label className="card-check"><input type="checkbox" aria-label={'Объединить ' + item.name} checked={mergeIds.includes(item.id)} onChange={() => setMergeIds(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} /></label><button className="preview-button" onClick={() => setEditing(item)} aria-label={'Открыть элемент ' + item.name}><Preview svg={item.preview} /><strong>{item.name}</strong></button><span className="hint">{item.variants.length > 1 ? `Вариантов: ${item.variants.length}` : 'Один вариант'}</span><button className="link-button" onClick={() => setEditing(item)}><Icon name="edit" />Настроить элемент</button></article>)}</div>
            <p className="hint">Чтобы объединить версии одного предмета, отметьте две или более карточки.</p><div className="action-row"><button className="with-icon" disabled={Boolean(busy)} onClick={() => command('export-set', { setId: activeId }, 'Экспортируем набор…')}><Icon name="download" />Экспорт набора</button><button className="primary with-icon" disabled={!currentItems.length} onClick={() => { setTab('compose'); if (!selected.length) setSelected(currentItems.slice(0, 3).map(i => i.id)); }}><Icon name="composition" />Создать композицию</button></div>
          </> : <Composer key={activeId} items={currentItems} selected={selected.filter(id => currentItems.some(i => i.id === id))} toggle={toggle} busy={Boolean(busy)} keyReady={keyReady} selectByText={selectText} create={options => command('create', { options }, 'Создаём варианты…')} exportSvg={() => command('export', {}, 'Экспортируем SVG…')} palettes={availablePalettes} paletteId={paletteId} selectPalette={id => { setPaletteId(id); if (id !== 'draft') setTransientPalette(null); }} managePalettes={openPalettes} applyPalette={(palette, backgroundColor) => command('palette', { palette, backgroundColor })} orderLayers={() => command('order-layers', {}, 'Упорядочиваем слои…')} scene={scene} />}
        </>}
      </>}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
