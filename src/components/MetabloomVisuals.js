import React from 'react';
import { createPortal } from 'react-dom';
import MetabloomVisualFrame, { MetabloomVisualBoundary } from './MetabloomVisualFrame';
import { METABLOOM_VISUAL_OFFER_EVENT, requestMetabloomVisual } from './metabloomVisualApiClient';
import { METABLOOM_TRANSCRIPT_READY_EVENT, METABLOOM_RESET_EVENT,
  beginMetabloomVisualTurn, acceptMetabloomVisualOffer, findMetabloomVisualReply } from './metabloomVisualSession';
import { createMetabloomVisualSnapshot, parseMetabloomVisualSnapshot } from './metabloomVisualSnapshot';
import { classifyMetabloomVisualIntent } from './metabloomVisualIntent';
import { postMetabloomTool } from './metabloomToolClient';
import { METABLOOM_CHAT_PROTOCOL_VERSION } from './metabloomEmoteLibrary';
import { METABLOOM_TOOL_ERROR_CODES, getMetabloomApiErrorMessage, parseMetabloomRequestRef } from './metabloomRequestErrors';
import { parseMetabloomVisualQuota, formatMetabloomVisualQuotaMessage } from './metabloomVisualQuota';
import { evaluateMetabloomVisualFormula } from './metabloomVisualProtocol';
import { METABLOOM_ARTIFACT_REFERENCE_EVENT, MAX_METABLOOM_ARTIFACT_REFERENCE_LABEL,
  isMetabloomArtifactVersion, parseMetabloomArtifactReference } from './metabloomArtifactReference';
import { isMetabloomFreshResearchRequest } from './metabloomResearchReference';
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

