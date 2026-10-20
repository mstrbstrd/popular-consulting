import React from 'react';
import { createPortal } from 'react-dom';
import MetabloomVisualFrame, { MetabloomVisualBoundary } from './MetabloomVisualFrame';
import { METABLOOM_VISUAL_OFFER_EVENT, requestMetabloomVisual } from './metabloomVisualApiClient';
import { beginMetabloomVisualTurn, acceptMetabloomVisualOffer, findMetabloomVisualReply } from './metabloomVisualSession';

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
  }
  componentWillUnmount() {
    this.mounted = false;
    window.removeEventListener('metabloom:user-message', this.onUserMessage);
    window.removeEventListener(METABLOOM_VISUAL_OFFER_EVENT, this.onOffer);
    this.observer?.disconnect();
    this.releaseTurn();
    for (const record of this.records.values()) { record.controller.abort(); this.removeSlot(record); }
    this.records.clear();
  }
  removeSlot = record => {
    record.slot.remove();
    if (record.article.dataset.visualAnswer === record.id) delete record.article.dataset.visualAnswer;
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
  onUserMessage = event => {
    for (const record of this.records.values()) this.stop(record);
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
  };
  onOffer = event => {
    if (!this.ownsSurface() || !acceptMetabloomVisualOffer(this.turn, event.detail)) return;
    this.reconcile();
  };
  stop = record => {
    if (!record || record.status !== 'generating') return;
    record.status = 'cancelled';
    record.code = 'visual_cancelled';
    record.controller.abort();
    this.refresh();
  };
  reconcile = () => {
    if (!this.mounted || !this.root || (!this.turn?.accepted && this.records.size === 0)) return;
    if (!this.ownsSurface()) {
      for (const record of this.records.values()) this.stop(record);
      this.releaseTurn();
      return;
    }
    const messages = this.messages();
    let changed = false;
    for (const [id, record] of this.records) {
      if (!record.slot.isConnected || !messages.some(message => message.id === record.replyId && message.role === 'assistant')) {
        record.controller.abort();
        this.removeSlot(record);
        this.records.delete(id);
        changed = true;
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
          controller: new AbortController(), status: 'generating' };
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
    } catch (error) {
      if (!this.mounted || this.records.get(record.id) !== record || record.status !== 'generating') return;
      record.status = error?.code === 'visual_cancelled' ? 'cancelled' : 'failed';
      record.code = error?.code || 'visual_unavailable';
    }
    this.refresh();
  };
  render() {
    return <>
      <span ref={this.captureAnchor} hidden aria-hidden="true" />
      {Array.from(this.records.values(), record => createPortal(
        <MetabloomVisualBoundary><MetabloomVisualFrame artifact={record} onStop={() => this.stop(record)} /></MetabloomVisualBoundary>, record.slot, record.id,
      ))}
    </>;
  }
}
