import { useMemo } from 'react';
import { paletteColor } from '../palettes';
import type { Item, Palette } from '../types';
import { Preview } from './Preview';
import { composeScene } from '../composition';

export type PaletteScene = { svg: string; name: string; backgroundIndex?: number };

export function colorizePreview(svg: string, palette?: Palette): string {
  if (!palette) return svg;
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  for (const node of document.querySelectorAll('*')) for (const property of ['fill', 'stroke']) {
    if (node.closest('[id^="mixer-protected-"]')) continue;
    const value = node.getAttribute(property);
    if (value) node.setAttribute(property, paletteColor(value, palette));
    const style = (node as SVGElement).style;
    const styled = style?.getPropertyValue(property);
    if (styled) style.setProperty(property, paletteColor(styled, palette));
  }
  return new XMLSerializer().serializeToString(document);
}

export function PaletteArtwork({ item, palette }: { item: Item; palette?: Palette }) {
  const svg = useMemo(() => colorizePreview(item.preview, item.origin === 'starter' ? palette : undefined), [item.preview, item.origin, palette]);
  return <Preview svg={svg} />;
}

function exampleScene(items: Item[]): string {
  if (!items.length) return '';
  const documents = items.map(item => new DOMParser().parseFromString(item.preview, 'image/svg+xml'));
  const subjects = items.map(item => ({ id: item.id, width: item.variants[0].width, height: item.variants[0].height }));
  const positions = composeScene(subjects, 1200, 630, 0, { crop: 'none' }).placements;
  const fragments = positions.map((position, index) => {
    const document = documents[index], root = document.documentElement, prefix = `subject-${index}-`;
    for (const node of document.querySelectorAll('[id]')) node.id = prefix + node.id;
    for (const node of document.querySelectorAll('*')) for (const attr of [...node.attributes]) {
      const value = attr.value.replace(/url\(#([^)]*)\)/g, (_, id) => `url(#${prefix}${id})`);
      node.setAttribute(attr.name, (attr.localName === 'href' && value.startsWith('#')) ? '#' + prefix + value.slice(1) : value);
    }
    root.setAttribute('x', String(position.x)); root.setAttribute('y', String(position.y));
    root.setAttribute('width', String(position.width)); root.setAttribute('height', String(position.height));
    if (items[index].origin !== 'starter') root.id = 'mixer-protected-' + index;
    return { layer: position.layer || 0, svg: new XMLSerializer().serializeToString(root) };
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#D7CDF5"/>${fragments.sort((a, b) => a.layer - b.layer).map(f => f.svg).join('')}</svg>`;
}

export function PalettePreview({ items, palette, scene }: { items: Item[]; palette?: Palette; scene?: PaletteScene | null }) {
  const example = useMemo(() => scene ? '' : exampleScene(items), [items, scene]);
  const svg = useMemo(() => colorizePreview(scene?.svg || example, palette), [scene, example, palette]);
  return <figure className="palette-composition"><div>{svg ? <img src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)} alt="Предпросмотр композиции" draggable={false} /> : <span>Выберите предметы для предпросмотра</span>}</div><figcaption>{scene ? 'Выделенная композиция' : 'Пример с выбранными предметами'}</figcaption></figure>;
}
