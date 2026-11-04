import type { Item, SetInfo } from '../types';
import { Icon } from './Icon';
import { Preview } from './Preview';

export function GenerationStart({ sets, items, busy, ready, own, choose, manage }: {
  sets: SetInfo[]; items: Item[]; busy: boolean; ready: () => void; own: () => void;
  choose: (id: string) => void; manage: () => void;
}) {
  return <div className="generation-start">
    <h1>Новая композиция</h1>
    <p className="intro">Выберите графику, задайте параметры и получите варианты на холсте Figma.</p>
    <div className="source-options">
      <button className="source-option" aria-label="Готовая библиотека" disabled={busy} onClick={ready}><Icon name="grid" /><span><strong>Готовая библиотека</strong><small>Предметы, авторские версии и три палитры</small></span><Icon name="chevron" /></button>
      <button className="source-option" aria-label="Свои элементы" disabled={busy} onClick={own}><Icon name="upload" /><span><strong>Свои элементы</strong><small>Из выделения Figma, SVG или сохранённого набора</small></span><Icon name="chevron" /></button>
    </div>
    {sets.some(set => set.id !== 'starter') && <><h2 className="source-heading">Библиотеки этого файла</h2><div className="set-list">{sets.filter(set => set.id !== 'starter').map(set => {
      const group = items.filter(item => item.setId === set.id);
      return <button className="set-card" key={set.id} disabled={busy || !group.length} onClick={() => choose(set.id)}><div className="set-previews">{group.slice(0, 3).map(item => <Preview key={item.id} svg={item.preview} />)}</div><div><strong>{set.name}</strong><span>Элементов: {group.length}</span></div><Icon name="chevron" /></button>;
    })}</div></>}
    <button className="text-button source-manage" disabled={busy} onClick={manage}><Icon name="folder" />Управление библиотеками</button>
    <p className="hint">Перемещайте и редактируйте готовые объекты средствами Figma. Mixer создаёт новые варианты.</p>
  </div>;
}
