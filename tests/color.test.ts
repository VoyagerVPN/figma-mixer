import { expect, test } from 'vitest';
import { hsvToHex, hexToHsv, normalizeHex } from '../src/color';

test('пикер принимает HEX и сохраняет выбранный цвет после преобразования HSV', () => {
  expect(normalizeHex('abc')).toBe('#AABBCC');
  expect(normalizeHex('#12xz00')).toBeNull();
  expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#FF0000');
  expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00FF00');
  for (const hex of ['#D7CDF5', '#7864D7', '#FFFFFF', '#000000']) expect(hsvToHex(hexToHsv(hex))).toBe(hex);
});
