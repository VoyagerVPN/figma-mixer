import { useCallback, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, pointerWithin, useDroppable, useSensor, useSensors, type CollisionDetection, type DragMoveEvent, type DragOverEvent, type DragEndEvent, type KeyboardCoordinateGetter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { moveLayer, type LayerGroup, type LayerStack, type LayerTarget } from '../layers';
import type { Item } from '../types';
import { Preview } from './Preview';
import { Icon } from './Icon';

type Props = { items: Item[]; value: LayerStack; onChange: (value: LayerStack) => void; close: () => void; busy?: boolean };
const groups: LayerGroup[] = ['background', 'main'];
const groupName = (group: LayerGroup) => group === 'background' ? 'Фон' : 'Основные';
const stop = (event: MouseEvent | TouchEvent) => event.stopPropagation();

function LayerRow({ item, group, index, focus, dragging, marker, busy, sorting, focusItem, transfer }: { item: Item; group: LayerGroup; index: number; focus: boolean; dragging: boolean; marker?: 'before' | 'after'; busy?: boolean; sorting: boolean; focusItem: () => void; transfer: () => void }) {
  const sortable = useSortable({ id: item.id, data: { group, index, kind: 'item' }, disabled: busy });
  return <div ref={sortable.setNodeRef} {...sortable.listeners} className={`layer-row ${focus ? 'is-focus' : ''} ${dragging ? 'is-dragging' : ''}`} data-layer-id={item.id} data-insert={marker}>
    <button ref={sortable.setActivatorNodeRef} {...sortable.attributes} className="drag-handle" aria-label={`Перетащить: ${item.name}`} disabled={busy}><Icon name="grip" /></button>
    <Preview svg={item.preview} /><span className="layer-name">{item.name}</span><div className="layer-actions" onMouseDown={stop} onTouchStart={stop}>
      {group === 'main' && <button className="icon-button focus-star" title={focus ? 'Убрать главный акцент' : 'Сделать главным акцентом'} aria-label={`Главный акцент: ${item.name}`} aria-pressed={focus} disabled={busy || sorting} onClick={focusItem}><Icon name="star" /></button>}
      <button className="icon-button layer-transfer" disabled={busy || sorting || group === 'main' && !item.variants.some(v => v.role === 'background')} title={group === 'background' ? 'Перенести в основные' : 'Перенести на фон'} aria-label={`${group === 'background' ? 'В основные' : 'На фон'}: ${item.name}`} onClick={transfer}><Icon name={group === 'background' ? 'down' : 'up'} /></button>
    </div>
  </div>;
}

function LayerGroupView({ group, ids, active, allowed, target, children }: { group: LayerGroup; ids: string[]; active: boolean; allowed: boolean; target: LayerTarget | null; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `layer-group-${group}`, data: { group, index: ids.length, kind: 'group' }, disabled: active && !allowed });
  return <section ref={setNodeRef} className={`layer-group layer-drop-group ${active && !allowed ? 'drop-forbidden' : ''} ${isOver && allowed ? 'drop-active' : ''}`} data-layer-group={group} data-drop-end={target?.group === group && target.index === ids.length && active}>
    <div className="section-heading"><h2>{groupName(group)}</h2><span className="meta">{ids.length}</span></div>
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
    {!ids.length && <p className="layer-empty">{active ? allowed ? 'Отпустите здесь' : 'У элемента нет фоновой версии' : group === 'background' ? 'Перетащите сюда фоновые элементы' : 'Перетащите сюда основные элементы'}</p>}
  </section>;
}

