import bundled from './assets/library.json';
import { mergeElements, selectionUnits, starterLibraryName, validateDraft, validateSvg } from './library-model';
import type { Asset, Detail, DraftItem, DraftVariant, Item, Role, SetInfo } from './types';

type Metadata = { id: string; setId: string; name: string; description: string; origin: string; detail: Detail; role: Role; label: string };
const uid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);

export class Library {
  private page: PageNode | undefined;
  private allowedSources = new Set<string>();
  private snapshot: readonly SceneNode[] = [];
  private previews = new Map<string, string>();
  sets: SetInfo[] = [];
  items: Item[] = [];

  async init() {
    this.page = figma.root.children.find(p => p.getPluginData('mixer-library') === '1');
    if (this.page) await this.page.loadAsync();
    const saved = figma.root.getPluginData('mixer-sets');
    this.sets = saved ? JSON.parse(saved) : [];
    const starter = this.sets.find(set => set.id === 'starter');
    if (starter) starter.name = starterLibraryName;
    // Уже добавленная в прототип библиотека становится стартовым набором без повторного импорта.
    for (const node of this.nodes()) {
      const meta = this.meta(node);
      if (!meta.setId) {
        meta.setId = meta.origin === 'starter' ? 'starter' : 'legacy';
        node.setPluginData('mixer-item', JSON.stringify(meta));
      }
      if (!this.sets.some(s => s.id === meta.setId)) this.sets.push({ id: meta.setId, name: meta.setId === 'starter' ? starterLibraryName : 'Импортированные элементы' });
    }
    this.persistSets();
    return this.refresh();
  }

  private nodes() { return this.page?.children.filter(n => n.getPluginData('mixer-item')) || []; }
  private meta(node: SceneNode): Metadata { return JSON.parse(node.getPluginData('mixer-item')); }
  private persistSets() { figma.root.setPluginData('mixer-sets', JSON.stringify(this.sets)); }
  private ensurePage() {
    if (!this.page) { this.page = figma.createPage(); this.page.name = 'Mixer · Библиотека'; this.page.setPluginData('mixer-library', '1'); }
    return this.page;
  }

  async refresh() {
    const result = new Map<string, Item>();
    for (const node of this.nodes()) {
      const m = this.meta(node);
      let item = result.get(m.id);
      if (!item) { item = { id: m.id, setId: m.setId, name: m.name, description: m.description, origin: m.origin, preview: '', variants: [] }; result.set(m.id, item); }
      item.variants.push({ detail: m.detail, role: m.role, label: m.label || node.name, nodeId: node.id, width: node.width, height: node.height });
      if (!item.preview || (m.detail === 'L' && m.role === 'main')) {
        if (!this.previews.has(node.id)) this.previews.set(node.id, await node.exportAsync({ format: 'SVG_STRING', svgOutlineText: true }));
        item.preview = this.previews.get(node.id)!;
      }
    }
    this.items = [...result.values()];
    return { sets: this.sets, items: this.items };
  }

