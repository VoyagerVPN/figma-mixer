import { useEffect, useId, useState, type PointerEvent } from 'react';
import { hexToHsv, hsvToHex, normalizeHex, type HSV } from '../color';

const clamp = (value: number, max = 1) => Math.max(0, Math.min(max, value));

export function ColorPicker({ value, onChange, label = 'Цвет', inputLabel = 'цвета', onValidityChange }: {
  value: string; onChange: (value: string) => void; label?: string; inputLabel?: string; onValidityChange?: (valid: boolean) => void;
}) {
  const [model, setModel] = useState(() => hexToHsv(value));
  const [draft, setDraft] = useState(value), [invalid, setInvalid] = useState(false);
  const instructions = useId();
  useEffect(() => {
    setDraft(value); setInvalid(false);
    // Чёрный и серый не должны сбрасывать выбранный оттенок при движении шкалы яркости.
    setModel(previous => {
      if (hsvToHex(previous) === normalizeHex(value)) return previous;
      const next = hexToHsv(value);
      return { ...next, h: next.s ? next.h : previous.h, s: next.v ? next.s : previous.s };
    });
  }, [value]);
  function change(next: Partial<HSV>) {
    const updated = { ...model, ...next }, color = hsvToHex(updated);
    setModel(updated); setDraft(color); setInvalid(false); onValidityChange?.(true); onChange(color);
  }
  function commit() {
    const normalized = normalizeHex(draft);
    setInvalid(!normalized); onValidityChange?.(!!normalized);
    if (normalized) { setDraft(normalized); onChange(normalized); }
  }
  function point(event: PointerEvent<HTMLDivElement>, brightness = false) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (brightness) change({ v: 1 - clamp((event.clientY - rect.top) / rect.height) });
    else change({ h: clamp((event.clientX - rect.left) / rect.width) * 360, s: 1 - clamp((event.clientY - rect.top) / rect.height) });
  }
  return <div className="color-picker sparkshot-picker">
    <div className="picker-field-labels"><span>Оттенок</span><span>Яркость</span></div>
    <div className="picker-fields">
      <div className="picker-hs" role="slider" tabIndex={0} aria-label={`Оттенок и насыщенность ${inputLabel}`} aria-describedby={instructions}
        aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(model.h)} aria-valuetext={`${Math.round(model.h)}°, насыщенность ${Math.round(model.s * 100)}%`}
        onPointerDown={event => { event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); point(event); }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) point(event); }}
        onKeyDown={event => {
          const step = event.shiftKey ? 10 : 1;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); change({ h: clamp(model.h + (event.key === 'ArrowRight' ? step : -step), 360) }); }
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); change({ s: clamp(model.s + (event.key === 'ArrowUp' ? step : -step) / 100) }); }
        }}><span className="picker-crosshair" style={{ left: `${model.h / 3.6}%`, top: `${(1 - model.s) * 100}%` }} /></div>
      <div className="picker-brightness" role="slider" tabIndex={0} aria-label={`Яркость ${inputLabel}`} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(model.v * 100)}
        style={{ background: `linear-gradient(to bottom, ${hsvToHex({ ...model, v: 1 })}, #000)` }}
        onPointerDown={event => { event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); point(event, true); }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) point(event, true); }}
        onKeyDown={event => {
          const direction = ['ArrowUp', 'ArrowRight', 'PageUp'].includes(event.key) ? 1 : ['ArrowDown', 'ArrowLeft', 'PageDown'].includes(event.key) ? -1 : 0;
          if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); change({ v: event.key === 'Home' ? 1 : 0 }); }
          else if (direction) { event.preventDefault(); change({ v: clamp(model.v + direction * (event.shiftKey || event.key.startsWith('Page') ? .1 : .01)) }); }
        }}>
        <span className="picker-brightness-marker" style={{ top: `${(1 - model.v) * 100}%` }} />
      </div>
    </div>
    <span id={instructions} className="picker-instructions">Стрелки влево и вправо — оттенок, вверх и вниз — насыщенность. Shift увеличивает шаг.</span>
    <div className="picker-value-row">
      <label className="picker-hex">HEX<input aria-label={`HEX ${inputLabel}`} value={draft} maxLength={7} spellCheck={false} aria-invalid={invalid}
        onChange={event => { setDraft(event.target.value); onValidityChange?.(!!normalizeHex(event.target.value)); }}
        onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') commit(); }} /></label>
      <span className="picker-color-preview" role="img" aria-label={`${label}: ${value}`} style={{ background: value }} />
    </div>
    {invalid && <p className="color-error" role="alert">Введите 3 или 6 символов HEX.</p>}
  </div>;
}
