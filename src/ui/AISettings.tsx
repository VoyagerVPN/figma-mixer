import { useEffect, useId, useRef, useState } from 'react';
import { aiPresets, validateAIConfig, validateAITarget, type AIConfig } from '../ai';
import { CustomSelect } from './CustomSelect';
import { Icon } from './Icon';
import { FieldHelp } from './FieldHelp';
import './ai-settings.css';

export function AISettings({ current, ready, busy, error, save, loadModels }: { current: AIConfig; ready: boolean; busy: boolean; error: string; save: (config: AIConfig & { apiKey: string }) => void; loadModels: (config: AIConfig & { apiKey: string }) => Promise<string[]> }) {
  const [draft, setDraft] = useState(current), [key, setKey] = useState(''), [localError, setLocalError] = useState('');
  const baseId = useId(), modelId = useId(), keyId = useId();
  const [models, setModels] = useState<string[]>([]), [modelsOpen, setModelsOpen] = useState(false), [modelsLoading, setModelsLoading] = useState(false), [modelsError, setModelsError] = useState(''), [search, setSearch] = useState('');
  const revision = useRef(0), modelBox = useRef<HTMLDivElement>(null), modelInput = useRef<HTMLInputElement>(null), searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => { revision.current++; }, []);
  useEffect(() => {
    if (!modelsOpen) return;
    searchInput.current?.focus();
    const outside = (event: PointerEvent) => { if (!modelBox.current?.contains(event.target as Node)) setModelsOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setModelsOpen(false); modelInput.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [modelsOpen]);
  function resetModels() { revision.current++; setModels([]); setModelsOpen(false); setModelsLoading(false); setModelsError(''); setSearch(''); }
  async function queryModels() {
    const request = ++revision.current; setModelsLoading(true); setModelsError(''); setModelsOpen(false);
    try { const found = await loadModels({ ...draft, apiKey: key.trim() }); if (revision.current === request) { setModels(found); setSearch(''); setModelsOpen(true); } }
    catch (error) { if (revision.current === request) setModelsError(error instanceof Error ? error.message : 'Не удалось получить список моделей'); }
    finally { if (revision.current === request) setModelsLoading(false); }
  }
  let sameTarget = false;
  let validTarget = false;
  try { const target = validateAITarget(draft); validTarget = true; sameTarget = target.provider === current.provider && target.baseUrl === current.baseUrl; } catch {}
  function submit() {
    try { const config = validateAIConfig(draft); if (!key.trim() && !(ready && sameTarget)) throw new Error('Введите API-ключ выбранного сервиса'); setLocalError(''); save({ ...config, apiKey: key.trim() }); }
    catch (error) { setLocalError(error instanceof Error ? error.message : 'Проверьте настройки подключения'); }
  }
  return <div className="ai-settings">
    <p className="panel-description">Выберите сервис и текстовую модель с поддержкой Chat Completions и JSON. Ключ действует до закрытия плагина.</p>
    {(localError || error) && <p className="message error" role="alert">{localError || error}</p>}
    <CustomSelect label="Провайдер" value={draft.provider} disabled={busy} onChange={provider => { resetModels(); setDraft({ ...aiPresets[provider] }); setKey(''); setLocalError(''); }} options={[{ value: 'deepseek', label: 'DeepSeek' }, { value: 'openai', label: 'OpenAI' }, { value: 'custom', label: 'OpenAI-совместимый сервис' }]} />
    <div className="ai-setting-field"><span className="ai-field-label"><label htmlFor={baseId}>Базовый адрес API</label><FieldHelp label="Что такое базовый адрес API?">Адрес сервиса, куда Mixer отправляет запросы. Его можно скопировать из документации провайдера. Для OpenAI — https://api.openai.com/v1. У готовых провайдеров адрес уже задан.</FieldHelp></span><input id={baseId} aria-label="Базовый адрес API" disabled={busy} readOnly={draft.provider !== 'custom'} value={draft.baseUrl} placeholder="https://example.com/v1" onChange={event => { resetModels(); setDraft({ ...draft, baseUrl: event.target.value }); setKey(''); }} /></div>
    <div className="ai-setting-field"><span className="ai-field-label"><label htmlFor={modelId}>Модель</label><FieldHelp label="Что такое модель?">Модель — версия нейросети, которая подбирает предметы для композиции. Укажите её точный ID или сначала вставьте API-ключ и нажмите кнопку справа от поля — она запросит список у сервиса. Для Mixer нужна модель для работы с текстом.</FieldHelp></span><div ref={modelBox} className="ai-model-box"><div className="ai-model-input"><input ref={modelInput} id={modelId} aria-label="Модель" disabled={busy} value={draft.model} maxLength={200} placeholder="ID модели вашего сервиса" onChange={event => setDraft({ ...draft, model: event.target.value })} /><button type="button" className="icon-button model-query" aria-label="Получить список моделей" disabled={busy || modelsLoading || !validTarget || (!key.trim() && !(ready && sameTarget))} onClick={queryModels}><span className={modelsLoading ? 'model-query-spinning' : ''}><Icon name="refresh" /></span></button></div>
      {modelsLoading && <p className="hint" role="status">Получаем список моделей…</p>}
      {modelsError && <p className="ai-model-error" role="alert">{modelsError}</p>}
      {modelsOpen && <div className="ai-model-results" role="group" aria-label="Модели API"><input ref={searchInput} aria-label="Поиск модели" placeholder="Поиск по ID" value={search} onChange={event => setSearch(event.target.value)} /><div className="ai-model-options">{models.filter(id => id.toLowerCase().includes(search.toLowerCase())).map(id => <button key={id} type="button" aria-pressed={draft.model === id} onClick={() => { setDraft({ ...draft, model: id }); setModelsOpen(false); modelInput.current?.focus(); }}>{id}</button>)}</div>{!models.some(id => id.toLowerCase().includes(search.toLowerCase())) && <p className="hint">Модели не найдены</p>}<p className="hint">Выберите модель для работы с текстом</p></div>}
    </div></div>
    <div className="ai-setting-field"><span className="ai-field-label"><label htmlFor={keyId}>API-ключ</label><FieldHelp label="Что такое API-ключ?">Ключ доступа выдаёт выбранный сервис в своём личном кабинете. Вставьте его целиком. Mixer использует ключ для запросов и хранит только до закрытия плагина.</FieldHelp></span><input id={keyId} aria-label="API-ключ" type="password" autoComplete="off" disabled={busy} value={key} placeholder={ready && sameTarget ? 'Ключ задан · оставьте пустым, чтобы сохранить' : 'Ключ выбранного сервиса'} onChange={event => { resetModels(); setKey(event.target.value); }} /></div>
    <button className="primary panel-done with-icon" disabled={busy || !draft.model.trim() || !draft.baseUrl.trim() || (!key.trim() && !(ready && sameTarget))} onClick={submit}><Icon name="key" />Сохранить</button>
  </div>;
}
