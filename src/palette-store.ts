import { builtInPalettes, validatePalette, type NamedPalette, type PaletteDraft } from './palettes';

type DocumentData = { getPluginData: (key: string) => string; setPluginData: (key: string, value: string) => void };
const key = 'mixer-palettes-v1';

export class PaletteStore {
  constructor(private readonly document: DocumentData) {}

  private custom(): NamedPalette[] {
    const saved = this.document.getPluginData(key);
    if (!saved) return [];
    const rows = JSON.parse(saved);
    if (!Array.isArray(rows)) throw new Error('Не удалось прочитать палитры документа');
    return rows.map(p => {
      if (typeof p.id !== 'string' || !p.id.startsWith('custom-')) throw new Error('Некорректный идентификатор палитры');
      return { id: p.id, ...validatePalette(p) };
    });
  }

  all(): NamedPalette[] { return [...builtInPalettes, ...this.custom()]; }

  save(draft: PaletteDraft): NamedPalette {
    const value = validatePalette(draft), palettes = this.custom();
    if (draft.id && builtInPalettes.some(p => p.id === draft.id)) throw new Error('Нельзя изменить встроенную палитру. Создайте копию');
    if (draft.id && !palettes.some(p => p.id === draft.id)) throw new Error('Палитра больше не существует');
    const saved = { ...value, id: draft.id || 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) };
    const next = draft.id ? palettes.map(p => p.id === saved.id ? saved : p) : [...palettes, saved];
    this.document.setPluginData(key, JSON.stringify(next));
    return saved;
  }

  export(id: string): string {
    const palette = this.all().find(p => p.id === id);
    if (!palette) throw new Error('Палитра больше не существует');
    const { id: _, ...colors } = palette;
    return JSON.stringify({ version: 1, ...colors }, null, 2);
  }
}
