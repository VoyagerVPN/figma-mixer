import { rectangleProfile, visualWeight, type ArtworkProfile } from './artwork';
import { sceneLayerOrder } from './scene-order';

export type CompositionItem = { id: string; width: number; height: number; background?: boolean; profile?: ArtworkProfile };
export type CompositionOptions = { style?: 'balanced' | 'diagonal' | 'airy'; heroId?: string; crop?: 'none' | 'accent'; backgroundColor?: string; balanceX?: number; balanceY?: number; bleedIds?: string[]; cropTarget?: number; layerOrder?: string[] };
export type Placement = { id: string; x: number; y: number; width: number; height: number; background?: boolean; scale?: number; layer?: number };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const deficit = (value: number, minimum: number) => Math.max(0, minimum - value) ** 2;

function sample(profile: ArtworkProfile, p: Placement, x: number, y: number) {
  const u = (x - p.x) / p.width, v = (y - p.y) / p.height;
  return u >= 0 && u < 1 && v >= 0 && v < 1 ? profile.alpha[Math.floor(v * profile.size) * profile.size + Math.floor(u * profile.size)] : 0;
}

function emptyRectangle(grid: number[], size: number) {
  const heights = Array(size).fill(0);
  let largest = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) heights[x] = grid[y * size + x] < .35 ? heights[x] + 1 : 0;
    const stack: number[] = [];
    for (let x = 0; x <= size; x++) {
      const height = x === size ? 0 : heights[x];
      while (stack.length && heights[stack[stack.length - 1]] > height) {
        const h = heights[stack.pop()!], start = stack.length ? stack[stack.length - 1] + 1 : 0;
        largest = Math.max(largest, h * (x - start));
      }
      stack.push(x);
    }
  }
  return largest / (size * size);
}

