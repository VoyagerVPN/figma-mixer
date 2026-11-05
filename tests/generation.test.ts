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

test('фиксированная палитра обязательна; явные названия с фиксированной палитрой работают локально', async () => {
  await expect(planWithAI({ ...input, palette: 'purple' }, items, builtInPalettes, connection, response({ directions }))).rejects.toThrow('палитру');
  const local = await planWithAI({ ...input, query: 'book, lamp', palette: 'peach' }, items, builtInPalettes, { ...connection, apiKey: '' }, async () => { throw new Error('Запрос не должен выполняться'); });
  expect(local.map(p => p.ids)).toEqual([['book', 'lamp'], ['book', 'lamp']]);
  expect(local.every(p => p.palette === 'peach')).toBe(true);
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
  for (const changed of [{ ids: ['invented'] }, { palette: 'invented' }, { backgroundIds: ['book'] }, { heroId: 'invented' }, { backgroundIndex: 3 }, { ...directions[0] }]) {
    await expect(planWithAI(input, items, builtInPalettes, connection, response({ directions: [directions[0], { ...directions[1], ...changed }] }))).rejects.toThrow();
  }
});
