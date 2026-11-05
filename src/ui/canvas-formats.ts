export const canvasFormats = [
  { value: '1280x720', label: '16:9 · Горизонтальный', shortLabel: '16:9', icon: 'landscape' },
  { value: '1440x1080', label: '4:3 · Горизонтальный', shortLabel: '4:3', icon: 'landscape' },
  { value: '1350x1080', label: '5:4 · Горизонтальный', shortLabel: '5:4', icon: 'landscape' },
  { value: '1080x1080', label: '1:1 · Квадрат', shortLabel: '1:1', icon: 'square' },
  { value: '1080x1350', label: '4:5 · Вертикальный', shortLabel: '4:5', icon: 'portrait' },
  { value: '1080x1440', label: '3:4 · Вертикальный', shortLabel: '3:4', icon: 'portrait' },
  { value: '720x1280', label: '9:16 · Вертикальный', shortLabel: '9:16', icon: 'portrait' }
] as const;

export type CanvasFormat = typeof canvasFormats[number]['value'];
