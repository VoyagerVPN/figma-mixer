import { PaletteStore } from '../src/palette-store';
import library from '../src/assets/library.json';
import { generateCompositions } from '../src/generation';
import { resolveItemMentions } from '../src/core';
import { AIKeyRequired, aiPresets, configureAI, listAIModels, publicAI, validateAIConfig } from '../src/ai';
import '../src/ui';

// Граница Figma ↔ iframe: тот же документный store, транспорт заменён браузерными сообщениями.
const store = new PaletteStore({ getPluginData: key => localStorage.getItem(key) || '', setPluginData: (key, value) => localStorage.setItem(key, value) });
if (new URLSearchParams(location.search).has('palette-many') && !store.all().some(p => p.name === 'Набор 01')) {
  for (let i = 1; i <= 24; i++) store.save({ ...store.all()[0], id: undefined, name: 'Набор ' + String(i).padStart(2, '0') });
}
function preview(svg: string) {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = window.document.importNode(document.documentElement, true) as unknown as SVGSVGElement;
  root.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'; window.document.body.append(root);
  const bounds = root.getBBox(); root.remove();
  document.documentElement.setAttribute('viewBox', `${bounds.x - 4} ${bounds.y - 4} ${bounds.width + 8} ${bounds.height + 8}`);
  return { svg: new XMLSerializer().serializeToString(document), width: bounds.width + 8, height: bounds.height + 8 };
}
const items = library.map(item => {
  const source = preview(item.variants[0].svg);
  return { ...item, setId: 'starter', preview: source.svg, variants: item.variants.map((v, i) => ({ ...v, nodeId: item.id + i, width: source.width, height: source.height })) };
});
const send = (message: unknown) => window.postMessage({ pluginMessage: message }, '*');
let starterPresent = !new URLSearchParams(location.search).has('empty');
let imported: typeof items = [], importedName = '';
let createFailed = false;
let keyReady = new URLSearchParams(location.search).has('connected');
const savedAI = localStorage.getItem('mixer-ai-config-v1');
let connection = { ...(savedAI ? validateAIConfig(JSON.parse(savedAI)) : aiPresets.deepseek), apiKey: keyReady ? 'test-key' : '' };
const catalog = () => send({ type: 'catalog', sets: [...(starterPresent ? [{ id: 'starter', name: 'Стартовый набор' }] : []), ...(importedName ? [{ id: 'imported', name: importedName }] : [])], items: [...(starterPresent ? items : []), ...imported], palettes: store.all(), keyReady, aiConfig: publicAI(connection) });
window.addEventListener('message', event => {
  const m = event.data?.pluginMessage;
  if (m?.type === 'palette-window') document.documentElement.dataset.paletteWindow = String(m.expanded);
  if (m?.type === 'close') document.documentElement.dataset.closed = 'true';
  if (m?.type === 'ready') { catalog(); send({ type: 'idle' }); }
  if (m?.type === 'list-ai-models') void (async () => {
    try {
      const models = await listAIModels(m.config, connection, async (url, options) => {
        document.documentElement.dataset.modelsRequest = JSON.stringify({ url, method: options?.method });
        if (new URLSearchParams(location.search).has('slow-model-list')) await new Promise(done => setTimeout(done, 200));
        if (new URLSearchParams(location.search).has('model-list-error')) return new Response('', { status: 404 });
        return new Response(JSON.stringify({ data: [{ id: 'model-alpha' }, { id: 'model-beta' }] }));
      });
      send({ type: 'ai-models', requestId: m.requestId, models });
    } catch (error) { send({ type: 'ai-models', requestId: m.requestId, error: error instanceof Error ? error.message : String(error) }); }
    finally { document.documentElement.dataset.modelsDone = m.requestId; }
  })();
  if (m?.type === 'configure-ai') { try { connection = configureAI(m.config, connection); keyReady = Boolean(connection.apiKey); localStorage.setItem('mixer-ai-config-v1', JSON.stringify(publicAI(connection))); send({ type: 'ai-configured', config: publicAI(connection), ready: keyReady }); } catch (error) { send({ type: 'error', message: String(error) }); } send({ type: 'idle' }); }
  if (m?.type === 'generate-prompt') void (async () => {
    try {
      if (m.input.setId === 'starter') { starterPresent = true; catalog(); }
      const selected = m.input.setId === 'starter' ? items : imported;
      const result = await generateCompositions(m.input, selected, store.all(), connection, {
        create: async options => {
          if (new URLSearchParams(location.search).has('create-error') && !createFailed) {
            createFailed = true;
            throw new Error('Тестовая ошибка генерации');
          }
          document.documentElement.dataset.created = JSON.stringify(options); return { frameIds: ['frame-' + options.variant] }; },
        removeGenerated: async () => {}
      }, async (url, options) => {
        document.documentElement.dataset.aiRequest = JSON.stringify({ url, body: JSON.parse(String(options?.body)) });
        const required: string[] = [...(m.input.requiredItemIds || []), ...resolveItemMentions(m.input.query, selected).ids];
        const combinations: string[][] = [];
        for (let a = 0; a < selected.length; a++) for (let b = a + 1; b < selected.length; b++) combinations.push([selected[a].id, selected[b].id]);
        combinations.push(...selected.map(item => [item.id]));
        const eligible = combinations.map(ids => [...new Set([...required, ...ids])].slice(0, 8));
        const candidates = m.input.palette === 'auto' ? store.all() : [{ id: m.input.palette }];
        const directions = Array.from({ length: m.input.count }, (_, index) => ({ title: 'Идея ' + (index + 1), ids: eligible[index % eligible.length], palette: candidates[index % candidates.length].id, backgroundIndex: index % 3, style: 'balanced', heroId: '', backgroundIds: [], explanation: 'Предметы раскрывают тему с разных сторон.' }));
        if (new URLSearchParams(location.search).has('ai-error')) directions[0].ids = ['invented'];
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ directions }) } }] }));
      });
      document.documentElement.dataset.promptResult = JSON.stringify(result); send({ type: 'prompt-result', ...result });
    } catch (error) { send({ type: error instanceof AIKeyRequired ? 'needs-key' : 'error', message: error instanceof Error ? error.message : String(error) }); }
    finally { send({ type: 'idle' }); }
  })();
  if (m?.type === 'starter') { starterPresent = true; catalog(); if (!m.stay) send({ type: 'open-set', setId: 'starter' }); send({ type: 'idle' }); }
  if (m?.type === 'save-set') {
    importedName = m.name;
    imported = m.items.map((item: any, index: number) => ({ ...item, id: 'imported-' + index, origin: 'custom', setId: 'imported', variants: item.variants.map((v: any) => ({ ...v, nodeId: 'imported-' + index, width: 80, height: 80 })) }));
    catalog(); send({ type: 'saved-set', setId: 'imported' }); send({ type: 'idle' });
  }
  if (m?.type === 'save-palette') {
    try { if (new URLSearchParams(location.search).has('palette-save-error')) throw new Error('Тестовая ошибка сохранения палитры'); const saved = store.save(m.palette); catalog(); send({ type: 'palette-saved', id: saved.id, palette: saved }); }
    catch (error) { send({ type: 'error', message: String(error) }); }
    send({ type: 'idle' });
  }
  if (m?.type === 'export' && document.documentElement.dataset.promptResult) {
    send({ type: 'download', name: 'mixer-composition.svg', data: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1Z"/></svg>', mime: 'image/svg+xml' });
    send({ type: 'idle' });
  }
  if (m?.type === 'export-palette') { send({ type: 'download', name: 'mixer-palette.json', data: store.export(m.id), mime: 'application/json' }); send({ type: 'idle' }); }
  if (m?.type === 'palette') { document.documentElement.dataset.applied = JSON.stringify(m); send({ type: 'palette-applied' }); send({ type: 'idle' }); }
});
