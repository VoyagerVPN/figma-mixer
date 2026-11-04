import { expect, test } from 'vitest';
import { analyzePixels, rectangleProfile } from '../src/artwork';
import { evaluateComposition, composeScene } from '../src/composition';

test('пересечение рамок не считается перекрытием, если предмет находится в прозрачном отверстии', () => {
  const data = new Uint8ClampedArray(24 * 24 * 4);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (x < 4 || x > 19 || y < 4 || y > 19) data.set([0, 0, 0, 255], (y * 24 + x) * 4);
  const items = [{ id: 'ring', width: 200, height: 200, profile: analyzePixels(data, 24, 24) }, { id: 'square', width: 50, height: 50, profile: rectangleProfile() }];
  const result = evaluateComposition(items, [{ id: 'ring', x: 50, y: 50, width: 200, height: 200 }, { id: 'square', x: 125, y: 125, width: 50, height: 50 }], 300, 300);
  expect(result.items.every(item => item.visible > .98)).toBe(true);
  expect(result.items.every(item => item.occlusion < .02)).toBe(true);
});

test('восемь абстрактных фигур сохраняются в кадре и используют общий масштаб', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: `shape-${i}`, width: 120 + i * 18, height: 100 + (i % 3) * 35, profile: rectangleProfile() }));
  const result = composeScene(items, 1080, 1080, 3, { crop: 'none', style: 'balanced' });
  expect(result.placements).toHaveLength(8);
  expect(new Set(result.placements.map(p => p.scale)).size).toBe(1);
  expect(result.metrics.items.every(p => p.crop < .025 && p.visible > .70)).toBe(true);
  expect(result.placements.every(p => p.x >= 0 && p.y >= 0 && p.x + p.width <= 1080 && p.y + p.height <= 1080)).toBe(true);
  expect(result.metrics.emptyRectangle).toBeGreaterThan(.10);
  expect(result.metrics.coverage).toBeGreaterThan(.18);
});

test('кадрирование контрастной детали оценивается хуже потери такого же объёма спокойного силуэта', () => {
  const profile = { size: 2, alpha: [1, 1, 1, 1], importance: [5, .5, 5, .5], rgb: Array(12).fill(.4), coverage: 1, detail: 1, centroid: { x: .5, y: .5 } };
  const items = [{ id: 'shape', width: 100, height: 100, profile }];
  const importantLost = evaluateComposition(items, [{ id: 'shape', x: -50, y: 50, width: 100, height: 100 }], 200, 200, { heroId: 'shape' });
  const quietLost = evaluateComposition(items, [{ id: 'shape', x: 150, y: 50, width: 100, height: 100 }], 200, 200, { heroId: 'shape' });
  expect(importantLost.items[0].crop).toBe(quietLost.items[0].crop);
  expect(importantLost.items[0].importantVisible).toBeLessThan(.1);
  expect(quietLost.items[0].importantVisible).toBeGreaterThan(.9);
  expect(importantLost.score).toBeGreaterThan(quietLost.score);
});

test('свободный режим сохраняет больше непрерывного пространства, чем сбалансированный', () => {
  const items = [{ id: 'a', width: 400, height: 300 }, { id: 'b', width: 260, height: 160 }, { id: 'c', width: 130, height: 120 }];
  const balanced = composeScene(items, 1200, 800, 0, { crop: 'none', style: 'balanced' });
  const airy = composeScene(items, 1200, 800, 0, { crop: 'none', style: 'airy' });
  expect(airy.metrics.coverage).toBeLessThan(balanced.metrics.coverage);
  expect(airy.metrics.emptyRectangle).toBeGreaterThan(balanced.metrics.emptyRectangle);
});

test('связность группы оценивается по видимым фигурам даже внутри пересекающихся рамок', () => {
  const stripe = (right: boolean) => ({ ...rectangleProfile(), alpha: Array.from({ length: 64 }, (_, i) => i % 8 === (right ? 7 : 0) ? 1 : 0), coverage: .125 });
  const items = [{ id: 'a', width: 400, height: 200, profile: stripe(false) }, { id: 'b', width: 400, height: 200, profile: stripe(true) }];
  const far = evaluateComposition(items, [{ id: 'a', x: 100, y: 100, width: 400, height: 200 }, { id: 'b', x: 100, y: 100, width: 400, height: 200 }], 600, 400);
  const close = evaluateComposition(items, [{ id: 'a', x: 200, y: 100, width: 400, height: 200 }, { id: 'b', x: 0, y: 100, width: 400, height: 200 }], 600, 400);
  expect(close.score).toBeLessThan(far.score);
});

test('диагональный режим предпочитает направленную группу горизонтальному ряду', () => {
  const items = [{ id: 'a', width: 100, height: 100 }, { id: 'b', width: 100, height: 100 }];
  const row = [{ id: 'a', x: 50, y: 100, width: 100, height: 100 }, { id: 'b', x: 150, y: 100, width: 100, height: 100 }];
  const diagonal = [{ id: 'a', x: 50, y: 50, width: 100, height: 100 }, { id: 'b', x: 150, y: 150, width: 100, height: 100 }];
  expect(evaluateComposition(items, diagonal, 300, 300, { style: 'diagonal' }).score).toBeLessThan(evaluateComposition(items, row, 300, 300, { style: 'diagonal' }).score);
});

test('у равнозначных фигур нет навязанного акцента, но дизайнер может назначить его явно', () => {
  const items = [{ id: 'circle', width: 100, height: 100 }, { id: 'square', width: 100, height: 100 }];
  expect(composeScene(items, 400, 400, 0).heroId).toBeUndefined();
  expect(composeScene(items, 400, 400, 0, { heroId: 'square' }).heroId).toBe('square');
});

test('свободная композиция оставляет центр открытым, распределяя крупные фигуры по краям', () => {
  const items = [{ id: 'a', width: 500, height: 400 }, { id: 'b', width: 450, height: 500 }, { id: 'c', width: 400, height: 300 }, { id: 'd', width: 300, height: 450 }];
  const result = composeScene(items, 1080, 1080, 0, { style: 'airy', crop: 'accent' });
  expect(result.metrics.centerCoverage).toBeLessThan(.08);
  expect(result.metrics.items.every(p => p.visible > .50)).toBe(true);
  expect(result.metrics.items.some(p => p.crop > .06)).toBe(true);
  expect(new Set(result.placements.map(p => p.scale)).size).toBe(1);
});
