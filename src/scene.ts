import { chooseSceneVariant, sceneBackgroundIds, validateSceneBatch } from './core';
import { builtInPalettes, paletteBackground, paletteColor, paletteKey, resolvePalette, validatePalette } from './palettes';
import { composeScene } from './composition';
import type { ArtworkProfile } from './artwork';
import type { ArtworkSample } from './artwork-channel';
import type { Item, Palette, SceneOptions } from './types';

const color = (hex: string) => {
  const value = hex === 'white' ? '#ffffff' : hex;
  return { r: parseInt(value.slice(1, 3), 16) / 255, g: parseInt(value.slice(3, 5), 16) / 255, b: parseInt(value.slice(5, 7), 16) / 255 };
};
const hex = (c: RGB) => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

type SceneEdit = { apply: () => void; undo: () => void; restorePreview?: () => void };

function stage<T>(edits: SceneEdit[], before: T, after: T, write: (value: T) => void) {
  edits.push({ apply: () => write(after), undo: () => write(before) });
}

function stagePaints(edits: SceneEdit[], node: SceneNode & GeometryMixin, property: 'fills' | 'strokes', before: readonly Paint[], after: readonly Paint[]) {
  const write = (paints: readonly Paint[]) => { node[property] = paints; };
  edits.push({
    apply: () => write(after),
    undo: () => write(before),
    restorePreview: () => {
      if (node.removed) return;
      const current = node[property];
      if (typeof current === 'symbol') return;
      let changed = false;
      const restored = current.flatMap((paint, index) => {
        const preview = after[index], original = before[index];
        if (paint.type !== 'SOLID' || preview?.type !== 'SOLID' || hex(paint.color) !== hex(preview.color)) return [paint];
        if (original?.type === 'SOLID' && hex(original.color) === hex(preview.color)) return [paint];
        changed = true;
        return original?.type === 'SOLID' ? [{ ...paint, color: original.color }] : original ? [original] : [];
      });
      if (changed) write(restored);
    }
  });
}

function applyEdits(edits: SceneEdit[]) {
  let applied = 0;
  try {
    for (; applied < edits.length; applied++) edits[applied].apply();
  } catch (error) {
    for (let index = applied - 1; index >= 0; index--) edits[index].undo();
    throw error;
  }
}

function stageRecolor(edits: SceneEdit[], node: SceneNode, palette: Palette, previous?: Palette) {
  const paintNode = (child: SceneNode) => {
    const saved = child.getPluginData('mixer-original-paints');
    const original: Record<string, Paint[]> = saved ? JSON.parse(saved) : {};
    for (const prop of ['fills', 'strokes'] as const) {
      if (!(prop in child)) continue;
      const geometry = child as SceneNode & GeometryMixin;
      const current = geometry[prop];
      if (!Array.isArray(current)) continue;
      const source = original[prop] || current;
      if (!original[prop] && previous) continue;
      original[prop] = source;
      const next = current.map((paint: Paint, index: number) => {
        const base = source[index];
        if (paint.type !== 'SOLID' || base?.type !== 'SOLID') return paint;
        const originalColor = hex(base.color);
        if (previous && hex(paint.color) !== paletteColor(originalColor, previous).toLowerCase()) return paint;
        const replacement = paletteColor(originalColor, palette);
        return hex(paint.color) === replacement.toLowerCase() ? paint : { ...paint, color: color(replacement) };
      });
      if (next.some((paint, index) => paint !== current[index])) stagePaints(edits, geometry, prop, current, next);
    }
    if (Object.keys(original).length) {
      const encoded = JSON.stringify(original);
      if (encoded !== saved) stage(edits, saved, encoded, value => child.setPluginData('mixer-original-paints', value));
    }
  };
  paintNode(node);
  if ('findAll' in node) node.findAll().forEach(paintNode);
}

function recolorSource(node: SceneNode, palette: Palette) {
  const edits: SceneEdit[] = [];
  stageRecolor(edits, node, palette);
  applyEdits(edits);
}

export class SceneRenderer {
  private livePreview: SceneEdit[] = [];
  constructor(private readonly palettes: () => Palette[] = () => builtInPalettes) {}

