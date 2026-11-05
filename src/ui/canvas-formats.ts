export const canvasFormats = [
  { value: '1280x720', label: '16:9 · Горизонтальный', shortLabel: '16:9', icon: 'landscape' },
  { value: '1080x1080', label: '1:1 · Квадрат', shortLabel: '1:1', icon: 'square' },
  { value: '1080x1350', label: '4:5 · Вертикальный', shortLabel: '4:5', icon: 'portrait' }
] as const;

export type CanvasFormat = typeof canvasFormats[number]['value'];
