import type { CompositionSelection, RecentComposition } from '../types';
import { Icon } from './Icon';

const plurals = new Intl.PluralRules('ru');

export function RecentCompositions({ results, selection, busy, choose, recolor, exportSvg }: {
  results: RecentComposition[]; selection: CompositionSelection[]; busy: boolean;
  choose: (id: string, toggle: boolean) => void; recolor: () => void; exportSvg: () => void;
}) {
  if (!results.length && !selection.length) return null;
  const selected = new Set(selection.map(frame => frame.id));
  const count = selected.size;
  const samePalette = Boolean(selection[0]?.paletteKey) && selection.every(frame => frame.paletteKey === selection[0].paletteKey);
  const outside = selection.some(frame => !results.some(result => result.id === frame.id));
  const variant = plurals.select(count) === 'few' ? 'варианта' : 'вариантов';
  return <section className="recent-compositions" aria-label="Варианты">
    <div className="recent-heading"><h2>{results.length ? 'Варианты' : 'Композиции на холсте'}</h2>
      {count > 0 && <span>{outside ? 'На холсте выбрано: ' : 'Выбрано: '}{count}</span>}
    </div>
    {results.length > 0 && <div className="recent-strip">
      {results.map((result, index) => <button className="recent-card" key={result.id}
        aria-label={'Вариант ' + (index + 1)} aria-pressed={selected.has(result.id)} title={result.name} disabled={busy}
        onClick={event => choose(result.id, event.shiftKey || event.ctrlKey || event.metaKey)}>
        <span className="recent-image">{result.image ? <img src={result.image} alt="" draggable={false} /> : <Icon name="composition" />}</span>
        <span className="recent-name">{result.name}</span>
      </button>)}
    </div>}
    <div className="recent-actions">
      <button className="with-icon" disabled={busy || !samePalette} onClick={recolor}><Icon name="palette" />{count > 1 ? `Перекрасить ${count} ${variant}` : 'Перекрасить композицию'}</button>
      <button className="text-button with-icon" disabled={busy || count !== 1} onClick={exportSvg}><Icon name="download" />Экспорт SVG</button>
    </div>
    {count > 1 && !samePalette ? <p className="hint">Выберите варианты с одинаковой палитрой.</p>
      : count === 1 && !samePalette ? <p className="hint">Исходная палитра композиции недоступна.</p>
      : results.length > 1 && <p className="hint">Shift + клик добавляет вариант к выделению.</p>}
  </section>;
}
