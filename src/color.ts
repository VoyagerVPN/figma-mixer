export type HSV = { h: number; s: number; v: number };
export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, '');
  if (/^[a-f\d]{3}$/i.test(raw)) return '#' + [...raw].map(c => c + c).join('').toUpperCase();
  return /^[a-f\d]{6}$/i.test(raw) ? '#' + raw.toUpperCase() : null;
}
export function hsvToHex({ h, s, v }: HSV): string {
  const hue = ((h % 360) + 360) % 360 / 60;
  const chroma = Math.max(0, Math.min(1, v)) * Math.max(0, Math.min(1, s));
  const x = chroma * (1 - Math.abs(hue % 2 - 1)), m = v - chroma;
  const channels = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]][Math.floor(hue)];
  return '#' + channels.map(c => Math.round((c + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function hexToHsv(value: string): HSV {
  const hex = normalizeHex(value); if (!hex) throw new Error('Некорректный HEX');
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const h = !d ? 0 : max === r ? (g - b) / d % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
