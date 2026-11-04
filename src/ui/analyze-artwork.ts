import { analyzePixels } from '../artwork';
import type { ArtworkSample } from '../artwork-channel';

export async function analyzeArtwork(samples: ArtworkSample[]) {
  return Promise.all(samples.map(async sample => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(sample.png)], { type: 'image/png' }));
    try {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Не удалось проанализировать графику');
      context.drawImage(image, 0, 0, 96, 96);
      return analyzePixels(context.getImageData(0, 0, 96, 96).data, 96, 96);
    } finally { URL.revokeObjectURL(url); }
  }));
}