export function evaluateComposition(items: CompositionItem[], placements: Placement[], width: number, height: number, options: CompositionOptions = {}) {
  const profiles = items.map(item => item.profile || rectangleProfile());
  const background = [1, 3, 5].map(i => parseInt((options.backgroundColor || '#D7CDF5').slice(i, i + 2), 16) / 255);
  const order = sceneLayerOrder(placements.map((p, i) => ({ ...p, background: items[i].background })), options.layerOrder).map(id => placements.findIndex(p => p.id === id));
  const results = items.map(item => ({ id: item.id, visible: 1, crop: 0, occlusion: 0, importantVisible: 1 }));
  let score = 0, visualMass = 0, momentX = 0, momentY = 0;
  for (let rank = 0; rank < order.length; rank++) {
    const index = order[rank], p = placements[index], profile = profiles[index];
    let full = 0, inside = 0, visible = 0, importance = 0, visibleImportance = 0;
    for (let cell = 0; cell < profile.alpha.length; cell++) {
      const a = profile.alpha[cell]; if (a < .03) continue;
      const x = p.x + ((cell % profile.size) + .5) / profile.size * p.width;
      const y = p.y + (Math.floor(cell / profile.size) + .5) / profile.size * p.height;
      full += a; importance += a * profile.importance[cell];
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      inside += a;
      let transmission = 1;
      for (let front = rank + 1; front < order.length; front++) {
        const j = order[front]; transmission *= 1 - sample(profiles[j], placements[j], x, y);
        if (transmission < .01) break;
      }
      visible += a * transmission; visibleImportance += a * profile.importance[cell] * transmission;
      const contrast = Math.abs(profile.rgb[cell * 3] - background[0]) * .21 + Math.abs(profile.rgb[cell * 3 + 1] - background[1]) * .72 + Math.abs(profile.rgb[cell * 3 + 2] - background[2]) * .07;
      const mass = a * transmission * p.width * p.height / (profile.size ** 2) * (.5 + contrast) * (.75 + profile.importance[cell] * .25) * (items[index].background ? .18 : 1);
      visualMass += mass; momentX += x * mass; momentY += y * mass;
    }
    const result = { id: p.id, visible: visible / (full || 1), crop: 1 - inside / (full || 1), occlusion: 1 - visible / (inside || 1), importantVisible: visibleImportance / (importance || 1) };
    results[index] = result;
    const hero = p.id === options.heroId;
    const edge = options.crop !== 'none' && !!options.bleedIds?.includes(p.id);
    const minimumInside = options.crop === 'none' ? .995 : items[index].background ? .40 : edge ? .64 : .87;
    const minimumVisible = items[index].background ? .23 : edge ? .56 : hero ? .69 : .80;
    score += deficit(1 - result.crop, minimumInside) * 160 + deficit(result.visible, minimumVisible) * 200 + deficit(result.importantVisible, minimumVisible) * 60;
    score += deficit(1 - result.occlusion, items[index].background ? .35 : .78) * 65;
    score += edge ? deficit(result.crop, options.cropTarget ?? .14) * 32 : result.crop * (items[index].background ? .08 : 1.3);
  }
  const size = 24, occupied = Array(size * size).fill(0);
  const silhouettes: number[][] = items.map(() => Array(size).fill(0));
  let centerMass = 0, centerCells = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let transmission = 1, visual = 0;
    for (let rank = order.length - 1; rank >= 0; rank--) {
      const i = order[rank], a = sample(profiles[i], placements[i], (x + .5) / size * width, (y + .5) / size * height);
      if (a > .12) silhouettes[i][y] |= 1 << x;
      visual += a * transmission * (items[i].background ? .20 : 1); transmission *= 1 - a;
    }
    occupied[y * size + x] = visual;
    if (x >= 8 && x < 16 && y >= 8 && y < 16) { centerMass += 1 - transmission; centerCells++; }
  }
  const coverage = occupied.reduce((sum, a) => sum + a, 0) / occupied.length;
  const space = emptyRectangle(occupied, size);
  const targetCoverage = options.style === 'airy' ? .32 : .43 + Math.max(0, items.length - 3) * .022;
  const cx = momentX / (visualMass || 1) / width, cy = momentY / (visualMass || 1) / height;
  const targetX = options.balanceX ?? .5;
  score += (coverage - targetCoverage) ** 2 * 16 + ((cx - targetX) ** 2 + (cy - (options.balanceY ?? .5)) ** 2) * 10;
  const centerCoverage = centerMass / centerCells;
  score += deficit(space, .13) * 28;
  if (options.style === 'airy') score += centerCoverage ** 2 * 65 + centerCoverage * 8;
  if (options.style === 'diagonal') {
    const centers = placements.flatMap((p, i) => items[i].background ? [] : [{ x: (p.x + p.width * profiles[i].centroid.x) / width, y: (p.y + p.height * profiles[i].centroid.y) / height }]);
    if (centers.length > 1) {
      const meanX = centers.reduce((sum, p) => sum + p.x, 0) / centers.length, meanY = centers.reduce((sum, p) => sum + p.y, 0) / centers.length;
      let xx = 0, yy = 0, xy = 0;
      for (const p of centers) { xx += (p.x - meanX) ** 2; yy += (p.y - meanY) ** 2; xy += (p.x - meanX) * (p.y - meanY); }
      score += deficit(Math.abs(2 * xy) / (xx + yy || 1), .45) * .8;
    }
  }
  // Расстояние между силуэтами: прозрачные поля рамок не связывают предметы в группу.
  silhouettes.forEach((rows, i) => {
    if (rows.some(Boolean)) return;
    // Элемент тоньше шага сетки всё равно участвует в оценке связности.
    const p = placements[i], center = profiles[i].centroid;
    const x = clamp(Math.floor((p.x + p.width * center.x) / width * size), 0, size - 1);
    const y = clamp(Math.floor((p.y + p.height * center.y) / height * size), 0, size - 1);
    rows[y] |= 1 << x;
  });
  const nearest = items.map(() => Infinity);
  for (let i = 0; i < placements.length; i++) for (let j = i + 1; j < placements.length; j++) {
    if (items[i].background || items[j].background) continue;
    if (nearest[i] <= .05 && nearest[j] <= .05) continue;
    let expanded = silhouettes[i], distance = 0;
    while (distance < 8 && !expanded.some((row, y) => (row & silhouettes[j][y]) !== 0)) {
      expanded = expanded.map((row, y) => (row | row << 1 | row >>> 1 | (expanded[y - 1] || 0) | (expanded[y + 1] || 0)) & 0xffffff);
      distance++;
    }
    const gap = Math.max(0, distance - 1) / size;
    nearest[i] = Math.min(nearest[i], gap); nearest[j] = Math.min(nearest[j], gap);
  }
  for (const gap of nearest) if (Number.isFinite(gap)) score += Math.max(0, gap - .05) ** 2 * (options.style === 'airy' ? 8 : 65);
  return { score, items: results, coverage, centerCoverage, emptyRectangle: space, centroid: { x: cx, y: cy } };
}

