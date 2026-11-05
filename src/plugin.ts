import { Library } from './library';
import { SceneRenderer } from './scene';
import { AIKeyRequired, aiPresets, configureAI, listAIModels, publicAI, validateAIConfig, type AIConnection } from './ai';
import { ArtworkChannel } from './artwork-channel';
import { PaletteStore } from './palette-store';
import { generateCompositions } from './generation';
import type { CompositionSelection, SceneOptions } from './types';

declare const __html__: string;
const library = new Library();
const palettes = new PaletteStore(figma.root);
const renderer = new SceneRenderer(() => palettes.all());
let connection: AIConnection = { ...aiPresets.deepseek, apiKey: '' };
let busy = false, initialized = false;
const send = (message: unknown) => figma.ui.postMessage(message);
const artwork = new ArtworkChannel(send);
const catalog = () => send({ type: 'catalog', sets: library.sets, items: library.items, palettes: palettes.all(), keyReady: Boolean(connection.apiKey), aiConfig: publicAI(connection) });
const windowSize = { width: 640, height: 720 };
figma.showUI(__html__, { ...windowSize, themeColors: true });

let recentIds: string[] = [], thumbnailVersion = 0;
let previewIds: string[] | null = null;
let thumbnailTimer: ReturnType<typeof setTimeout> | undefined;
const describe = (frame: FrameNode): CompositionSelection => {
  try {
    const options = JSON.parse(frame.getPluginData('mixer-scene')) as SceneOptions;
    return { id: frame.id, name: frame.name, paletteId: options.palette, paletteKey: renderer.paletteKeyFor(frame), paletteSnapshot: options.paletteSnapshot };
  } catch {
    return { id: frame.id, name: frame.name, paletteId: 'original', paletteKey: null };
  }
};
const sendSelection = () => send({ type: 'composition-selection', frames: renderer.selectedFrames().map(describe) });
figma.on('selectionchange', () => {
  if (previewIds && !targetsMatch(previewIds)) cancelPalettePreview();
  watchPage(figma.currentPage);
  sendSelection();
});
figma.on('close', () => renderer.clearPalettePreview());

async function refreshThumbnails() {
  if (previewIds) return;
  const version = ++thumbnailVersion;
  const frames = await Promise.all(recentIds.map(id => figma.getNodeByIdAsync(id)));
  const results = await Promise.all(frames.filter((frame): frame is FrameNode => frame?.type === 'FRAME' && !frame.removed)
    .map(async frame => ({ id: frame.id, name: frame.name, image: await renderer.thumbnail(frame).catch(() => '') })));
  if (version === thumbnailVersion && !previewIds) send({ type: 'composition-thumbnails', results });
}

function queueThumbnails() {
  clearTimeout(thumbnailTimer);
  thumbnailTimer = setTimeout(() => { void refreshThumbnails().catch(() => {}); }, 150);
}

function targetsMatch(ids: string[], frames = renderer.selectedFrames()) {
  return Array.isArray(ids) && ids.length > 0 && ids.length === frames.length && frames.every(frame => ids.includes(frame.id));
}

function matchTargets(ids: string[]) {
  const frames = renderer.selectedFrames();
  if (!targetsMatch(ids, frames)) throw new Error('Выделение изменилось. Откройте перекраску снова.');
  return frames;
}

function cancelPalettePreview() {
  if (!previewIds) return;
  previewIds = null;
  renderer.clearPalettePreview();
  queueThumbnails();
}

function handleResultChanges(event: NodeChangeEvent) {
  if (previewIds) return;
  const changed = new Set(event.nodeChanges.flatMap(change => {
    const frame = 'parent' in change.node ? renderer.composition(change.node) : null;
    return [change.id, frame?.id];
  }));
  if (recentIds.some(id => changed.has(id)) || event.nodeChanges.some(change => change.type === 'DELETE')) queueThumbnails();
  if (renderer.selectedFrames().some(frame => changed.has(frame.id))) sendSelection();
}

let watchedPage: PageNode | undefined;
function watchPage(page: PageNode) {
  if (watchedPage === page) return;
  watchedPage?.off('nodechange', handleResultChanges);
  watchedPage = page;
  page.on('nodechange', handleResultChanges);
}

