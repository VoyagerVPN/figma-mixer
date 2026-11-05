import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DraftItem, Item, SetInfo } from './types';
import { ImportWizard } from './ui/ImportWizard';
import { ItemEditor } from './ui/ItemEditor';
import { Preview } from './ui/Preview';
import { analyzeArtwork } from './ui/analyze-artwork';
import { Panel } from './ui/Panel';
import { AISettings } from './ui/AISettings';
import { aiPresets, type AIConfig } from './ai';
import { Icon } from './ui/Icon';
import { builtInPalettes, type NamedPalette, type PaletteDraft } from './palettes';
import { PaletteManager } from './ui/PaletteManager';
import { GenerationStart, type PromptDraft } from './ui/GenerationStart';
import { canvasFormats } from './ui/canvas-formats';
import type { Direction, GenerationInput } from './generation';
import './ui.css';
import './ui/flow.css';
import './ui/chrome.css';

const post = (type: string, payload = {}) => parent.postMessage({ pluginMessage: { type, ...payload } }, '*');
function App() {
  const [sets, setSets] = useState<SetInfo[]>([]), [items, setItems] = useState<Item[]>([]);
  const [view, setView] = useState<'home' | 'libraries' | 'set' | 'import'>('home');
  const [activeId, setActiveId] = useState(''), [targetId, setTargetId] = useState('');
  const importDestination = useRef<'home' | 'set'>('home');
  const importReturn = useRef<'home' | 'libraries' | 'set'>('home');
  const [mergeIds, setMergeIds] = useState<string[]>([]);
  const [mergeName, setMergeName] = useState(''), [editing, setEditing] = useState<Item | null>(null);
  const [draft, setDraft] = useState<DraftItem[]>([]), [canSplit, setCanSplit] = useState(false), [skipped, setSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState('Загружаем наборы…'), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [keyReady, setKeyReady] = useState(false), [settings, setSettings] = useState<'settings' | 'generate' | null>(null);
  const [aiConfig, setAIConfig] = useState<AIConfig>(aiPresets.deepseek);
  const resumeOnIdle = useRef(false);
  const [modelCatalog, setModelCatalog] = useState<string[]>([]), savedModels = useRef<string[]>([]);
  const modelRequests = useRef(new Map<string, { resolve: (models: string[]) => void; reject: (error: Error) => void }>()), modelRequestId = useRef(0);
  const [generation, setGeneration] = useState(0);
  const [palettes, setPalettes] = useState<NamedPalette[]>(builtInPalettes), [paletteId, setPaletteId] = useState('auto'), [paletteOpen, setPaletteOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState<PromptDraft>({
    mode: 'metaphor', query: '', itemQuery: '', format: canvasFormats[0].value, count: 1, detail: 'default', itemStyle: 'balanced', metaphorStyle: 'auto'
  }), [promptResult, setPromptResult] = useState<Direction[]>([]);
  const pendingInput = useRef<GenerationInput | null>(null);
  const keyRequested = useRef(false);
  const [transientPalette, setTransientPalette] = useState<NamedPalette | null>(null);
  const pendingPaletteSave = useRef<{ resolve: (palette: NamedPalette) => void; reject: (error: Error) => void } | null>(null);
  const availablePalettes = transientPalette ? [...palettes, transientPalette] : palettes;
  const activeSet = sets.find(s => s.id === activeId);
  const currentItems = useMemo(() => items.filter(i => i.setId === (activeId || 'starter')), [items, activeId]);
  const previewItems = currentItems.slice(0, 3);
  const [search, setSearch] = useState('');
  const main = useRef<HTMLElement>(null);
  useEffect(() => { if (main.current) main.current.scrollTop = 0; }, [view, editing?.id]);
  useEffect(() => { post('palette-window', { expanded: paletteOpen }); }, [paletteOpen]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const m = event.data?.pluginMessage; if (!m) return;
      if (m.type === 'ai-models') { const pending = modelRequests.current.get(m.requestId); if (pending) { modelRequests.current.delete(m.requestId); if (m.error) pending.reject(new Error(m.error)); else pending.resolve(m.models); } return; }
      if (m.type === 'analyze-artwork') {
        void analyzeArtwork(m.samples).then(profiles => post('artwork-analysis', { requestId: m.requestId, profiles }))
          .catch(error => post('artwork-analysis', { requestId: m.requestId, error: error instanceof Error ? error.message : 'Не удалось проанализировать графику' }));
        return;
      }
      if (m.type === 'catalog') { setSets(m.sets || []); setItems(m.items); if (m.palettes) setPalettes(m.palettes); setKeyReady(m.keyReady); if (m.aiConfig) setAIConfig(m.aiConfig); }
      if (m.type === 'palette-saved') { setTransientPalette(null); setPaletteId(m.id); pendingPaletteSave.current?.resolve(m.palette); pendingPaletteSave.current = null; setNotice('Палитра сохранена в этом файле Figma'); }
      if (m.type === 'error') { pendingPaletteSave.current?.reject(new Error(m.message)); pendingPaletteSave.current = null; pendingInput.current = null; keyRequested.current = false; setSettings(mode => mode === 'generate' ? 'settings' : mode); setError(m.message); setBusy(''); }
      if (m.type === 'needs-key') { keyRequested.current = Boolean(pendingInput.current); setSettings(keyRequested.current ? 'generate' : 'settings'); setBusy(''); }
      if (m.type === 'prompt-result') { pendingInput.current = null; setPromptResult(m.directions); setNotice(m.warnings?.join('. ') || ''); }
      if (m.type === 'idle') { if (resumeOnIdle.current && pendingInput.current) { resumeOnIdle.current = false; command('generate-prompt', { input: pendingInput.current }, 'Подбираем идеи и создаём композиции…'); } else setBusy(''); }
      if (m.type === 'draft') { setDraft(m.items); setCanSplit(m.canSplit); setSkipped(m.skipped); }
      if (m.type === 'saved-set' || m.type === 'open-set') { setActiveId(m.setId); setView(importDestination.current); setPromptResult([]); setGeneration(0); setMergeIds([]); setDraft([]); setNotice(m.type === 'saved-set' ? 'Набор сохранён в этом файле Figma' : ''); }
      if (m.type === 'item-updated') { setEditing(null); setNotice('Карточка элемента сохранена'); }
      if (m.type === 'merged') { setMergeIds([]); setMergeName(''); setNotice('Элементы объединены. Назначьте свойства версий в карточке'); }
      if (m.type === 'notice') setNotice(m.message);
      if (m.type === 'ai-configured') { setModelCatalog(savedModels.current); setAIConfig(m.config); setKeyReady(m.ready); setSettings(null); setNotice('Подключение AI сохранено'); if (m.ready && keyRequested.current && pendingInput.current) { keyRequested.current = false; resumeOnIdle.current = true; } }
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
  function savePalette(palette: PaletteDraft) { return new Promise<NamedPalette>((resolve, reject) => { pendingPaletteSave.current = { resolve, reject }; command('save-palette', { palette }, 'Сохраняем палитру…'); }); }
  function openPalettes() { setPaletteOpen(true); setError(''); }
  function loadModels(config: AIConfig & { apiKey: string }) { return new Promise<string[]>((resolve, reject) => { const requestId = 'models-' + ++modelRequestId.current; modelRequests.current.set(requestId, { resolve, reject }); post('list-ai-models', { requestId, config }); }); }
  function choosePromptPalette(id: string) { if (id === '__manage__') { if (!(activeId || '') && !currentItems.length) { importDestination.current = 'home'; command('starter', {}, 'Готовим библиотеку для предпросмотра…'); } openPalettes(); return; } setPaletteId(id); if (id !== 'draft') setTransientPalette(null); }
  function generatePrompt() {
    const [width, height] = promptDraft.format.split('x').map(Number);
    const input: GenerationInput = {
      mode: promptDraft.mode,
      query: (promptDraft.mode === 'items' ? promptDraft.itemQuery : promptDraft.query).trim(),
      setId: activeId || 'starter',
      palette: paletteId === 'original' ? 'purple' : paletteId,
      paletteSnapshot: paletteId === 'draft' ? transientPalette || undefined : undefined,
      width, height, count: promptDraft.count, detail: promptDraft.detail, variant: generation,
      style: promptDraft.mode === 'items' ? promptDraft.itemStyle : promptDraft.metaphorStyle
    };
    pendingInput.current = input; command('generate-prompt', { input }, 'Подбираем идеи и создаём композиции…'); setGeneration(value => value + promptDraft.count);
  }
  function command(type: string, payload = {}, label = 'Выполняем…') { setError(''); setNotice(''); setBusy(label); post(type, payload); }
  function openSet(id: string) { setActiveId(id); setView('set'); setMergeIds([]); setEditing(null); setSearch(''); setError(''); setNotice(''); }
  function readyLibrary() { importDestination.current = 'set'; command('starter', {}, 'Подготавливаем библиотеку…'); }
  function startImport(id = '', generate = false) { importDestination.current = generate ? 'home' : 'set'; importReturn.current = view === 'set' ? 'set' : view === 'libraries' ? 'libraries' : 'home'; setTargetId(id); setDraft([]); setCanSplit(false); setSkipped([]); setView('import'); setError(''); setNotice(''); }

  return <div className="app">
    <header><div><span className="brand">Mixer</span><span className="version">Композиции из вашей графики</span></div><button className="connection icon-button" disabled={Boolean(busy)} aria-label="Настройки AI" title={keyReady ? 'Модель: ' + aiConfig.model : 'Настройки AI'} onClick={() => setSettings('settings')}><Icon name="settings" /></button></header>
    {paletteOpen && <PaletteManager palettes={availablePalettes} selected={paletteId === 'auto' ? 'purple' : paletteId} items={previewItems} scene={null} busy={Boolean(busy)} error={error} select={usePalette} apply={usePalette} save={savePalette} exportPalette={id => command('export-palette', { id }, 'Экспортируем палитру…')} close={() => setPaletteOpen(false)} />}
    <Panel open={settings !== null} title="Подключение AI" close={() => { pendingInput.current = null; keyRequested.current = false; resumeOnIdle.current = false; setSettings(null); }}>{settings && <AISettings resumeGeneration={settings === 'generate'} initialModels={modelCatalog} loadModels={loadModels} current={aiConfig} ready={keyReady} busy={Boolean(busy)} error={error} save={(config, models) => { savedModels.current = models; command('configure-ai', { config }, 'Сохраняем подключение…'); }} />}</Panel>
    <main ref={main}>
      {error && <div role="alert" className="message error">{error}</div>}
      {notice && <div role="status" className="message">{notice}</div>}
      {busy && <div role="status" className="progress">{busy}</div>}
      {view === 'home' && <GenerationStart sets={sets} setId={activeId || 'starter'} items={currentItems}
        prepareItems={() => command('starter', { stay: true }, 'Загружаем названия предметов…')}
        loadingItems={busy === 'Загружаем названия предметов…'}
        palettes={availablePalettes} paletteId={paletteId} draft={promptDraft} result={promptResult}
        busy={Boolean(busy)} change={setPromptDraft}
        choose={id => { setActiveId(id); setPromptResult([]); }}
        choosePalette={choosePromptPalette} generate={generatePrompt} exportSvg={() => command('export', {}, 'Экспортируем SVG…')} own={() => startImport('', true)}
        manage={() => setView('libraries')} finish={() => post('close')} />}
      {view === 'libraries' && <>
        <button className="back" onClick={() => setView('home')}><Icon name="arrow" />К генерации</button>
        <section className="home-intro"><h1>Библиотеки</h1><p className="intro">Объедините элементы в набор, затем создавайте из них варианты композиций.</p><div className="action-row"><button className="primary with-icon" disabled={Boolean(busy)} onClick={() => startImport()}><Icon name="plus" />Создать набор</button><button className="with-icon" disabled={Boolean(busy)} onClick={() => { startImport(); command('capture-selection', {}, 'Читаем выделение…'); }}><Icon name="selection" />Из выделения Figma</button></div></section>
        {!sets.length && <div className="empty-state"><h2>Ваш первый набор</h2><p>Добавьте целые объекты из Figma или несколько SVG-файлов.</p><button disabled={Boolean(busy)} onClick={() => readyLibrary()}>Попробовать на стартовом наборе</button></div>}
        <div className="set-list">{sets.map(set => { const group = items.filter(i => i.setId === set.id); return <button className="set-card" key={set.id} onClick={() => openSet(set.id)} disabled={Boolean(busy)}><div className="set-previews">{group.slice(0, 3).map(item => <Preview key={item.id} svg={item.preview} />)}</div><div><strong>{set.name}</strong><span>Элементов: {group.length}</span></div><Icon name="chevron" /></button>; })}</div>
        {sets.length > 0 && !sets.some(s => s.id === 'starter') && <button className="link-button" onClick={() => readyLibrary()}>Открыть стартовый набор</button>}
        <p className="hint">Наборы хранятся внутри этого файла Figma. Для переноса используйте экспорт набора.</p>
      </>}
      {view === 'import' && <ImportWizard key="import" forGeneration={importDestination.current !== 'set'} sets={sets} items={draft} targetId={targetId} setItems={setDraft} setTargetId={setTargetId} busy={Boolean(busy)} canSplit={canSplit} skipped={skipped} capture={split => command('capture-selection', { split, fresh: !split }, 'Читаем выделение…')} highlight={nodeId => command('highlight', { nodeId })} save={(name, items, setId) => command('save-set', { name, items, setId }, 'Сохраняем набор…')} cancel={() => { setView(importReturn.current); setDraft([]); setError(''); }} reportError={setError} />}
      {view === 'set' && activeSet && <>
        {editing ? <ItemEditor key={editing.id} item={editing} busy={Boolean(busy)} cancel={() => setEditing(null)} save={(name, variants) => command('update-item', { id: editing.id, name, variants }, 'Сохраняем карточку…')} /> : <>
          <div className="set-context"><button className="back" onClick={() => { setView('libraries'); setNotice(''); setError(''); }}><Icon name="arrow" />Библиотеки</button><h1>{activeSet.name}</h1><button className="text-button" disabled={Boolean(busy)} onClick={() => startImport(activeId)}><Icon name="plus" />Добавить</button></div>
          <>
            <label className="search-label"><span className="with-icon"><Icon name="search" />Поиск</span><input placeholder="Название предмета" value={search} onChange={e => setSearch(e.target.value)} /></label>
            {mergeIds.length > 1 && <section className="merge-panel"><label>Общее название элемента<input value={mergeName} onChange={e => setMergeName(e.target.value)} maxLength={100} placeholder="Например, лампа" /></label><button disabled={!mergeName.trim() || Boolean(busy)} className="with-icon" onClick={() => command('merge-items', { ids: mergeIds, name: mergeName }, 'Объединяем варианты…')}><Icon name="layers" />Объединить как варианты</button><p className="hint">Графика сохранится. Выбранные карточки станут версиями одного элемента.</p></section>}
            <div className="library-grid">{currentItems.filter(i => i.name.toLowerCase().includes(search.toLowerCase())).map(item => <article key={item.id} className="library-card"><label className="card-check"><input type="checkbox" aria-label={'Объединить ' + item.name} checked={mergeIds.includes(item.id)} onChange={() => setMergeIds(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} /></label><button className="preview-button" onClick={() => setEditing(item)} aria-label={'Открыть элемент ' + item.name}><Preview svg={item.preview} /><strong>{item.name}</strong></button><span className="hint">{item.variants.length > 1 ? `Вариантов: ${item.variants.length}` : 'Один вариант'}</span><button className="link-button" onClick={() => setEditing(item)}><Icon name="edit" />Настроить элемент</button></article>)}</div>
            <p className="hint">Чтобы объединить версии одного предмета, отметьте две или более карточки.</p><div className="action-row"><button className="with-icon" disabled={Boolean(busy)} onClick={() => command('export-set', { setId: activeId }, 'Экспортируем набор…')}><Icon name="download" />Экспорт набора</button><button className="primary with-icon" disabled={!currentItems.length} onClick={() => { setView('home'); setPromptResult([]); }}><Icon name="composition" />Создать композицию</button></div>
          </>
        </>}
      </>}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
