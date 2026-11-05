import { expect, test } from 'vitest';
import { generateCompositions, planWithAI } from '../src/generation';
import { aiPresets } from '../src/ai';
import { builtInPalettes } from '../src/palettes';
import type { Item } from '../src/types';

const items: Item[] = ['book', 'lamp', 'phone'].map(id => ({ id, setId: 'test', name: id, description: '', origin: 'starter', preview: '', variants: [{ detail: 'L', role: 'main', nodeId: id, width: 100, height: 100 }] }));
const connection = { ...aiPresets.deepseek, apiKey: 'test-key' };
const input = { query: 'Обучение через практику', setId: 'test', palette: 'auto', width: 1200, height: 630, count: 2 };
const directions = [
  { title: 'Знания и идея', ids: ['book', 'lamp'], palette: 'purple', backgroundIndex: 0, style: 'balanced', heroId: 'book', backgroundIds: [], explanation: 'Книга и лампа связывают знания с идеей.' },
  { title: 'Доступ к знаниям', ids: ['book', 'phone'], palette: 'peach', backgroundIndex: 1, style: 'airy', heroId: 'phone', backgroundIds: [], explanation: 'Телефон помогает применять знания.' }
];
const response = (value: unknown) => async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));

test('один AI-запрос подбирает разные составы и только доступные палитры', async () => {
  let sent: any;
  const catalog = [{ ...items[0], description: 'Старое описание из сохранённой библиотеки' }, ...items.slice(1)];
  const plan = await planWithAI(input, catalog, builtInPalettes, connection, async (_url, options) => {
    sent = JSON.parse(String(options?.body));
    return response({ directions })();
  });
  expect(plan.map(p => p.ids)).toEqual([['book', 'lamp'], ['book', 'phone']]);
  expect(plan.map(p => p.palette)).toEqual(['purple', 'peach']);
  expect(sent.messages[0].content).toContain('backgroundIds');
  expect(sent.messages[0].content).toContain('"name":"book"');
  expect(sent.messages[0].content).not.toContain('"description"');
  expect(sent.response_format).toEqual({ type: 'json_object' });
});

test('для запроса «книга фоном» генератор сохраняет фон во всех вариантах и сбрасывает недопустимый акцент', async () => {
  const book = items[0];
  const catalog: Item[] = [{
    ...book,
    name: 'Книга',
    variants: [...book.variants, { ...book.variants[0], role: 'background', nodeId: 'book-bg' }]
  }, ...items.slice(1)];
  const planned = [
    { ...directions[0], backgroundIds: ['book'] },
    { ...directions[1], backgroundIds: ['book'] },
    { ...directions[1], ids: ['book', 'lamp', 'phone'], heroId: 'invented', backgroundIds: ['book'] }
  ];
  const renderedRoles: { backgroundIds: string[]; heroId: string }[] = [];
  const result = await generateCompositions({ ...input, mode: 'metaphor', query: 'Книга фоном', count: 3 }, catalog, builtInPalettes, connection, {
    create: async ({ backgroundIds, heroId }) => {
      renderedRoles.push({ backgroundIds: backgroundIds ?? [], heroId: heroId ?? '' });
      return { frameIds: [`frame-${renderedRoles.length}`] };
    },
    removeGenerated: async () => {}
  }, async (_url, options) => {
    const { messages } = JSON.parse(String(options?.body));
    expect(messages[1].content).toBe('Книга фоном');
    expect(messages[0].content).toContain('"name":"Книга","canBackground":true');
    expect(messages[0].content).toMatch(/«книга фоном»[^\n]+в каждом варианте[^\n]+ids и backgroundIds/u);
    return response({ directions: planned })();
  });
  expect(result.frameIds).toHaveLength(3);
  expect(renderedRoles).toEqual([
    { backgroundIds: ['book'], heroId: '' },
    { backgroundIds: ['book'], heroId: 'phone' },
    { backgroundIds: ['book'], heroId: '' }
  ]);
});

test('фиксированная палитра обязательна; явные названия с фиксированной палитрой работают локально', async () => {
  await expect(planWithAI({ ...input, palette: 'purple' }, items, builtInPalettes, connection, response({ directions }))).rejects.toThrow('палитру');
  const local = await planWithAI({ ...input, query: 'book, lamp', palette: 'peach' }, items, builtInPalettes, { ...connection, apiKey: '' }, async () => { throw new Error('Запрос не должен выполняться'); });
  expect(local.map(p => p.ids)).toEqual([['book', 'lamp'], ['book', 'lamp']]);
  expect(local.every(p => p.palette === 'peach')).toBe(true);
});

