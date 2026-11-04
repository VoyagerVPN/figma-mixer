import { expect, test } from 'vitest';
import { analyzePixels, visualWeight } from '../src/artwork';

test('визуальный вес зависит от непрозрачного силуэта, а не пустой рамки или имени', () => {
  const pixels = (size: number) => {
    const data = new Uint8ClampedArray(24 * 24 * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data.set([30, 30, 30, 255], (y * 24 + x) * 4);
    return analyzePixels(data, 24, 24);
  };
  const sparse = pixels(6), solid = pixels(24);
  expect(sparse.coverage).toBeCloseTo(.0625, 2);
  expect(visualWeight({ width: 400, height: 400, profile: solid }, '#FFFFFF')).toBeGreaterThan(visualWeight({ width: 400, height: 400, profile: sparse }, '#FFFFFF') * 2);
});