figma.ui.onmessage = async message => {
  if (message.type === 'palette-window') { figma.ui.resize(message.expanded ? 760 : windowSize.width, message.expanded ? 900 : windowSize.height); return; }
  if (message.type === 'list-ai-models') {
    try { send({ type: 'ai-models', requestId: message.requestId, models: await listAIModels(message.config, connection) }); }
    catch (error) { send({ type: 'ai-models', requestId: message.requestId, error: error instanceof Error ? error.message : 'Не удалось получить список моделей' }); }
    return;
  }
  if (message.type === 'artwork-analysis') { artwork.receive(message); return; }
  if (message.type === 'ready') { if (initialized) { catalog(); sendSelection(); if (!busy) send({ type: 'idle' }); } return; }
  if (message.type === 'cancel-palette-preview') { cancelPalettePreview(); return; }
  if (message.type === 'preview-palette') {
    if (busy) return;
    try {
      const frames = matchTargets(message.ids);
      renderer.previewPalette(message.palette, frames);
      const firstPreview = !previewIds;
      previewIds = message.ids;
      if (firstPreview && frames.length > 1) figma.viewport.scrollAndZoomIntoView(frames);
      send({ type: 'canvas-preview' });
    } catch (error) {
      cancelPalettePreview();
      send({ type: 'canvas-preview', error: error instanceof Error ? error.message : 'Предпросмотр недоступен' });
    }
    return;
  }
  if (busy) return;
  busy = true;
  try {
    cancelPalettePreview();
    if (message.type === 'configure-ai') { const next = configureAI(message.config, connection); await figma.clientStorage.setAsync('mixer-ai-config-v1', publicAI(next)); connection = next; send({ type: 'ai-configured', config: publicAI(connection), ready: true }); }
    if (message.type === 'generate-prompt') {
      const input = message.input;
      if (input.setId === 'starter' && !library.sets.some(set => set.id === 'starter')) { await library.starter(); catalog(); }
      const result = await generateCompositions(input, library.items.filter(item => item.setId === input.setId), palettes.all(), connection, {
        create: options => renderer.create(options, library.items, samples => artwork.analyze(samples)),
        removeGenerated: ids => renderer.removeGenerated(ids)
      });
      const frames = (await Promise.all(result.frameIds.map(id => figma.getNodeByIdAsync(id)))).filter((node): node is FrameNode => node?.type === 'FRAME');
      recentIds = frames.map(frame => frame.id);
      thumbnailVersion++;
      if (frames.length) {
        figma.currentPage.selection = frames.slice(0, 1);
        figma.viewport.scrollAndZoomIntoView(frames);
        watchPage(figma.currentPage);
      }
      figma.commitUndo();
      send({ type: 'prompt-result', ...result, results: frames.map(frame => ({ id: frame.id, name: frame.name, image: '' })) });
      sendSelection();
      queueThumbnails();
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
    if (message.type === 'select-composition') {
      const frame = recentIds.includes(message.id) ? await figma.getNodeByIdAsync(message.id) : null;
      if (!frame || frame.type !== 'FRAME' || frame.removed || !renderer.composition(frame)) {
        queueThumbnails();
        throw new Error('Эта композиция удалена или недоступна');
      }
      let page: BaseNode | null = frame.parent;
      while (page && page.type !== 'PAGE') page = page.parent;
      if (page?.type !== 'PAGE') throw new Error('Страница композиции недоступна');
      if (page !== figma.currentPage) await figma.setCurrentPageAsync(page);
      const selected = message.toggle ? renderer.selectedFrames() : [];
      const next = selected.includes(frame) ? selected.filter(node => node !== frame) : [...selected, frame];
      figma.currentPage.selection = next;
      if (!message.toggle) figma.viewport.scrollAndZoomIntoView([frame]);
      sendSelection();
    }
    if (message.type === 'save-palette') {
      const saved = palettes.save(message.palette);
      figma.commitUndo(); catalog(); send({ type: 'palette-saved', id: saved.id, palette: saved });
    }
    if (message.type === 'export-palette') send({ type: 'download', name: 'mixer-palette.json', data: palettes.export(message.id), mime: 'application/json' });
    if (message.type === 'palette') {
      renderer.applyPalette(message.palette, undefined, matchTargets(message.ids));
      send({ type: 'palette-applied' });
      sendSelection();
      queueThumbnails();
    }
    if (message.type === 'export') {
      if (renderer.selectedFrames().length !== 1) throw new Error('Выберите одну композицию для экспорта');
      send({ type: 'download', name: 'mixer-composition.svg', data: await renderer.export(), mime: 'image/svg+xml' });
    }
    if (message.type === 'export-set') send({ type: 'download', name: 'mixer-library.json', data: await library.exportSet(message.setId), mime: 'application/json' });
  } catch (error) { send({ type: error instanceof AIKeyRequired ? 'needs-key' : 'error', message: error instanceof Error ? error.message : 'Не удалось выполнить действие' }); }
  finally { busy = false; send({ type: 'idle' }); }
};
busy = true;
Promise.all([library.init(), figma.clientStorage.getAsync('mixer-ai-config-v1').then(saved => { if (saved) connection = { ...validateAIConfig(saved), apiKey: '' }; })]).then(() => { initialized = true; watchPage(figma.currentPage); catalog(); sendSelection(); }).catch(error => send({ type: 'error', message: String(error) })).finally(() => { busy = false; send({ type: 'idle' }); });