test('выбранный предмет передаётся по имени и требуется в каждом варианте по метафоре', async () => {
  const tagged = { ...input, requiredItemIds: ['book'] };
  let system = '';
  const plan = await planWithAI(tagged, items, builtInPalettes, connection, async (_url, options) => {
    system = JSON.parse(String(options?.body)).messages[0].content;
    return response({ directions })();
  });
  expect(system).toContain('Обязательные предметы');
  expect(system).toContain('"name":"book"');
  expect(plan.every(p => p.ids.includes('book'))).toBe(true);
  await expect(planWithAI(tagged, items, builtInPalettes, connection, response({
    directions: [directions[0], { ...directions[1], ids: ['phone'] }]
  }))).rejects.toThrow('обязательный предмет');
});

test('состав из одних плашек компонуется локально по идентификаторам', async () => {
  const plan = await planWithAI({ ...input, query: '', requiredItemIds: ['lamp', 'book'] }, items, builtInPalettes, { ...connection, apiKey: '' },
    async () => { throw new Error('Запрос не должен выполняться'); });
  expect(plan.map(p => p.ids)).toEqual([['lamp', 'book'], ['lamp', 'book']]);
});

test('режим предметов сохраняет состав и с автоматической палитрой работает локально', async () => {
  const withoutAI = async () => { throw new Error('Запрос не должен выполняться'); };
  const options = { ...input, mode: 'items' as const, requiredItemIds: ['book'] };
  const plan = await planWithAI({ ...options, query: 'lamp' }, items, builtInPalettes, connection, withoutAI);
  expect(plan.map(p => p.ids)).toEqual([['book', 'lamp'], ['book', 'lamp']]);
  await expect(planWithAI({ ...options, query: 'неизвестный предмет' }, items, builtInPalettes, connection, withoutAI))
    .rejects.toThrow('неизвестный предмет');
});

test('название предмета с запятой остаётся целым в редактируемом списке', async () => {
  const catalog = [{ ...items[0], name: 'Книга, открытая' }, items[1]];
  const options = { ...input, mode: 'items' as const, query: '"Книга, открытая", lamp, ' };
  const plan = await planWithAI(options, catalog, builtInPalettes, connection,
    async () => { throw new Error('Запрос не должен выполняться'); });
  expect(plan.map(p => p.ids)).toEqual([['book', 'lamp'], ['book', 'lamp']]);
});

test('в метафоре ручное упоминание по имени обязательно, включая имена из нескольких слов', async () => {
  const catalog = [items[0], { ...items[1], name: 'Настольная лампа' }, items[2]];
  const options = { ...input, mode: 'metaphor' as const, query: 'Рядом с @настольная лампа, добавь что-нибудь для учёбы' };
  await expect(planWithAI(options, catalog, builtInPalettes, connection, response({ directions })))
    .rejects.toThrow('обязательный предмет');
  await expect(planWithAI({ ...options, query: 'Вечер с @неизвестный' }, catalog, builtInPalettes, connection, response({ directions })))
    .rejects.toThrow('@неизвестный');
});

test('весь план проверяется перед созданием; при ошибке рендера удаляются только новые фреймы', async () => {
  const made: any[] = [], removed: string[][] = [];
  const renderer = { create: async (options: any) => { made.push(options); if (made.length === 2) throw new Error('Ошибка рендера'); return { frameIds: ['new-frame'] }; }, removeGenerated: async (ids: string[]) => { removed.push(ids); } };
  await expect(generateCompositions(input, items, builtInPalettes, connection, renderer, response({ directions: [directions[0], { ...directions[1], ids: ['unknown'] }] }))).rejects.toThrow();
  expect(made).toEqual([]);
  await expect(generateCompositions(input, items, builtInPalettes, connection, renderer, response({ directions }))).rejects.toThrow('Ошибка рендера');
  expect(made[0]).toMatchObject({ ids: ['book', 'lamp'], count: 1, palette: 'purple', width: 1200, height: 630 });
  expect(made[1]).toMatchObject({ ids: ['book', 'phone'], palette: 'peach', backgroundColor: '#FAC896' });
  expect(removed).toEqual([['new-frame']]);
});

test('выдуманные предметы, палитры, роли и повтор одинакового состава отклоняются до рендера', async () => {
  for (const changed of [{ ids: ['invented'] }, { palette: 'invented' }, { backgroundIds: ['book'] }, { backgroundIndex: 3 }, { ...directions[0] }]) {
    await expect(planWithAI(input, items, builtInPalettes, connection, response({ directions: [directions[0], { ...directions[1], ...changed }] }))).rejects.toThrow();
  }
});
