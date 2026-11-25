import { MAX_METABLOOM_RESEARCH_STREAM_BYTES, createMetabloomSegmentStreamDecoder, parseMetabloomChatEnvelope } from "./metabloomEmoteProtocol";
import { METABLOOM_ACTION_MODES } from "./metabloomDecisionMapping";
import { METABLOOM_REQUEST_ERROR_MESSAGES, parseMetabloomRequestError, parseMetabloomRequestRef, getMetabloomApiErrorMessage } from "./metabloomRequestErrors";
import { METABLOOM_VISUAL_OFFER_EVENT, createMetabloomVisualStreamBridge } from "./metabloomVisualApiClient";
import { parseMetabloomResearchContext, isMetabloomFreshResearchRequest } from "./metabloomResearchReference";
import { METABLOOM_AGENT_TIMEOUT_MS, MAX_METABLOOM_GMAIL_AGENT_CALLS, createMetabloomCalendarStreamBridge, createMetabloomGmailStreamBridge } from './metabloomAgentTools';
import { MAX_CALENDAR_PROPOSAL_BYTES } from './metabloomCalendarProtocol';
import { parseMetabloomModelSelection } from './metabloomModelProtocol';
import { parseMetabloomOrbContext } from './metabloomExpressionProtocol';
import { MAX_METABLOOM_WORKSPACE_BODY_BYTES, MAX_METABLOOM_WORKSPACE_EVENT_BYTES,
  parseMetabloomWorkspaceContext } from './metabloomWorkspaceProtocol';
import { createMetabloomNavigationStreamBridge, parseMetabloomNavigationContext } from './metabloomNavigation';
import { createMetabloomTraceStreamBridge } from './metabloomLatency';

export { getMetabloomApiErrorMessage } from "./metabloomRequestErrors";

const MAX_RESPONSE_BYTES = 96000;
export const METABLOOM_RESEARCH_TIMEOUT_MS = 210000;
export const METABLOOM_RESEARCH_REUSE_TIMEOUT_MS = 90000;
export class MetabloomApiError extends Error {
  constructor(message, { code = "request_failed", status = 0, requestRef = null } = {}) {
    super(message);
    this.name = "MetabloomApiError";
    this.code = typeof code === "string" && Object.prototype.hasOwnProperty.call(METABLOOM_REQUEST_ERROR_MESSAGES, code) ? code : "request_failed";
    this.status = Number.isInteger(status) && status >= 0 && status <= 599 ? status : 0;
    this.requestRef = parseMetabloomRequestRef(requestRef);
  }
}
export const isMetabloomApiUnavailable = (error) => error instanceof MetabloomApiError
  && (error.code === "not_configured" || error.status === 404);

const clientTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
  catch { return "UTC"; }
};

