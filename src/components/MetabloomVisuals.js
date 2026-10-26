import React from 'react';
import { createPortal } from 'react-dom';
import MetabloomVisualFrame, { MetabloomVisualBoundary } from './MetabloomVisualFrame';
import { METABLOOM_VISUAL_OFFER_EVENT, requestMetabloomVisual } from './metabloomVisualApiClient';
import { beginMetabloomVisualTurn, acceptMetabloomVisualOffer, findMetabloomVisualReply } from './metabloomVisualSession';
import { classifyMetabloomVisualIntent } from './metabloomVisualIntent';
import { postMetabloomTool } from './metabloomToolClient';
import { METABLOOM_CHAT_PROTOCOL_VERSION } from './metabloomEmoteLibrary';
import { METABLOOM_TOOL_ERROR_CODES, getMetabloomApiErrorMessage, parseMetabloomRequestRef } from './metabloomRequestErrors';
import { parseMetabloomVisualQuota, formatMetabloomVisualQuotaMessage } from './metabloomVisualQuota';
const safeReply = response => ({ version: METABLOOM_CHAT_PROTOCOL_VERSION, segments: [{ response }] });
const toolFailure = error => {
  const code = METABLOOM_TOOL_ERROR_CODES.includes(error?.code) ? error.code : 'tool_unavailable';
  const requestRef = parseMetabloomRequestRef(error?.requestRef);
  const status = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? error.status : null;
  const quota = code === 'tool_quota' ? parseMetabloomVisualQuota(error?.quota) : null;
  return { code, requestRef, status,
    message: code === 'tool_quota' ? formatMetabloomVisualQuotaMessage(quota) : getMetabloomApiErrorMessage(code),
    diagnostic: `Code: ${code}.${requestRef ? ` Reference: ${requestRef}.` : ''}` };
};

