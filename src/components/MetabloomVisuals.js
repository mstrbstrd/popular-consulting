import React from 'react';
import { createPortal } from 'react-dom';
import MetabloomVisualFrame, { MetabloomVisualBoundary } from './MetabloomVisualFrame';
import { METABLOOM_VISUAL_OFFER_EVENT, requestMetabloomVisual } from './metabloomVisualApiClient';
import { METABLOOM_TRANSCRIPT_READY_EVENT, METABLOOM_RESET_EVENT,
  beginMetabloomVisualTurn, acceptMetabloomVisualOffer, findMetabloomVisualReply,
  METABLOOM_WORKSPACE_VIEW_EVENT, METABLOOM_WORKSPACE_VIEW_REQUEST } from './metabloomVisualSession';
import { createMetabloomVisualSnapshot, parseMetabloomVisualSnapshot } from './metabloomVisualSnapshot';
import { classifyMetabloomVisualIntent } from './metabloomVisualIntent';
import { postMetabloomTool } from './metabloomToolClient';
import { METABLOOM_CHAT_PROTOCOL_VERSION } from './metabloomEmoteLibrary';
import { METABLOOM_TOOL_ERROR_CODES, getMetabloomApiErrorMessage, parseMetabloomRequestRef } from './metabloomRequestErrors';
import { parseMetabloomVisualQuota, formatMetabloomVisualQuotaMessage } from './metabloomVisualQuota';
import { METABLOOM_ARTIFACT_REFERENCE_EVENT, METABLOOM_ARTIFACT_UPDATE_EVENT,
  isMetabloomArtifactVersion, parseMetabloomArtifactReference } from './metabloomArtifactReference';
