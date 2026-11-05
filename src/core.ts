import { composeScene, type CompositionItem } from './composition';
export { sceneLayerOrder } from './scene-order';
export type { SceneLayer } from './scene-order';
export type CatalogItem = { id: string; name: string };
export function validateSelection(value: unknown, catalog: CatalogItem[]) {
  const result = value as { ids?: unknown; explanation?: unknown };
  if (!result || !Array.isArray(result.ids) || !result.ids.length || result.ids.length > 8) throw new Error('Модель вернула некорректный набор предметов');
  if (result.ids.some(id => typeof id !== 'string' || !catalog.some(item => item.id === id))) throw new Error('Модель вернула неизвестный предмет');
  return { ids: [...new Set(result.ids)] as string[], explanation: typeof result.explanation === 'string' ? result.explanation.slice(0, 700) : '' };
}
export const normalizeItemName = (value: string) => value.toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();

const backgroundSuffix = /[ \t]*\([ \t]*фон[ \t]*\)$/iu;

export function itemListName(name: string, background = false) {
  const entry = /[,;\n]/.test(name) || name.startsWith('"') || backgroundSuffix.test(name) ? JSON.stringify(name) : name;
  return entry + (background ? ' (фон)' : '');
}

export function itemListTokens(input: string) {
  return Array.from(input.matchAll(/(?:[,;\n]|^)([ \t]*"(?:\\.|[^"\\])*"(?:[ \t]*\([ \t]*фон[ \t]*\))?[ \t]*(?=[,;\n]|$)|[^,;\n]*)/giu), match => {
    const text = match[1], start = match.index + match[0].length - text.length;
    return { text, start, end: start + text.length };
  });
}

export function readItemListEntry(raw: string, allowBackground = true) {
  const background = allowBackground && backgroundSuffix.test(raw);
  let name = background ? raw.replace(backgroundSuffix, '').trimEnd() : raw;
  if (name.startsWith('"') && name.endsWith('"')) {
    try { name = JSON.parse(name); } catch { /* Имя может содержать кавычки. */ }
  }
  return { name, background };
}

export function resolveItemList(input: string, catalog: CatalogItem[], allowBackground = true) {
  const ranges: { id: string; start: number; end: number }[] = [];
  const missing: string[] = [];
  const backgroundIds = new Set<string>();
  for (const token of itemListTokens(input)) {
    const raw = token.text.trim();
    if (!raw) continue;
    const { name, background } = readItemListEntry(raw, allowBackground);
    const item = catalog.find(item => normalizeItemName(item.name) === normalizeItemName(name));
    const literal = background && !item ? catalog.find(item => normalizeItemName(item.name) === normalizeItemName(raw)) : undefined;
    const id = (item ?? literal)?.id;
    const start = token.start + token.text.indexOf(raw);
    if (id) ranges.push({ id, start, end: start + raw.length });
    else missing.push(name);
    if (item && background) backgroundIds.add(item.id);
  }
  return { ids: [...new Set(ranges.map(range => range.id))], backgroundIds: [...backgroundIds], missing, ranges };
}

export function resolveNames(input: string, catalog: CatalogItem[]) {
  const { ids, missing } = resolveItemList(input, catalog, false);
  return { ids, missing };
}

export function resolveItemMentions(input: string, catalog: CatalogItem[]) {
  const ranges: { id: string; start: number; end: number }[] = [];
  const missing: string[] = [];
  const names = catalog.map(item => ({ id: item.id, name: normalizeItemName(item.name) }))
    .sort((a, b) => b.name.length - a.name.length);
  for (const mention of input.matchAll(/(?<![\p{L}\p{N}_.+@-])@/gu)) {
    const start = mention.index;
    if (start < (ranges[ranges.length - 1]?.end ?? 0)) continue;
    const after = input.slice(start + 1);
    const search = normalizeItemName(after);
    const item = names.find(({ name }) => name && search.startsWith(name) &&
      (search.length === name.length || /[\s,.!?;:…()[\]{}"'«»]/.test(search[name.length])));
    if (item) ranges.push({
      id: item.id,
      start,
      end: start + 1 + after.length - after.trimStart().length + item.name.length
    });
    else missing.push('@' + (after.trim().match(/^[^\s,.!?;:…()[\]{}@]+/)?.[0] || ''));
  }
  return { ids: [...new Set(ranges.map(range => range.id))], missing, ranges };
}

export type SizedItem = CompositionItem;
export function backgroundPlaneColor(base: string, palettes: { background: string[] }[]) {
  const preset = palettes.find(p => p.background[0].toLowerCase() === base.toLowerCase());
  if (preset) return preset.background[1];
  return '#' + [.8, .78, .98].map((factor, index) => Math.round(parseInt(base.slice(1 + index * 2, 3 + index * 2), 16) * factor).toString(16).padStart(2, '0')).join('');
}
export function chooseSceneVariant<T extends { detail: string; role: string }>(variants: T[], detail: string, role: 'main' | 'background'): T {
  const matches = (v: T) => role === 'background' ? v.role === 'background' : v.role !== 'background';
  const selected = variants.find(v => v.detail === detail && matches(v)) || variants.find(matches) || variants.find(v => v.detail === detail && v.role !== 'background') || variants.find(v => v.role !== 'background') || variants[0];
  if (!selected) throw new Error('У элемента нет доступных вариантов');
  return selected;
}
export function sceneBackgroundIds(options: { ids: string[]; backgroundIds?: string[]; backgroundId?: string; background?: boolean }) {
  const selected = options.backgroundIds ?? (options.backgroundId ? [options.backgroundId] : options.background && options.ids.length > 1 ? options.ids.slice(-1) : []);
  if (!Array.isArray(selected) || selected.some(id => !options.ids.includes(id))) throw new Error('Фоновые элементы должны входить в выбранный набор');
  return [...new Set(selected)];
}
export function validateSceneBatch(count: number, width: number, height: number) {
  if (!Number.isInteger(count) || count < 1 || count > 12) throw new Error('Укажите целое количество вариантов от 1 до 12');
  if (![width, height].every(n => Number.isFinite(n) && n >= 100 && n <= 8000)) throw new Error('Укажите размер холста от 100 до 8000 пикселей');
  return count;
}
export function layoutScene(items: SizedItem[], width: number, height: number, variant: number) {
  return composeScene(items, width, height, variant).placements;
}
