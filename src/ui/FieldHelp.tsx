import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export function FieldHelp({ label, children }: { label: string; children: ReactNode }) {
  const id = useId(), wrapper = useRef<HTMLSpanElement>(null), button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState<{ left: number; top?: number; bottom?: number }>({ left: 16 });
  function show() {
    const rect = button.current!.getBoundingClientRect(), width = Math.min(280, window.innerWidth - 32);
    setPosition({ left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)), ...(window.innerHeight - rect.bottom >= 160 ? { top: rect.bottom + 8 } : { bottom: window.innerHeight - rect.top + 8 }) });
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); } };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', close); document.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); window.removeEventListener('resize', close); document.removeEventListener('scroll', close, true); };
  }, [open]);
  return <span ref={wrapper} className="field-help" onPointerEnter={show} onPointerLeave={() => { if (document.activeElement !== button.current) setOpen(false); }}>
    <button ref={button} type="button" className="field-help-trigger" aria-label={label} aria-describedby={open ? id : undefined} onClick={show} onFocus={show} onBlur={() => setOpen(false)}><Icon name="help" /></button>
    {open && <span id={id} role="tooltip" className="field-help-popup" style={position}>{children}</span>}
  </span>;
}
