import React from 'react';
import { METABLOOM_PROVIDERS, defaultModelPreferences } from './metabloomModelProtocol';
import { requestMetabloomModels } from './metabloomModelApiClient';
import './MetabloomModelPicker.css';

export const availableModelSelection = (catalog, selection) => {
  const provider = catalog?.providers.find(item => item.id === selection?.provider);
  return provider?.status === 'ready' && ((selection.model === 'default' && provider.defaultModel) || (selection.model === 'latest' && provider.latestModel)
    || provider.models.some(model => model.id === selection.model));
};

export default function MetabloomModelPicker({ selection, onChange, onAvailability, disabled, isActive = true }) {
  const [catalog, setCatalog] = React.useState(null), [preferences, setPreferences] = React.useState(defaultModelPreferences);
  const [open, setOpen] = React.useState(false), [draft, setDraft] = React.useState({ provider: 'openai', model: 'default' });
  const [loading, setLoading] = React.useState(true), [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(''), [notice, setNotice] = React.useState('');
  const [revision, setRevision] = React.useState(0);
  const dialog = React.useRef(null), trigger = React.useRef(null), saveRequest = React.useRef(null);
  const current = React.useRef({ selection, onChange, onAvailability });
  current.current = { selection, onChange, onAvailability, disabled, isActive };
  React.useEffect(() => {
    if (!isActive) return undefined;
    const controller = new AbortController();
    setLoading(true); setError('');
    requestMetabloomModels({ signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      setCatalog(value);
      const saved = value.preferences || defaultModelPreferences();
      setPreferences(saved);
      const chosen = current.current.selection || (value.preferences && { provider: saved.provider, model: saved.defaults[saved.provider] });
      if (chosen) current.current.onChange(chosen);
      current.current.onAvailability(Boolean(chosen && availableModelSelection(value, chosen)));
      setNotice(value.preferencesAvailable ? '' : 'Saved preferences could not load. Choose a model for this session or retry.');
    }).catch(() => {
      if (!controller.signal.aborted) { setError('Could not load models. Retry to keep your saved choice.'); current.current.onAvailability(false); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isActive, revision]);
  React.useEffect(() => () => saveRequest.current?.abort(), []);
  const close = React.useCallback(() => {
    const wasOpen = dialog.current?.open;
    if (wasOpen) dialog.current.close();
    setOpen(false);
    if (wasOpen) trigger.current?.focus({ preventScroll: true });
  }, []);
  React.useEffect(() => {
    if (disabled || !isActive) { close(); saveRequest.current?.abort(); setSaving(false); }
  }, [disabled, isActive, close]);
  React.useLayoutEffect(() => {
    if (!open) return undefined;
    const panel = dialog.current;
    panel.showModal(); panel.querySelector('select')?.focus({ preventScroll: true });
    return () => { if (panel.open) panel.close(); };
  }, [open]);
  const choose = value => {
    if (current.current.disabled || !current.current.isActive || !availableModelSelection(catalog, value)) return;
    onChange({ ...value }); onAvailability(true);
  };
  const save = async () => {
    if (!availableModelSelection(catalog, draft) || saving || disabled || !isActive) return;
    const controller = new AbortController(); saveRequest.current = controller;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await requestMetabloomModels({ selection: draft, signal: controller.signal });
      if (controller.signal.aborted) return;
      setPreferences(result.preferences); choose(draft);
      setNotice(`Default saved for ${METABLOOM_PROVIDERS[draft.provider]}.`);
    } catch { if (!controller.signal.aborted) setError('The default could not be confirmed. Retry, or use the model for this session.'); }
    finally { if (!controller.signal.aborted) setSaving(false); }
  };
  const provider = catalog?.providers.find(item => item.id === draft.provider);
  const activeProvider = catalog?.providers.find(item => item.id === selection?.provider);
  const activeId = selection?.model === 'default' ? activeProvider?.defaultModel
    : selection?.model === 'latest' ? activeProvider?.latestModel : selection?.model;
  const label = activeProvider?.models.find(model => model.id === activeId)?.label;
  const valid = availableModelSelection(catalog, draft);
  const unavailableSaved = selection && catalog && !availableModelSelection(catalog, selection);
  return <div className="metabloom-model-picker">
    <button type="button" ref={trigger} className="metabloom-model-picker__trigger" disabled={disabled || !isActive}
      aria-label="Choose chat model" aria-haspopup="dialog" aria-expanded={open}
      title={label || 'Choose provider and model'} onClick={() => {
        setDraft(selection || { provider: preferences.provider, model: preferences.defaults[preferences.provider] }); setOpen(true);
      }}><span>{selection ? METABLOOM_PROVIDERS[selection.provider] : 'Model'}</span><span>{loading ? 'Loading…' : label || 'Choose model'}</span><span aria-hidden="true">⌄</span></button>
    {!open && (error || unavailableSaved || (!loading && !selection)) && <span className="metabloom-model-picker__warning" role="status">Choose an available model to continue.</span>}
    {open && <dialog ref={dialog} className="metabloom-model-picker__dialog" aria-labelledby="metabloom-model-title"
      onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === dialog.current) close(); }}>
      <div className="metabloom-model-picker__content">
        <div className="metabloom-model-picker__heading"><h2 id="metabloom-model-title">Chat model</h2><button type="button" aria-label="Close model settings" onClick={close}>×</button></div>
        <p>Your selected provider writes replies and research briefs. Web research and visuals use shared OpenAI services.</p>
        <label>Provider<select aria-label="Model provider" value={draft.provider} disabled={saving} onChange={event => {
          const id = event.target.value; setDraft({ provider: id, model: preferences.defaults[id] }); setError(''); setNotice('');
        }}>{Object.entries(METABLOOM_PROVIDERS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        {provider?.status === 'ready' ? <label>Model<select aria-label="Chat model" value={draft.model} disabled={saving} onChange={event => setDraft({ ...draft, model: event.target.value })}>
          {provider.defaultModel && <option value="default">Configured default ({provider.defaultModel})</option>}
          {provider.latestModel && <option value="latest">Latest available ({provider.latestModel})</option>}
          {!valid && <option value={draft.model} disabled>{draft.model} (unavailable)</option>}
          {provider.models.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}
        </select></label> : <p role="status">{loading ? 'Loading provider models…' : provider?.status === 'not_configured'
          ? `${METABLOOM_PROVIDERS[draft.provider]} is not connected yet. Its server API key must be configured.`
          : 'This provider’s model list is unavailable. Retry to check the connection.'}</p>}
        {provider?.status === 'ready' && <small>Default for this provider: {preferences.defaults[draft.provider]}. Latest follows release metadata or the version reported by the provider. Lists refresh within five minutes.</small>}
        {!valid && provider?.status === 'ready' && <p role="alert">Your saved model is no longer offered. Choose another model; it will not be replaced automatically.</p>}
        {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
        <div className="metabloom-model-picker__actions">
          <button type="button" disabled={loading || saving} onClick={() => setRevision(value => value + 1)}>Refresh models</button>
          <button type="button" disabled={!valid || saving || disabled} onClick={save}>{saving ? 'Saving…' : 'Save as provider default'}</button>
          <button type="button" disabled={!valid || saving || disabled} onClick={() => { choose(draft); close(); }}>Use model</button>
        </div>
      </div>
    </dialog>}
  </div>;
}
