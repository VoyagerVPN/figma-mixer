import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, '.cache/qa/palettes-browser'), temporary = resolve(root, '.cache/playwright/tmp');
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
const browser = await chromium.launch({ channel: 'msedge', headless: true, env: { ...process.env }, downloadsPath: output });
const page = await browser.newPage({ viewport: { width: 520, height: 840 } }), errors = [];
page.setDefaultTimeout(6000); page.on('pageerror', error => errors.push(error.message));
const base = `http://127.0.0.1:${server.address().port}`;
async function compose() { await page.getByRole('button', { name: 'Параметры вывода', exact: true }).click(); await page.getByRole('button', { name: 'Выбрать предметы вручную', exact: true }).click(); for (const name of ['Пазлы', 'Книга', 'Телефон']) await page.getByRole('button', { name, exact: true }).click(); await page.getByRole('button', { name: 'К параметрам', exact: true }).click(); }
try {
  await page.goto(base); await compose();
  await page.getByRole('button', { name: 'Палитры', exact: true }).click();
  await page.getByRole('button', { name: 'Создать палитру', exact: true }).click();
  assert.equal(await page.getByLabel('Название палитры', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Заменить цвет #F9ECB0', exact: true }).click();
  await page.getByRole('textbox', { name: 'HEX замены', exact: true }).fill('#FF0000');
  await page.getByRole('textbox', { name: 'HEX замены', exact: true }).press('Enter');
  assert.ok((await page.locator('.palette-composition img').getAttribute('src')).includes('FF0000'));
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.screenshot({ path: resolve(output, 'editor.png') });
  await page.getByRole('button', { name: 'Сохранить как палитру', exact: true }).click();
  await page.getByLabel('Название палитры', { exact: true }).fill('Авторская');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('button', { name: 'Палитра Авторская', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Создать варианты', exact: true }).click();
  await page.waitForFunction(() => !!document.documentElement.dataset.created);
  const options = JSON.parse(await page.locator('html').getAttribute('data-created'));
  assert.ok(options.palette.startsWith('custom-')); assert.equal(options.backgroundColor, '#D7CDF5');
  console.log('OK создание палитры → предпросмотр → сохранение → генерация');

  await page.getByRole('heading', { name: 'Композиции на холсте', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Создать ещё варианты', exact: true }).click();
  await page.getByRole('button', { name: 'Палитры', exact: true }).click();
  await page.getByText('Пример с выбранными предметами', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Заменить цвет #D7CDF5', exact: true }).click();
  const hex = page.getByRole('textbox', { name: 'HEX замены', exact: true });
  await hex.fill('zzzzz'); await hex.press('Tab');
  assert.equal(await page.getByRole('button', { name: 'Использовать', exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Использовать', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: 'Заменить цвет #D7CDF5', exact: true }).click();
  await hex.fill('#152535'); await hex.press('Enter');
  await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'Использовать', exact: true }).click();
  await page.getByRole('button', { name: 'Создать варианты', exact: true }).click();
  await page.getByRole('heading', { name: 'Композиции на холсте', exact: true }).waitFor();
  const applied = JSON.parse(await page.locator('html').getAttribute('data-created'));
  assert.equal(applied.palette, 'draft'); assert.equal(applied.paletteSnapshot.background[0], '#152535'); assert.equal(applied.backgroundColor, '#152535');
  assert.equal(await page.locator('html').getAttribute('data-applied'), null);
  console.log('OK неправильный HEX блокирует применение; Escape закрывает пикер; генерация с несохранённой палитрой не перекрашивает старые сцены');

  await page.reload(); await compose();
  assert.equal(await page.getByRole('button', { name: 'Палитра Изменённая палитра', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Палитра Авторская', exact: true }).click();
  await page.getByRole('button', { name: 'Палитры', exact: true }).click();
  await page.getByRole('button', { name: 'Заменить цвет #F9A3AA', exact: true }).click();
  await hex.fill('#345678'); await hex.press('Enter'); await page.getByRole('button', { name: 'Готово', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Палитры', exact: true }).click();
  await page.getByLabel('Действия палитры', { exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт JSON', exact: true }).click();
  const download = await downloadPromise, exported = resolve(output, 'roundtrip.json'); await download.saveAs(exported);
  const transferred = JSON.parse(await readFile(exported, 'utf8'));
  assert.equal(transferred.name, 'Авторская'); assert.equal(transferred.object_accents[0], '#FF0000'); assert.equal(transferred.object_accents[1], '#345678'); assert.equal(transferred.id, undefined);
  console.log('OK повторное открытие, редактирование и экспорт актуальных цветов');

  await page.getByLabel('Файл палитры', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"name":"Сломанная"}') });
  await page.getByRole('alert').filter({ hasText: 'три' }).waitFor();
  assert.equal(await page.getByLabel('Название палитры', { exact: true }).count(), 0);
  await page.getByLabel('Файл палитры', { exact: true }).setInputFiles(exported);
  await page.getByRole('button', { name: 'Сохранить как палитру', exact: true }).click();
  await page.getByLabel('Название палитры', { exact: true }).fill('Импортированная'); await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('button', { name: 'Палитра Импортированная', exact: true }).waitFor();
  await page.reload(); await compose();
  await page.getByRole('button', { name: 'Палитра Импортированная', exact: true }).waitFor();
  console.log('OK неправильный файл не меняет палитру; импорт JSON сохраняется в документе');

  await page.setViewportSize({ width: 400, height: 760 });
  await page.getByRole('button', { name: 'Палитры', exact: true }).click();
  await page.getByRole('button', { name: 'Заменить цвет #181817', exact: true }).click();
  const popup = await page.locator('.palette-picker').boundingBox(); assert.ok(popup.x >= 0 && popup.x + popup.width <= 400);
  await page.screenshot({ path: resolve(output, 'narrow-picker.png') });
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Закрыть панель', exact: true }).click();
  console.log('OK компактный пикер в панели 400 px, отмена без сохранения');
  assert.deepEqual(errors, []);
} catch (error) { await page.screenshot({ path: resolve(output, 'failure.png') }); throw error; }
finally { await browser.close(); await new Promise(done => server.close(done)); }
