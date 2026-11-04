export type LayerGroup = 'background' | 'main';
export type LayerItem = { id: string; canBackground: boolean };
export type LayerStack = { background: string[]; main: string[]; heroId: string; manual: boolean };
export type LayerTarget = { group: LayerGroup; index: number };

export function reconcileLayers(state: LayerStack, items: readonly LayerItem[]): LayerStack {
  const ids = new Set(items.map(item => item.id)), seen = new Set<string>();
  const keep = (id: string) => { if (!ids.has(id) || seen.has(id)) return false; seen.add(id); return true; };
  const background = state.background.filter(id => items.some(item => item.id === id && item.canBackground)).filter(keep), main = state.main.filter(keep);
  for (const item of items) if (!seen.has(item.id)) { main.push(item.id); seen.add(item.id); }
  return { background, main, heroId: main.includes(state.heroId) ? state.heroId : '', manual: state.manual };
}

export function moveLayer(state: LayerStack, items: readonly LayerItem[], id: string, target: LayerTarget): LayerStack {
  const stack = reconcileLayers(state, items);
  const item = items.find(item => item.id === id);
  if (!item || target.group === 'background' && !item.canBackground || !Number.isInteger(target.index)) return state;
  const previousIndex = stack[target.group].indexOf(id);
  const background = stack.background.filter(value => value !== id), main = stack.main.filter(value => value !== id);
  const list = target.group === 'background' ? background : main;
  const index = Math.max(0, Math.min(list.length, target.index - (previousIndex >= 0 && previousIndex < target.index ? 1 : 0)));
  list.splice(index, 0, id);
  return { background, main, heroId: target.group === 'background' && stack.heroId === id ? '' : stack.heroId, manual: true };
}