export function LayerEditor({ items, value, onChange, close, busy }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null), [target, setTarget] = useState<LayerTarget | null>(null), [message, setMessage] = useState('');
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const origin = useRef(value), targetRef = useRef<LayerTarget | null>(null), keyboard = useRef(false);
  const attach = useCallback((node: HTMLDivElement | null) => { setContainer(node?.closest('dialog') || null); }, []);
  const byId = new Map(items.map(item => [item.id, item]));
  const capabilities = items.map(item => ({ id: item.id, canBackground: item.variants.some(v => v.role === 'background') }));
  const activeItem = activeId ? byId.get(activeId) : undefined;
  const canBackground = !activeId || !!capabilities.find(item => item.id === activeId)?.canBackground;
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { active, currentCoordinates, context }) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code) || !context.collisionRect) return;
    event.preventDefault();
    const allowed = !!capabilities.find(item => item.id === String(active))?.canBackground;
    const slots = groups.filter(group => group === 'main' || allowed).flatMap(group => value[group].length ? value[group] : [`layer-group-${group}`]);
    const current = String(context.over?.id || active), index = Math.max(0, slots.indexOf(current));
    let id: string | undefined;
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') id = slots[index + (event.code === 'ArrowUp' ? -1 : 1)];
    else {
      const group = event.code === 'ArrowLeft' ? 'background' : 'main';
      if (group === 'background' && !allowed) return;
      id = value[group][0] || `layer-group-${group}`;
    }
    const rect = id ? context.droppableRects.get(id) : undefined; if (!rect) return;
    return { x: currentCoordinates.x + rect.left + rect.width / 2 - context.collisionRect.left - context.collisionRect.width / 2, y: currentCoordinates.y + rect.top + rect.height / 2 - context.collisionRect.top - context.collisionRect.height / 2 };
  };
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates, scrollBehavior: 'auto' }));
  const collision: CollisionDetection = args => {
    const eligible = args.droppableContainers.filter(entry => canBackground || entry.data.current?.group !== 'background');
    const scoped = { ...args, droppableContainers: eligible };
    if (!args.pointerCoordinates) return closestCenter({ ...scoped, droppableContainers: eligible.filter(entry => entry.data.current?.kind !== 'group' || !value[entry.data.current.group as LayerGroup].length) });
    const hits = pointerWithin(scoped);
    return hits.sort((a, b) => Number(eligible.find(e => e.id === a.id)?.data.current?.kind === 'group') - Number(eligible.find(e => e.id === b.id)?.data.current?.kind === 'group'));
  };
  function locate(event: DragMoveEvent | DragOverEvent | DragEndEvent): LayerTarget | null {
    const data = event.over?.data.current;
    if (!data || !groups.includes(data.group) || event.over?.id === event.active.id) return null;
    const group = data.group as LayerGroup;
    if (group === 'background' && !capabilities.find(item => item.id === event.active.id)?.canBackground) return null;
    let index = data.index as number;
    if (data.kind === 'item') {
      const rect = event.active.rect.current.translated;
      const after = keyboard.current ? (group === (origin.current.background.includes(String(event.active.id)) ? 'background' : 'main') && index > origin.current[group].indexOf(String(event.active.id))) : !!rect && rect.top + rect.height / 2 > event.over!.rect.top + event.over!.rect.height / 2;
      if (after) index++;
    }
    return { group, index };
  }
  function updateTarget(event: DragMoveEvent | DragOverEvent) {
    const next = locate(event); targetRef.current = next;
    setTarget(previous => previous?.group === next?.group && previous?.index === next?.index ? previous : next);
  }
  function cleanup() { setActiveId(null); setTarget(null); targetRef.current = null; }
  function finish(event: DragEndEvent) {
    const next = event.over ? locate(event) || targetRef.current : null;
    if (next) {
      const result = moveLayer(origin.current, capabilities, String(event.active.id), next);
      onChange(result);
      setMessage(`${byId.get(String(event.active.id))?.name}: ${groupName(next.group)}, позиция ${result[next.group].indexOf(String(event.active.id)) + 1}`);
    } else setMessage('Перенос отменён');
    cleanup();
  }
  return <div ref={attach} className="layer-editor" data-dnd-active={activeId ? 'true' : undefined}>
    <DndContext sensors={sensors} collisionDetection={collision} autoScroll={{ threshold: { x: .1, y: .18 }, acceleration: 8 }} accessibility={{ container: container || undefined, screenReaderInstructions: { draggable: 'Нажмите пробел или Enter, чтобы взять слой. Стрелки перемещают его. Пробел или Enter подтверждает перенос, Escape отменяет.' }, announcements: { onDragStart: ({ active }) => `Взят слой ${byId.get(String(active.id))?.name}`, onDragOver: ({ over }) => over ? `Цель: ${groupName(over.data.current?.group || 'main')}` : 'Вне области переноса', onDragEnd: () => 'Перенос завершён', onDragCancel: () => 'Перенос отменён' } }}
      onDragStart={event => { origin.current = value; keyboard.current = event.activatorEvent instanceof KeyboardEvent; setActiveId(String(event.active.id)); setMessage(''); }} onDragMove={updateTarget} onDragOver={updateTarget} onDragEnd={finish} onDragCancel={() => { cleanup(); setMessage('Перенос отменён'); }}>
      <div className="layer-groups">{groups.map(group => <LayerGroupView key={group} group={group} ids={value[group]} active={!!activeId} allowed={group === 'main' || canBackground} target={target}>
        {value[group].map((id, index) => {
          const item = byId.get(id); if (!item) return null;
          const marker = activeId && target?.group === group ? target.index === index ? 'before' : index === value[group].length - 1 && target.index === index + 1 ? 'after' : undefined : undefined;
          return <LayerRow key={id} item={item} group={group} index={index} focus={value.heroId === id} dragging={activeId === id} marker={marker} busy={busy} sorting={!!activeId} focusItem={() => onChange({ ...value, heroId: value.heroId === id ? '' : id })} transfer={() => {
            const destination = group === 'background' ? 'main' : 'background';
            onChange({ ...moveLayer(value, capabilities, id, { group: destination, index: value[destination].length }), manual: value.manual });
          }} />;
        })}
      </LayerGroupView>)}</div>
      <DragOverlay dropAnimation={null} zIndex={200}>{activeItem && <div className="layer-row layer-drag-overlay" aria-hidden="true"><Icon name="grip" /><Preview svg={activeItem.preview} /><span className="layer-name">{activeItem.name}</span>{value.heroId === activeId && <Icon name="star" />}</div>}</DragOverlay>
    </DndContext>
    <p className="hint layer-order-hint">{value.manual ? 'Выше в группе — поверх остальных' : 'Порядок автоматический. Перетащите слой, чтобы задать его вручную'}. Фон всегда за основными</p>
    <p className="hint layer-hint"><Icon name="star" />{value.heroId ? `Главный акцент: ${byId.get(value.heroId)?.name}` : 'Главный акцент выбирается автоматически'}</p>
    <div className="layer-feedback" role="status" aria-live="polite">{message}</div>
    <button className="primary panel-done" disabled={!!activeId} onClick={close}>Готово</button>
  </div>;
}
