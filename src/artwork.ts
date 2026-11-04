export type ArtworkProfile = {
  size: number;
  alpha: number[];
  importance: number[];
  rgb: number[];
  coverage: number;
  detail: number;
  centroid: { x: number; y: number };
};

export function analyzePixels(data: ArrayLike<number>, width: number, height: number, size = 24): ArtworkProfile {
  if (data.length !== width * height * 4 || width < 1 || height < 1) throw new Error('Некорректное изображение для анализа');
  const alpha = Array(size * size).fill(0), rgb = Array(size * size * 3).fill(0), counts = Array(size * size).fill(0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cell = Math.min(size - 1, Math.floor(y * size / height)) * size + Math.min(size - 1, Math.floor(x * size / width));
    const p = (y * width + x) * 4, a = data[p + 3] / 255;
    counts[cell]++; alpha[cell] += a;
    for (let c = 0; c < 3; c++) rgb[cell * 3 + c] += data[p + c] / 255 * a;
  }
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i]) for (let c = 0; c < 3; c++) rgb[i * 3 + c] /= alpha[i];
    alpha[i] /= counts[i] || 1;
  }
  const importance = alpha.map((a, i) => {
    let edge = 0, neighbors = 0;
    const x = i % size, y = Math.floor(i / size);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (x + dx < 0 || x + dx >= size || y + dy < 0 || y + dy >= size) continue;
      const j = (y + dy) * size + x + dx;
      edge += Math.abs(a - alpha[j]);
      if (a > .1 && alpha[j] > .1) for (let c = 0; c < 3; c++) edge += Math.abs(rgb[i * 3 + c] - rgb[j * 3 + c]) / 3;
      neighbors++;
    }
    return .5 + edge / (neighbors || 1) * 2;
  });
  const mass = alpha.reduce((sum, a) => sum + a, 0);
  if (mass < .01) throw new Error('У элемента нет видимого силуэта');
  let cx = 0, cy = 0;
  for (let i = 0; i < alpha.length; i++) { cx += ((i % size) + .5) / size * alpha[i]; cy += (Math.floor(i / size) + .5) / size * alpha[i]; }
  return { size, alpha, rgb, importance, coverage: mass / (size * size), detail: importance.reduce((sum, v, i) => sum + (v - .5) * alpha[i], 0) / mass, centroid: { x: cx / mass, y: cy / mass } };
}

export function visualWeight(item: { width: number; height: number; profile: ArtworkProfile }, background: string) {
  const p = item.profile;
  const bg = [1, 3, 5].map(start => parseInt(background.slice(start, start + 2), 16) / 255);
  let contrast = 0, chroma = 0, mass = 0;
  for (let i = 0; i < p.alpha.length; i++) {
    const rgb = p.rgb.slice(i * 3, i * 3 + 3), a = p.alpha[i];
    contrast += a * (Math.abs(rgb[0] - bg[0]) * .21 + Math.abs(rgb[1] - bg[1]) * .72 + Math.abs(rgb[2] - bg[2]) * .07);
    chroma += a * (Math.max(...rgb) - Math.min(...rgb)); mass += a;
  }
  return Math.sqrt(item.width * item.height * p.coverage) * (.65 + contrast / mass * .75 + chroma / mass * .3 + p.detail * .65);
}

export function rectangleProfile(): ArtworkProfile {
  return { size: 8, alpha: Array(64).fill(1), importance: Array(64).fill(1), rgb: Array(192).fill(.4), coverage: 1, detail: 0, centroid: { x: .5, y: .5 } };
}

export function validateProfile(value: ArtworkProfile): ArtworkProfile {
  if (!value || !Number.isInteger(value.size) || value.size < 1 || value.size > 32) throw new Error('Некорректный анализ силуэта');
  const n = value.size * value.size;
  if (value.alpha?.length !== n || value.rgb?.length !== n * 3 || value.importance?.length !== n ||
      ![...value.alpha, ...value.rgb].every(v => Number.isFinite(v) && v >= 0 && v <= 1) ||
      !value.importance.every(v => Number.isFinite(v) && v >= 0 && v <= 5) ||
      !Number.isFinite(value.coverage) || value.coverage <= 0 || value.coverage > 1 || !Number.isFinite(value.detail) ||
      !value.centroid || ![value.centroid.x, value.centroid.y].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw new Error('Некорректный анализ силуэта');
  return value;
}