// Uses Orb's existing request and transcript extension points. The portal is
// inside an assistant row, but owns its state independently of text/research.
export default class MetabloomVisuals extends React.Component {
  state = { revision: 0 };
  records = new Map();
  turn = null;
  anchor = null;
  captureAnchor = node => { this.anchor = node; };
  componentDidMount() {
    this.mounted = true;
    this.root = this.anchor?.closest('.orb-page');
    if (!this.root) return;
    window.addEventListener('metabloom:user-message', this.onUserMessage);
    window.addEventListener(METABLOOM_VISUAL_OFFER_EVENT, this.onOffer);
    this.observer = new MutationObserver(this.reconcile);
    this.observer.observe(this.root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-stream-status'] });
    window.__metabloomVisualSnapshot = this.snapshot;
  }
  componentWillUnmount() {
    this.mounted = false;
    window.removeEventListener('metabloom:user-message', this.onUserMessage);
    window.removeEventListener(METABLOOM_VISUAL_OFFER_EVENT, this.onOffer);
    this.observer?.disconnect();
    if (window.__metabloomVisualSnapshot === this.snapshot) delete window.__metabloomVisualSnapshot;
    this.releaseTurn();
    for (const record of this.records.values()) { record.controller.abort(); window.clearTimeout(record.renderTimeout); this.removeSlot(record); }
    this.records.clear();
  }
  removeSlot = record => {
    record.slot.remove();
    record.pendingArticle?.remove();
    if (record.article?.dataset.visualAnswer === record.id) delete record.article.dataset.visualAnswer;
  };
  messages = () => {
    try { return typeof window.__orbMessages === 'function' ? window.__orbMessages() : []; }
    catch { return []; }
  };
  refresh = () => { if (this.mounted) this.setState(state => ({ revision: state.revision + 1 })); };
  releaseTurn = () => {
    if (this.turn && this.onTurnAbort) this.turn.signal.removeEventListener('abort', this.onTurnAbort);
    this.turn = null;
    this.onTurnAbort = null;
  };
  ownsSurface = () => this.root?.isConnected && document.querySelectorAll('.orb-page').length === 1;
  snapshot = () => {
    const record = this.records.get(this.lastInteractedId)
      || Array.from(this.records.values()).reverse().find(item => item.status === 'ready' && item.spec?.kind === 'calculator');
    if (!record || record.status !== 'ready' || record.spec?.kind !== 'calculator') return null;
    const inputs = record.inputs === undefined
      ? Object.fromEntries(record.spec.controls.map(control => [control.id, control.initial])) : record.inputs;
    return record.spec.controls.every(control => Number.isFinite(inputs[control.id]))
      ? { id: record.id, inputs: { ...inputs } } : null;
  };
  onUserMessage = event => {
    for (const record of this.records.values()) {
      if (record.status === 'generating') this.stop(record);
      else if (record.mode === 'tool' && record.continuing && !record.completed) record.controller.abort();
    }
    this.releaseTurn();
    if (!this.ownsSurface()) return;
    const turn = beginMetabloomVisualTurn(event.detail, this.messages());
    if (!turn) return;
    this.turn = turn;
    this.onTurnAbort = () => {
      if (this.turn !== turn) return;
      if (turn.offer) this.stop(this.records.get(turn.offer.id));
      this.releaseTurn();
    };
    turn.signal.addEventListener('abort', this.onTurnAbort, { once: true });
    const intent = classifyMetabloomVisualIntent(event.detail.message, event.detail.history);
    if (intent.mode === 'requested' && intent.preferredKinds?.length
      && event.detail.actionMode !== 'deep-research' && !event.defaultPrevented) {
      event.preventDefault();
      event.detail.claim?.();
      event.detail.onToolActivity?.('start');
      this.startTool(turn, event.detail);
    }
  };
  startTool = async (turn, detail) => {
    try {
      const { offer, emote } = await postMetabloomTool({ phase: 'start',
        message: detail.message, history: detail.history, requestId: detail.requestId }, { signal: detail.signal });
      if (!this.mounted || this.turn !== turn || turn.signal.aborted) return;
      detail.onReaction?.({ phase: 'input', emote });
      turn.offer = offer;
      turn.started = true;
      const userArticle = this.root.querySelector(`[data-message-id="${turn.userId}"]`);
      if (!userArticle) throw new Error('Missing originating message');
      // Start on the assistant side and reserve the final visual-before-text
      // order. The user's right-aligned bubble must never host a visual.
      const article = document.createElement('article');
      article.className = 'metabloom-chat__message metabloom-chat__message--assistant';
      article.setAttribute('aria-label', 'Metabloom message');
      const speaker = document.createElement('span');
      speaker.className = 'metabloom-chat__speaker';
      speaker.textContent = 'Metabloom';
      article.appendChild(speaker);
      const slot = document.createElement('div');
      slot.className = 'metabloom-visual-slot';
      slot.dataset.visualId = offer.id;
      slot.dataset.visualUserId = turn.userId;
      article.appendChild(slot);
      article.dataset.visualAnswer = offer.id;
      userArticle.after(article);
      const record = { id: offer.id, kind: offer.kind, userId: turn.userId, replyId: null,
        mode: 'tool', detail, article, pendingArticle: article, slot, controller: new AbortController(), status: 'generating',
        continuing: false, completed: false };
      this.records.set(offer.id, record);
      turn.signal.addEventListener('abort', () => record.controller.abort(), { once: true });
      this.refresh();
      this.generate(record, offer);
    } catch (error) {
      if (!this.mounted || this.turn !== turn || turn.signal.aborted) return;
      // Never silently downgrade a requested interactive component to a
      // text-model response. That path can produce raw HTML/JS in the transcript.
      const failure = toolFailure(error);
      console.info('[Metabloom] Native visual request unavailable', {
        code: failure.code, requestRef: failure.requestRef, status: failure.status,
      });
      detail.onToolActivity?.('complete');
      detail.respond?.(safeReply(`${failure.message} ${failure.diagnostic}`));
    }
  };
  onOffer = event => {
    if (!this.ownsSurface() || !acceptMetabloomVisualOffer(this.turn, event.detail)) return;
    this.reconcile();
  };
  stop = record => {
    if (!record) return;
    if (record.mode === 'tool' && record.continuing && !record.completed) record.controller.abort();
    if (record.status !== 'generating') return;
    record.status = 'cancelled';
    record.code = 'visual_cancelled';
    record.controller.abort();
    if (record.mode === 'tool' && !record.completed && !record.detail.signal.aborted) {
      record.detail.onToolActivity?.('complete');
      record.detail.respond?.(safeReply('I stopped building that visual.'));
      record.completed = true;
    }
    this.refresh();
  };
  reconcile = () => {
    if (!this.mounted || !this.root || (!this.turn?.accepted && !this.turn?.started && this.records.size === 0)) return;
    if (!this.ownsSurface()) {
      for (const record of this.records.values()) this.stop(record);
      this.releaseTurn();
      return;
    }
    const messages = this.messages();
    let changed = false;
    for (const [id, record] of this.records) {
      const owner = record.mode === 'tool' ? record.userId : record.replyId;
      if (!record.slot.isConnected || !messages.some(message => message.id === owner)) {
        record.controller.abort();
        window.clearTimeout(record.renderTimeout);
        this.removeSlot(record);
        this.records.delete(id);
        changed = true;
        continue;
      }
      if (record.mode === 'tool' && record.completed && !record.replyId) {
        const index = messages.findIndex(message => message.id === record.userId);
        const reply = messages[index + 1];
        if (reply?.role === 'assistant' && reply.status === 'complete') {
          const article = this.root.querySelector(`[data-message-id="${reply.id}"][data-stream-status="complete"]`);
          if (article) {
            const focused = record.slot.contains(document.activeElement) ? document.activeElement : null;
            if (record.article?.dataset.visualAnswer === record.id) delete record.article.dataset.visualAnswer;
            article.insertBefore(record.slot, article.querySelector('.metabloom-chat__bubble'));
            record.pendingArticle?.remove();
            record.pendingArticle = null;
            article.dataset.visualAnswer = record.id;
            record.article = article;
            record.replyId = reply.id;
            if (focused?.isConnected) focused.focus({ preventScroll: true });
            changed = true;
          }
        }
      }
    }
    const turn = this.turn;
    if (turn && !messages.some(message => message.id === turn.userId)) this.releaseTurn();
    const reply = findMetabloomVisualReply(this.turn, messages);
    if (reply && !this.turn.started && !this.records.has(this.turn.offer.id)) {
      // The validated reply must also be visible and complete after the scene gate.
      const article = this.root.querySelector(`[data-message-id="${reply.id}"][data-stream-status="complete"]`);
      if (article?.querySelector('.metabloom-chat__bubble')) {
        const offer = this.turn.offer;
        this.turn.started = true;
        const slot = document.createElement('div');
        slot.className = 'metabloom-visual-slot';
        slot.dataset.visualId = offer.id;
        // A sibling of the text bubble avoids nested backdrop blurs while
        // remaining part of this exact assistant message.
        article.appendChild(slot);
        article.dataset.visualAnswer = offer.id;
        const record = { id: offer.id, kind: offer.kind, replyId: reply.id, slot, article,
          controller: new AbortController(), status: 'generating', mode: 'optional' };
        this.records.set(offer.id, record);
        changed = true;
        this.generate(record, offer);
      }
    }
    if (changed) this.refresh();
  };
  generate = async (record, offer) => {
    try {
      const result = await requestMetabloomVisual(offer, { signal: record.controller.signal });
      if (!this.mounted || this.records.get(record.id) !== record || record.controller.signal.aborted) return;
      Object.assign(record, result, { status: 'ready' });
      if (record.mode === 'tool') record.renderTimeout = window.setTimeout(() => this.finishTool(record, 'unknown'), 1500);
    } catch (error) {
      if (!this.mounted || this.records.get(record.id) !== record || record.status !== 'generating') return;
      record.status = error?.code === 'visual_cancelled' ? 'cancelled' : 'failed';
      record.code = error?.code || 'visual_unavailable';
      if (record.code === 'visual_quota') {
        record.quota = parseMetabloomVisualQuota(error?.quota);
        // A denied claim has no generated result to continue. End this turn
        // locally, including a quota race after a successful start preflight.
        if (record.mode === 'tool' && !record.completed && !record.detail.signal.aborted) {
          record.completed = true;
          // Nothing was built. Replace the temporary row with one clear reply,
          // rather than showing a second error card beside the same message.
          this.removeSlot(record);
          this.records.delete(record.id);
          record.detail.onToolActivity?.('complete');
          record.detail.respond?.(safeReply(formatMetabloomVisualQuotaMessage(record.quota)));
        }
      } else if (record.mode === 'tool' && record.status === 'failed') this.finishTool(record, 'failed');
    }
    this.refresh();
  };
  ready = record => {
    if (record.mode !== 'tool' || record.status !== 'ready' || record.continuing) return;
    const mounted = Boolean(record.slot.isConnected && this.root?.contains(record.slot)
      && record.slot.querySelector('.metabloom-visual[data-visual-state="ready"]'));
    if (mounted && !record.readyNotified) {
      record.readyNotified = true;
      window.dispatchEvent(new CustomEvent('metabloom:visual-ready', {
        detail: { id: record.id, userId: record.userId },
      }));
    }
    this.finishTool(record, mounted ? 'mounted' : 'unknown');
  };
  inputsChanged = (record, values) => {
    if (record.status !== 'ready' || record.spec?.kind !== 'calculator') return;
    record.inputs = { ...values };
    this.lastInteractedId = record.id;
  };
  finishTool = async (record, display) => {
    if (!this.mounted || record.mode !== 'tool' || record.continuing || record.completed || record.controller.signal.aborted) return;
    record.continuing = true;
    window.clearTimeout(record.renderTimeout);
    const detail = record.detail;
    try {
      const result = await postMetabloomTool({ phase: 'continue', id: record.id, display },
        { signal: record.controller.signal });
      if (!this.mounted || record.controller.signal.aborted || detail.signal.aborted) return;
      detail.onReaction?.({ phase: 'response', emote: result.emote });
      detail.onToolActivity?.('complete');
      detail.respond?.(result.reply);
    } catch (error) {
      if (!this.mounted || record.controller.signal.aborted || detail.signal.aborted) return;
      const failure = toolFailure(error);
      console.info('[Metabloom] Native visual explanation unavailable', {
        code: failure.code, requestRef: failure.requestRef, status: failure.status,
      });
      const message = record.status !== 'ready' ? failure.message : display === 'failed'
        ? 'The visual was generated, but could not be displayed.' : display === 'mounted'
          ? (failure.code === 'tool_timeout' ? 'The visual is ready, but its explanation timed out.'
            : 'The visual is ready, but I could not finish its explanation.')
          : 'The visual was generated, but its display could not be confirmed.';
      detail.onToolActivity?.('complete');
      detail.respond?.(safeReply(`${message} ${failure.diagnostic}`));
    } finally {
      record.completed = true;
      this.reconcile();
    }
  };
  render() {
    return <>
      <span ref={this.captureAnchor} hidden aria-hidden="true" />
      {Array.from(this.records.values(), record => createPortal(
        <MetabloomVisualBoundary><MetabloomVisualFrame artifact={record} onStop={() => this.stop(record)}
          onReady={() => this.ready(record)} onInputsChange={values => this.inputsChanged(record, values)} /></MetabloomVisualBoundary>, record.slot, record.id,
      ))}
    </>;
  }
}
