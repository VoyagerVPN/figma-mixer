import { Library } from './library';
import { SceneRenderer } from './scene';
import { selectWithDeepSeek } from './deepseek';
import { ArtworkChannel } from './artwork-channel';

declare const __html__: string;
const library = new Library();
const renderer = new SceneRenderer();
let apiKey = '', busy = false, initialized = false;
const send = (message: unknown) => figma.ui.postMessage(message);
const artwork = new ArtworkChannel(send);
const catalog = () => send({ type: 'catalog', sets: library.sets, items: library.items, keyReady: Boolean(apiKey) });
figma.showUI(__html__, { width: 520, height: 840, themeColors: true });

figma.ui.onmessage = async message => {
  if (message.type === 'artwork-analysis') { artwork.receive(message); return; }
  if (message.type === 'ready') { if (initialized) catalog(); return; }
  if (message.type === 'key') { apiKey = String(message.key || '').trim(); send({ type: 'key-ready', ready: Boolean(apiKey) }); return; }
  if (busy) { send({ type: 'error', message: 'Дождитесь завершения текущей операции' }); return; }
  busy = true;
  try {
    if (message.type === 'capture-selection') send({ type: 'draft', ...await library.captureSelection(Boolean(message.split), message.fresh !== false) });
    if (message.type === 'highlight') await library.highlight(message.nodeId);
    if (message.type === 'save-set') {
      const set = await library.save(message.name, message.items, message.setId);
      catalog(); send({ type: 'saved-set', setId: set.id });
    }
    if (message.type === 'starter') { const set = await library.starter(); catalog(); send({ type: 'open-set', setId: set.id }); }
    if (message.type === 'update-item') { await library.update(message.id, message.name, message.description, message.variants); catalog(); send({ type: 'item-updated' }); }
    if (message.type === 'merge-items') { await library.merge(message.ids, message.name); catalog(); send({ type: 'merged' }); }
    if (message.type === 'create') send({ type: 'scene', ...await renderer.create(message.options, library.items, samples => artwork.analyze(samples)) });
    if (message.type === 'order-layers') {
      const count = renderer.reorder(library.items);
      send({ type: 'layer-order', count });
      send({ type: 'notice', message: `Порядок слоёв обновлён. Композиций: ${count}. Расположение предметов сохранено` });
    }
    if (message.type === 'palette') { renderer.applyPalette(message.palette); send({ type: 'notice', message: 'Палитра применена. Расположение объектов сохранено' }); }
    if (message.type === 'export') send({ type: 'download', name: 'mixer-composition.svg', data: await renderer.export(), mime: 'image/svg+xml' });
    if (message.type === 'export-set') send({ type: 'download', name: 'mixer-library.json', data: await library.exportSet(message.setId), mime: 'application/json' });
    if (message.type === 'ai') {
      const items = library.items.filter(i => i.setId === message.setId);
      if (!items.length || !String(message.query || '').trim()) throw new Error('Выберите набор и введите описание композиции');
      send({ type: 'selection', ...await selectWithDeepSeek(message.query, items, apiKey) });
    }
  } catch (error) { send({ type: 'error', message: error instanceof Error ? error.message : 'Не удалось выполнить действие' }); }
  finally { busy = false; send({ type: 'idle' }); }
};
busy = true;
library.init().then(() => { initialized = true; catalog(); }).catch(error => send({ type: 'error', message: String(error) })).finally(() => { busy = false; send({ type: 'idle' }); });
