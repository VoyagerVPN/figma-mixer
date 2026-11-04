import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, '.cache/qa/dnd-browser'), temporary = resolve(root, '.cache/playwright/tmp');
await Promise.all([output, temporary].map(path => mkdir(path, { recursive: true })));
process.env.TEMP = temporary; process.env.TMP = temporary;
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, '.cache/playwright/browsers');
await build({ entryPoints: [resolve(root, 'tests/layers-fixture.tsx')], outfile: resolve(output, 'app.js'), bundle: true, format: 'iife', target: 'chrome100' });
await writeFile(resolve(output, 'index.html'), '<!doctype html><html lang="ru"><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>');
const server = createServer(async (request, response) => {
  const name = request.url?.split('?')[0], file = name === '/app.js' ? 'app.js' : name === '/app.css' ? 'app.css' : 'index.html';
  response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  response.end(await readFile(resolve(output, file)));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const { chromium } = await import('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true, env: { ...process.env }, downloadsPath: output });
const context = await browser.newContext({ viewport: { width: 520, height: 840 }, hasTouch: true });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const base = `http://127.0.0.1:${server.address().port}`;
const group = name => page.locator(`[data-layer-group="${name}"]`);
const order = name => group(name).locator('[data-layer-id]').evaluateAll(nodes => nodes.map(node => node.dataset.layerId));
async function fresh(query = '') { await page.goto(base + query); await page.getByRole('button', { name: 'Перетащить: ' + (query.includes('large') ? 'Элемент 1' : 'Книга'), exact: true }).waitFor(); }
async function point(locator, bottom = false) { const r = await locator.boundingBox(); assert.ok(r); return { x: r.x + r.width / 2, y: bottom ? r.y + r.height - 3 : r.y + r.height / 2 }; }
async function start(id) { const p = await point(page.locator(`[data-layer-id="${id}"] .drag-handle`)); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 8, p.y + 2, { steps: 3 }); await page.locator('.layer-drag-overlay').waitFor(); }
async function hover(locator, bottom = false) { const p = await point(locator, bottom); await page.mouse.move(p.x, p.y, { steps: 12 }); }
async function dropped(id, name) { await page.locator(`[data-layer-group="${name}"] [data-layer-id="${id}"]`).waitFor(); await page.locator('.layer-drag-overlay').waitFor({ state: 'detached' }); }
let passed = 0;
async function check(name, action) { await action(); passed++; console.log('OK ' + name); }
try {
  await check('мышь: перенос в пустой фон снимает звезду', async () => {
    await fresh(); await start('book'); await hover(group('background').locator('.layer-empty')); await page.mouse.up(); await dropped('book', 'background');
    assert.deepEqual(await order('main'), ['phone', 'pen']); assert.equal(await page.getByRole('switch', { name: 'Главный акцент: Книга', exact: true }).count(), 0);
  });
  await check('мышь: порядок внутри группы', async () => {
    await fresh(); await start('book'); await hover(page.locator('[data-layer-id="pen"]'), true); await page.mouse.up();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-layer-group="main"] [data-layer-id]')].map(n => n.dataset.layerId).join() === 'phone,pen,book');
    assert.equal(await page.getByRole('button', { name: 'Главный акцент: Книга', exact: true }).getAttribute('aria-pressed'), 'true');
  });
  await check('Escape отменяет перенос и оставляет панель открытой', async () => {
    await fresh(); await start('book'); await hover(group('background').locator('.layer-empty')); await page.keyboard.press('Escape');
    await page.locator('.layer-drag-overlay').waitFor({ state: 'detached' }); assert.deepEqual(await order('main'), ['book', 'phone', 'pen']); assert.equal(await page.locator('dialog').evaluate(node => node.open), true);
  });
  await check('сброс за панель и недоступный фон не меняют состав', async () => {
    await fresh(); await start('pen'); await hover(group('background').locator('.layer-empty')); await page.mouse.up(); await page.locator('.layer-drag-overlay').waitFor({ state: 'detached' });
    assert.deepEqual(await order('main'), ['book', 'phone', 'pen']);
    await start('book'); await page.mouse.move(2, 2, { steps: 10 }); await page.mouse.up(); await page.locator('.layer-drag-overlay').waitFor({ state: 'detached' }); assert.deepEqual(await order('main'), ['book', 'phone', 'pen']);
  });
  await check('клавиатура: перестановка и перенос в другой слой', async () => {
    await fresh(); await page.getByRole('button', { name: 'Перетащить: Книга', exact: true }).focus(); await page.keyboard.press('Space'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Space');
    await page.waitForFunction(() => [...document.querySelectorAll('[data-layer-group="main"] [data-layer-id]')].map(n => n.dataset.layerId).join() === 'phone,book,pen');
    await fresh(); await page.getByRole('button', { name: 'Перетащить: Книга', exact: true }).focus(); await page.keyboard.press('Space'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Space'); await dropped('book', 'background');
  });
  await check('touch: перенос после удержания', async () => {
    await fresh(); const touch = await context.newCDPSession(page), from = await point(page.locator('[data-layer-id="book"] .drag-handle')), to = await point(group('background').locator('.layer-empty'));
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
    await new Promise(done => setTimeout(done, 240));
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to.x, y: to.y }] }); await page.locator('.layer-drag-overlay').waitFor();
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await dropped('book', 'background'); await touch.detach();
  });
  await check('автопрокрутка длинного списка и отмена', async () => {
    await fresh('?large'); await start('item-0'); const r = await page.locator('.panel-body').boundingBox(); await page.mouse.move(r.x + r.width / 2, r.y + r.height - 8, { steps: 12 });
    await page.waitForFunction(() => document.querySelector('.panel-body').scrollTop > 120, { timeout: 5000 });
    await page.keyboard.press('Escape'); await page.locator('.layer-drag-overlay').waitFor({ state: 'detached' }); assert.equal((await order('main'))[0], 'item-0');
  });
  await check('звезда нажимается без начала перетаскивания', async () => {
    await fresh(); const star = page.getByRole('button', { name: 'Главный акцент: Телефон', exact: true }); await star.click(); assert.equal(await star.getAttribute('aria-pressed'), 'true'); assert.equal(await page.locator('.layer-drag-overlay').count(), 0);
  });
  await check('Composer передаёт порядок и роли в создание композиции', async () => {
    await page.goto(base + '?composer'); await page.getByRole('button', { name: 'Слои', exact: true }).click(); await start('book'); await hover(group('background').locator('.layer-empty')); await page.mouse.up(); await dropped('book', 'background');
    // MouseSensor удаляет блокировку клика через 50 мс после отпускания.
    await page.waitForTimeout(60);
    await page.getByRole('button', { name: 'Готово', exact: true }).click(); await page.getByRole('button', { name: 'Создать варианты', exact: true }).click();
    const payload = JSON.parse(await page.getByTestId('payload').textContent()); assert.deepEqual(payload.backgroundIds, ['book']); assert.deepEqual(payload.layerOrder, ['book', 'phone', 'pen']);
  });
  assert.deepEqual(errors, []); console.log(`Проверено сценариев DnD: ${passed}`);
  await fresh(); await start('book'); await hover(group('background').locator('.layer-empty')); await page.screenshot({ path: resolve(output, 'drag-preview.png') }); await page.keyboard.press('Escape');
} catch (error) { await page.screenshot({ path: resolve(output, 'failure.png') }); throw error; }
finally { await browser.close(); await new Promise(done => server.close(done)); }
