import { useState } from 'react';
import type { Detail, DraftVariant, Item, Role } from '../types';
import { Preview } from './Preview';
import { CustomSelect } from './CustomSelect';
import { Icon } from './Icon';

export function ItemEditor({ item, busy, save, cancel }: { item: Item; busy: boolean; save: (name: string, description: string, variants: DraftVariant[]) => void; cancel: () => void }) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description);
  const [variants, setVariants] = useState<DraftVariant[]>(item.variants.map(v => ({ nodeId: v.nodeId, detail: v.detail, role: v.role, label: v.label || 'Исходный' })));
  const patch = (index: number, value: Partial<DraftVariant>) => setVariants(current => current.map((v, i) => i === index ? { ...v, ...value } : v));
  return <>
    <button className="back" onClick={cancel}><Icon name="arrow" />К элементам набора</button><h1>Карточка элемента</h1><Preview svg={item.preview} className="large" />
    <label>Название<input value={name} maxLength={100} onChange={e => setName(e.target.value)} /></label>
    <label>Описание для смыслового подбора <span className="optional">Необязательно</span><textarea maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Например: обучение, знания, исследование" /></label>
    <details open={variants.length > 1}><summary>Варианты элемента · {variants.length}</summary><p className="hint">Для обычного элемента оставьте «Исходный». Настройки S/L и ролей нужны, только если такие версии подготовлены.</p>
      {variants.map((v, index) => <div className="variant-row" key={v.nodeId}><label>Название версии<input value={v.label} maxLength={100} onChange={e => patch(index, { label: e.target.value })} /></label><div className="two-columns"><CustomSelect<Detail> label="Детализация" ariaLabel={`Детализация версии ${index + 1}`} value={v.detail} onChange={detail => patch(index, { detail })} options={[{ value: 'default', label: 'Исходная' }, { value: 'S', label: 'S · Упрощённая' }, { value: 'L', label: 'L · Подробная' }]} /><CustomSelect<Role> label="Роль" ariaLabel={`Роль версии ${index + 1}`} value={v.role} onChange={role => patch(index, { role })} options={[{ value: 'default', label: 'Исходная' }, { value: 'main', label: 'Главный' }, { value: 'background', label: 'Фоновый' }]} /></div></div>)}
    </details>
    <div className="bottom-actions"><button onClick={cancel} disabled={busy}>Отмена</button><button className="primary with-icon" disabled={busy || !name.trim()} onClick={() => save(name, description, variants)}><Icon name="save" />Сохранить изменения</button></div>
  </>;
}
