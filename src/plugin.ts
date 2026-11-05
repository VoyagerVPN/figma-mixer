import { Library } from './library';
import { SceneRenderer } from './scene';
import { AIKeyRequired, aiPresets, configureAI, listAIModels, publicAI, selectWithAI, validateAIConfig, type AIConnection } from './ai';
import { ArtworkChannel } from './artwork-channel';
import { PaletteStore } from './palette-store';
import { generateCompositions } from './generation';

declare const __html__: string;
const library = new Library();
const palettes = new PaletteStore(figma.root);
const renderer = new SceneRenderer(() => palettes.all());
let connection: AIConnection = { ...aiPresets.deepseek, apiKey: '' };
let busy = false, initialized = false;
const send = (message: unknown) => figma.ui.postMessage(message);
const artwork = new ArtworkChannel(send);
const catalog = () => send({ type: 'catalog', sets: library.sets, items: library.items, palettes: palettes.all(), keyReady: Boolean(connection.apiKey), aiConfig: publicAI(connection) });
figma.showUI(__html__, { width: 520, height: 840, themeColors: true });

figma.ui.onmessage = async message => {
  if (message.type === 'palette-window') { figma.ui.resize(message.expanded ? 760 : 520, message.expanded ? 900 : 840); return; }
  if (message.type === 'list-ai-models') {
    try { send({ type: 'ai-models', requestId: message.requestId, models: await listAIModels(message.config, connection) }); }
    catch (error) { send({ type: 'ai-models', requestId: message.requestId, error: error instanceof Error ? error.message : 'Не удалось получить список моделей' }); }
    return;
  }
  if (message.type === 'close' && !busy) { figma.closePlugin(); return; }
  if (message.type === 'artwork-analysis') { artwork.receive(message); return; }
  if (message.type === 'ready') { if (initialized) { catalog(); if (!busy) send({ type: 'idle' }); } return; }
  if (busy) { send({ type: 'error', message: 'Дождитесь завершения текущей операции' }); return; }
  busy = true;
  try {
    if (message.type === 'configure-ai') { const next = configureAI(message.config, connection); await figma.clientStorage.setAsync('mixer-ai-config-v1', publicAI(next)); connection = next; send({ type: 'ai-configured', config: publicAI(connection), ready: true }); }
    if (message.type === 'generate-prompt') {
      const input = message.input;
      if (input.setId === 'starter' && !library.sets.some(set => set.id === 'starter')) { await library.starter(); catalog(); }
      const result = await generateCompositions(input, library.items.filter(item => item.setId === input.setId), palettes.all(), connection, {
        create: options => renderer.create(options, library.items, samples => artwork.analyze(samples)),
        removeGenerated: ids => renderer.removeGenerated(ids)
      });
      const frames = (await Promise.all(result.frameIds.map(id => figma.getNodeByIdAsync(id)))).filter((node): node is FrameNode => node?.type === 'FRAME');
      figma.currentPage.selection = frames; figma.viewport.scrollAndZoomIntoView(frames); figma.commitUndo();
      send({ type: 'prompt-result', ...result });
    }
    if (message.type === 'capture-selection') send({ type: 'draft', ...await library.captureSelection(Boolean(message.split), message.fresh !== false) });
    if (message.type === 'highlight') await library.highlight(message.nodeId);
    if (message.type === 'save-set') {
      const set = await library.save(message.name, message.items, message.setId);
      catalog(); send({ type: 'saved-set', setId: set.id });
    }
    if (message.type === 'starter') {
      const set = await library.starter();
      catalog();
      if (!message.stay) send({ type: 'open-set', setId: set.id });
    }
    if (message.type === 'update-item') { await library.update(message.id, message.name, message.variants); catalog(); send({ type: 'item-updated' }); }
    if (message.type === 'merge-items') { await library.merge(message.ids, message.name); catalog(); send({ type: 'merged' }); }
    if (message.type === 'create') send({ type: 'scene', ...await renderer.create(message.options, library.items, samples => artwork.analyze(samples)) });
    if (message.type === 'preview-palette') send({ type: 'palette-preview', preview: await renderer.previewPalette() });
    if (message.type === 'order-layers') {
      const count = renderer.reorder(library.items);
      send({ type: 'layer-order', count });
      send({ type: 'notice', message: `Порядок слоёв обновлён. Композиций: ${count}. Расположение предметов сохранено` });
    }
    if (message.type === 'save-palette') {
      const saved = palettes.save(message.palette);
      figma.commitUndo(); catalog(); send({ type: 'palette-saved', id: saved.id, palette: saved });
    }
    if (message.type === 'export-palette') send({ type: 'download', name: 'mixer-palette.json', data: palettes.export(message.id), mime: 'application/json' });
    if (message.type === 'palette') { renderer.applyPalette(message.palette, message.backgroundColor); send({ type: 'palette-applied' }); send({ type: 'notice', message: 'Палитра применена. Расположение объектов сохранено' }); }
    if (message.type === 'export') send({ type: 'download', name: 'mixer-composition.svg', data: await renderer.export(), mime: 'image/svg+xml' });
    if (message.type === 'export-set') send({ type: 'download', name: 'mixer-library.json', data: await library.exportSet(message.setId), mime: 'application/json' });
    if (message.type === 'ai') {
      const items = library.items.filter(i => i.setId === message.setId);
      if (!items.length || !String(message.query || '').trim()) throw new Error('Выберите набор и введите описание композиции');
      send({ type: 'selection', ...await selectWithAI(message.query, items, connection) });
    }
  } catch (error) { send({ type: error instanceof AIKeyRequired ? 'needs-key' : 'error', message: error instanceof Error ? error.message : 'Не удалось выполнить действие' }); }
  finally { busy = false; send({ type: 'idle' }); }
};
busy = true;
Promise.all([library.init(), figma.clientStorage.getAsync('mixer-ai-config-v1').then(saved => { if (saved) connection = { ...validateAIConfig(saved), apiKey: '' }; })]).then(() => { initialized = true; catalog(); }).catch(error => send({ type: 'error', message: String(error) })).finally(() => { busy = false; send({ type: 'idle' }); });