// A visual keeps one portal container for its lifetime. Moving that container
// between its original reply and the workspace preserves the live form state.
export default class MetabloomVisuals extends React.Component {
  constructor(props) {
    super(props);
    // Keep this mount's cache revision. A later account's callback must never
    // receive an old component's cleanup snapshot.
    this.saveToolState = props.navigation?.saveToolState;
    this.pendingSnapshot = props.navigation?.getToolState('orbVisuals');
  }
  state = { revision: 0 };
  records = new Map();
  turn = null;
  activeVisualId = null;
  workspaceSelectionRevision = 0;
  anchor = null;
  captureAnchor = node => { this.anchor = node; };
  componentDidMount() {
    this.mounted = true;
    this.root = this.anchor?.closest('.orb-page');
    if (!this.root) return;
    window.addEventListener('metabloom:user-message', this.onUserMessage);
    window.addEventListener(METABLOOM_VISUAL_OFFER_EVENT, this.onOffer);
    window.addEventListener(METABLOOM_TRANSCRIPT_READY_EVENT, this.restore);
    window.addEventListener(METABLOOM_RESET_EVENT, this.reset);
    this.observer = new MutationObserver(this.reconcile);
    this.observer.observe(this.root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-stream-status'] });
    window.__metabloomVisualSnapshot = this.snapshot;
    this.restore();
  }
  componentWillUnmount() {
    if (this.saveToolState) {
      const snapshot = createMetabloomVisualSnapshot(
        Array.from(this.records.values()), this.messages(), this.lastInteractedId || null, this.activeVisualId,
      );
      this.saveToolState('orbVisuals', snapshot);
      // React's development remount reuses this instance after cleanup.
      this.pendingSnapshot = snapshot;
    }
    this.mounted = false;
    window.removeEventListener('metabloom:user-message', this.onUserMessage);
    window.removeEventListener(METABLOOM_VISUAL_OFFER_EVENT, this.onOffer);
    window.removeEventListener(METABLOOM_TRANSCRIPT_READY_EVENT, this.restore);
    window.removeEventListener(METABLOOM_RESET_EVENT, this.reset);
    this.observer?.disconnect();
    if (window.__metabloomVisualSnapshot === this.snapshot) delete window.__metabloomVisualSnapshot;
    this.releaseTurn();
    for (const record of this.records.values()) { record.controller.abort(); window.clearTimeout(record.renderTimeout); this.removeSlot(record); }
    this.records.clear();
    this.clearWorkspace();
  }
  removeSlot = record => {
    if (this.activeVisualId === record.id) this.clearWorkspace();
    record.slot.remove();
    record.launcher?.remove();
    record.pendingArticle?.remove();
    if (record.article?.dataset.visualAnswer === record.id) delete record.article.dataset.visualAnswer;
  };
  messages = () => {
    try {
      if (typeof window.__orbMessages === 'function') this.lastMessages = window.__orbMessages();
      return this.lastMessages || [];
    } catch { return this.lastMessages || []; }
  };
  restore = event => {
    if (!this.mounted || !this.ownsSurface() || this.pendingSnapshot === undefined
      || (event && (!(event.detail instanceof Element) || !this.root.contains(event.detail)))
      || !this.root.querySelector('[data-orb-transcript-ready="true"]')) return;
    const messages = this.messages();
    const snapshot = parseMetabloomVisualSnapshot(this.pendingSnapshot, messages);
    this.pendingSnapshot = undefined;
    this.lastInteractedId = snapshot.lastInteractedId;
    for (const saved of snapshot.records) {
      let replyId = saved.replyId;
      if (!replyId && saved.mode === 'tool') {
        const index = messages.findIndex(message => message.id === saved.userId);
        const reply = messages[index + 1];
        if (index >= 0 && reply?.role === 'assistant' && reply.status === 'complete') replyId = reply.id;
      }
      let article = replyId && this.root.querySelector(`[data-message-id="${replyId}"][data-stream-status="complete"]`);
      let pendingArticle = null;
      if (!article && saved.mode === 'tool' && !saved.replyId) {
        const userArticle = this.root.querySelector(`[data-message-id="${saved.userId}"]`);
        if (!userArticle) continue;
        article = this.createPendingArticle(userArticle);
        pendingArticle = article;
        replyId = null;
      }
      if (!article || article.dataset.visualAnswer) continue;
      const slot = this.createSlot(saved.id, saved.userId);
      if (saved.mode === 'tool') article.insertBefore(slot, article.querySelector('.metabloom-chat__bubble'));
      else article.appendChild(slot);
      article.dataset.visualAnswer = saved.id;
      this.records.set(saved.id, { ...saved, replyId, article, pendingArticle, slot,
        controller: new AbortController(), restored: true,
        code: saved.status === 'cancelled' ? 'visual_cancelled' : undefined });
      this.ensureLauncher(this.records.get(saved.id));
    }
    if (snapshot.activeVisualId) this.activateComponent(this.records.get(snapshot.activeVisualId));
    this.refresh();
  };
  createPendingArticle = userArticle => {
    const article = document.createElement('article');
    article.className = 'metabloom-chat__message metabloom-chat__message--assistant';
    article.setAttribute('aria-label', 'Metabloom message');
    const speaker = document.createElement('span');
    speaker.className = 'metabloom-chat__speaker';
    speaker.textContent = 'Metabloom';
    article.appendChild(speaker);
    userArticle.after(article);
    return article;
  };
  createSlot = (id, userId) => {
    const slot = document.createElement('div');
    slot.className = 'metabloom-visual-slot';
    slot.dataset.visualId = id;
    if (userId) slot.dataset.visualUserId = userId;
    return slot;
  };
  workspaceHost = () => {
    const host = this.root?.querySelector('.metabloom-chat__workspace');
    return this.ownsSurface() && host?.isConnected ? host : null;
  };
  ensureLauncher = record => {
    if (record.status !== 'ready' || record.launcher || !this.workspaceHost()) return;
    record.launcher = document.createElement('div');
    record.launcher.className = 'metabloom-visual-launcher';
    record.launcher.dataset.visualId = record.id;
    record.slot.before(record.launcher);
  };
  placeAtOrigin = record => {
    const article = record.article;
    if (!article?.isConnected) return;
    const anchor = record.launcher || record.slot;
    if (record.mode === 'tool') article.insertBefore(anchor, article.querySelector('.metabloom-chat__bubble'));
    else article.appendChild(anchor);
    if (record.launcher && this.activeVisualId !== record.id) record.launcher.after(record.slot);
  };
  clearWorkspace = () => {
    this.activeVisualId = null;
    this.workspaceToolbar?.remove();
    this.workspaceBody?.remove();
    if (this.root) delete this.root.dataset.activeComponent;
  };
  activateComponent = (record, { explicit = false, focus = false } = {}) => {
    const host = this.workspaceHost();
    const owner = record?.replyId || record?.userId;
    if (!this.mounted || !host || !record || this.records.get(record.id) !== record
      || record.status !== 'ready' || !record.slot?.isConnected || !this.root.contains(record.slot)
      || !this.messages().some(message => message.id === owner)) return false;
    if (explicit) this.workspaceSelectionRevision += 1;
    if (this.activeVisualId === record.id) {
      // Ask lives below the fields in short workspaces. A deliberate selection
      // brings the result back into view; streamed replies never reset this scroll.
      if (explicit && this.workspaceBody) this.workspaceBody.scrollTop = 0;
      if (focus) this.workspaceBody?.focus({ preventScroll: true });
      return true;
    }
    const previous = this.records.get(this.activeVisualId);
    this.activeVisualId = null;
    if (previous) this.placeAtOrigin(previous);
    this.ensureLauncher(record);
    if (!this.workspaceToolbar) {
      this.workspaceToolbar = document.createElement('div');
      this.workspaceToolbar.className = 'metabloom-component-workspace__toolbar';
      this.workspaceBody = document.createElement('div');
      this.workspaceBody.className = 'metabloom-component-workspace__body';
      this.workspaceBody.tabIndex = -1;
    }
    host.append(this.workspaceToolbar, this.workspaceBody);
    const focused = record.slot.contains(document.activeElement) ? document.activeElement : null;
    this.workspaceBody.appendChild(record.slot);
    this.workspaceBody.scrollTop = 0;
    this.activeVisualId = record.id;
    this.root.dataset.activeComponent = 'true';
    if (focus) this.workspaceBody.focus({ preventScroll: true });
    else if (focused?.isConnected) focused.focus({ preventScroll: true });
    this.refresh();
    return true;
  };
  returnComponent = () => {
    const record = this.records.get(this.activeVisualId);
    this.workspaceSelectionRevision += 1;
    this.activeVisualId = null;
    if (record) this.placeAtOrigin(record);
    this.clearWorkspace();
    this.refresh();
    record?.launcher?.querySelector('button')?.focus();
  };
  activateSubmittedReference = reference => {
    const parsed = parseMetabloomArtifactReference(reference);
    const record = parsed && this.records.get(parsed.id);
    if (record?.artifactVersion === parsed?.version) this.activateComponent(record, { explicit: true });
  };
  activateGeneratedComponent = record => {
    const turn = record.generationTurn;
    if (turn && this.turn === turn && !turn.signal.aborted
      && turn.workspaceSelectionRevision === this.workspaceSelectionRevision) this.activateComponent(record);
  };
  reset = event => {
    if (!this.mounted || !this.ownsSurface() || !(event?.detail instanceof Element) || !this.root.contains(event.detail)) return;
    this.releaseTurn();
    this.pendingSnapshot = undefined;
    this.lastInteractedId = null;
    this.workspaceSelectionRevision += 1;
    for (const record of this.records.values()) {
      record.controller.abort();
      window.clearTimeout(record.renderTimeout);
      this.removeSlot(record);
    }
    this.records.clear();
    this.clearWorkspace();
    this.saveToolState?.('orbVisuals', null);
    this.refresh();
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
    const inputs = record.viewState?.inputs
      ? Object.fromEntries(record.spec.controls.map(control => {
        const value = record.viewState.inputs[control.id];
        return [control.id, value.trim() ? Number(value) : NaN];
      })) : record.inputs === undefined
        ? Object.fromEntries(record.spec.controls.map(control => [control.id, control.initial])) : record.inputs;
    return record.spec.controls.every(control => Number.isFinite(inputs[control.id])
      && inputs[control.id] >= control.min && inputs[control.id] <= control.max)
      ? { id: record.id, inputs: { ...inputs } } : null;
  };
  askAbout = (record, selection) => {
    if (!this.mounted || !this.ownsSurface() || this.records.get(record.id) !== record
      || record.status !== 'ready' || !isMetabloomArtifactVersion(record.artifactVersion)
      || !record.slot?.isConnected || !this.root.contains(record.slot)) return false;
    const reference = parseMetabloomArtifactReference({ id: record.id, version: record.artifactVersion,
      selector: selection?.selector,
      ...(selection && Object.prototype.hasOwnProperty.call(selection, 'inputs') ? { inputs: selection.inputs } : {}),
    });
    if (!reference) return false;
    const { spec } = record, { selector } = reference;
    let detail;
    if (selector.type === 'table-row') {
      if (spec.kind !== 'table' || !spec.rows[selector.index]) return false;
      const text = spec.rows[selector.index].find(cell => cell.trim());
      detail = `Row ${selector.index + 1}${text ? `: ${text}` : ''}`;
    } else if (selector.type === 'observation') {
      if (spec.kind !== 'line-chart') return false;
      detail = spec.labels?.[selector.index] ?? spec.points?.[selector.index]?.label;
      if (detail === undefined) return false;
    } else if (selector.type === 'pie-category') {
      if (spec.kind !== 'pie-chart' || !spec.points[selector.index]) return false;
      detail = spec.points[selector.index].label;
    } else if (selector.type === 'flow-node') {
      if (spec.kind !== 'flowchart') return false;
      detail = spec.nodes.find(node => node.id === selector.id)?.label;
      if (detail === undefined) return false;
    } else if (selector.type === 'calculator') {
      if (spec.kind !== 'calculator' || Object.keys(reference.inputs).length !== spec.controls.length
        || !spec.controls.every(control => Object.prototype.hasOwnProperty.call(reference.inputs, control.id)
          && Number.isFinite(reference.inputs[control.id]) && reference.inputs[control.id] >= control.min
          && reference.inputs[control.id] <= control.max)
        || evaluateMetabloomVisualFormula(spec.formula, spec.controls, reference.inputs) === null) return false;
      detail = 'Scenario';
    } else return false;
    const text = `${spec.title} · ${detail}`.replace(/\s+/g, ' ').trim();
    const label = text.length <= MAX_METABLOOM_ARTIFACT_REFERENCE_LABEL ? text
      : `${text.slice(0, MAX_METABLOOM_ARTIFACT_REFERENCE_LABEL - 1).replace(/[\uD800-\uDBFF]$/, '')}…`;
    this.activateComponent(record, { explicit: true });
    window.dispatchEvent(new CustomEvent(METABLOOM_ARTIFACT_REFERENCE_EVENT, {
      detail: { reference, label, root: this.root },
    }));
    return true;
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
    if (event.detail.artifactContext) this.activateSubmittedReference(event.detail.artifactContext);
    turn.workspaceSelectionRevision = this.workspaceSelectionRevision;
    this.onTurnAbort = () => {
      if (this.turn !== turn) return;
      if (turn.offer) this.stop(this.records.get(turn.offer.id));
      this.releaseTurn();
    };
    turn.signal.addEventListener('abort', this.onTurnAbort, { once: true });
    const intent = classifyMetabloomVisualIntent(event.detail.message, event.detail.history);
    if (intent.mode === 'requested' && intent.preferredKinds?.length
      && event.detail.actionMode !== 'deep-research'
      && !(event.detail.researchContext && isMetabloomFreshResearchRequest(event.detail.message)) && !event.defaultPrevented) {
      event.preventDefault();
      event.detail.claim?.();
      event.detail.onToolActivity?.('start');
      this.startTool(turn, event.detail);
    }
  };
  startTool = async (turn, detail) => {
    try {
      const { offer, emote } = await postMetabloomTool({ phase: 'start',
        message: detail.message, history: detail.history, requestId: detail.requestId,
        ...(detail.artifactContext ? { artifactContext: detail.artifactContext } : {}),
        ...(detail.researchContext ? { researchContext: detail.researchContext } : {}),
      }, { signal: detail.signal });
      if (!this.mounted || this.turn !== turn || turn.signal.aborted) return;
      detail.onReaction?.({ phase: 'input', emote });
      turn.offer = offer;
      turn.started = true;
      const userArticle = this.root.querySelector(`[data-message-id="${turn.userId}"]`);
      if (!userArticle) throw new Error('Missing originating message');
      // Start on the assistant side and reserve the final visual-before-text
      // order. The user's right-aligned bubble must never host a visual.
      const article = this.createPendingArticle(userArticle);
      const slot = this.createSlot(offer.id, turn.userId);
      article.appendChild(slot);
      article.dataset.visualAnswer = offer.id;
      const record = { id: offer.id, kind: offer.kind, userId: turn.userId, replyId: null,
        expiresAt: offer.expiresAt,
        mode: 'tool', detail, article, pendingArticle: article, slot, controller: new AbortController(), status: 'generating',
        continuing: false, completed: false, generationTurn: turn };
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
      const owner = record.replyId || record.userId;
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
            article.dataset.visualAnswer = record.id;
            record.article = article;
            record.replyId = reply.id;
            this.placeAtOrigin(record);
            record.pendingArticle?.remove();
            record.pendingArticle = null;
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
        const slot = this.createSlot(offer.id);
        // A sibling of the text bubble avoids nested backdrop blurs while
        // remaining part of this exact assistant message.
        article.appendChild(slot);
        article.dataset.visualAnswer = offer.id;
        const record = { id: offer.id, kind: offer.kind, replyId: reply.id, slot, article, expiresAt: offer.expiresAt,
          controller: new AbortController(), status: 'generating', mode: 'optional', generationTurn: turn };
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
      if (record.spec.kind === 'calculator') this.lastInteractedId = record.id;
      this.ensureLauncher(record);
      this.activateGeneratedComponent(record);
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
    if (!this.mounted || this.records.get(record.id) !== record || record.restored
      || record.mode !== 'tool' || record.status !== 'ready' || record.continuing) return;
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
    if (!this.mounted || this.records.get(record.id) !== record || record.status !== 'ready' || record.spec?.kind !== 'calculator') return;
    record.inputs = { ...values };
  };
  viewStateChanged = (record, viewState) => {
    if (!this.mounted || this.records.get(record.id) !== record || record.status !== 'ready') return;
    record.viewState = viewState;
    if (record.spec.kind === 'calculator') this.lastInteractedId = record.id;
  };
  finishTool = async (record, display) => {
    if (!this.mounted || record.restored || record.mode !== 'tool' || record.continuing || record.completed || record.controller.signal.aborted) return;
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
    const active = this.records.get(this.activeVisualId);
    return <>
      <span ref={this.captureAnchor} hidden aria-hidden="true" />
      {active && this.workspaceToolbar && createPortal(<>
        <strong title={active.spec.title}>{active.spec.title}</strong>
        <button type="button" aria-label="Return component to conversation" onClick={this.returnComponent}>Return to chat</button>
      </>, this.workspaceToolbar, 'workspace-toolbar')}
      {Array.from(this.records.values(), record => <React.Fragment key={record.id}>
        {createPortal(<MetabloomVisualBoundary><MetabloomVisualFrame artifact={record} onStop={() => this.stop(record)}
          onReady={() => this.ready(record)} onInputsChange={values => this.inputsChanged(record, values)}
          onViewStateChange={viewState => this.viewStateChanged(record, viewState)}
          onAskAbout={selection => this.askAbout(record, selection)} /></MetabloomVisualBoundary>, record.slot, record.id)}
        {record.launcher && createPortal(<button type="button" aria-label={`Show component: ${record.spec.title}`}
          aria-pressed={this.activeVisualId === record.id}
          onClick={() => this.activateComponent(record, { explicit: true, focus: true })}>
          <span>Show component</span><strong>{record.spec.title}</strong>
        </button>, record.launcher, `${record.id}-launcher`)}
      </React.Fragment>)}
    </>;
  }
}
