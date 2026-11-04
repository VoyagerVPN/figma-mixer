import { useRef, useState } from 'react';
import { newDraftId, validateSvg } from '../library-model';
import type { DraftItem, SetInfo } from '../types';
import { Preview } from './Preview';
import { CustomSelect } from './CustomSelect';
import { Icon } from './Icon';

type Props = {
  sets: SetInfo[]; items: DraftItem[]; targetId: string; setItems: (items: DraftItem[]) => void;
  setTargetId: (id: string) => void; busy: boolean; canSplit: boolean; skipped: string[];
  capture: (split?: boolean) => void; highlight: (id: string) => void;
  save: (name: string, items: DraftItem[], id?: string) => void; cancel: () => void;
  reportError: (message: string) => void;
  forGeneration?: boolean;
};
export function ImportWizard(props: Props) {
  const [name, setName] = useState(props.forGeneration ? 'Моя библиотека' : '');
  const [excluded, setExcluded] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const pack = useRef<HTMLInputElement>(null);
  const included = props.items.filter(item => !excluded.includes(item.id));
  const patch = (id: string, value: Partial<DraftItem>) => props.setItems(props.items.map(i => i.id === id ? { ...i, ...value } : i));
  const valid = included.length > 0 && included.every(i => i.name.trim()) && (props.targetId || name.trim());

  async function readFiles(files: File[]) {
    const drafts: DraftItem[] = [], errors: string[] = [];
    for (const file of files) {
      try {
        const svg = await file.text(); validateSvg(svg);
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Некорректный SVG');
        drafts.push({ id: newDraftId(), name: file.name.replace(/\.svg$/i, ''), description: '', preview: svg, variants: [{ svg, detail: 'default', role: 'default', label: 'Исходный' }] });
      } catch (err) { errors.push(file.name + ': ' + (err instanceof Error ? err.message : String(err))); }
    }
    props.setItems([...props.items, ...drafts]);
    if (errors.length) props.reportError(errors.join('\n'));
  }

  return <>
    <button className="back" onClick={props.cancel}><Icon name="arrow" />Назад</button>
    <h1>{props.forGeneration ? 'Добавьте свои элементы' : props.targetId ? 'Добавление элементов' : 'Создание набора'}</h1>
    <p className="intro">{props.forGeneration ? 'Загрузите SVG или возьмите выделение Figma. Проверьте предметы — библиотека сохранится в этом файле, затем создадите композиции по описанию.' : 'Выделите целые объекты в Figma или загрузите SVG. Перед сохранением проверьте карточки.'}</p>
    <div className="action-row"><button className="with-icon" disabled={props.busy} onClick={() => props.capture()}><Icon name="selection" />Взять выделение Figma</button><button className="with-icon" disabled={props.busy} onClick={() => input.current?.click()}><Icon name="upload" />Загрузить SVG</button></div>
    <button className="link-button" onClick={() => pack.current?.click()}><Icon name="folder" />Импортировать сохранённый набор</button>
    {props.canSplit && <div className="hint-box">Выбран один контейнер. Он может быть целым элементом или содержать несколько.<button className="link-button" disabled={props.busy} onClick={() => props.capture(true)}><Icon name="layers" />Использовать вложенные объекты</button></div>}
    {props.skipped.length > 0 && <p className="hint">Не включены подписи или объекты с растром: {props.skipped.join(', ')}.</p>}
    <section><CustomSelect label="Сохранить в набор" value={props.targetId} onChange={props.setTargetId} options={[{ value: '', label: 'Создать новый набор' }, ...props.sets.map(set => ({ value: set.id, label: set.name }))]} />
      {!props.targetId && <label>Название набора<input value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="Например, рабочее пространство" /></label>}
    </section>
    <div className="section-heading"><h2>Элементы</h2><span>Выбрано: {included.length}</span></div>
    {!props.items.length && <div className="empty-state compact"><p>Пока нет элементов</p><span>Каждый выбранный объект или SVG-файл станет отдельной карточкой. Внутренние контуры останутся вместе.</span></div>}
    <div className="draft-list">{props.items.map(item => <article key={item.id} className={'draft-card ' + (excluded.includes(item.id) ? 'excluded' : '')}>
      <label className="check"><input type="checkbox" aria-label={'Включить ' + item.name} checked={!excluded.includes(item.id)} onChange={() => setExcluded(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} /></label>
      <Preview svg={item.preview} />
      <div className="draft-fields"><label>Название элемента<input maxLength={100} value={item.name} onChange={e => patch(item.id, { name: e.target.value })} /></label><span className="hint">{item.variants.length > 1 ? `Вариантов: ${item.variants.length}` : 'Один целый элемент'}</span>{item.variants[0].nodeId && <button className="link-button" onClick={() => props.highlight(item.variants[0].nodeId!)}><Icon name="locate" />Показать на холсте</button>}</div>
    </article>)}</div>
    <p className="hint">Описание и варианты можно настроить позже в карточке элемента. Исходные объекты останутся на месте; в набор сохранятся копии.</p>
    <div className="bottom-actions"><button onClick={props.cancel} disabled={props.busy}>Отмена</button><button className="primary with-icon" disabled={!valid || props.busy} onClick={() => props.save(props.targetId ? props.sets.find(s => s.id === props.targetId)!.name : name, included, props.targetId || undefined)}><Icon name={props.targetId ? 'plus' : 'save'} />{props.forGeneration ? 'Использовать библиотеку' : props.targetId ? 'Добавить элементы' : 'Создать набор'}</button></div>
    <input ref={input} type="file" multiple accept=".svg,image/svg+xml" hidden onChange={async e => { const files = [...(e.target.files || [])]; e.target.value = ''; await readFiles(files); }} />
    <input ref={pack} type="file" accept=".json" hidden onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      try {
        const value = JSON.parse(await file.text());
        if (value.version !== 1 || !Array.isArray(value.assets) || value.assets.length > 100) throw new Error('Неизвестный формат набора');
        const drafts: DraftItem[] = value.assets.map((asset: any) => { asset.variants.forEach((v: any) => validateSvg(v.svg)); return { id: newDraftId(), name: asset.name, description: asset.description || '', preview: asset.variants[0].svg, variants: asset.variants.map((v: any) => ({ svg: v.svg, detail: v.detail || 'default', role: v.role || 'default', label: v.label || 'Исходный' })) }; });
        props.setItems([...props.items, ...drafts]); if (!name) setName(value.name || file.name.replace(/\.json$/i, ''));
      } catch (err) { props.reportError(err instanceof Error ? err.message : 'Не удалось прочитать набор'); }
    }} />
  </>;
}