  async captureSelection(split = false, fresh = true) {
    if (fresh) this.snapshot = [...figma.currentPage.selection];
    if (!this.snapshot.length) throw new Error('Выделите на холсте целые объекты, которые хотите добавить');
    const units = selectionUnits(this.snapshot, split);
    if (units.length > 100) throw new Error('За один раз можно добавить до 100 элементов');
    this.allowedSources.clear();
    const items: DraftItem[] = [];
    const skipped: string[] = [];
    for (const node of units) {
      if (!this.isArtwork(node)) { skipped.push(node.name); continue; }
      const variants: DraftVariant[] = [];
      const sources = node.type === 'COMPONENT_SET' ? node.children : [node];
      for (const source of sources) {
        this.allowedSources.add(source.id);
        const props = source.type === 'COMPONENT' ? source.variantProperties : null;
        const detail = Object.entries(props || {}).find(([key]) => /^(size|detail|размер|детализация)$/i.test(key))?.[1];
        const role = Object.entries(props || {}).find(([key]) => /^(role|роль)$/i.test(key))?.[1];
        variants.push({ nodeId: source.id, label: source.name, detail: detail === 'S' || detail === 'L' ? detail : 'default', role: role === 'main' || role === 'background' ? role : 'default' });
      }
      const previewNode = node.type === 'COMPONENT_SET' ? node.defaultVariant : node;
      items.push({ id: uid(), name: node.name, description: node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' ? node.description : '', preview: await previewNode.exportAsync({ format: 'SVG_STRING', svgOutlineText: true }), variants });
    }
    if (!items.length) throw new Error('В выделении нет векторных элементов. Выберите группы, компоненты или фигуры без растровых заливок');
    return { items, skipped, canSplit: !split && this.snapshot.length === 1 && 'children' in this.snapshot[0] && this.snapshot[0].type !== 'COMPONENT_SET' };
  }

  private isArtwork(node: SceneNode) {
    if (node.removed || ['TEXT', 'SLICE', 'SECTION', 'STAMP', 'STICKY', 'WIDGET', 'EMBED'].includes(node.type)) return false;
    const all = [node, ...('findAll' in node ? node.findAll() : [])];
    return all.every(n => !('fills' in n && Array.isArray(n.fills) && n.fills.some(p => p.type === 'IMAGE' || p.type === 'VIDEO')));
  }

  async highlight(nodeId: string) {
    if (!this.allowedSources.has(nodeId)) throw new Error('Этот объект не входит в текущий импорт');
    const node = await figma.getNodeByIdAsync(nodeId) as SceneNode | null;
    if (!node || node.removed) throw new Error('Исходный объект больше не существует');
    let page: BaseNode | null = node;
    while (page && page.type !== 'PAGE') page = page.parent;
    if (page?.type === 'PAGE') await figma.setCurrentPageAsync(page);
    figma.currentPage.selection = [node]; figma.viewport.scrollAndZoomIntoView([node]);
  }

  async save(name: string, drafts: DraftItem[], targetSetId?: string) {
    const checked = validateDraft(name, drafts);
    const existing = targetSetId ? this.sets.find(s => s.id === targetSetId) : undefined;
    if (targetSetId && !existing) throw new Error('Выбранный набор больше не существует');
    const set = existing || { id: uid(), name: checked.name };
    const sources = new Map<string, SceneNode>();
    for (const draft of drafts) for (const variant of draft.variants) {
      if (variant.svg) validateSvg(variant.svg);
      if (variant.nodeId) {
        if (!this.allowedSources.has(variant.nodeId)) throw new Error('Исходный объект не относится к текущему импорту');
        const source = await figma.getNodeByIdAsync(variant.nodeId) as SceneNode | null;
        if (!source || source.removed || !this.isArtwork(source)) throw new Error(`Исходник «${draft.name}» изменён или удалён. Обновите выделение`);
        sources.set(variant.nodeId, source);
      }
    }
    const created: SceneNode[] = [];
    try {
      for (const draft of drafts) {
        const itemId = uid();
        for (const variant of draft.variants) {
          let node: SceneNode;
          if (variant.nodeId) { node = sources.get(variant.nodeId)!.clone(); created.push(node); }
          else {
            const frame = figma.createNodeFromSvg(variant.svg!);
            created.push(frame);
            if (frame.children.length === 1) { node = frame.children[0]; this.ensurePage().appendChild(node); created.push(node); frame.remove(); }
            else node = frame;
          }
          this.store(node, { id: itemId, setId: set.id, name: draft.name.trim(), description: draft.description.trim(), origin: 'custom', detail: variant.detail, role: variant.role, label: variant.label });
        }
      }
      if (!existing) this.sets.push(set);
      this.persistSets(); figma.commitUndo();
    } catch (error) { created.filter(n => !n.removed).forEach(n => n.remove()); throw error; }
    await this.refresh();
    return set;
  }

  private store(node: SceneNode, meta: Metadata) {
    const index = this.nodes().length;
    this.ensurePage().appendChild(node);
    node.name = meta.name + (meta.label ? ' · ' + meta.label : '');
    node.x = (index % 5) * 1800; node.y = Math.floor(index / 5) * 1800;
    node.setPluginData('mixer-item', JSON.stringify(meta));
    node.setPluginData('mixer-scene', ''); node.setPluginData('mixer-source', '');
  }

  async starter() {
    if (this.sets.some(s => s.id === 'starter')) return this.sets.find(s => s.id === 'starter')!;
    const assets = bundled as Asset[];
    const drafts: DraftItem[] = assets.map(asset => ({ ...asset, preview: '', variants: asset.variants.map(v => ({ ...v, label: `${v.detail} · ${v.role === 'main' ? 'Главный' : 'Фоновый'}` })) }));
    const set = await this.save(starterLibraryName, drafts);
    for (const node of this.nodes()) {
      const meta = this.meta(node);
      if (meta.setId === set.id) { meta.origin = 'starter'; meta.setId = 'starter'; node.setPluginData('mixer-item', JSON.stringify(meta)); }
    }
    set.id = 'starter'; this.persistSets(); await this.refresh();
    return set;
  }

  async update(itemId: string, name: string, variants: DraftVariant[]) {
    const item = this.items.find(i => i.id === itemId);
    if (!item) throw new Error('Элемент больше не существует');
    validateDraft('Редактирование', [{ ...item, name, variants }]);
    if (variants.length !== item.variants.length || variants.some(v => !item.variants.some(old => old.nodeId === v.nodeId))) throw new Error('Состав вариантов изменился');
    for (const v of variants) {
      const node = await figma.getNodeByIdAsync(v.nodeId!) as SceneNode;
      const meta = this.meta(node);
      node.setPluginData('mixer-item', JSON.stringify({ ...meta, name: name.trim(), detail: v.detail, role: v.role, label: v.label }));
      node.name = name.trim() + ' · ' + v.label;
    }
    figma.commitUndo(); await this.refresh();
  }

  async merge(ids: string[], name: string) {
    const chosen = this.items.filter(item => ids.includes(item.id));
    if (chosen.length !== new Set(ids).size || chosen.length < 2 || new Set(chosen.map(i => i.setId)).size !== 1 || !name.trim()) throw new Error('Выберите минимум два элемента одного набора и укажите название');
    const drafts: DraftItem[] = chosen.map(i => ({ ...i, variants: i.variants.map(v => ({ ...v, label: v.label || 'Исходный' })) }));
    const merged = mergeElements(drafts, ids, name)[0];
    validateDraft('Объединение вариантов', [merged]);
    for (const node of this.nodes()) {
      const meta = this.meta(node);
      if (ids.includes(meta.id)) node.setPluginData('mixer-item', JSON.stringify({ ...meta, id: merged.id, name: merged.name }));
    }
    figma.commitUndo(); await this.refresh();
    return chosen[0].id;
  }

  async exportSet(setId: string) {
    const set = this.sets.find(s => s.id === setId);
    if (!set) throw new Error('Набор не найден');
    const assets: Asset[] = [];
    for (const item of this.items.filter(i => i.setId === setId)) {
      const variants = [];
      for (const v of item.variants) {
        const node = await figma.getNodeByIdAsync(v.nodeId) as SceneNode;
        variants.push({ detail: v.detail, role: v.role, label: v.label, svg: await node.exportAsync({ format: 'SVG_STRING', svgOutlineText: true }) });
      }
      assets.push({ id: item.id, name: item.name, description: item.description, origin: item.origin, variants });
    }
    return JSON.stringify({ version: 1, name: set.name, assets });
  }
}
