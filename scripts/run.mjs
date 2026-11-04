import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
const cache = resolve(root, '.cache/npm');
const env = { ...process.env, npm_config_cache: cache, npm_config_audit: 'false', npm_config_fund: 'false' };
const targets = {
  install: [resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), 'install', '--ignore-scripts'],
  test: [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', ...process.argv.slice(3), '--pool=threads'],
  'ui-test': [resolve(root, 'scripts/test-ui.mjs')],
  'palette-test': [resolve(root, 'scripts/test-palettes.mjs')],
  'ai-discovery-test': [resolve(root, 'scripts/test-ai-discovery.mjs')],
  'ai-settings-test': [resolve(root, 'scripts/test-ai-settings.mjs')],
  'ai-test': [resolve(root, 'scripts/test-ai.mjs')],
  'flow-test': [resolve(root, 'scripts/test-flow.mjs')],
  typecheck: [resolve(root, 'node_modules/typescript/bin/tsc'), '--noEmit'],
  build: [resolve(root, 'scripts/build.mjs')],
  smoke: [resolve(root, 'scripts/deepseek-smoke.mjs')]
};
if (!targets[mode]) throw new Error('Неизвестная команда');
if (mode === 'install') mkdirSync(cache, { recursive: true });
if (mode === 'test' && process.platform === 'win32') {
  // Vite проверяет сетевые диски через cmd.exe; этот дочерний процесс тоже должен быть скрыт.
  const viteFile = resolve(root, 'node_modules/vite/dist/node/chunks/config.js');
  const source = readFileSync(viteFile, 'utf8');
  const patched = source.replace('exec("net use", (', 'exec("net use", { windowsHide: true }, (');
  if (patched.includes('exec("net use", (')) throw new Error('Не удалось скрыть процесс проверки сетевых дисков Vite');
  if (patched !== source) writeFileSync(viteFile, patched);
}
const child = spawn(process.execPath, targets[mode], { cwd: root, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.on('exit', code => { process.exitCode = code ?? 1; });
child.on('error', err => { console.error(err.message); process.exitCode = 1; });
