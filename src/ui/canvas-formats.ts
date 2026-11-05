export const canvasFormats = [
  { value: '1280x720', label: '16:9 Горизонтальный', shortLabel: '16:9', icon: 'ratio16x9' },
  { value: '1440x1080', label: '4:3 Горизонтальный', shortLabel: '4:3', icon: 'ratio4x3' },
  { value: '1350x1080', label: '5:4 Горизонтальный', shortLabel: '5:4', icon: 'ratio5x4' },
  { value: '1080x1080', label: '1:1 Квадрат', shortLabel: '1:1', icon: 'ratio1x1' },
  { value: '1080x1350', label: '4:5 Вертикальный', shortLabel: '4:5', icon: 'ratio4x5' },
  { value: '1080x1440', label: '3:4 Вертикальный', shortLabel: '3:4', icon: 'ratio3x4' },
  { value: '720x1280', label: '9:16 Вертикальный', shortLabel: '9:16', icon: 'ratio9x16' }
] as const;

export type CanvasFormat = typeof canvasFormats[number]['value'];