  async create(options: SceneOptions, items: Item[], analyze: (samples: ArtworkSample[]) => Promise<ArtworkProfile[]>) {
    const count = validateSceneBatch(options.count ?? 1, options.width, options.height);
    if (!options.ids.length || options.ids.length > 8 || new Set(options.ids).size !== options.ids.length) throw new Error('Выберите от 1 до 8 разных элементов');
    const palette = resolvePalette(options.palette, this.palettes(), options.paletteSnapshot);
    const effectivePalette = palette || builtInPalettes[0];
    const base = paletteBackground(effectivePalette, options.backgroundColor);
    const backgroundIds = sceneBackgroundIds(options);
    const picked = [];
    const warnings: string[] = [];
    for (let index = 0; index < options.ids.length; index++) {
      const item = items.find(i => i.id === options.ids[index]);
      if (!item) throw new Error('Элемент больше не существует');
      const role = backgroundIds.includes(item.id) ? 'background' : 'main';
      const v = chooseSceneVariant(item.variants, options.detail, role);
      if (role === 'background' && v.role !== 'background') warnings.push(`У «${item.name}» нет фоновой версии: использован исходный вариант`);
      const source = await figma.getNodeByIdAsync(v.nodeId) as SceneNode | null;
      if (!source || source.removed) throw new Error(`Исходник «${item.name}» удалён из библиотеки`);
      picked.push({ item, variant: v, source });
    }
    const samples: ArtworkSample[] = [];
    for (const p of picked) {
      // Анализируем именно выбранную версию и палитру, не меняя библиотечный исходник.
      const temporary = p.source.clone();
      try {
        if (palette && p.item.origin === 'starter') recolorSource(temporary, palette);
        const png = await temporary.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 128 / Math.max(temporary.width, temporary.height) }, useAbsoluteBounds: true });
        samples.push({ id: p.item.id, png });
      } finally { temporary.remove(); }
    }
    const profiles = await analyze(samples);
    const subjects = picked.map((p, i) => ({ id: p.item.id, width: p.source.width, height: p.source.height, background: p.variant.role === 'background', profile: profiles[i] }));
    let page = figma.root.children.find(p => p.getPluginData('mixer-scenes') === '1');
    if (!page) { page = figma.createPage(); page.name = 'Mixer · Композиции'; page.setPluginData('mixer-scenes', '1'); }
    await figma.setCurrentPageAsync(page);
    const created: FrameNode[] = [];
    const origin = page.children.reduce((max, n) => Math.max(max, n.x + n.width + 100), 0);
    try {
      for (let variant = 0; variant < count; variant++) {
        const composition = composeScene(subjects, options.width, options.height, options.variant + variant, { style: options.style, heroId: options.heroId, crop: options.crop, backgroundColor: base, layerOrder: options.layerOrder });
        const positions = composition.placements;
        warnings.push(...composition.warnings);
        const frame = figma.createFrame(); created.push(frame);
        const styleName = { balanced: 'Сбалансированная', diagonal: 'Динамичная', airy: 'Свободный центр' }[options.style || 'balanced'];
        frame.name = `${options.title || 'Композиция'} · ${styleName} · ${variant + 1}`.slice(0, 100);
        frame.resize(options.width, options.height); frame.x = origin + variant * (options.width + 100);
        frame.clipsContent = true;
        frame.fills = [{ type: 'SOLID', color: color(base) }];
        frame.setPluginData('mixer-scene', JSON.stringify({ ...options, backgroundColor: base, paletteSnapshot: palette }));
        if (options.ground !== false) {
          const plane = figma.createVector(); frame.appendChild(plane);
          plane.name = 'Диагональная плоскость'; plane.setPluginData('mixer-backdrop', 'ground');
          const w = options.width, h = options.height;
          plane.vectorPaths = [{ windingRule: 'NONZERO', data: `M 0 ${h * .30} L ${w * .45} 0 L ${w * .45} ${h * .30} Z` }];
          plane.x = w * .55; plane.y = h * .70;
          plane.fills = [{ type: 'SOLID', color: color(effectivePalette.background[(effectivePalette.background.indexOf(base) + 1) % 3]) }];
          plane.strokes = [];
        }
        const order = picked.map((_, index) => index).sort((a, b) => positions[a].layer - positions[b].layer);
        for (const index of order) {
          const p = picked[index], clone = p.source.clone();
          frame.appendChild(clone); clone.setPluginData('mixer-item', ''); clone.setPluginData('mixer-source', p.item.id);
          clone.setPluginData('mixer-colorable', p.item.origin === 'starter' ? '1' : '0');
          clone.setPluginData('mixer-role', p.variant.role === 'background' ? 'background' : 'main');
          if ('rescale' in clone) clone.rescale(positions[index].scale);
          clone.x = positions[index].x; clone.y = positions[index].y;
          if (palette && p.item.origin === 'starter') recolorSource(clone, palette);
        }
      }
      return { name: created[0].name, width: options.width, height: options.height, count: picked.length, variants: count, frameIds: created.map(frame => frame.id), warnings: [...new Set(warnings)] };
    } catch (error) { created.filter(n => !n.removed).forEach(n => n.remove()); throw error; }
  }

  async removeGenerated(ids: string[]) {
    for (const id of ids) { const node = await figma.getNodeByIdAsync(id); if (node && node.type === 'FRAME' && node.getPluginData('mixer-scene')) node.remove(); }
    figma.commitUndo();
  }

  composition(node: BaseNode | null): FrameNode | null {
    while (node && node.type !== 'DOCUMENT') {
      if (node.type === 'FRAME' && node.getPluginData('mixer-scene')) return node;
      node = node.parent;
    }
    return null;
  }

  selectedFrames() {
    return [...new Set(figma.currentPage.selection.map(node => this.composition(node)).filter(node => node !== null))];
  }

  selected() {
    const frame = this.selectedFrames()[0];
    if (!frame) throw new Error('Выберите созданную композицию на холсте');
    return frame;
  }

  async thumbnail(frame: FrameNode) {
    const png = await frame.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: Math.min(1, 192 / Math.max(frame.width, frame.height)) } });
    return 'data:image/png;base64,' + figma.base64Encode(png);
  }

  private paletteFor(input: string | Palette) {
    const id = typeof input === 'string' ? input : 'draft';
    const definition = typeof input === 'string' ? undefined : { id, ...validatePalette(input) };
    return { id, palette: resolvePalette(id, this.palettes(), definition) || builtInPalettes[0] };
  }

  private scenePalette(frame: FrameNode) {
    const stored = frame.getPluginData('mixer-scene');
    const options = JSON.parse(stored) as SceneOptions;
    const previous = options.paletteSnapshot
      || this.palettes().find(p => p.id === options.palette)
      || builtInPalettes.find(p => p.id === options.palette)
      || (!options.palette || options.palette === 'original' ? builtInPalettes[0] : undefined);
    if (!previous) throw new Error('Исходная палитра композиции недоступна');
    const savedIndex = options.backgroundIndex;
    const backgroundIndex = savedIndex === 0 || savedIndex === 1 || savedIndex === 2
      ? savedIndex
      : Math.max(0, previous.background.findIndex(value => value.toLowerCase() === options.backgroundColor?.toLowerCase()));
    return { stored, options, previous, backgroundIndex };
  }

  paletteKeyFor(frame: FrameNode) {
    return paletteKey(this.scenePalette(frame).previous);
  }

  private paletteTargets(frames: FrameNode[]) {
    if (!frames.length) throw new Error('Выберите созданную композицию на холсте');
    const targets = frames.map(frame => ({ frame, scene: this.scenePalette(frame) }));
    if (new Set(targets.map(({ scene }) => paletteKey(scene.previous))).size > 1) {
      throw new Error('Выберите композиции с одинаковой палитрой');
    }
    return targets;
  }

  private stageFrame(edits: SceneEdit[], frame: FrameNode, palette: Palette, index: number, scene: ReturnType<SceneRenderer['scenePalette']>) {
    const { options, previous, backgroundIndex } = scene;
    const base = palette.background[index];
    const fills = frame.fills;
    if (typeof fills !== 'symbol') {
      const paint = fills[0];
      if (!options.backgroundColor || (paint?.type === 'SOLID' && hex(paint.color) === options.backgroundColor.toLowerCase())) {
        const next: Paint[] = [{ ...(paint?.type === 'SOLID' ? paint : { type: 'SOLID' }), color: color(base) }, ...fills.slice(1)];
        if (paint?.type !== 'SOLID' || hex(paint.color) !== base.toLowerCase()) stagePaints(edits, frame, 'fills', fills, next);
      }
    }
    for (const node of frame.children) {
      if (node.getPluginData('mixer-backdrop') === 'ground' && 'fills' in node) {
        const oldPlane = previous.background[(backgroundIndex + 1) % 3].toLowerCase();
        const fills = node.fills;
        if (typeof fills === 'symbol') continue;
        const fill = fills[0];
        if (fill?.type === 'SOLID' && hex(fill.color) === oldPlane) {
          const next = [{ ...fill, color: color(palette.background[(index + 1) % 3]) }, ...fills.slice(1)];
          stagePaints(edits, node as SceneNode & GeometryMixin, 'fills', fills, next);
        }
      } else if (node.getPluginData('mixer-colorable') === '1') {
        stageRecolor(edits, node, palette, options.palette === 'original' && !options.paletteSnapshot ? undefined : previous);
      }
    }
  }

  clearPalettePreview() {
    const edits = this.livePreview;
    this.livePreview = [];
    for (let index = edits.length - 1; index >= 0; index--) edits[index].restorePreview?.();
  }

  previewPalette(input: string | Palette, frames = this.selectedFrames()) {
    this.clearPalettePreview();
    const { palette } = this.paletteFor(input);
    const edits: SceneEdit[] = [];
    for (const { frame, scene } of this.paletteTargets(frames)) this.stageFrame(edits, frame, palette, scene.backgroundIndex, scene);
    const paints = edits.filter(edit => edit.restorePreview);
    applyEdits(paints);
    this.livePreview = paints;
  }

  applyPalette(input: string | Palette, backgroundColor?: string, frames = this.selectedFrames()) {
    this.clearPalettePreview();
    const { id, palette } = this.paletteFor(input);
    const edits: SceneEdit[] = [];
    for (const { frame, scene } of this.paletteTargets(frames)) {
      const index = backgroundColor === undefined ? scene.backgroundIndex : palette.background.indexOf(paletteBackground(palette, backgroundColor));
      this.stageFrame(edits, frame, palette, index, scene);
      const updated = { ...scene.options, palette: id, backgroundColor: palette.background[index], backgroundIndex: index, paletteSnapshot: palette };
      stage(edits, scene.stored, JSON.stringify(updated), value => frame.setPluginData('mixer-scene', value));
    }
    applyEdits(edits);
    figma.commitUndo();
  }

  async export() { return this.selected().exportAsync({ format: 'SVG_STRING', svgIdAttribute: true, svgOutlineText: true }); }
}
