import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, '.cache/qa/flow-browser'), temporary = resolve(root, '.cache/playwright/tmp');
await Promise.all([output, temporary].map(path => mkdir(path, { recursive: true })));
process.env.TEMP = temporary; process.env.TMP = temporary;
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, '.cache/playwright/browsers');
await build({ entryPoints: [resolve(root, 'tests/palettes-fixture.ts')], outfile: resolve(output, 'app.js'), bundle: true, format: 'iife', target: 'chrome100' });
await writeFile(resolve(output, 'index.html'), '<!doctype html><html lang="ru"><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>');
const server = createServer(async (request, response) => {
  const file = request.url === '/app.js' ? 'app.js' : request.url === '/app.css' ? 'app.css' : 'index.html';
  response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  response.end(await readFile(resolve(output, file)));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const { chromium } = await import('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, env: { ...process.env } });
const page = await browser.newPage({ viewport: { width: 520, height: 840 } }), errors = [];
page.setDefaultTimeout(4000); page.on('pageerror', error => errors.push(error.message));
const base = `http://127.0.0.1:${server.address().port}`;
const button = name => page.getByRole('button', { name, exact: true });
const heading = name => page.getByRole('heading', { name, exact: true });
const library = page.getByRole('combobox', { name: 'Библиотека', exact: true });
const input = page.getByRole('textbox', { name: 'Названия предметов', exact: true });
const rootNode = page.locator('html');
async function own() {
  await library.click();
  await page.getByRole('option', { name: 'Добавить свои элементы…', exact: true }).click();
}
async function importSvg(name, markup) {
  await own();
  await page.locator('input[type=file][accept=".svg,image/svg+xml"]').setInputFiles({
    name: name + '.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">' + markup + '</svg>')
  });
  await button('Использовать библиотеку').click();
  await heading('Новая композиция').waitFor();
}
async function generate() {
  await button('Создать композиции').click();
  await page.waitForFunction(() => Boolean(document.documentElement.dataset.promptResult));
  await button('Создать композиции').waitFor();
  return JSON.parse(await rootNode.getAttribute('data-created'));
}
try {
  await page.goto(base + '?empty');
  await heading('Новая композиция').waitFor();
  assert.equal(await button('Выбрать предметы вручную').count(), 0);
  await own();
  await button('Назад').click();
  await button('Предметы').click();
  await button('Добавить предмет').click();
  const picker = page.getByRole('dialog', { name: 'Добавить предмет', exact: true });
  await picker.getByRole('button', { name: 'Книга', exact: true }).click();
  assert.equal(await input.inputValue(), 'Книга, ');
  await input.fill('Книга, Лампа');
  const first = await generate();
  assert.deepEqual(first.ids, ['starter-2', 'starter-5']);
  assert.equal(await input.inputValue(), 'Книга, Лампа');
  await input.fill('Пазлы');
  await button('Создать композиции').click();
  await page.waitForFunction(() => JSON.parse(document.documentElement.dataset.created || '{}').ids?.join() === 'starter-1');
  assert.equal(await button('Продолжить в Figma').count(), 0);
  console.log('OK первый запуск без мастера → точный состав → повторная генерация на том же экране');

  await button('Больше вариантов').click();
  await button('Больше вариантов').click();
  await button('Создать композиции').click();
  const gallery = page.getByRole('region', { name: 'Варианты', exact: true });
  const card = number => gallery.getByRole('button', { name: 'Вариант ' + number, exact: true });
  await card(3).waitFor({ timeout: 2000 });
  assert.equal(await card(1).getAttribute('aria-pressed'), 'true');
  assert.equal(await card(2).getAttribute('aria-pressed'), 'false');
  const before = await card(2).locator('img').getAttribute('src');
  await card(2).click();
  await card(3).click({ modifiers: ['Shift'] });
  assert.equal(await card(1).getAttribute('aria-pressed'), 'false');
  assert.equal(await card(2).getAttribute('aria-pressed'), 'true');
  assert.equal(await card(3).getAttribute('aria-pressed'), 'true');
  await page.setViewportSize({ width: 640, height: 720 });
  await button('Перекрасить 2 варианта').click();
  const paletteDialog = page.getByRole('dialog', { name: 'Оформление композиции', exact: true });
  await paletteDialog.getByRole('button', { name: 'Выбор палитры', exact: true }).click();
  await paletteDialog.getByRole('button', { name: 'Выбрать палитру: Персик', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.canvasPreview?.includes('FDD7B9'), undefined, { timeout: 2000 });
  assert.equal(await paletteDialog.getByText('Цвета меняются на холсте Figma.', { exact: true }).count(), 0);
  await paletteDialog.screenshot({ path: resolve(output, 'live-palette-640.png') });
  await paletteDialog.getByRole('button', { name: 'Применить к 2 вариантам', exact: true }).click();
  await paletteDialog.waitFor({ state: 'detached' });
  const applied = JSON.parse(await rootNode.getAttribute('data-applied'));
  assert.equal(applied.palette, 'peach');
  assert.deepEqual(applied.ids, ['frame-3', 'frame-4']);
  await page.waitForFunction(previous => document.querySelector('[aria-label="Вариант 2"] img')?.getAttribute('src') !== previous, before);
  await card(1).click();
  await card(2).click({ modifiers: ['Shift'] });
  assert.equal(await button('Перекрасить 2 варианта').isDisabled(), true);
  assert.equal(await gallery.getByText('Выберите варианты с одинаковой палитрой.', { exact: true }).count(), 1);
  const unchanged = await card(1).locator('img').getAttribute('src');
  assert.ok(unchanged.includes('D7CDF5'));
  await page.evaluate(() => window.postMessage({ pluginMessage: { type: 'fixture-selection', ids: ['frame-2'] } }, '*'));
  await page.waitForFunction(() => document.querySelector('[aria-label="Вариант 1"]')?.getAttribute('aria-pressed') === 'true');
  assert.equal(await card(2).getAttribute('aria-pressed'), 'false');
  await button('Перекрасить композицию').click();
  const importedPalette = { version: 1, name: 'Контрастная', background: ['#113355', '#557799', '#AACCFF'], object_accents: ['#FF0000', '#00FF00', '#0000FF'], ink: '#101010', paper: '#FAFAFA' };
  await paletteDialog.getByLabel('Файл палитры', { exact: true }).setInputFiles({ name: 'palette.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(importedPalette)) });
  await page.waitForFunction(() => document.documentElement.dataset.canvasPreview?.includes('113355'));
  await paletteDialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await paletteDialog.waitFor({ state: 'detached' });
  await page.waitForFunction(() => !document.documentElement.dataset.canvasPreview);
  assert.deepEqual(JSON.parse(await rootNode.getAttribute('data-applied')).ids, ['frame-3', 'frame-4']);
  await button('Перекрасить композицию').click();
  await paletteDialog.getByLabel('Файл палитры', { exact: true }).setInputFiles({ name: 'palette.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(importedPalette)) });
  await paletteDialog.getByRole('button', { name: 'Применить', exact: true }).click();
  await paletteDialog.waitFor({ state: 'detached' });
  const single = JSON.parse(await rootNode.getAttribute('data-applied'));
  assert.deepEqual(single.ids, ['frame-2']);
  assert.equal(single.palette.background[0], '#113355');
  assert.equal(await page.getByRole('combobox', { name: 'Палитра', exact: true }).innerText(), 'Авто');
  console.log('OK миниатюры ↔ холст → перекраска двух вариантов и импорт для одного');

  await page.goto(base);
  await button('Управление библиотеками').click();
  await button('Стартовый набор Элементов: 10').click();
  assert.equal(await page.getByRole('checkbox', { name: 'Объединить Книга', exact: true }).isVisible(), true);
  await button('Открыть элемент Книга').click();
  await heading('Карточка элемента').waitFor();
  await button('К элементам набора').click();
  await button('Создать композицию').click();
  await heading('Новая композиция').waitFor();
  assert.ok((await library.innerText()).includes('Стартовый набор'));
  console.log('OK карточки библиотеки и переход к основному генератору');

  await page.goto(base + '?empty');
  await button('Предметы').click();
  await importSvg('Круг', '<circle cx="40" cy="40" r="30" fill="#333333"/>');
  assert.ok((await library.innerText()).includes('Моя библиотека'));
  await input.fill('Круг');
  const imported = await generate();
  assert.deepEqual(imported.ids, ['imported-0']);
  await card(1).waitFor();
  await importSvg('Квадрат', '<rect width="80" height="80" fill="#333333"/>');
  assert.equal(await card(1).count(), 1);
  await input.fill('Квадрат');
  await button('Добавить предмет').click();
  assert.equal(await picker.getByRole('button', { name: 'Квадрат', exact: true }).isVisible(), true);
  console.log('OK импорт SVG → активная библиотека → генерация; последний результат остаётся виден при импорте');

  await page.goto(base + '?create-error');
  await button('Предметы').click();
  await input.fill('Книга');
  await button('Создать композиции').click();
  await page.getByRole('alert').filter({ hasText: 'Тестовая ошибка генерации' }).waitFor();
  assert.equal(await input.inputValue(), 'Книга');
  const retry = await generate();
  assert.deepEqual(retry.ids, ['starter-2']);
  console.log('OK ошибка сохраняет текст, повторная генерация проходит');
  assert.deepEqual(errors, []);
} finally { await browser.close(); await new Promise(done => server.close(done)); }
