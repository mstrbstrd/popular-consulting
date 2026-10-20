import React from 'react';
import { createPortal } from 'react-dom';
import MetabloomVisualFrame, { MetabloomVisualBoundary } from './MetabloomVisualFrame';
import { METABLOOM_VISUAL_OFFER_EVENT, requestMetabloomVisual } from './metabloomVisualApiClient';
import { beginMetabloomVisualTurn, acceptMetabloomVisualOffer, findMetabloomVisualReply } from './metabloomVisualSession';
import { classifyMetabloomVisualIntent } from './metabloomVisualIntent';
import { requestMetabloomResponse } from './metabloomApiClient';
import { postMetabloomTool } from './metabloomToolClient';
import { METABLOOM_CHAT_PROTOCOL_VERSION } from './metabloomEmoteLibrary';
const safeReply = response => ({ version: METABLOOM_CHAT_PROTOCOL_VERSION, segments: [{ response }] });

// Uses Orb's existing request and transcript extension points. The portal is
// inside the originating message, but owns its state independently of text/research.
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
    const intent = classifyMetabloomVisualIntent(event.detail.message);
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
      const article = this.root.querySelector(`[data-message-id="${turn.userId}"]`);
      if (!article) throw new Error('Missing originating message');
      const slot = document.createElement('div');
      slot.className = 'metabloom-visual-slot';
      slot.dataset.visualId = offer.id;
      article.appendChild(slot);
      article.dataset.visualAnswer = offer.id;
      const record = { id: offer.id, kind: offer.kind, userId: turn.userId, replyId: null,
        mode: 'tool', detail, article, slot, controller: new AbortController(), status: 'generating',
        continuing: false, completed: false };
      this.records.set(offer.id, record);
      turn.signal.addEventListener('abort', () => record.controller.abort(), { once: true });
      this.refresh();
      this.generate(record, offer);
    } catch (error) {
      if (!this.mounted || this.turn !== turn || turn.signal.aborted) return;
      if (error?.code === 'tool_disabled') {
        try {
          const reply = await requestMetabloomResponse({ ...detail, optional: false });
          if (!turn.signal.aborted) detail.respond?.(reply);
        } catch { if (!turn.signal.aborted) detail.respond?.(safeReply('I could not prepare that visual right now.')); }
      } else detail.respond?.(safeReply('I could not prepare that visual right now. Please try again.'));
      detail.onToolActivity?.('complete');
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
            if (record.article?.dataset.visualAnswer === record.id) delete record.article.dataset.visualAnswer;
            article.appendChild(record.slot);
            article.dataset.visualAnswer = record.id;
            record.article = article;
            record.replyId = reply.id;
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
      if (record.mode === 'tool' && record.status === 'failed') this.finishTool(record, 'failed');
    }
    this.refresh();
  };
  ready = record => {
    if (record.mode !== 'tool' || record.status !== 'ready' || record.continuing) return;
    const mounted = Boolean(record.slot.querySelector('.metabloom-visual[data-visual-state="ready"]'));
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
    } catch {
      if (!this.mounted || detail.signal.aborted) return;
      detail.onToolActivity?.('complete');
      detail.respond?.(safeReply(record.status === 'ready'
        ? 'I generated the visual, but could not complete the accompanying explanation.'
        : 'I could not create that visual right now.'));
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
