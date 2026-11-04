import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
const ui = await build({ entryPoints: ['src/ui.tsx'], outfile: 'ui.js', bundle: true, write: false, format: 'iife', target: 'chrome100', minify: true, define: { 'process.env.NODE_ENV': '"production"' } });
const js = ui.outputFiles.find(f => f.path.endsWith('.js') || f.path === '<stdout>')?.text;
const css = ui.outputFiles.find(f => f.path.endsWith('.css'))?.text || '';
const html = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script>' + js?.replace(/<\/script/gi, '<\\/script') + '</script></body></html>';
await writeFile('dist/ui.html', html);
await build({ entryPoints: ['src/plugin.ts'], outfile: 'dist/code.js', bundle: true, format: 'iife', target: 'es2020', minify: false });
await writeFile('dist/manifest.json', JSON.stringify({ name: 'Figma Mixer', id: 'figma-mixer-local-prototype', api: '1.0.0', main: 'code.js', ui: 'ui.html', editorType: ['figma'], documentAccess: 'dynamic-page', networkAccess: { allowedDomains: ['*'], reasoning: 'Пользователь выбирает адрес OpenAI-совместимого API в настройках. Ключ и запросы отправляются только на этот адрес.' } }, null, 2));
console.log('Сборка готова: dist/manifest.json');
