import { expect, test } from 'vitest';
import { ArtworkChannel } from '../src/artwork-channel';
import { rectangleProfile } from '../src/artwork';

test('ответ анализа сопоставляется с запросом, посторонний ответ не завершает ожидание', async () => {
  const sent: any[] = [], channel = new ArtworkChannel(message => sent.push(message));
  const pending = channel.analyze([{ id: 'a', png: new Uint8Array([1]) }]);
  expect(channel.receive({ requestId: 0, profiles: [] })).toBe(false);
  channel.receive({ requestId: sent[0].requestId, profiles: [rectangleProfile()] });
  expect(await pending).toHaveLength(1);
});

test('повреждённые и неполные профили не подменяются прямоугольниками', async () => {
  const sent: any[] = [], channel = new ArtworkChannel(message => sent.push(message));
  const pending = channel.analyze([{ id: 'a', png: new Uint8Array([1]) }]);
  channel.receive({ requestId: sent[0].requestId, profiles: [] });
  await expect(pending).rejects.toThrow('анализ');
});
