import { afterEach, expect, test, vi } from 'vitest';
import { SceneRenderer } from '../src/scene';
import type { SceneOptions } from '../src/types';
import { builtInPalettes } from '../src/palettes';

afterEach(() => vi.unstubAllGlobals());
const custom = { id: 'custom-test', name: 'Тест', background: ['#ABCDEF', '#CCDDEE', '#223344'], object_accents: ['#FF0000', '#00FF00', '#0000FF'], ink: '#101010', paper: '#FAFAFA' };
function node(type: string, metadata: Record<string, string>, fills: any[] = [], strokes: any[] = []) {
  return { type, x: 42, y: 17, width: 100, height: 80, fills, strokes, children: [] as any[], parent: null, getPluginData: (key: string) => metadata[key] || '', setPluginData: (key: string, value: string) => { metadata[key] = value; }, findAll() { return this.children; } };
}

test('пользовательская палитра перекрашивает целую композицию без изменения геометрии и прозрачности', () => {
  const subject = node('GROUP', { 'mixer-colorable': '1' });
  const part = node('VECTOR', {}, [{ type: 'SOLID', color: { r: 249 / 255, g: 163 / 255, b: 170 / 255 }, opacity: .4 }], [{ type: 'SOLID', color: { r: 24 / 255, g: 24 / 255, b: 23 / 255 }, opacity: .7 }]);
  subject.children = [part];
  const frame = node('FRAME', { 'mixer-scene': JSON.stringify({ ids: ['item'], palette: 'original' }) });
  frame.children = [subject];
  vi.stubGlobal('figma', { currentPage: { selection: [frame] }, commitUndo: vi.fn() });
  const renderer = new SceneRenderer(() => [custom]);
  renderer.applyPalette(custom.id, '#CCDDEE');
  expect(frame.fills[0].color).toEqual({ r: 204 / 255, g: 221 / 255, b: 238 / 255 });
  expect(part.fills[0]).toEqual({ type: 'SOLID', color: { r: 0, g: 1, b: 0 }, opacity: .4 });
  expect(part.strokes[0].opacity).toBe(.7);
  expect([part.x, part.y, part.width, part.height]).toEqual([42, 17, 100, 80]);
  renderer.applyPalette(custom.id);
  expect(part.fills[0].color).toEqual({ r: 0, g: 1, b: 0 });
  expect(JSON.parse(frame.getPluginData('mixer-scene')).paletteSnapshot).toMatchObject(custom);
  renderer.applyPalette({ ...custom, id: 'draft', object_accents: ['#FFFF00', '#00FFFF', '#FF00FF'] });
  expect(part.fills[0].color).toEqual({ r: 0, g: 1, b: 1 });
  renderer.applyPalette('original');
  expect(part.fills[0].color).toEqual({ r: 249 / 255, g: 163 / 255, b: 170 / 255 });
});

test('недопустимый фон отклоняется до изменения документа при создании композиции', async () => {
  const renderer = new SceneRenderer(() => [custom]);
  await expect(renderer.create({ ids: ['item'], count: 1, width: 1200, height: 630, palette: custom.id, backgroundColor: '#FF0000' } as SceneOptions, [], async () => [])).rejects.toThrow('фоновых');
});

test('живой предпросмотр меняет цвета на холсте без записи палитры и восстанавливает их при отмене', () => {
  const original = [{ type: 'SOLID', color: { r: 215 / 255, g: 205 / 255, b: 245 / 255 } }];
  const saved = JSON.stringify({ palette: 'purple', backgroundColor: '#D7CDF5' });
  const first = node('FRAME', { 'mixer-scene': saved }, original);
  const second = node('FRAME', { 'mixer-scene': saved }, original);
  const commitUndo = vi.fn();
  vi.stubGlobal('figma', { currentPage: { selection: [first, second] }, commitUndo });
  const renderer = new SceneRenderer(() => [custom, ...builtInPalettes]);
  renderer.previewPalette(custom.id);
  expect(first.fills[0].color.r).toBe(171 / 255);
  expect(second.fills[0].color.r).toBe(171 / 255);
  expect(first.getPluginData('mixer-scene')).toBe(saved);
  expect(commitUndo).not.toHaveBeenCalled();
  renderer.previewPalette('peach');
  expect(first.fills[0].color.r).toBe(253 / 255);
  renderer.clearPalettePreview();
  expect(first.fills).toEqual(original);
  expect(second.fills).toEqual(original);
  renderer.previewPalette(custom.id);
  renderer.applyPalette('peach');
  expect(first.fills[0].color.r).toBe(253 / 255);
  expect(JSON.parse(first.getPluginData('mixer-scene')).palette).toBe('peach');
  expect(commitUndo).toHaveBeenCalledOnce();
});

