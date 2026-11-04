export type SelectionObject = { id: string; name: string; type: string; children?: readonly SelectionObject[]; parent?: { id: string } | null };

export function selectionUnits<T extends SelectionObject>(selection: readonly T[], splitContainer = false): T[] {
  if (splitContainer) {
    if (selection.length !== 1 || !selection[0].children || selection[0].type === 'COMPONENT_SET') throw new Error('Выделите один контейнер с элементами');
    return [...selection[0].children] as T[];
  }
  const ids = new Set(selection.map(node => node.id));
  return selection.filter(node => !node.parent || !ids.has(node.parent.id));
}
import type { DraftItem } from './types';
let draftSequence = 0;
export const newDraftId = () => 'draft-' + Date.now().toString(36) + '-' + (++draftSequence).toString(36);

export function validateDraft(name: string, items: DraftItem[]) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw new Error('Укажите название набора до 100 символов');
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('Добавьте от 1 до 100 элементов');
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Повторяющиеся элементы в импорте');
  for (const item of items) {
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 100) throw new Error('Укажите название элемента до 100 символов');
    if (typeof item.description !== 'string' || item.description.length > 2000) throw new Error('Описание элемента слишком длинное');
    if (!Array.isArray(item.variants) || !item.variants.length || item.variants.length > 30) throw new Error('Элемент должен содержать от 1 до 30 вариантов');
    for (const variant of item.variants) {
      if (!['default', 'S', 'L'].includes(variant.detail) || !['default', 'main', 'background'].includes(variant.role)) throw new Error('Некорректные свойства варианта');
      if (Boolean(variant.nodeId) === Boolean(variant.svg)) throw new Error('У варианта должен быть один источник графики');
    }
  }
  return { name: name.trim(), items };
}

export function mergeElements(items: DraftItem[], ids: string[], name: string): DraftItem[] {
  const chosen = items.filter(item => ids.includes(item.id));
  if (chosen.length < 2 || !name.trim()) throw new Error('Выберите минимум два элемента и укажите общее название');
  const merged = { ...chosen[0], name: name.trim(), variants: chosen.flatMap(item => item.variants) };
  return items.flatMap(item => item.id === chosen[0].id ? [merged] : ids.includes(item.id) ? [] : [item]);
}

export function validateSvg(svg: string) {
  if (typeof svg !== 'string' || svg.length > 5_000_000 || !/<svg[\s>]/i.test(svg) || /<!DOCTYPE|<!ENTITY|<(?:\w+:)?(?:image|script|foreignObject|iframe|object|embed|text)\b|\bon\w+\s*=|(?:\b(?:xlink:)?href\s*=\s*["']\s*(?!#))|url\(\s*["']?\s*(?!#)[a-z]+:|@import/i.test(svg)) throw new Error('Нужен автономный векторный SVG: без растра, текста, скриптов и внешних ресурсов. Текст переведите в кривые');
}