import { describeMetabloomVisualSelection, currentMetabloomVisualSelection, summarizeMetabloomVisual } from './metabloomVisualSelection';
import { isMetabloomFreshResearchRequest, parseMetabloomResearchReference } from './metabloomResearchReference';
import { getMetabloomVisualSaveSource } from './metabloomSavedWorkspace';
import { parseMetabloomSavedWorkMetadata } from './metabloomSavedWorkProtocol';
const safeReply = response => ({ version: METABLOOM_CHAT_PROTOCOL_VERSION, segments: [{ response }] });
const visualKindLabels = { calculator: 'Calculator', table: 'Table', 'line-chart': 'Line chart',
  'bar-chart': 'Bar chart', 'pie-chart': 'Pie chart', flowchart: 'Flowchart' };
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
    const research = props.navigation?.getToolState('orbWorkspace');
    this.pendingResearchWorkspace = research && Object.keys(research).length === 2
      && /^assistant-\d{1,16}$/.test(research.messageId) && ['compact', 'expanded'].includes(research.view)
      ? { messageId: research.messageId, view: research.view } : null;
    this.researchWorkspaceSnapshot = this.pendingResearchWorkspace;
  }
  state = { revision: 0 };
  records = new Map();
  researchRecords = new Map();
  turn = null;
  activeVisualId = null;
  activeResearchId = null;
  workspaceView = 'compact';
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
    window.addEventListener(METABLOOM_ARTIFACT_UPDATE_EVENT, this.updateReference);
    window.addEventListener(METABLOOM_WORKSPACE_VIEW_REQUEST, this.requestWorkspaceView);
    this.root.addEventListener('focusin', this.onWorkspaceFocus);
    this.mobileQuery = window.matchMedia?.('(max-width: 900px)');
    this.mobileQuery?.addEventListener?.('change', this.onWorkspaceBreakpoint);
    this.observer = new MutationObserver(this.reconcile);
    this.observer.observe(this.root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-stream-status'] });
    window.__metabloomVisualSnapshot = this.snapshot;
    this.restore();
    this.releaseWorkspace = this.props.onWorkspaceReady?.(this);
  }
  componentWillUnmount() {
    if (this.saveToolState) {
      const snapshot = createMetabloomVisualSnapshot(
        Array.from(this.records.values()), this.messages(), this.lastInteractedId || null, this.activeVisualId, this.workspaceView,
      );
      this.saveToolState('orbVisuals', snapshot);
      // React's development remount reuses this instance after cleanup.
      this.pendingSnapshot = snapshot;
      const research = this.researchWorkspaceSnapshot;
      const retained = research && this.messages().some(message => message.id === research.messageId && message.role === 'assistant')
        ? research : null;
      this.saveToolState('orbWorkspace', retained);
      this.pendingResearchWorkspace = retained;
    }
    this.mounted = false;
    this.releaseWorkspace?.();
    window.removeEventListener('metabloom:user-message', this.onUserMessage);
    window.removeEventListener(METABLOOM_VISUAL_OFFER_EVENT, this.onOffer);
    window.removeEventListener(METABLOOM_TRANSCRIPT_READY_EVENT, this.restore);
    window.removeEventListener(METABLOOM_RESET_EVENT, this.reset);
    window.removeEventListener(METABLOOM_ARTIFACT_UPDATE_EVENT, this.updateReference);
    window.removeEventListener(METABLOOM_WORKSPACE_VIEW_REQUEST, this.requestWorkspaceView);
    this.root?.removeEventListener('focusin', this.onWorkspaceFocus);
    this.mobileQuery?.removeEventListener?.('change', this.onWorkspaceBreakpoint);
    this.observer?.disconnect();
    if (window.__metabloomVisualSnapshot === this.snapshot) delete window.__metabloomVisualSnapshot;
    this.releaseTurn();
    for (const record of this.records.values()) { record.controller.abort(); window.clearTimeout(record.renderTimeout); this.removeSlot(record); }
    this.records.clear();
    for (const research of this.researchRecords.values()) {
      if (research.origin.isConnected) research.origin.appendChild(research.slot);
      research.slot.hidden = false;
    }
    this.researchRecords.clear();
    this.clearWorkspace({ preserveResearch: true });
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
    if (snapshot.activeVisualId) this.activateComponent(this.records.get(snapshot.activeVisualId), { view: snapshot.workspaceView || 'compact' });
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
  visualTitle = record => parseMetabloomSavedWorkMetadata(this.messages()
    .find(message => message.id === record.replyId)?.savedArtifact)?.title || record.spec.title;
  captureSavedWorkContext = () => {
    if (!this.mounted || !this.workspaceHost()) return null;
    const messages = this.messages();
    const visual = this.records.get(this.activeVisualId);
    const research = this.researchRecords.get(this.activeResearchId);
    const messageId = visual?.replyId || research?.messageId;
    const owner = messages.find(message => message.id === messageId && message.role === 'assistant');
    if (!owner) return null;
    const artifact = parseMetabloomSavedWorkMetadata(owner.savedArtifact);
    if (visual && this.availableComponents().includes(visual)) {
      const source = getMetabloomVisualSaveSource(visual);
      return { messageId, artifact, source: source ? { ...source, title: artifact?.title || source.title } : { title: this.visualTitle(visual),
        hint: 'Complete the component inputs before saving this work.' } };
    }
    if (research && this.researchOriginIsOwned(research)) {
      const metadata = research.source;
      const reusable = metadata && Date.parse(metadata.expiresAt) > Date.now();
      return { messageId, artifact, source: { title: research.title,
        ...(reusable ? { source: { kind: 'research', researchId: metadata.researchId,
          ...(metadata.briefId ? { briefId: metadata.briefId } : {}) } }
          : { hint: 'This report remains readable. Its temporary reference is unavailable for saving.' }) } };
    }
    return null;
  };
  importSavedVisual = (template, replyId) => {
    if (!this.mounted || !this.workspaceHost() || this.records.has(template?.id)) return false;
    const messages = this.messages();
    const snapshot = createMetabloomVisualSnapshot([{ ...template, replyId }], messages);
    const saved = snapshot.records[0];
    if (!saved || saved.status !== 'ready' || saved.mode !== 'optional' || !saved.artifactVersion) return false;
    const article = this.root.querySelector(`[data-message-id="${replyId}"][data-stream-status="complete"]`);
    if (!article || article.dataset.visualAnswer) return false;
    const slot = this.createSlot(saved.id);
    article.appendChild(slot);
    article.dataset.visualAnswer = saved.id;
    const record = { ...saved, article, slot, controller: new AbortController(), restored: true };
    this.records.set(record.id, record);
    if (record.kind === 'calculator') this.lastInteractedId = record.id;
    this.ensureLauncher(record);
    return this.activateComponent(record, { explicit: true, view: 'expanded' });
  };
  researchOriginIsOwned = record => {
    const article = record?.origin?.closest('[data-message-id]');
    return this.mounted && this.ownsSurface() && /^assistant-\d{1,16}$/.test(record?.messageId)
      && record.slot instanceof Element && record.origin instanceof Element
      && record.slot.isConnected && this.root.contains(record.slot)
      && this.root.contains(record.origin) && article?.dataset.messageId === record.messageId
      && ['complete', 'error', 'interrupted'].includes(article.dataset.streamStatus);
  };
  registerResearchSurface = record => {
    if (!this.researchOriginIsOwned(record) || !record.origin.contains(record.slot)
      || !this.workspaceHost() || this.researchRecords.has(record.messageId)) return undefined;
    this.researchRecords.set(record.messageId, record);
    record.slot.hidden = true;
    const pending = this.pendingResearchWorkspace;
    if (pending?.messageId === record.messageId) {
      this.pendingResearchWorkspace = null;
      if (!this.activeVisualId && this.workspaceSelectionRevision === 0) this.activateResearchSurface(record, { view: pending.view });
    }
    this.refresh();
    return () => {
      if (this.researchRecords.get(record.messageId) !== record) return;
      if (this.activeResearchId === record.messageId) {
        const retained = this.messages().some(message => message.id === record.messageId);
        this.clearWorkspace({ preserveResearch: retained });
      }
      this.researchRecords.delete(record.messageId);
      if (record.origin.isConnected) record.origin.appendChild(record.slot);
      record.slot.hidden = false;
      this.refresh();
    };
  };
  updateResearchSurface = (record, presentation) => {
    if (this.researchRecords.get(record.messageId) !== record || !this.researchOriginIsOwned(record)) return;
    if (record.title === presentation.title && record.summary === presentation.summary
      && JSON.stringify(record.source) === JSON.stringify(presentation.source)) return;
    Object.assign(record, presentation);
    this.refresh();
  };
  parkResearch = () => {
    const record = this.researchRecords.get(this.activeResearchId);
    if (record) {
      record.workspaceScrollTop = this.workspaceBody?.scrollTop || 0;
      if (record.origin.isConnected) record.origin.appendChild(record.slot);
      record.slot.hidden = true;
    }
    this.activeResearchId = null;
  };
  ensureWorkspaceContainers = host => {
    if (!this.workspaceToolbar) {
      this.workspaceToolbar = document.createElement('div');
      this.workspaceToolbar.className = 'metabloom-component-workspace__toolbar';
      this.workspaceBody = document.createElement('div');
      this.workspaceBody.className = 'metabloom-component-workspace__body';
      this.workspaceBody.tabIndex = -1;
    }
    if (this.workspaceToolbar.parentNode !== host) host.appendChild(this.workspaceToolbar);
    if (this.workspaceBody.parentNode !== host) host.appendChild(this.workspaceBody);
  };
  activateResearchSurface = (record, { explicit = false, focus = false, view = this.workspaceView } = {}) => {
    if (this.researchRecords.get(record?.messageId) !== record || !this.researchOriginIsOwned(record)) return false;
    const host = this.workspaceHost();
    if (!host) return false;
    if (explicit) this.workspaceSelectionRevision += 1;
    if (this.activeResearchId !== record.messageId) {
      const previous = this.records.get(this.activeVisualId);
      if (previous) previous.workspaceScrollTop = this.workspaceBody?.scrollTop || 0;
      this.activeVisualId = null;
      if (previous) this.placeAtOrigin(previous);
      this.parkResearch();
      this.ensureWorkspaceContainers(host);
      record.slot.hidden = false;
      this.workspaceBody.appendChild(record.slot);
      this.workspaceBody.scrollTop = record.workspaceScrollTop || 0;
      this.activeResearchId = record.messageId;
    }
    this.workspaceView = view;
    this.researchWorkspaceSnapshot = { messageId: record.messageId, view };
    this.root.dataset.activeComponent = 'true';
    this.publishWorkspaceView(view);
    if (focus) this.workspaceBody.focus({ preventScroll: true });
    this.refresh();
    return true;
  };
  selectWorkspaceItem = key => key.startsWith('research:')
    ? this.activateResearchSurface(this.researchRecords.get(key.slice(9)), { explicit: true })
    : this.activateComponent(this.records.get(key), { explicit: true });
  availableComponents = () => {
    if (!this.ownsSurface()) return [];
    const owners = new Set(this.messages().map(message => message.id));
    return Array.from(this.records.values()).filter(record => record.status === 'ready' && record.spec
      && owners.has(record.replyId || record.userId) && record.slot?.isConnected
      && record.article?.isConnected && this.root.contains(record.slot));
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
  publishWorkspaceView = (view, { restoreReading = true } = {}) => {
    if (!this.root) return;
    // Notify before hiding the transcript so its reading position can be saved.
    if (this.mounted) window.dispatchEvent(new CustomEvent(METABLOOM_WORKSPACE_VIEW_EVENT,
      { detail: { root: this.root, view, restoreReading } }));
    this.root.dataset.componentView = view;
  };
  setWorkspaceView = (view, { explicit = true, focus = false } = {}) => {
    if (!this.mounted || !this.ownsSurface() || (!this.activeVisualId && !this.activeResearchId) || !['compact', 'expanded'].includes(view)) return false;
    if (explicit) this.workspaceSelectionRevision += 1;
    this.workspaceView = view;
    if (this.activeResearchId) this.researchWorkspaceSnapshot = { messageId: this.activeResearchId, view };
    this.publishWorkspaceView(view);
    this.refresh();
    if (focus) {
      const target = view === 'expanded' ? this.workspaceBody : this.workspaceToolbar?.querySelector('[data-workspace-toggle]');
      target?.focus({ preventScroll: true });
    }
    return true;
  };
  requestWorkspaceView = event => {
    if (event.detail?.root === this.root) this.setWorkspaceView(event.detail.view, { explicit: true });
  };
  onWorkspaceFocus = event => {
    if (this.mobileQuery?.matches && this.workspaceView === 'expanded'
      && event.target.matches?.('.metabloom-chat__composer textarea')) this.setWorkspaceView('compact', { explicit: false });
  };
  onWorkspaceBreakpoint = event => {
    if (!this.activeVisualId && !this.activeResearchId) return;
    const focused = document.activeElement;
    if (event.matches) this.setWorkspaceView(this.workspaceBody?.contains(focused) ? 'expanded' : 'compact', { explicit: false });
    else {
      this.publishWorkspaceView(this.workspaceView);
      if (focused?.matches?.('[data-workspace-toggle]')) this.workspaceBody?.focus({ preventScroll: true });
      else if (focused?.closest?.('.metabloom-chat__component-reply')) this.root.querySelector('.metabloom-chat__composer textarea')?.focus({ preventScroll: true });
    }
  };
  clearWorkspace = ({ preserveResearch = false } = {}) => {
    this.activeVisualId = null;
    this.activeResearchId = null;
    if (!preserveResearch) this.researchWorkspaceSnapshot = null;
    this.workspaceView = 'compact';
    this.publishWorkspaceView('compact', { restoreReading: false });
    this.workspaceToolbar?.remove();
    this.workspaceBody?.remove();
    if (this.root) { delete this.root.dataset.activeComponent; delete this.root.dataset.componentView; }
  };
  activateComponent = (record, { explicit = false, focus = false, view } = {}) => {
    const host = this.workspaceHost();
    const owner = record?.replyId || record?.userId;
    if (!this.mounted || !host || !record || this.records.get(record.id) !== record
      || record.status !== 'ready' || !record.slot?.isConnected || !this.root.contains(record.slot)
      || !this.messages().some(message => message.id === owner)) return false;
    if (explicit) this.workspaceSelectionRevision += 1;
    this.parkResearch();
    this.researchWorkspaceSnapshot = null;
    if (view) this.workspaceView = view;
    if (this.activeVisualId === record.id) {
      this.publishWorkspaceView(this.workspaceView);
      this.refresh();
      // Ask lives below the fields in short workspaces. A deliberate selection
      // brings the result back into view; streamed replies never reset this scroll.
      if (explicit && this.workspaceBody) this.workspaceBody.scrollTop = 0;
      if (focus) this.workspaceBody?.focus({ preventScroll: true });
      return true;
    }
    const previous = this.records.get(this.activeVisualId);
    if (previous && this.workspaceBody) previous.workspaceScrollTop = this.workspaceBody.scrollTop;
    this.activeVisualId = null;
    if (previous) this.placeAtOrigin(previous);
    this.ensureLauncher(record);
    // Re-appending a focused toolbar can blur its native select. Only attach
    // these persistent containers when returning from a closed workspace.
    this.ensureWorkspaceContainers(host);
    const focused = record.slot.contains(document.activeElement) ? document.activeElement : null;
    this.workspaceBody.appendChild(record.slot);
    this.workspaceBody.scrollTop = record.workspaceScrollTop || 0;
    this.activeVisualId = record.id;
    this.root.dataset.activeComponent = 'true';
    this.publishWorkspaceView(this.workspaceView);
    if (focus) this.workspaceBody.focus({ preventScroll: true });
    else if (focused?.isConnected) focused.focus({ preventScroll: true });
    this.refresh();
    return true;
  };
  returnComponent = () => {
    if (this.activeResearchId) {
      const research = this.researchRecords.get(this.activeResearchId);
      this.workspaceSelectionRevision += 1;
      this.parkResearch();
      this.clearWorkspace();
      this.refresh();
      research?.origin.querySelector('button')?.focus();
      return;
    }
    const record = this.records.get(this.activeVisualId);
    if (record && this.workspaceBody) record.workspaceScrollTop = this.workspaceBody.scrollTop;
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
    if (record?.artifactVersion === parsed?.version) this.activateComponent(record, { explicit: true, view: 'compact' });
  };
  activateSubmittedResearch = reference => {
    const parsed = parseMetabloomResearchReference(reference);
    if (!parsed) return;
    const retained = new Set(this.messages().map(message => message.id));
    const matches = record => this.researchOriginIsOwned(record) && retained.has(record.messageId)
      && record.source?.researchId === parsed.researchId
      && (parsed.selector.type === 'report' || record.source.briefId === parsed.selector.briefId);
    const active = this.researchRecords.get(this.activeResearchId);
    const record = matches(active) ? active : Array.from(this.researchRecords.values()).reverse().find(matches);
    if (record) this.activateResearchSurface(record, { explicit: true, view: 'compact' });
  };
  activateGeneratedComponent = record => {
    const turn = record.generationTurn;
    if (turn && this.turn === turn && !turn.signal.aborted
      && turn.workspaceSelectionRevision === this.workspaceSelectionRevision) this.activateComponent(record, { view: 'compact' });
  };
  reset = event => {
    if (!this.mounted || !this.ownsSurface() || !(event?.detail instanceof Element) || !this.root.contains(event.detail)) return;
    this.releaseTurn();
    this.pendingSnapshot = undefined;
    this.pendingResearchWorkspace = null;
    this.lastInteractedId = null;
    this.workspaceSelectionRevision += 1;
    for (const record of this.records.values()) {
      record.controller.abort();
      window.clearTimeout(record.renderTimeout);
      this.removeSlot(record);
    }
    this.records.clear();
    // Reset retains the conversation and its completed reports. Close the
    // workspace without leaving their existing Open research controls inert.
    this.parkResearch();
    this.clearWorkspace();
    this.saveToolState?.('orbVisuals', null);
    this.saveToolState?.('orbWorkspace', null);
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
    const presentation = describeMetabloomVisualSelection(record.spec, reference);
    if (!presentation) return false;
    this.activateComponent(record, { explicit: true, view: 'compact' });
    window.dispatchEvent(new CustomEvent(METABLOOM_ARTIFACT_REFERENCE_EVENT, {
      detail: { reference, ...presentation, root: this.root },
    }));
    return true;
  };
  updateReference = event => {
    if (!this.mounted || !this.ownsSurface() || event.detail?.root !== this.root) return;
    const reference = parseMetabloomArtifactReference(event.detail.reference);
    const record = reference && this.records.get(reference.id);
    if (!record || record.artifactVersion !== reference.version) return;
    const selection = currentMetabloomVisualSelection(record, reference);
    if (selection && this.askAbout(record, selection)) event.preventDefault();
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
    else if (event.detail.researchContext) this.activateSubmittedResearch(event.detail.researchContext);
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
    if (!this.mounted || !this.root || (!this.turn?.accepted && !this.turn?.started
      && this.records.size === 0 && this.researchRecords.size === 0)) return;
    if (!this.ownsSurface()) {
      for (const record of this.records.values()) this.stop(record);
      this.releaseTurn();
      return;
    }
    const messages = this.messages();
    let changed = false;
    for (const [id, record] of this.researchRecords) {
      if (!this.researchOriginIsOwned(record)
        || (typeof window.__orbMessages === 'function' && !messages.some(message => message.id === id))) {
        if (this.activeResearchId === id) this.clearWorkspace();
        this.researchRecords.delete(id);
        record.slot.remove();
        changed = true;
      }
    }
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
    if (record.id === this.activeVisualId) this.refresh();
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
    const visual = this.records.get(this.activeVisualId);
    const research = this.researchRecords.get(this.activeResearchId);
    const active = visual || research;
    const title = visual ? this.visualTitle(visual) : research?.title;
    const activeKey = visual?.id || (research && `research:${research.messageId}`);
    const messageOrder = new Map(this.messages().map((message, index) => [message.id, index]));
    const components = [
      ...this.availableComponents().map(record => ({ key: record.id, title: this.visualTitle(record),
        kind: visualKindLabels[record.spec.kind], order: messageOrder.get(record.replyId || record.userId) ?? Infinity })),
      ...Array.from(this.researchRecords.values()).filter(this.researchOriginIsOwned)
        .map(record => ({ key: `research:${record.messageId}`, title: record.title, kind: 'Research',
          order: messageOrder.get(record.messageId) ?? Infinity })),
    ].sort((first, second) => first.order - second.order);
    return <>
      <span ref={this.captureAnchor} hidden aria-hidden="true" />
      {active && this.workspaceToolbar && createPortal(<>
        <div className="metabloom-component-workspace__identity">
          <h3 title={title} className={components.length > 1 ? 'metabloom-visual__sr-only' : undefined}>{title}</h3>
          {components.length > 1 && <label className="metabloom-component-workspace__picker">
            <span className="metabloom-visual__sr-only">Components in this conversation</span>
            <select value={activeKey} onChange={event => this.selectWorkspaceItem(event.target.value)}>
              {components.map((record, index) => <option key={record.key} value={record.key}>
                {index + 1}. {record.title} · {record.kind}
              </option>)}
            </select>
          </label>}
          <p className="metabloom-component-workspace__summary">{visual ? summarizeMetabloomVisual(visual) : research.summary}</p>
        </div>
        <button type="button" data-workspace-toggle aria-expanded={this.workspaceView === 'expanded'}
          onClick={() => this.setWorkspaceView(this.workspaceView === 'expanded' ? 'compact' : 'expanded', { focus: true })}>
          {this.workspaceView === 'expanded' ? 'Back to chat' : 'Open'}
        </button>
        <button type="button" aria-label={research ? 'Return research to conversation' : 'Return component to conversation'}
          title={research ? 'Return research to conversation' : 'Return component to conversation'} onClick={this.returnComponent}>×</button>
      </>, this.workspaceToolbar, 'workspace-toolbar')}
      {Array.from(this.records.values(), record => <React.Fragment key={record.id}>
        {createPortal(<MetabloomVisualBoundary><MetabloomVisualFrame artifact={record} workspace={this.activeVisualId === record.id} onStop={() => this.stop(record)}
          onReady={() => this.ready(record)} onInputsChange={values => this.inputsChanged(record, values)}
          onViewStateChange={viewState => this.viewStateChanged(record, viewState)}
          onAskAbout={selection => this.askAbout(record, selection)} /></MetabloomVisualBoundary>, record.slot, record.id)}
        {record.launcher && createPortal(<button type="button" aria-label={`Show component: ${this.visualTitle(record)}`}
          aria-pressed={this.activeVisualId === record.id}
          onClick={() => this.activateComponent(record, { explicit: true, focus: true, view: 'expanded' })}>
          <span>Show component</span><strong>{this.visualTitle(record)}</strong>
        </button>, record.launcher, `${record.id}-launcher`)}
      </React.Fragment>)}
    </>;
  }
}