test('перекрашивает выбранные фреймы одним действием, сохраняя слоты фона и ручные цвета', () => {
  const paint = (r: number, g: number, b: number) => ({ type: 'SOLID', color: { r: r / 255, g: g / 255, b: b / 255 } });
  const first = node('FRAME', { 'mixer-scene': JSON.stringify({ palette: 'purple', backgroundColor: '#D7CDF5' }) }, [paint(215, 205, 245)]);
  const second = node('FRAME', { 'mixer-scene': JSON.stringify({ palette: 'purple', backgroundColor: '#7864D7' }) }, [paint(120, 100, 215)]);
  const unselected = node('FRAME', { 'mixer-scene': first.getPluginData('mixer-scene') }, [paint(215, 205, 245)]);
  const original = paint(249, 163, 170);
  const edited = paint(45, 47, 49);
  const part = node('VECTOR', { 'mixer-colorable': '1', 'mixer-original-paints': JSON.stringify({ fills: [original, original] }) }, [original, edited]);
  Object.assign(part, { parent: second });
  second.children = [part];
  const commitUndo = vi.fn();
  vi.stubGlobal('figma', { currentPage: { selection: [first, part, second] }, commitUndo });
  const renderer = new SceneRenderer(() => [custom]);
  renderer.applyPalette(custom.id);
  expect(first.fills).toEqual([paint(171, 205, 239)]);
  expect(second.fills).toEqual([paint(34, 51, 68)]);
  expect(unselected.fills).toEqual([paint(215, 205, 245)]);
  expect(part.fills).toEqual([paint(0, 255, 0), edited]);
  expect(commitUndo).toHaveBeenCalledOnce();
});

test('сохраняет позицию фона при переходе через палитру с одинаковыми цветами', () => {
  const frame = node('FRAME', { 'mixer-scene': JSON.stringify({ palette: 'purple', backgroundColor: '#7864D7', backgroundIndex: 2 }) }, [{ type: 'SOLID', color: { r: 120 / 255, g: 100 / 255, b: 215 / 255 } }]);
  vi.stubGlobal('figma', { currentPage: { selection: [frame] }, commitUndo: vi.fn() });
  const renderer = new SceneRenderer(() => [custom]);
  renderer.applyPalette({ ...custom, background: ['#ABCDEF', '#ABCDEF', '#ABCDEF'] });
  renderer.applyPalette(custom.id);
  expect(frame.fills[0].color).toEqual({ r: 34 / 255, g: 51 / 255, b: 68 / 255 });
});

test('при ошибке записи второго фрейма возвращает первую композицию к прежней палитре', () => {
  const metadata = { 'mixer-scene': JSON.stringify({ palette: 'purple', backgroundColor: '#D7CDF5' }) };
  const original = [{ type: 'SOLID', color: { r: 215 / 255, g: 205 / 255, b: 245 / 255 } }];
  const first = node('FRAME', { ...metadata }, original);
  const second = node('FRAME', { ...metadata }, original);
  Object.defineProperty(second, 'fills', { get: () => original, set: () => { throw new Error('Фрейм недоступен'); } });
  const commitUndo = vi.fn();
  vi.stubGlobal('figma', { currentPage: { selection: [first, second] }, commitUndo });
  expect(() => new SceneRenderer(() => [custom]).applyPalette(custom.id)).toThrow('Фрейм недоступен');
  expect(first.fills).toEqual(original);
  expect(first.getPluginData('mixer-scene')).toBe(metadata['mixer-scene']);
  expect(commitUndo).not.toHaveBeenCalled();
});

test('разные исходные цвета блокируют предпросмотр и применение даже при одинаковом ID палитры', () => {
  const first = node('FRAME', { 'mixer-scene': JSON.stringify({ palette: custom.id, paletteSnapshot: custom }) });
  const second = node('FRAME', { 'mixer-scene': JSON.stringify({ palette: custom.id, paletteSnapshot: { ...custom, ink: '#000000' } }) });
  const commitUndo = vi.fn();
  vi.stubGlobal('figma', { currentPage: { selection: [first, second] }, commitUndo });
  const renderer = new SceneRenderer(() => [custom]);
  expect(() => renderer.previewPalette('original')).toThrow('одинаковой палитрой');
  expect(() => renderer.applyPalette('original')).toThrow('одинаковой палитрой');
  expect(first.fills).toEqual([]);
  expect(second.fills).toEqual([]);
  expect(commitUndo).not.toHaveBeenCalled();
});