export const requestMetabloomResponse = async ({
  actionMode = "auto",
  allowMultiple = false,
  fetchImpl = globalThis.fetch,
  history = [],
  artifactContext,
  researchContext,
  modelSelection,
  orbContext,
  workspaceContext,
  calendarContext,
  gmailEnabled,
  navigationContext,
  onNavigation,
  latency = null,
  onWorkspaceProposal,
  onCalendarProposal,
  onCalendarReceipt,
  onGmailProposal,
  onGmailReceipt,
  message,
  onSegment,
  onTextDelta,
  onReaction,
  onAction,
  onResearch,
  onResearchProgress,
  onResearchDetails,
  onResearchBrief,
  onResearchReference,
  onSources,
  onSourceMedia,
  onToolImages,
  onVisualOffer,
  onToolActivity,
  onToolProgress,
  onAgentStatus,
  toolset = true,
  optional = false,
  requestId,
  conversationId,
  signal,
  timeZone = clientTimeZone(),
} = {}) => {
  if (!METABLOOM_ACTION_MODES.includes(actionMode)) {
    throw new MetabloomApiError("Unknown presentation mode.", { code: "invalid_request" });
  }
  if (modelSelection !== undefined) {
    modelSelection = parseMetabloomModelSelection(modelSelection);
    if (!modelSelection) throw new MetabloomApiError('Invalid model selection.', { code: 'invalid_request' });
  }
  if (researchContext !== undefined) {
    researchContext = parseMetabloomResearchContext(researchContext);
    if (!researchContext || artifactContext) throw new MetabloomApiError(getMetabloomApiErrorMessage("research_reference_invalid"), { code: "research_reference_invalid" });
    actionMode = isMetabloomFreshResearchRequest(message) ? "deep-research" : "none";
  }
  if (typeof fetchImpl !== "function") {
    if (optional && !researchContext && !modelSelection) return null;
    throw new MetabloomApiError("Fetch is unavailable.");
  }
  const useTools = toolset === true && !artifactContext && !researchContext && actionMode !== 'deep-research';
  if (orbContext !== undefined) {
    orbContext = parseMetabloomOrbContext(orbContext);
    if (!orbContext || typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,160}$/.test(requestId))
      throw new MetabloomApiError('Invalid Orb context.', { code: 'invalid_request' });
  }
  const useExpressions = Boolean(useTools && orbContext);
  const useWorkspace = workspaceContext !== undefined;
  if (useWorkspace) {
    workspaceContext = parseMetabloomWorkspaceContext(workspaceContext);
    if (!useTools || !workspaceContext || workspaceContext.conversationId !== conversationId
      || typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,160}$/.test(requestId))
      throw new MetabloomApiError('Invalid invoice workspace context.', { code: 'invalid_request' });
  }
  // Page navigation is an opt-in of the tool-enabled chat: the browser lists
  // the pages it can open and performs any move the host chooses.
  const navigation = useTools && navigationContext !== undefined ? parseMetabloomNavigationContext(navigationContext) : null;
  if (useTools && navigationContext !== undefined && !navigation)
    throw new MetabloomApiError('Invalid navigation context.', { code: 'invalid_request' });
  const hasCalendarContext = Boolean(calendarContext && typeof calendarContext === 'object');
  const useCalendar = Boolean(useTools && (hasCalendarContext || process.env.REACT_APP_METABLOOM_CALENDAR_ENABLED === '1'));
  const defaultGmailEnabled = process.env.REACT_APP_METABLOOM_GMAIL_ENABLED !== '0'
    && process.env.REACT_APP_METABLOOM_CALENDAR_ENABLED === '1';
  const useGmail = Boolean(useTools && (gmailEnabled !== undefined ? gmailEnabled === true : defaultGmailEnabled));
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const startedAt = Date.now();
  let researchStarted = false;
  let toolsStarted = false;
  let timeout = setTimeout(abort, useTools ? METABLOOM_AGENT_TIMEOUT_MS : 30000);
  let reader;
  let responseStatus = 0;
  let responseRequestRef = null;
  try {
    const requestBody = JSON.stringify({ actionMode, allowMultiple: allowMultiple === true, streamText: true,
      streamResearchProgress: true, streamResearchDetails: true, streamResearchBrief: true, streamResearchMedia: true, streamResearchReuse: true, timeZone, history, message, requestId,
      ...(useTools ? { streamToolMedia: true, ...(conversationId ? { conversationId } : {}) } : {}),
      ...(modelSelection ? { modelSelection } : {}), ...(useExpressions ? { orbContext } : {}),
      ...(useWorkspace ? { workspaceContext } : {}),
      ...(useCalendar && hasCalendarContext ? { calendarContext } : {}),
      ...(navigation ? { navigation } : {}),
      ...(artifactContext ? { artifactContext } : {}), ...(researchContext ? { researchContext } : {}) });
    if (useWorkspace && new TextEncoder().encode(requestBody).byteLength > MAX_METABLOOM_WORKSPACE_BODY_BYTES)
      throw new MetabloomApiError("The selected invoice context is too large. Narrow the request or edit it manually.", { code: "invalid_request" });
    latency?.mark('fetch_start');
    const response = await fetchImpl("/api/metabloom", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson", "X-Metabloom-Visuals": "1", "X-Metabloom-Ui-Tools": "1", "X-Metabloom-Pricebook": "2",
        ...(useTools ? { 'X-Metabloom-Toolset': '2', 'X-Metabloom-Boom-Request': '1', 'X-Metabloom-Invoice': '1' } : {}),
        ...(useExpressions ? { 'X-Metabloom-Expressions': '1' } : {}),
        ...(useWorkspace ? { 'X-Metabloom-Workspace': '1' } : {}),
        ...(useCalendar ? { 'X-Metabloom-Calendar': '1' } : {}),
        ...(useGmail ? { 'X-Metabloom-Gmail': '1' } : {}),
        ...(navigation ? { 'X-Metabloom-Navigation': '1' } : {}),
        ...(latency ? { 'X-Metabloom-Trace': '1' } : {}) },
      body: requestBody,
      signal: controller.signal,
    });
    const contentType = response.headers?.get?.("content-type") || "";
    responseStatus = response.status;
    responseRequestRef = parseMetabloomRequestRef(response.headers?.get?.("X-Metabloom-Request-Ref"));
    latency?.mark('headers');
    latency?.note({ requestRef: responseRequestRef || undefined, provider: response.headers?.get?.('X-Metabloom-Provider') || undefined,
      model: response.headers?.get?.('X-Metabloom-Model') || undefined });
    const isStream = contentType.includes("application/x-ndjson");
    let streamError = null;
    const decoder = createMetabloomTraceStreamBridge(createMetabloomNavigationStreamBridge(createMetabloomGmailStreamBridge(
      createMetabloomCalendarStreamBridge(
        createMetabloomVisualStreamBridge(createMetabloomSegmentStreamDecoder({
          allowMultiple,
          allowResearchDetails: true,
          allowResearchBrief: true,
          allowResearchReuse: true,
          allowTools: useTools,
          allowToolMedia: useTools,
          allowToolProgress: useTools,
          ...(useGmail ? { maxToolCalls: MAX_METABLOOM_GMAIL_AGENT_CALLS } : {}),
          allowExpressions: useExpressions,
          allowWorkspace: useWorkspace,
          requestId,
          onToolProgress: (progress) => {
            if (controller.signal.aborted) throw new MetabloomApiError('Cancelled.', { code: 'cancelled' });
            onToolProgress?.(progress);
          },
          onAgentStatus: (status) => {
            if (controller.signal.aborted) throw new MetabloomApiError('Cancelled.', { code: 'cancelled' });
            onAgentStatus?.(status);
          },
          onToolActivity: (activity) => {
            if (controller.signal.aborted) throw new MetabloomApiError('Cancelled.', { code: 'cancelled' });
            if (!toolsStarted) {
              toolsStarted = true;
              clearTimeout(timeout);
              timeout = setTimeout(abort, Math.max(0, startedAt + METABLOOM_AGENT_TIMEOUT_MS - Date.now()));
            }
            onToolActivity?.(activity);
          },
          onError: (error) => {
            const code = error.code || "invalid_response";
            streamError = new MetabloomApiError(getMetabloomApiErrorMessage(code), {
              code, status: responseStatus, requestRef: error.requestRef || responseRequestRef,
            });
          },
          onAction: (action) => {
            if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
            onAction?.(action);
          },
          onResearch: (research) => {
            if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
            if (research.state === "searching" && !researchStarted) {
              researchStarted = true;
              clearTimeout(timeout);
              timeout = setTimeout(abort, Math.max(0, startedAt + METABLOOM_RESEARCH_TIMEOUT_MS - Date.now()));
            } else if (research.state === "reusing" && !researchStarted) {
              researchStarted = true;
              clearTimeout(timeout);
              timeout = setTimeout(abort, Math.max(0, startedAt + METABLOOM_RESEARCH_REUSE_TIMEOUT_MS - Date.now()));
            }
            onResearch?.(research);
          },
          onResearchProgress: (progress) => {
            if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
            onResearchProgress?.(progress);
          },
          onResearchDetails: (report) => {
            if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
            onResearchDetails?.(report);
          },
          onResearchBrief: (brief) => {
            if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
            onResearchBrief?.(brief);
          },
          onResearchReference: (metadata) => {
            if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
            onResearchReference?.(metadata);
          },
          onSources: (sources) => {
            if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
            onSources?.(sources);
          },
          onSourceMedia: (media) => {
            if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
            onSourceMedia?.(media);
          },
          onToolImages: (images) => {
            if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
            onToolImages?.(images);
          },
          onTextDelta: (delta, index) => {
            if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
            onTextDelta?.(delta, index);
          },
          onReaction: (reaction) => {
            if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
            onReaction?.(reaction);
          },
          onSegment: (segment, index) => {
            if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
            onSegment?.(segment, index);
          },
        }), { maxRecordChars: useWorkspace ? MAX_METABLOOM_WORKSPACE_EVENT_BYTES : 24000 }),
        {
          allowCalendar: useCalendar,
          requestId,
          maxRecordChars: Math.max(24000, MAX_CALENDAR_PROPOSAL_BYTES),
        },
      ),
      {
        allowGmail: useGmail,
        requestId,
      },
    ), {
      allowNavigation: Boolean(navigation),
      destinations: navigation?.destinations || [],
      onNavigation: (destination) => {
        if (controller.signal.aborted) throw new MetabloomApiError('Cancelled.', { code: 'cancelled' });
        onNavigation?.(destination);
      },
    }), { allowTrace: Boolean(latency), recorder: latency });
    let text = "";
    let bytes = 0;
    if (response.ok && !isStream && !contentType.includes("application/json")) {
      throw new MetabloomApiError("Unexpected model response format.");
    }
    if (response.body?.getReader) {
      reader = response.body.getReader();
      const textDecoder = new TextDecoder("utf-8", { fatal: true });
      while (true) {
        const chunk = await reader.read();
        if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        // The decoder enforces the ordinary 320k cap until searching is verified.
        if (bytes > (response.ok ? (isStream ? MAX_METABLOOM_RESEARCH_STREAM_BYTES : MAX_RESPONSE_BYTES) : 4096)) throw new MetabloomApiError("Response exceeded its size limit.");
        const part = textDecoder.decode(chunk.value, { stream: true });
        if (response.ok && isStream) {
          if (!decoder.push(part)) throw streamError || new MetabloomApiError("Invalid stream.");
        } else text += part;
      }
      const tail = textDecoder.decode();
      if (response.ok && isStream) decoder.push(tail); else text += tail;
    } else if (typeof response.text === "function") {
      text = await response.text();
      if (text.length > (response.ok ? (isStream ? MAX_METABLOOM_RESEARCH_STREAM_BYTES : 24000) : 4096)) throw new MetabloomApiError("Response exceeded its size limit.");
      if (response.ok && isStream) decoder.push(text);
    } else if (!response.ok && typeof response.json === "function") {
      // Minimal test transports; real HTTP responses use the bounded reader above.
      text = JSON.stringify(await response.json());
      if (text.length > 4096) throw new MetabloomApiError("Response exceeded its size limit.");
    }
    if (controller.signal.aborted) throw new MetabloomApiError("Cancelled.", { code: "cancelled" });
    if (!response.ok) {
      let payload = {};
      try { payload = JSON.parse(text); } catch { /* Static host may return HTML. */ }
      // Older HTTP handlers may include a message field. Never copy its text;
      // validate only the same safe code and reference used by stream errors.
      const details = parseMetabloomRequestError({ code: payload?.code,
        ...(payload?.requestRef !== undefined ? { requestRef: payload.requestRef } : {}) });
      const code = details?.code || "request_failed";
      const error = new MetabloomApiError(getMetabloomApiErrorMessage(code), {
        code, status: responseStatus, requestRef: details?.requestRef || responseRequestRef,
      });
      if (optional && !researchContext && !modelSelection && isMetabloomApiUnavailable(error)) return null;
      throw error;
    }
    const result = isStream ? decoder.finish() : parseMetabloomChatEnvelope(text, { allowMultiple });
    if (!result.ok) throw streamError || new MetabloomApiError(getMetabloomApiErrorMessage("invalid_response"), {
      code: "invalid_response", status: responseStatus, requestRef: responseRequestRef,
    });
    if (result.value.workspaceProposal && (!useWorkspace
      || result.value.workspaceProposal.conversationId !== conversationId
      || result.value.workspaceProposal.workspaceInstanceId !== workspaceContext.workspaceInstanceId
      || result.value.workspaceProposal.bindingEpoch !== workspaceContext.bindingEpoch
      || result.value.workspaceProposal.expectedDataRevision !== workspaceContext.dataRevision))
      throw new MetabloomApiError('The invoice operation did not match this request.', { code: 'invalid_response' });
    // JSON compatibility responses use the same callback, exactly once per segment.
    if (!isStream) result.value.segments.forEach((segment, index) => onSegment?.(segment, index));
    // A visual is offered only after the entire text stream has validated. Its
    // optional listener cannot turn a completed answer into a failed request.
    if (isStream && decoder.offer && requestId && !signal?.aborted) {
      const detail = { offer: decoder.offer, requestId, reply: result.value, signal };
      try {
        if (onVisualOffer) onVisualOffer(detail);
        else if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(METABLOOM_VISUAL_OFFER_EVENT, { detail }));
      } catch { /* Text completion is independent of optional presentation. */ }
    }
    if (result.value.workspaceProposal && !signal?.aborted) {
      try { onWorkspaceProposal?.(result.value.workspaceProposal); } catch { /* Caller may instead consume the returned metadata. */ }
    }
    if (result.value.calendarProposal && !signal?.aborted) {
      try { onCalendarProposal?.(result.value.calendarProposal); } catch { /* Caller may instead consume the returned metadata. */ }
    }
    if (result.value.calendarReceipt && !signal?.aborted) {
      try { onCalendarReceipt?.(result.value.calendarReceipt); } catch { /* Caller may instead consume the returned metadata. */ }
    }
    if (result.value.gmailProposal && !signal?.aborted) {
      try { onGmailProposal?.(result.value.gmailProposal); } catch { /* Caller may instead consume the returned metadata. */ }
    }
    if (result.value.gmailReceipt && !signal?.aborted) {
      try { onGmailReceipt?.(result.value.gmailReceipt); } catch { /* Caller may instead consume the returned metadata. */ }
    }
    latency?.finish('done');
    return result.value;
  } catch (error) {
    latency?.finish(controller.signal.aborted ? 'cancelled' : typeof error?.code === 'string' && /^[a-z_]{1,40}$/.test(error.code) ? error.code : 'error');
    if (controller.signal.aborted) throw new MetabloomApiError(getMetabloomApiErrorMessage("cancelled"), {
      code: "cancelled", status: responseStatus, requestRef: responseRequestRef,
    });
    if (error instanceof MetabloomApiError) throw error;
    throw new MetabloomApiError(getMetabloomApiErrorMessage("network_error"), {
      code: "network_error", status: responseStatus, requestRef: responseRequestRef,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
    if (reader) {
      try { await reader.cancel(); } catch { /* Already closed or aborted. */ }
      reader.releaseLock();
    }
  }
};
