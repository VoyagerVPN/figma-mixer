import { PaletteStore } from '../src/palette-store';
import library from '../src/assets/library.json';
import '../src/ui';

// Граница Figma ↔ iframe: тот же документный store, транспорт заменён браузерными сообщениями.
const store = new PaletteStore({ getPluginData: key => localStorage.getItem(key) || '', setPluginData: (key, value) => localStorage.setItem(key, value) });
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
let created = false;
const catalog = () => send({ type: 'catalog', sets: [{ id: 'starter', name: 'Стартовый набор' }], items, palettes: store.all(), keyReady: false });
window.addEventListener('message', event => {
  const m = event.data?.pluginMessage;
  if (m?.type === 'ready') catalog();
  if (m?.type === 'preview-palette') { send({ type: 'palette-preview', preview: created ? { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#D7CDF5"/><path d="M100 100H900V500H100Z" fill="#F9ECB0"/></svg>', name: 'Композиция', backgroundIndex: 0 } : null }); send({ type: 'idle' }); }
  if (m?.type === 'save-palette') {
    try { const saved = store.save(m.palette); catalog(); send({ type: 'palette-saved', id: saved.id }); }
    catch (error) { send({ type: 'error', message: String(error) }); }
    send({ type: 'idle' });
  }
  if (m?.type === 'export-palette') { send({ type: 'download', name: 'mixer-palette.json', data: store.export(m.id), mime: 'application/json' }); send({ type: 'idle' }); }
  if (m?.type === 'palette') { document.documentElement.dataset.applied = JSON.stringify(m); send({ type: 'palette-applied' }); send({ type: 'idle' }); }
  if (m?.type === 'create') { created = true;
    document.documentElement.dataset.created = JSON.stringify(m.options);
    send({ type: 'scene', variants: m.options.count, width: m.options.width, height: m.options.height }); send({ type: 'idle' });
  }
});
