import { expect, test } from 'vitest';
import { readPaletteFile, paletteBackground, paletteColor } from '../src/palettes';
import { PaletteStore } from '../src/palette-store';

const document = { version: 1, name: 'Авторская', background: ['#abc', '#DDEEFF', '#112233'], object_accents: ['#AABBCC', '#FF8800', '#FF8800'], ink: '#000000', paper: '#fff' };

test('загруженная палитра сохраняет восемь назначений и допускает повтор цветов', () => {
  expect(readPaletteFile(JSON.stringify(document))).toEqual({ name: 'Авторская', background: ['#AABBCC', '#DDEEFF', '#112233'], object_accents: ['#AABBCC', '#FF8800', '#FF8800'], ink: '#000000', paper: '#FFFFFF' });
  expect(() => readPaletteFile(JSON.stringify({ ...document, background: ['#FFFFFF'] }))).toThrow('три');
  expect(() => readPaletteFile(JSON.stringify({ ...document, ink: 'url(remote)' }))).toThrow('HEX');
  expect(() => readPaletteFile(JSON.stringify({ ...document, version: 2 }))).toThrow('версия');
});

test('фон ограничен фоновыми цветами, цвета предметов заменяются по исходным назначениям', () => {
  const palette = { id: 'custom', ...readPaletteFile(JSON.stringify(document)) };
  expect(paletteBackground(palette, '#def')).toBe('#DDEEFF');
  expect(() => paletteBackground(palette, '#FF8800')).toThrow('фоновых');
  expect(paletteColor('#D7CDF5', palette)).toBe('#AABBCC');
  expect(paletteColor('#F9A3AA', palette)).toBe('#FF8800');
  expect(paletteColor('white', palette)).toBe('#FFFFFF');
  expect(paletteColor('#765432', palette)).toBe('#765432');
});

test('палитра переживает повторное открытие документа, редактируется и переносится файлом', () => {
  const data = new Map<string, string>();
  const root = { getPluginData: (key: string) => data.get(key) || '', setPluginData: (key: string, value: string) => { data.set(key, value); } };
  const first = new PaletteStore(root), saved = first.save(readPaletteFile(JSON.stringify(document)));
  const reopened = new PaletteStore(root);
  expect(reopened.all().find(p => p.id === saved.id)?.name).toBe('Авторская');
  const edited = reopened.save({ ...saved, name: 'Обновлённая', ink: '#123456' });
  expect(edited.id).toBe(saved.id);
  expect(reopened.all().filter(p => p.id === saved.id)).toHaveLength(1);
  const transferred = new PaletteStore({ getPluginData: () => '', setPluginData: () => {} }).save(readPaletteFile(reopened.export(saved.id)));
  expect(transferred.name).toBe('Обновлённая'); expect(transferred.ink).toBe('#123456');
  expect(() => reopened.save({ ...saved, id: 'purple' })).toThrow('встроенную');
  expect(() => reopened.save({ ...saved, ink: 'invalid' })).toThrow('HEX');
  expect(reopened.all().find(p => p.id === saved.id)?.ink).toBe('#123456');
});
