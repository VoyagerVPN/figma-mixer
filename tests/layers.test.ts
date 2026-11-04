import { expect, test } from 'vitest';
import { moveLayer, reconcileLayers } from '../src/layers';

const items = [{ id: 'book', canBackground: true }, { id: 'phone', canBackground: true }, { id: 'pen', canBackground: false }];
test('перенос в пустой фон сохраняет все объекты и снимает акцент с перенесённого', () => {
  const state = { background: [], main: ['book', 'phone', 'pen'], heroId: 'book', manual: false };
  expect(moveLayer(state, items, 'book', { group: 'background', index: 0 })).toEqual({ background: ['book'], main: ['phone', 'pen'], heroId: '', manual: true });
  expect(state.main).toEqual(['book', 'phone', 'pen']);
});

test('перестановка внутри группы сохраняет акцент и порядок другой группы', () => {
  const state = { background: ['book'], main: ['phone', 'pen'], heroId: 'phone', manual: false };
  expect(moveLayer(state, items, 'phone', { group: 'main', index: 2 })).toEqual({ background: ['book'], main: ['pen', 'phone'], heroId: 'phone', manual: true });
});

test('изменённый набор очищает удалённые элементы, повторы и недоступную фоновую роль', () => {
  expect(reconcileLayers({ background: ['pen', 'book', 'gone'], main: ['book', 'phone'], heroId: 'gone', manual: true }, items))
    .toEqual({ background: ['book'], main: ['phone', 'pen'], heroId: '', manual: true });
});

test('предмет без фоновой версии нельзя сбросить в фон, неудачный перенос ничего не меняет', () => {
  const state = { background: ['book'], main: ['phone', 'pen'], heroId: 'pen', manual: false };
  expect(moveLayer(state, items, 'pen', { group: 'background', index: 0 })).toEqual(state);
});
