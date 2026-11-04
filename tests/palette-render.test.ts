import { afterEach, expect, test, vi } from 'vitest';
import { SceneRenderer } from '../src/scene';
import type { SceneOptions } from '../src/types';

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

test('предпросмотр экспортирует исходные цвета временной копии и не меняет выбранную композицию', async () => {
  const source = node('FRAME', { 'mixer-scene': JSON.stringify({ palette: 'custom-test', paletteSnapshot: custom }) }, [{ type: 'SOLID', color: { r: .5, g: .5, b: .5 } }]);
  const copy = node('FRAME', {}, []), remove = vi.fn();
  Object.assign(copy, { remove, exportAsync: async () => `<svg fill="${copy.fills[0].color.r}"/>` });
  Object.assign(source, { clone: () => copy });
  vi.stubGlobal('figma', { currentPage: { selection: [source] } });
  const result = await new SceneRenderer().previewPalette();
  expect(result?.svg).toBe('<svg fill="0.8431372549019608"/>');
  expect(source.fills[0].color).toEqual({ r: .5, g: .5, b: .5 });
  expect(remove).toHaveBeenCalledOnce();
});
