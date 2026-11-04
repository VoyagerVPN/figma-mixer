import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Panel({ open, title, description, children, close }: { open: boolean; title: string; description?: string; children: ReactNode; close: () => void }) {
  const reference = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = reference.current; if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
    return () => { if (element.open) element.close(); };
  }, [open]);
  return <dialog ref={reference} className="ui-panel" aria-labelledby={id} onKeyDownCapture={event => {
    // Escape сначала отменяет перенос; модальная панель при этом остаётся открытой.
    if (event.key === 'Escape' && event.currentTarget.querySelector('[data-dnd-active=true]')) event.preventDefault();
  }} onCancel={event => { event.preventDefault(); if (!event.currentTarget.querySelector('[data-dnd-active=true]')) close(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const r = event.currentTarget.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
  }}>
      <div className="panel-header"><h2 id={id}>{title}</h2><button className="icon-button" aria-label="Закрыть панель" onClick={close}><Icon name="close" /></button></div>
      <div className="panel-body">{description && <p className="panel-description">{description}</p>}{children}</div>
  </dialog>;
}
