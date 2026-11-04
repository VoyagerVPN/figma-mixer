import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.cache/qa');
const profile = resolve(root, '.cache/inkscape/profile');
const cache = resolve(root, '.cache/inkscape/cache');
await Promise.all([output, profile, cache].map(p => mkdir(p, { recursive: true })));
await build({ entryPoints: [resolve(root, 'src/core.ts')], bundle: true, format: 'esm', platform: 'node', outfile: resolve(output, 'core.mjs') });
const { layoutScene } = await import('file:///' + resolve(output, 'core.mjs').replaceAll('\\', '/'));
await build({ entryPoints: [resolve(root, 'src/artwork.ts')], bundle: true, format: 'esm', platform: 'node', outfile: resolve(output, 'artwork.mjs') });
const { analyzePixels } = await import('file:///' + resolve(output, 'artwork.mjs').replaceAll('\\', '/'));
const assets = JSON.parse(await readFile(resolve(root, 'src/assets/library.json'), 'utf8'));
const themes = [
  { ids: [3, 1] }, { ids: [2, 3] }, { ids: [8, 6, 9] },
  { ids: [4, 10], background: true }, { ids: [6, 9, 5], background: true }, { ids: [1, 7, 2], background: true },
  { ids: [8, 2, 3, 1, 9] },
  { ids: [8, 2, 5, 4] },
  { ids: [8, 2, 5, 4], backgroundIds: [2, 5] }
];
const variants = new Map();
for (const theme of themes) for (const [i, n] of theme.ids.entries()) {
  const role = theme.backgroundIds?.includes(n) || theme.background && i === theme.ids.length - 1 ? 'background' : 'main';
  const key = `${n}-${role}`;
  if (variants.has(key)) continue;
  const asset = assets.find(a => a.id === `starter-${n}`);
  const svg = asset.variants.find(v => v.detail === 'L' && v.role === role).svg;
  const filename = resolve(output, `preview-${key}.svg`);
  await writeFile(filename, svg);
  const bounds = await new Promise((done, fail) => execFile('C:/Program Files/Inkscape/bin/inkscape.exe', [filename, '--query-all'], {
    windowsHide: true, shell: false, env: { ...process.env, INKSCAPE_PROFILE_DIR: profile, XDG_CACHE_HOME: cache }
  }, (error, stdout) => error ? fail(error) : done(stdout)));
  const [x, y, width, height] = bounds.split('\n')[0].split(',').slice(-4).map(Number);
  const png = resolve(output, `mask-${key}.png`);
  await new Promise((done, fail) => execFile('C:/Program Files/Inkscape/bin/inkscape.exe', [filename, '--export-area-drawing', '--export-width=96', `--export-filename=${png}`], {
    windowsHide: true, shell: false, env: { ...process.env, INKSCAPE_PROFILE_DIR: profile, XDG_CACHE_HOME: cache }
  }, error => error ? fail(error) : done()));
  const decoded = JSON.parse(await new Promise((done, fail) => execFile('python', ['-c', 'from PIL import Image; import json,sys; im=Image.open(sys.argv[1]).convert("RGBA").resize((96,96)); print(json.dumps(list(im.tobytes())))', png], { windowsHide: true, shell: false, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => error ? fail(error) : done(stdout))));
  variants.set(key, { id: key, name: asset.name, svg, x, y, width, height, background: role === 'background', profile: analyzePixels(decoded, 96, 96) });
}
const formats = [[1080, 1080], [1200, 630], [1080, 1350]];
await writeFile(resolve(output, 'layout-profiles.json'), JSON.stringify([...variants.values()]));
const parts = [];
for (const [row, theme] of themes.entries()) for (let col = 0; col < formats.length; col++) {
  const [w, h] = formats[col], s = 350 / Math.max(w, h), ox = 20 + col * 380, oy = 40 + row * 395;
  const items = theme.ids.map((n, i) => variants.get(`${n}-${theme.backgroundIds?.includes(n) || theme.background && i === theme.ids.length - 1 ? 'background' : 'main'}`));
  const positions = layoutScene(items, w, h, 0);
  const clip = `frame-${row}-${col}`;
  parts.push(`<text x="${ox}" y="${oy - 12}" font-family="Arial" font-size="13">${items.map(a => a.name).join(' + ')} · ${w}×${h}</text><defs><clipPath id="${clip}"><rect width="${w}" height="${h}"/></clipPath></defs><g transform="translate(${ox} ${oy}) scale(${s})"><g clip-path="url(#${clip})"><rect width="${w}" height="${h}" fill="#D7CDF5"/><path d="M${w * .55} ${h}L${w} ${h * .7}V${h}Z" fill="#AA9BF0"/>`);
  for (const p of [...positions].sort((a, b) => a.layer - b.layer)) {
    const a = items.find(a => a.id === p.id), prefix = `${clip}-${a.id}-`;
    const svg = a.svg.replace(/id="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`).replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`);
    parts.push(svg.replace(/<svg[^>]*>/, `<svg x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" viewBox="${a.x} ${a.y} ${a.width} ${a.height}" overflow="visible">`));
  }
  parts.push('</g></g>');
}
await writeFile(resolve(output, 'layout-gallery.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="${themes.length * 395 + 20}"><rect width="100%" height="100%" fill="white"/>${parts.join('')}</svg>`);
console.log('Галерея: .cache/qa/layout-gallery.svg');
