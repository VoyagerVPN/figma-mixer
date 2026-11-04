import { useState } from 'react';
import { aiPresets, validateAIConfig, type AIConfig } from '../ai';
import { CustomSelect } from './CustomSelect';
import { Icon } from './Icon';

export function AISettings({ current, ready, busy, error, save }: { current: AIConfig; ready: boolean; busy: boolean; error: string; save: (config: AIConfig & { apiKey: string }) => void }) {
  const [draft, setDraft] = useState(current), [key, setKey] = useState(''), [localError, setLocalError] = useState('');
  let sameTarget = false;
  try { sameTarget = draft.provider === current.provider && validateAIConfig(draft).baseUrl === current.baseUrl; } catch {}
  function submit() {
    try { const config = validateAIConfig(draft); if (!key.trim() && !(ready && sameTarget)) throw new Error('Введите API-ключ выбранного сервиса'); setLocalError(''); save({ ...config, apiKey: key.trim() }); }
    catch (error) { setLocalError(error instanceof Error ? error.message : 'Проверьте настройки подключения'); }
  }
  return <div className="ai-settings">
    <p className="panel-description">Выберите сервис и текстовую модель с поддержкой Chat Completions и JSON. Ключ действует до закрытия плагина.</p>
    {(localError || error) && <p className="message error" role="alert">{localError || error}</p>}
    <CustomSelect label="Провайдер" value={draft.provider} disabled={busy} onChange={provider => { setDraft({ ...aiPresets[provider] }); setKey(''); setLocalError(''); }} options={[{ value: 'deepseek', label: 'DeepSeek' }, { value: 'openai', label: 'OpenAI' }, { value: 'custom', label: 'OpenAI-совместимый сервис' }]} />
    <label>Базовый адрес API<input aria-label="Базовый адрес API" disabled={busy} readOnly={draft.provider !== 'custom'} value={draft.baseUrl} placeholder="https://example.com/v1" onChange={event => { setDraft({ ...draft, baseUrl: event.target.value }); setKey(''); }} /></label>
    <label>Модель<input aria-label="Модель" disabled={busy} value={draft.model} maxLength={200} placeholder="ID модели вашего сервиса" onChange={event => setDraft({ ...draft, model: event.target.value })} /></label>
    <label>API-ключ<input aria-label="API-ключ" type="password" autoComplete="off" disabled={busy} value={key} placeholder={ready && sameTarget ? 'Ключ задан · оставьте пустым, чтобы сохранить' : 'Ключ выбранного сервиса'} onChange={event => setKey(event.target.value)} /></label>
    <button className="primary panel-done with-icon" disabled={busy || !draft.model.trim() || !draft.baseUrl.trim() || (!key.trim() && !(ready && sameTarget))} onClick={submit}><Icon name="key" />Сохранить</button>
  </div>;
}
