import { useEffect, useState } from 'react';
import { hexToHsv, hsvToHex, normalizeHex } from '../color';
import { Icon } from './Icon';

export function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(value), [hue, setHue] = useState(hexToHsv(value).h);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(value); setInvalid(false); }, [value]);
  const hsv = hexToHsv(value), h = hsv.s && hsv.v ? hsv.h : hue;
  function change(next: Partial<typeof hsv>) { const model = { ...hsv, h, ...next }; setHue(model.h); onChange(hsvToHex(model)); }
  function commit() { const normalized = normalizeHex(draft); setInvalid(!normalized); if (normalized) { setDraft(normalized); onChange(normalized); } }
  return <div className="color-picker">
    <span className="field-caption">Цвет фона</span>
    <button className="color-trigger" type="button" aria-expanded={open} onClick={() => setOpen(!open)}><span className="color-chip" style={{ background: value }} /><span>{value.toUpperCase()}</span><span className="color-edit with-icon"><Icon name={open ? 'up' : 'edit'} />{open ? 'Свернуть' : 'Изменить'}</span></button>
    {open && <div className="color-panel">
      <div className="color-sv" aria-hidden="true" style={{ backgroundColor: hsvToHex({ h, s: 1, v: 1 }) }} onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = event.currentTarget.getBoundingClientRect();
        change({ s: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), v: 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) });
      }} onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = event.currentTarget.getBoundingClientRect(); change({ s: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), v: 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }); }}><span style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} /></div>
      <label className="color-slider">Тон<input aria-label="Тон фона" className="hue-track" type="range" min={0} max={359} value={Math.round(h)} onChange={e => change({ h: +e.target.value })} /></label>
      <div className="two-columns"><label className="color-slider">Насыщенность<input aria-label="Насыщенность фона" type="range" min={0} max={100} value={Math.round(hsv.s * 100)} onChange={e => change({ s: +e.target.value / 100 })} /></label><label className="color-slider">Яркость<input aria-label="Яркость фона" type="range" min={0} max={100} value={Math.round(hsv.v * 100)} onChange={e => change({ v: +e.target.value / 100 })} /></label></div>
      <label>HEX<input aria-label="HEX фона" value={draft} maxLength={7} aria-invalid={invalid} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); }} /></label>
      {invalid && <p className="color-error" role="alert">Введите 3 или 6 символов HEX.</p>}
    </div>}
  </div>;
}
