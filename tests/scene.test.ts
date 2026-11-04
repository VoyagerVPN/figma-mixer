import { expect, test } from 'vitest';
import { resolveNames, layoutScene, validateSelection, validateSceneBatch, chooseSceneVariant, backgroundPlaneColor, sceneLayerOrder, sceneBackgroundIds } from '../src/core';
import palettes from '../src/assets/palettes.json';

test('находит предметы по названиям и не подменяет отсутствующий предмет', () => {
  const result = resolveNames('книга, лампа, самолёт', [
    { id: 'book', name: 'Книга', description: 'Чтение' },
    { id: 'lamp', name: 'Лампа', description: 'Идея' }
  ]);
  expect(result).toEqual({ ids: ['book', 'lamp'], missing: ['самолёт'] });
});

test('число вариантов задаётся пользователем, ошибочный размер или дробное количество отклоняются', () => {
  expect(validateSceneBatch(4, 1200, 630)).toBe(4);
  expect(() => validateSceneBatch(1.5, 1200, 630)).toThrow('целое');
  expect(() => validateSceneBatch(3, -1, 630)).toThrow('размер');
});

test('ответ модели с выдуманным предметом отклоняется до создания сцены', () => {
  expect(() => validateSelection({ ids: ['book', 'airplane'], explanation: 'test' }, [{ id: 'book', name: 'Книга', description: '' }])).toThrow('неизвестный');
  expect(validateSelection({ ids: ['book', 'book'], explanation: 'Знания' }, [{ id: 'book', name: 'Книга', description: '' }])).toEqual({ ids: ['book'], explanation: 'Знания' });
});

test('раскладка сохраняет соотношения размеров', () => {
  const scene = layoutScene([{ id: 'book', width: 400, height: 200 }, { id: 'pen', width: 100, height: 50 }], 600, 1000, 0);
  expect(scene[0].width / scene[1].width).toBe(4);
  expect(scene[0].scale).toBe(scene[1].scale);
});

test('пара предметов остаётся крупной без обязательного взаимного наложения', () => {
  const [book, phone] = layoutScene([{ id: 'book', width: 800, height: 560 }, { id: 'phone', width: 420, height: 300 }], 1080, 1080, 0);
  expect(book.width).toBeGreaterThan(700);
  expect(phone.width).toBeGreaterThan(350);
});

test('несколько вариантов даже одного элемента получают разные раскладки', () => {
  const item = [{ id: 'folder', width: 400, height: 200 }];
  const a = layoutScene(item, 1200, 630, 0);
  const b = layoutScene(item, 1200, 630, 1);
  expect(a).not.toEqual(b);
});

test('фоновая версия располагается за основной, даже если она меньше', () => {
  const [main, background] = layoutScene([{ id: 'headphones', width: 800, height: 600 }, { id: 'vase', width: 300, height: 400, background: true }], 1080, 1350, 0);
  expect(background.layer).toBeLessThan(main.layer);
});

test('несколько объектов получают фоновую роль, старые настройки продолжают читаться', () => {
  const ids = ['a', 'b', 'c'];
  expect(sceneBackgroundIds({ ids, backgroundIds: ['a', 'c'] })).toEqual(['a', 'c']);
  expect(sceneBackgroundIds({ ids, backgroundId: 'b' })).toEqual(['b']);
  expect(sceneBackgroundIds({ ids, background: true })).toEqual(['c']);
  expect(sceneBackgroundIds({ ids, backgroundIds: [], background: true })).toEqual([]);
  expect(() => sceneBackgroundIds({ ids, backgroundIds: ['missing'] })).toThrow('набор');
});

test('кадрирование не убирает маленький элемент целиком за край холста', () => {
  const items = [{ id: 'hero', width: 1000, height: 1000 }, ...Array.from({ length: 7 }, (_, i) => ({ id: `coin-${i}`, width: 2, height: 2 }))];
  for (const [width, height] of [[1200, 630], [1080, 1080], [1080, 1350]]) for (let variant = 0; variant < 12; variant++) {
    const scene = layoutScene(items, width, height, variant);
    for (const p of scene) {
      const visibleWidth = Math.max(0, Math.min(width, p.x + p.width) - Math.max(0, p.x));
      const visibleHeight = Math.max(0, Math.min(height, p.y + p.height) - Math.max(0, p.y));
      expect(visibleWidth * visibleHeight / (p.width * p.height)).toBeGreaterThanOrEqual(p.id === 'hero' ? .6 : .7);
      expect(p.scale).toBe(scene[0].scale);
    }
  }
});

test('исходная детализация сохраняет выбранную фоновую роль предмета', () => {
  const main = { detail: 'L', role: 'main' }, background = { detail: 'L', role: 'background' };
  expect(chooseSceneVariant([main, background], 'default', 'background')).toBe(background);
  expect(chooseSceneVariant([main], 'default', 'background')).toBe(main);
});

test('диагональная плоскость использует точный оттенок исходной цветовой схемы', () => {
  expect(backgroundPlaneColor('#d7cdf5', palettes)).toBe('#AA9BF0');
  expect(backgroundPlaneColor('#FDD7B9', palettes)).toBe('#FAC896');
  expect(backgroundPlaneColor('#BEEBEB', palettes)).toBe('#80DADA');
});

test('пересортировка учитывает опору высокого предмета, сохраняет фон позади и не меняет геометрию', () => {
  const objects = [
    { id: 'lamp', x: 0, y: 0, width: 100, height: 500 },
    { id: 'phone', x: 20, y: 300, width: 80, height: 100 },
    { id: 'background', x: 0, y: 900, width: 400, height: 600, background: true }
  ];
  const before = structuredClone(objects);
  expect(sceneLayerOrder(objects)).toEqual(['background', 'phone', 'lamp']);
  expect(objects).toEqual(before);
  expect(sceneLayerOrder([...objects].reverse())).toEqual(['background', 'phone', 'lamp']);
});

test('ручной порядок рисует верхнюю строку группы впереди, фон остаётся за основными', () => {
  const objects = [
    { id: 'front', x: 0, y: 0, width: 100, height: 100 },
    { id: 'back', x: 0, y: 200, width: 100, height: 100 },
    { id: 'background', x: 0, y: 900, width: 100, height: 100, background: true }
  ];
  expect(sceneLayerOrder(objects, ['background', 'front', 'back'])).toEqual(['background', 'back', 'front']);
});
