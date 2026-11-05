import { expect, test, vi } from 'vitest';
import { selectionUnits, validateDraft, mergeElements, validateSvg, newDraftId } from '../src/library-model';
import { Library } from '../src/library';
import { chooseSceneVariant } from '../src/core';

test('три выделенных объекта становятся тремя элементами, внутренности лампы остаются вместе', () => {
  const nodes = [
    { id: 'folder', name: 'Папка', type: 'GROUP', children: [{ id: 'path', name: 'Контур', type: 'VECTOR' }] },
    { id: 'book', name: 'Книга', type: 'COMPONENT' },
    { id: 'lamp', name: 'Лампа', type: 'FRAME', children: [{ id: 'shade', name: 'Абажур', type: 'VECTOR' }] }
  ];
  expect(selectionUnits(nodes).map(n => n.id)).toEqual(['folder', 'book', 'lamp']);
  expect(selectionUnits([nodes[0]], true).map(n => n.id)).toEqual(['path']);
});

test('идентификаторы карточек работают в iframe без crypto.randomUUID и не совпадают в одном миллисекундном пакете', () => {
  vi.stubGlobal('crypto', {});
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  try { expect(new Set([newDraftId(), newDraftId(), newDraftId()]).size).toBe(3); }
  finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});

test('объединение двух элементов сохраняет обе версии и остальные элементы набора', () => {
  const make = (id: string) => ({ id, name: id, description: '', preview: '', variants: [{ nodeId: id, detail: 'default' as const, role: 'default' as const, label: id }] });
  const merged = mergeElements([make('lamp-color'), make('book'), make('lamp-background')], ['lamp-color', 'lamp-background'], 'Лампа');
  expect(merged.map(item => item.name)).toEqual(['Лампа', 'book']);
  expect(merged[0].variants.map(v => v.nodeId)).toEqual(['lamp-color', 'lamp-background']);
});

test('набор можно сохранить без описаний и без подготовки S/L, пустое название отклоняется', () => {
  const item = { id: 'draft-1', name: 'Книга', description: '', preview: '', variants: [{ nodeId: 'book', detail: 'default' as const, role: 'default' as const, label: 'Исходный' }] };
  expect(validateDraft('Рабочее пространство', [item])).toEqual({ name: 'Рабочее пространство', items: [item] });
  expect(() => validateDraft(' ', [item])).toThrow('название набора');
  expect(() => validateDraft('Набор', [{ ...item, name: '' }])).toThrow('название элемента');
});

test('SVG с растром или внешними ресурсами отклоняется, внутренний clipPath допускается', () => {
  expect(() => validateSvg('<svg><image href="data:image/png;base64,a" /></svg>')).toThrow('вектор');
  expect(() => validateSvg('<svg><use href="https://example.com/a.svg#x" /></svg>')).toThrow('вектор');
  expect(() => validateSvg('<svg><path fill="url(#clip)" d="M0 0L20 0L20 20Z"/></svg>')).not.toThrow();
});

test('набор вариантов Figma сохраняется под одним именем, роли доступны после повторного открытия', async () => {
  const svg = '<svg><path d="M0 0L20 0L20 20Z"/></svg>';
  const metadata = () => {
    const data = new Map<string, string>();
    return { getPluginData: (key: string) => data.get(key) || '', setPluginData: (key: string, value: string) => data.set(key, value) };
  };
  const component = (role: 'main' | 'background', id: string = role) => ({
    ...metadata(), type: 'COMPONENT', id, name: 'Role=' + role, width: 100, height: 80,
    variantProperties: { Role: role, Detail: 'L' },
    exportAsync: async () => svg,
    clone: () => component(role, id + '-copy')
  });
  const main = component('main'), background = component('background');
  const componentSet = { id: 'book', name: 'Книга', type: 'COMPONENT_SET', description: '', children: [main, background], defaultVariant: main };
  const children: ReturnType<typeof component>[] = [];
  const page = { ...metadata(), children, appendChild: (node: ReturnType<typeof component>) => children.push(node), loadAsync: async () => {} };
  const pages: typeof page[] = [];
  vi.stubGlobal('figma', {
    root: { ...metadata(), children: pages },
    currentPage: { selection: [componentSet] },
    getNodeByIdAsync: async (id: string) => [main, background].find(node => node.id === id),
    createPage: () => { pages.push(page); return page; },
    commitUndo: () => {}
  });
  try {
    const library = new Library();
    const captured = await library.captureSelection();
    await library.save('Книги', captured.items);
    const reopened = new Library();
    await reopened.init();
    expect(reopened.items.map(item => item.name)).toEqual(['Книга']);
    const [book] = reopened.items;
    expect(chooseSceneVariant(book.variants, 'L', 'main').nodeId).toBe('main-copy');
    expect(chooseSceneVariant(book.variants, 'L', 'background').nodeId).toBe('background-copy');
  } finally {
    vi.unstubAllGlobals();
  }
});
