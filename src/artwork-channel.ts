import { validateProfile, type ArtworkProfile } from './artwork';
export type ArtworkSample = { id: string; png: Uint8Array };
export class ArtworkChannel {
  private serial = 0;
  private pending = new Map<number, { count: number; resolve: (profiles: ArtworkProfile[]) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private send: (message: unknown) => void) {}
  analyze(samples: ArtworkSample[]): Promise<ArtworkProfile[]> {
    const requestId = ++this.serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('Не удалось завершить анализ графики. Откройте плагин повторно')); }, 15000);
      this.pending.set(requestId, { count: samples.length, resolve, reject, timer });
      this.send({ type: 'analyze-artwork', requestId, samples });
    });
  }
  receive(message: { requestId: number; profiles?: ArtworkProfile[]; error?: string }) {
    const pending = this.pending.get(message.requestId); if (!pending) return false;
    clearTimeout(pending.timer); this.pending.delete(message.requestId);
    try {
      if (message.error) throw new Error(message.error);
      if (!Array.isArray(message.profiles) || message.profiles.length !== pending.count) throw new Error('Получен неполный анализ графики');
      pending.resolve(message.profiles.map(validateProfile));
    } catch (error) { pending.reject(error instanceof Error ? error : new Error('Ошибка анализа графики')); }
    return true;
  }
}
