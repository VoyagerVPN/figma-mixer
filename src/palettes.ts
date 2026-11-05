import data from './assets/palettes.json';
import { normalizeHex } from './color';
import type { Palette } from './types';

export type PaletteDraft = Omit<Palette, 'id'> & { name: string; id?: string };
export type NamedPalette = Palette & { name: string };
const names: Record<string, string> = { purple: 'Сирень', peach: 'Персик', turquoise: 'Бирюза' };

export function validatePalette(value: unknown): Omit<NamedPalette, 'id'> {
  if (!value || typeof value !== 'object') throw new Error('Некорректная палитра');
  const p = value as Record<string, unknown>;
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.trim().length > 100) throw new Error('Укажите название палитры от 1 до 100 символов');
  const color = (input: unknown) => {
    const normalized = typeof input === 'string' ? normalizeHex(input === 'white' ? '#FFFFFF' : input) : null;
    if (!normalized) throw new Error('Цвета палитры должны быть записаны в HEX: #RGB или #RRGGBB');
    return normalized;
  };
  const colors = (input: unknown) => {
    if (!Array.isArray(input) || input.length !== 3) throw new Error('Палитра должна содержать три фоновых цвета и три акцента');
    return input.map(color);
  };
  return { name: p.name.trim(), background: colors(p.background), object_accents: colors(p.object_accents), ink: color(p.ink), paper: color(p.paper) };
}

export const builtInPalettes: NamedPalette[] = data.map(p => ({ id: p.id, ...validatePalette({ ...p, name: names[p.id] }) }));

const slots = (p: Palette) => [...p.background, ...p.object_accents, p.ink, p.paper];
const originalColors = slots(builtInPalettes[0]);
export const paletteKey = (palette: Palette) => slots(palette).map(value => (normalizeHex(value === 'white' ? '#FFFFFF' : value) || value).toUpperCase()).join('|');

export function paletteColor(input: string, palette: Palette): string {
  const color = normalizeHex(input === 'white' ? '#FFFFFF' : input);
  const index = color ? originalColors.indexOf(color) : -1;
  return index < 0 ? input : slots(palette)[index];
}

export function paletteBackground(palette: Palette, input = palette.background[0]): string {
  const color = normalizeHex(input);
  if (!color || !palette.background.includes(color)) throw new Error('Выберите фон из фоновых цветов палитры');
  return color;
}

export function resolvePalette(id: string, palettes: Palette[], snapshot?: Palette): Palette | undefined {
  if (id === 'original') return undefined;
  if (id === 'draft' && snapshot) return { id, ...validatePalette(snapshot) };
  const found = palettes.find(p => p.id === id);
  if (!found) throw new Error('Палитра больше не существует. Выберите другую');
  return found;
}

export function readPaletteFile(text: string) {
  if (text.length > 65536) throw new Error('Файл палитры слишком большой: максимум 64 КБ');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('Не удалось прочитать JSON палитры'); }
  if (value?.version !== 1) throw new Error('Неподдерживаемая версия файла палитры');
  return validatePalette(value);
}
