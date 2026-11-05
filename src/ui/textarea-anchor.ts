const textStyles = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
  'font-variant', 'font-feature-settings', 'line-height', 'letter-spacing', 'word-spacing',
  'text-align', 'text-indent', 'text-transform', 'direction', 'white-space',
  'overflow-wrap', 'word-break', 'tab-size', 'padding'
];

export function textareaTextPoint(field: HTMLTextAreaElement, offset: number) {
  // Textarea не отдаёт координаты символов, поэтому измеряем тот же текст в скрытой копии.
  const style = getComputedStyle(field);
  const mirror = document.createElement('div');
  mirror.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box';
  mirror.style.width = field.clientWidth + 'px';
  for (const property of textStyles) mirror.style.setProperty(property, style.getPropertyValue(property));
  const text = document.createTextNode(field.value + '\u200b');
  mirror.append(text);
  document.body.append(mirror);

  try {
    const range = document.createRange();
    const start = Math.min(offset, field.value.length);
    range.setStart(text, start);
    range.setEnd(text, start + 1);
    const character = range.getBoundingClientRect();
    const copy = mirror.getBoundingClientRect();
    const bounds = field.getBoundingClientRect();
    return {
      x: bounds.left + field.clientLeft + character.left - copy.left - field.scrollLeft,
      y: bounds.top + field.clientTop + character.top - copy.top - field.scrollTop,
      bounds
    };
  } finally {
    mirror.remove();
  }
}
