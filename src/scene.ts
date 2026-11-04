import { chooseSceneVariant, sceneBackgroundIds, sceneLayerOrder, validateSceneBatch } from './core';
import { builtInPalettes, paletteBackground, paletteColor, resolvePalette, validatePalette } from './palettes';
import { composeScene } from './composition';
import type { ArtworkProfile } from './artwork';
import type { ArtworkSample } from './artwork-channel';
import type { Item, Palette, SceneOptions } from './types';

const color = (hex: string) => {
  const value = hex === 'white' ? '#ffffff' : hex;
  return { r: parseInt(value.slice(1, 3), 16) / 255, g: parseInt(value.slice(3, 5), 16) / 255, b: parseInt(value.slice(5, 7), 16) / 255 };
};
const hex = (c: RGB) => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

function recolor(node: SceneNode, palette: Palette, starter: boolean) {
  if (!starter) return;
  const paintNode = (child: SceneNode) => {
    const saved = child.getPluginData('mixer-original-paints');
    const original: Record<string, Paint[]> = saved ? JSON.parse(saved) : {};
    for (const prop of ['fills', 'strokes'] as const) {
      if (!(prop in child)) continue;
      const paints = original[prop] || (child as GeometryMixin)[prop];
      if (!Array.isArray(paints)) continue;
      original[prop] = paints;
      (child as GeometryMixin)[prop] = paints.map((p: Paint) => p.type === 'SOLID' ? { ...p, color: color(paletteColor(hex(p.color), palette)) } : p);
    }
    child.setPluginData('mixer-original-paints', JSON.stringify(original));
  };
  paintNode(node);
  if ('findAll' in node) node.findAll().forEach(paintNode);
}

export class SceneRenderer {
  current: FrameNode | null = null;
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
        if (palette) recolor(temporary, palette, p.item.origin === 'starter');
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
          if (palette) recolor(clone, palette, p.item.origin === 'starter');
        }
      }
      this.current = created[0]; figma.currentPage.selection = created;
      figma.viewport.scrollAndZoomIntoView(created); figma.commitUndo();
      return { name: created[0].name, width: options.width, height: options.height, count: picked.length, variants: count, warnings: [...new Set(warnings)] };
    } catch (error) { created.filter(n => !n.removed).forEach(n => n.remove()); throw error; }
  }

  selected() {
    let node: BaseNode | null = figma.currentPage.selection[0] || this.current;
    while (node && node.type !== 'DOCUMENT' && !node.getPluginData('mixer-scene')) node = node.parent;
    if (!node || node.type !== 'FRAME') throw new Error('Выберите созданную композицию на холсте');
    return node;
  }

  async previewPalette() {
    let source: FrameNode;
    try { source = this.selected(); } catch { return null; }
    const copy = source.clone();
    try {
      // Копия нужна только для SVG предпросмотра; исходная сцена остаётся нетронутой.
      copy.x = source.x + source.width + 10000;
      const original = builtInPalettes[0];
      const options = JSON.parse(source.getPluginData('mixer-scene')) as SceneOptions;
      const previous = options.paletteSnapshot || this.palettes().find(p => p.id === options.palette) || original;
      const backgroundIndex = Math.max(0, previous.background.findIndex(value => value.toLowerCase() === options.backgroundColor?.toLowerCase()));
      copy.fills = [{ type: 'SOLID', color: color(original.background[backgroundIndex]) }];
      copy.children.forEach((node, index) => {
        if (node.getPluginData('mixer-backdrop') === 'ground' && 'fills' in node) node.fills = [{ type: 'SOLID', color: color(original.background[(backgroundIndex + 1) % 3]) }];
        else if (node.getPluginData('mixer-colorable') === '1') recolor(node, original, true);
        else node.name = `mixer-protected-${index}`;
      });
      return { svg: await copy.exportAsync({ format: 'SVG_STRING', svgIdAttribute: true, svgOutlineText: true }), name: source.name, backgroundIndex };
    } finally { copy.remove(); }
  }

  reorder(items: Item[]) {
    const frames = new Map<string, FrameNode>();
    for (const selected of figma.currentPage.selection) {
      let node: BaseNode | null = selected;
      while (node && node.type !== 'DOCUMENT' && !node.getPluginData('mixer-scene')) node = node.parent;
      if (node?.type === 'FRAME') frames.set(node.id, node);
    }
    if (!frames.size) { const frame = this.selected(); frames.set(frame.id, frame); }
    for (const frame of frames.values()) {
      const options = JSON.parse(frame.getPluginData('mixer-scene')) as SceneOptions;
      const children = [...frame.children];
      const subjects = children.filter(n => n.getPluginData('mixer-source'));
      const manualOrder = options.layerOrder?.flatMap(id => subjects.filter(node => node.getPluginData('mixer-source') === id).map(node => node.id));
      const order = sceneLayerOrder(subjects.map(node => {
        const sourceId = node.getPluginData('mixer-source');
        const role = node.getPluginData('mixer-role');
        // В старых композициях роль отдельно не записывалась.
        const legacyBackground = !role && sceneBackgroundIds(options).includes(sourceId) &&
          items.find(item => item.id === sourceId)?.variants.some(v => v.role === 'background');
        return { id: node.id, x: node.x, y: node.y, width: node.width, height: node.height, background: role === 'background' || !!legacyBackground };
      }), manualOrder);
      const byId = new Map(subjects.map(node => [node.id, node]));
      const planes = children.filter(n => n.getPluginData('mixer-backdrop'));
      let cursor = 0;
      const sorted = [...planes, ...children.filter(n => !n.getPluginData('mixer-backdrop')).map(node =>
        node.getPluginData('mixer-source') ? byId.get(order[cursor++])! : node
      )];
      sorted.forEach((node, index) => frame.insertChild(index, node));
    }
    figma.commitUndo();
    return frames.size;
  }

  applyPalette(input: string | Palette, backgroundColor?: string) {
    const paletteId = typeof input === 'string' ? input : 'draft';
    const definition = typeof input === 'string' ? undefined : { id: 'draft', ...validatePalette(input) };
    const palette = resolvePalette(paletteId, this.palettes(), definition) || builtInPalettes[0];
    const base = paletteBackground(palette, backgroundColor), frame = this.selected();
    frame.fills = [{ type: 'SOLID', color: color(base) }];
    frame.children.forEach(node => {
      if (node.getPluginData('mixer-backdrop') === 'ground' && 'fills' in node) node.fills = [{ type: 'SOLID', color: color(palette.background[(palette.background.indexOf(base) + 1) % 3]) }];
      else recolor(node, palette, node.getPluginData('mixer-colorable') === '1');
    });
    const options = JSON.parse(frame.getPluginData('mixer-scene'));
    frame.setPluginData('mixer-scene', JSON.stringify({ ...options, palette: paletteId, backgroundColor: base, paletteSnapshot: palette }));
    figma.commitUndo();
  }

  async export() { return this.selected().exportAsync({ format: 'SVG_STRING', svgIdAttribute: true, svgOutlineText: true }); }
}
