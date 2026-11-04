import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LayerEditor } from '../src/ui/LayerEditor';
import { Panel } from '../src/ui/Panel';
import { Composer } from '../src/ui/Composer';
import type { Item, SceneOptions } from '../src/types';
import type { LayerStack } from '../src/layers';
import '../src/ui.css';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><path d="M5 20L45 5L75 35L35 55Z" fill="#ddd5f2" stroke="#333"/></svg>';
const basic = [{ id: 'book', name: 'Книга' }, { id: 'phone', name: 'Телефон' }, { id: 'pen', name: 'Ручка' }];
const large = new URLSearchParams(location.search).has('large');
const items: Item[] = (large ? Array.from({ length: 60 }, (_, i) => ({ id: `item-${i}`, name: `Элемент ${i + 1}` })) : basic).map(item => ({ ...item, setId: 'test', description: '', origin: 'custom', preview: svg, variants: [{ detail: 'default', role: 'main', nodeId: item.id, width: 80, height: 60 }, ...(item.id === 'pen' ? [] : [{ detail: 'default' as const, role: 'background' as const, nodeId: item.id + '-bg', width: 80, height: 60 }])] }));
function Fixture() {
  const [state, setState] = useState<LayerStack>({ background: [], main: items.map(item => item.id), heroId: items[0].id, manual: false });
  const [open, setOpen] = useState(true), [selected, setSelected] = useState(items.map(item => item.id)), [payload, setPayload] = useState<SceneOptions | null>(null);
  if (new URLSearchParams(location.search).has('composer')) return <div className="app"><main><Composer items={items} selected={selected} toggle={id => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])} busy={false} keyReady={false} selectByText={() => {}} create={setPayload} exportSvg={() => {}} applyPalette={() => {}} orderLayers={() => {}} scene="" /><output data-testid="payload">{JSON.stringify(payload)}</output></main></div>;
  return <div className="app"><Panel open={open} title="Слои композиции" close={() => setOpen(false)}><LayerEditor items={items} value={state} onChange={setState} close={() => setOpen(false)} /></Panel></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