export function composeScene(items: CompositionItem[], width: number, height: number, variant: number, options: CompositionOptions = {}) {
  if (!items.length) throw new Error('Выберите хотя бы один предмет');
  if (![width, height, ...items.flatMap(i => [i.width, i.height])].every(n => Number.isFinite(n) && n > 0)) throw new Error('Некорректный размер');
  const foreground = items.map((item, index) => ({ item, index, weight: visualWeight({ ...item, profile: item.profile || rectangleProfile() }, options.backgroundColor || '#D7CDF5') }))
    .filter(p => !p.item.background).sort((a, b) => b.weight - a.weight || a.item.id.localeCompare(b.item.id));
  const requested = foreground.find(p => p.item.id === options.heroId);
  const lead = requested || foreground[0] || { item: items[0], index: 0, weight: 1 };
  const dominant = !!requested || foreground.length < 2 || lead.weight > (foreground[1]?.weight || 1) * 1.18;
  const heroId = dominant ? lead.item.id : undefined;
  const largest = [...items].sort((a, b) => b.width * b.height * (b.profile?.coverage || 1) - a.width * a.height * (a.profile?.coverage || 1));
  const major = largest.filter(i => i.width * i.height * (i.profile?.coverage || 1) >= largest[0].width * largest[0].height * (largest[0].profile?.coverage || 1) * .55);
  const bleedIds = options.crop === 'none' || items.length === 1 ? [] : (options.style === 'airy' ? major : major.slice(0, 2)).map(i => i.id);
  const context = { ...options, heroId, bleedIds, cropTarget: .10 + variant % 3 * .035, balanceX: .5 + (variant % 3 - 1) * .035, balanceY: .48 + Math.floor(variant % 12 / 3) * .015 };
  const ranked = [lead.index, ...foreground.filter(p => p.index !== lead.index).map(p => p.index), ...items.map((p, i) => p.background && i !== lead.index ? i : -1).filter(i => i >= 0)];
  const candidates: Placement[][] = [];
  // Кадр задаёт построение: крупные силуэты у границ, остальные поддерживают группу.
  const perimeter = [[.12, .12], [.88, .88], [.88, .12], [.12, .88], [.5, -.04], [.5, 1.04], [-.04, .5], [1.04, .5]];
  const clusters = [
    [[.28, .48], [.82, .76], [.75, .12], [.13, .04], [.08, .88], [.97, .3], [.5, 1], [.5, -.05]],
    [[.76, .48], [.15, .76], [.28, .10], [.92, .04], [.97, .90], [.02, .30], [.5, 1], [.5, -.05]],
    [[.50, .12], [.18, .73], [.86, .69], [.05, .15], [.94, .15], [.5, 1], [.02, .5], [.98, .5]]
  ];
  const inkArea = items.reduce((sum, i) => sum + i.width * i.height * (i.profile?.coverage || 1), 0);
  for (let seed = 0; seed < 18; seed++) {
    const anchors = options.style === 'airy' ? perimeter : clusters[(seed + variant) % clusters.length];
    const scale = Math.sqrt(width * height * (options.style === 'airy' ? [.46, .60, .76][seed % 3] : [.55, .72, .9][seed % 3]) / inkArea);
    const draft: Placement[] = items.map(i => ({ id: i.id, x: 0, y: 0, width: i.width * scale, height: i.height * scale, scale, background: i.background }));
    ranked.forEach((index, rank) => {
      const slot = items[index].background ? perimeter[(rank + seed + 2) % perimeter.length] : anchors[rank % anchors.length];
      let [x, y] = slot;
      if ((seed + variant) % 2) x = 1 - x;
      if (options.style === 'airy' && Math.floor((seed + variant) / 2) % 2) y = 1 - y;
      if (options.style === 'diagonal') { x += (rank % 2 ? .07 : -.07); y += (rank % 3 - 1) * .05; }
      draft[index].x = x * width - draft[index].width / 2;
      draft[index].y = y * height - draft[index].height / 2;
    });
    candidates.push(draft);
  }
  const aspect = Math.sqrt(width / height);
  for (let seed = 0; seed < (options.style === 'airy' ? 0 : 14); seed++) {
    const mirror = (variant + seed) % 2 ? -1 : 1;
    const flip = Math.floor((variant + seed) / 2) % 2 ? -1 : 1;
    const base = items.map(item => ({ id: item.id, x: -item.width / 2, y: -item.height / 2, width: item.width, height: item.height, background: item.background }));
    const angles = options.style === 'diagonal' ? [35, 215, 105, 315, 55, 175, 270] : [145, 30, 215, 325, 90, 180, 0];
    ranked.forEach((index, rank) => {
      if (!rank) return;
      const item = items[index];
      const angle = (angles[(rank - 1 + Math.floor(seed / 4)) % angles.length] + (variant % 3 - 1) * 12) * Math.PI / 180;
      const distance = .32 + Math.floor(rank / 4) * .18 + seed % 3 * .035;
      const cx = item.background ? -.24 * (lead.item.width + item.width) * mirror : Math.cos(angle) * (lead.item.width + item.width) * distance * mirror * clamp(aspect, .75, 1.35);
      const cy = item.background ? -.26 * (lead.item.height + item.height) : Math.sin(angle) * (lead.item.height + item.height) * distance * flip / clamp(aspect, .75, 1.35);
      base[index].x += cx; base[index].y += cy;
    });
    const left = Math.min(...base.map(p => p.x)), top = Math.min(...base.map(p => p.y));
    const w = Math.max(...base.map(p => p.x + p.width)) - left, h = Math.max(...base.map(p => p.y + p.height)) - top;
    const fill = [.90, 1.10, 1.30][seed % 3];
    const scale = Math.min(width / w, height / h) * fill;
    candidates.push(base.map(p => ({ ...p, x: (p.x - left) * scale + (width - w * scale) / 2, y: (p.y - top) * scale + (height - h * scale) / 2, width: p.width * scale, height: p.height * scale, scale })));
  }
  // Свободный ряд даёт безопасную исходную точку для большого числа равнозначных фигур.
  const columns = Math.ceil(Math.sqrt(items.length * width / height)), rows = Math.ceil(items.length / columns);
  const cellW = Math.max(...items.map(i => i.width)) * 1.10, cellH = Math.max(...items.map(i => i.height)) * 1.10;
  const gridScale = Math.min(width * .94 / (columns * cellW), height * .94 / (rows * cellH));
  candidates.push(items.map((p, i) => ({ id: p.id, x: (width - columns * cellW * gridScale) / 2 + (i % columns + .5) * cellW * gridScale - p.width * gridScale / 2,
    y: (height - rows * cellH * gridScale) / 2 + (Math.floor(i / columns) + .5) * cellH * gridScale - p.height * gridScale / 2, width: p.width * gridScale, height: p.height * gridScale, scale: gridScale, background: p.background })));
  const constrain = (placements: Placement[]) => {
    if (options.crop !== 'none') return placements;
    const factor = Math.min(1, ...placements.flatMap(p => [width * .999 / p.width, height * .999 / p.height]));
    return placements.map(p => {
      const w = p.width * factor, h = p.height * factor;
      return { ...p, x: clamp(p.x, 0, width - w), y: clamp(p.y, 0, height - h), width: w, height: h, scale: p.scale! * factor };
    });
  };
  const seeds = candidates.map(constrain).map(placements => ({ placements, metrics: evaluateComposition(items, placements, width, height, context) }))
    .sort((a, b) => a.metrics.score - b.metrics.score).slice(0, items.length <= 3 ? 3 : 1);
  let winner = seeds[0], best = winner.placements, metrics = winner.metrics;
  const accept = (raw: Placement[]) => {
    const candidate = constrain(raw);
    const result = evaluateComposition(items, candidate, width, height, context);
    if (result.score + .00001 < metrics.score) { best = candidate; metrics = result; return true; }
    return false;
  };
  for (const seed of seeds) {
    best = seed.placements; metrics = seed.metrics;
    for (let pass = 0; pass < 5; pass++) {
    const step = [.085, .06, .04, .025, .012][pass];
    for (let cycle = 0; cycle < (items.length <= 3 ? 2 : 1); cycle++) {
      for (const factor of [1.10, 1.04, .94]) accept(best.map(p => ({ ...p, x: width / 2 + (p.x - width / 2) * factor, y: height / 2 + (p.y - height / 2) * factor, width: p.width * factor, height: p.height * factor, scale: p.scale! * factor })));
      for (const factor of [.82, 1.12]) accept(best.map(p => ({ ...p, x: metrics.centroid.x * width + (p.x + p.width / 2 - metrics.centroid.x * width) * factor - p.width / 2, y: metrics.centroid.y * height + (p.y + p.height / 2 - metrics.centroid.y * height) * factor - p.height / 2 })));
      accept(best.map(p => ({ ...p, x: p.x + (context.balanceX - metrics.centroid.x) * width * .6, y: p.y + (context.balanceY - metrics.centroid.y) * height * .6 })));
      for (let i = 0; i < best.length; i++) for (const [dx, dy] of [[-step, 0], [step, 0], [0, -step], [0, step], [-step, -step], [step, step], [-step, step], [step, -step]]) {
        accept(best.map((p, j) => j === i ? { ...p, x: p.x + dx * width, y: p.y + dy * height } : p));
      }
    }
    }
    if (metrics.score < winner.metrics.score) winner = { placements: best, metrics };
  }
  best = winner.placements; metrics = winner.metrics;
  const order = new Map(sceneLayerOrder(best, options.layerOrder).map((id, i) => [id, i]));
  const placements = best.map(p => ({ ...p, scale: p.scale!, layer: order.get(p.id)! }));
  const warnings: string[] = [];
  if (metrics.items.some((p, i) => !items[i].background && p.occlusion > .34)) warnings.push('В наборе есть плотные перекрытия. Попробуйте свободную композицию или уменьшите число элементов.');
  return { placements, heroId, metrics, warnings };
}
