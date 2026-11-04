import { expect, test } from 'vitest';
import { aiPresets, configureAI, listAIModels, publicAI, requestAIJSON, validateAIConfig } from '../src/ai';

test('OpenAI использует выбранную модель, свой endpoint и параметры Chat Completions', async () => {
  const connection = configureAI({ ...aiPresets.openai, model: 'chosen-chat-model', apiKey: 'any-project-key' });
  let url = '', payload: any, headers: any;
  const result = await requestAIJSON('Идея', 'Верни JSON', 1200, connection, async (target, options) => {
    url = String(target); payload = JSON.parse(String(options?.body)); headers = options?.headers;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
  });
  expect(url).toBe('https://api.openai.com/v1/chat/completions');
  expect(payload).toMatchObject({ model: 'chosen-chat-model', max_completion_tokens: 1200, response_format: { type: 'json_object' } });
  expect(payload).not.toHaveProperty('thinking'); expect(payload).not.toHaveProperty('max_tokens');
  expect(headers.Authorization).toBe('Bearer any-project-key'); expect(result).toEqual({ ok: true });
});

test('единый GET /models работает без заранее известного ID модели и использует ключ выбранного сервиса', async () => {
  const captured: any[] = [];
  const previous = configureAI({ ...aiPresets.deepseek, apiKey: 'saved-key' });
  for (const config of [{ ...aiPresets.openai, apiKey: 'openai-key' }, { provider: 'custom' as const, baseUrl: 'https://proxy.example/v1', apiKey: 'proxy-key' }, { ...aiPresets.deepseek, apiKey: '' }]) {
    const models = await listAIModels({ ...config, model: '' }, previous, async (url, options) => {
      captured.push({ url, options });
      return new Response(JSON.stringify({ data: [{ id: 'z-model' }, { id: 'a-model' }, { id: 'a-model' }, { noId: true }] }));
    });
    expect(models).toEqual(['a-model', 'z-model']);
  }
  expect(captured.map(c => c.url)).toEqual(['https://api.openai.com/v1/models', 'https://proxy.example/v1/models', 'https://api.deepseek.com/models']);
  expect(captured.map(c => c.options.headers.Authorization)).toEqual(['Bearer openai-key', 'Bearer proxy-key', 'Bearer saved-key']);
  expect(captured.every(c => c.options.method === 'GET' && !c.options.body)).toBe(true);
});

test('опрос моделей не переносит ключ между сервисами и не подменяет неподдержанный ответ', async () => {
  const previous = configureAI({ ...aiPresets.deepseek, apiKey: 'saved-key' }); let calls = 0;
  await expect(listAIModels({ ...aiPresets.openai, model: '' }, previous, async () => { calls++; return new Response('{}'); })).rejects.toThrow();
  expect(calls).toBe(0);
  for (const reply of [new Response('', { status: 404 }), new Response('{"models":[]}'), new Response('{"data":[]}'), new Response('not json')]) {
    await expect(listAIModels({ ...aiPresets.deepseek }, previous, async () => reply)).rejects.toThrow('вручную');
  }
  await expect(listAIModels({ ...aiPresets.deepseek }, previous, async () => { throw new Error('Network failure'); })).rejects.toThrow('вручную');
  expect(previous.model).toBe('deepseek-flash'); expect(previous.apiKey).toBe('saved-key');
});

test('совместимый endpoint принимает полный путь, а DeepSeek сохраняет свои параметры', async () => {
  const captured: any[] = [];
  const fetcher: typeof fetch = async (url, options) => { captured.push({ url, body: JSON.parse(String(options?.body)) }); return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] })); };
  await requestAIJSON('Идея', 'JSON', 600, configureAI({ provider: 'custom', baseUrl: 'http://127.0.0.1:1234/v1/chat/completions/', model: 'local/model', apiKey: 'arbitrary-key' }), fetcher);
  await requestAIJSON('Идея', 'JSON', 600, configureAI({ ...aiPresets.deepseek, apiKey: 'arbitrary-key' }), fetcher);
  expect(captured[0].url).toBe('http://127.0.0.1:1234/v1/chat/completions');
  expect(captured[0].body).toEqual({ model: 'local/model', max_tokens: 600, messages: [{ role: 'system', content: 'JSON' }, { role: 'user', content: 'Идея' }] });
  expect(captured[1].body).toMatchObject({ model: 'deepseek-flash', thinking: { type: 'disabled' }, response_format: { type: 'json_object' } });
});

test('ключ сохраняется только для того же сервиса; в публичных настройках секрета нет', () => {
  const first = configureAI({ ...aiPresets.deepseek, apiKey: 'private-key' });
  expect(configureAI({ ...aiPresets.deepseek, model: 'another-model' }, first).apiKey).toBe('private-key');
  expect(() => configureAI(aiPresets.openai, first)).toThrow();
  expect(() => configureAI({ provider: 'custom', baseUrl: 'https://proxy.example/v1', model: 'model' }, first)).toThrow();
  expect(publicAI(first)).toEqual(aiPresets.deepseek);
  for (const baseUrl of ['file:///key.txt', 'https://secret@proxy.example/v1', 'https://proxy.example/v1?key=secret', 'https://proxy.example/v1#fragment']) expect(() => validateAIConfig({ provider: 'custom', baseUrl, model: 'model' })).toThrow();
});

test('ключ с переносами строк отклоняется до отправки в HTTP-заголовке', () => {
  expect(() => configureAI({ ...aiPresets.openai, apiKey: 'first-line\nsecond-line' })).toThrow('одной строкой');
});

test('ошибка провайдера не вызывает повторный запрос, а не-JSON отклоняется', async () => {
  const connection = configureAI({ ...aiPresets.openai, apiKey: 'test-key' }); let calls = 0;
  await expect(requestAIJSON('Идея', 'JSON', 600, connection, async () => { calls++; return new Response('', { status: 401 }); })).rejects.toThrow('ключ');
  expect(calls).toBe(1);
  await expect(requestAIJSON('Идея', 'JSON', 600, connection, async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not JSON' } }] })))).rejects.toThrow('JSON');
});
