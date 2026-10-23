import React from "react";
import { useThemeMode } from "../contexts/ThemeContext";
import { useAppNavigation } from '../contexts/AppNavigationContext';
import { METABLOOM_HOOD_SEQUENCE } from "./metabloomUnderHood";
import MetabloomAvatar from "./MetabloomAvatar";
import MetabloomReactionPanel from "./MetabloomReactionPanel";
import MetabloomResearchStatus from "./MetabloomResearchStatus";
import MetabloomResearchBrief from "./MetabloomResearchBrief";
import { METABLOOM_SCENE_TRANSITION_SECONDS } from "./metabloomSceneTransition";
import {
  METABLOOM_ACTIONS,
  METABLOOM_ACTION_IDS,
  getDefaultMetabloomAction,
  resolveMetabloomAction,
} from "./metabloomActions";
import {
  MAX_METABLOOM_ACTION_DURATION_MS,
  MAX_METABLOOM_ACTION_INTENSITY,
  MAX_METABLOOM_ACTION_STEPS,
  MAX_METABLOOM_CHAIN_DURATION_MS,
  MIN_METABLOOM_ACTION_DURATION_MS,
  MIN_METABLOOM_ACTION_INTENSITY,
  METABLOOM_MODEL_RESPONSE_SCHEMA,
  parseMetabloomModelResponse,
} from "./metabloomResponseContract";
import { METABLOOM_DEMO_PROMPTS, METABLOOM_DEMOS } from "./metabloomDemoResponses";
import { parseMetabloomChatEnvelope, createMetabloomSegmentStreamDecoder, MAX_METABLOOM_RESEARCH_PROGRESS_CHARS, MAX_METABLOOM_RESEARCH_PROGRESS_EVENTS } from "./metabloomEmoteProtocol";
import { resolveMetabloomEmote, METABLOOM_PROTOCOL_VERSION, METABLOOM_EMOTE_IDS, METABLOOM_EMOTE_RESPONSE_SCHEMA } from "./metabloomEmoteLibrary";
import { METABLOOM_ACTIVITIES, METABLOOM_ACTIONS as METABLOOM_SCENE_ACTIONS, METABLOOM_REACTION_RECIPES, METABLOOM_DECISION_SCHEMA, METABLOOM_REACTION_QUESTION, resolveMetabloomDecision, parseMetabloomActivity } from "./metabloomDecisionMapping";
import { createMetabloomReactionPlayer } from "./metabloomReactionPlayer";
import { createMetabloomReplySession } from "./metabloomReplySession";
import { createMetabloomResearchDisplayGate } from "./metabloomResearchDisplayGate";
import { METABLOOM_RESEARCH_TIMEOUT_MS, getMetabloomApiErrorMessage, requestMetabloomResponse } from "./metabloomApiClient";
import { METABLOOM_REQUEST_ERROR_MESSAGES, parseMetabloomRequestRef } from "./metabloomRequestErrors";
import { METABLOOM_TOOL_TURN_TIMEOUT_MS } from "./metabloomVisualProtocol";
import { parseMetabloomResearchSources } from "./metabloomResearchSources";
import { parseMetabloomResearchReport } from "./metabloomResearchReport";
import { parseMetabloomResearchBrief } from "./metabloomResearchBriefProtocol";
import { streamMetabloomDemoResponse } from "./metabloomDemoStream";
import "./OrbSection.css";
import "./OrbEmoteDemos.css";

const DEFAULT_ACTION_RECORD = getDefaultMetabloomAction();
const DEFAULT_ACTION = DEFAULT_ACTION_RECORD.id;
const LEGACY_FORMS = Object.freeze(["companion", "bloom", "focus", "drift"]);
const FORM_ACTIONS = Object.freeze({
  bloom: "surprised",
  companion: "reform",
  drift: "sleepy",
  focus: "thinking",
});
const ACTION_FORMS = Object.freeze({
  excited: "bloom",
  reform: "companion",
  sleepy: "drift",
  surprised: "bloom",
  thinking: "focus",
});
const MODEL_REQUEST_EVENT = "metabloom:user-message";
const MODEL_RESPONSE_EVENT = "metabloom:model-response";
const MAX_USER_MESSAGE_CHARS = 1600;
const MAX_CHAT_MESSAGES = 24;
const MAX_HISTORY_MESSAGES = 12;
const RESPONSE_TIMEOUT_MS = 30000;
const MAX_ACTIVITY_TIMEOUT_MS = 300000;
const RESEARCH_SURFACING_LEAD_MS = 650;
const SCENE_THINK_LEAD_MS = 400;
const MAX_TOOL_SEQUENCE_ID_CHARS = 48;
const TOOL_SEQUENCE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const TOOL_EXPRESSION_KEYS = new Set([
  "action",
  "duration",
  "intensity",
  "talking",
]);
const TOOL_SEQUENCE_KEYS = new Set(["id", "steps"]);
const TOOL_TALK_KEYS = new Set(["active"]);
const EMPTY_TOOL_KEYS = new Set();
const TOOL_REACTION_KEYS = new Set(["emote"]);

const METABLOOM_TOOL_SCHEMAS = Object.freeze({
  react: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MetabloomReact",
    type: "object",
    additionalProperties: false,
    required: ["emote"],
    properties: { emote: { type: "string", enum: [...METABLOOM_EMOTE_IDS] } },
  },
  express: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MetabloomExpress",
    type: "object",
    additionalProperties: false,
    required: ["action"],
    properties: {
      action: { type: "string", enum: [...METABLOOM_ACTION_IDS] },
      duration: {
        type: "integer",
        minimum: MIN_METABLOOM_ACTION_DURATION_MS,
        maximum: MAX_METABLOOM_ACTION_DURATION_MS,
      },
      intensity: {
        type: "number",
        minimum: MIN_METABLOOM_ACTION_INTENSITY,
        maximum: MAX_METABLOOM_ACTION_INTENSITY,
      },
      talking: { type: "boolean" },
    },
  },
  sequence: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MetabloomSequence",
    type: "object",
    additionalProperties: false,
    required: ["steps"],
    properties: {
      id: {
        type: "string",
        minLength: 1,
        maxLength: MAX_TOOL_SEQUENCE_ID_CHARS,
        pattern: "^[a-z][a-z0-9-]*$",
      },
      steps: {
        type: "array",
        minItems: 1,
        maxItems: MAX_METABLOOM_ACTION_STEPS,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["action"],
          properties: {
            action: { type: "string", enum: [...METABLOOM_ACTION_IDS] },
            duration: {
              type: "integer",
              minimum: MIN_METABLOOM_ACTION_DURATION_MS,
              maximum: MAX_METABLOOM_ACTION_DURATION_MS,
            },
            intensity: {
              type: "number",
              minimum: MIN_METABLOOM_ACTION_INTENSITY,
              maximum: MAX_METABLOOM_ACTION_INTENSITY,
            },
            talking: { type: "boolean" },
          },
        },
      },
    },
  },
  talk: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MetabloomTalk",
    type: "object",
    additionalProperties: false,
    required: ["active"],
    properties: { active: { type: "boolean" } },
  },
  pulse: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MetabloomPulse",
    type: "object",
    additionalProperties: false,
  },
  settle: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MetabloomSettle",
    type: "object",
    additionalProperties: false,
  },
  getState: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MetabloomGetState",
    type: "object",
    additionalProperties: false,
  },
});

let metabloomMountSequence = 0;

const createMetabloomMountId = () => {
  metabloomMountSequence += 1;
  const randomUUID =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : "";
  const uniquePart =
    randomUUID ||
    `${Date.now().toString(36)}-${metabloomMountSequence.toString(36)}`;
  return `metabloom-${uniquePart}`;
};

const INITIAL_MESSAGES = Object.freeze([]);

const SUGGESTED_PROMPTS = METABLOOM_DEMO_PROMPTS;

const isPlainObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasOnlyKeys = (value, allowedKeys) =>
  Object.keys(value).every((key) => allowedKeys.has(key));

const normalizeDuration = (value, fallback = DEFAULT_ACTION_RECORD.duration) => {
  const duration = Number(value);
  return Number.isFinite(duration)
    ? Math.max(
        MIN_METABLOOM_ACTION_DURATION_MS,
        Math.min(duration, MAX_METABLOOM_ACTION_DURATION_MS),
      )
    : fallback;
};

const normalizeIntensity = (
  value,
  fallback = DEFAULT_ACTION_RECORD.intensity,
) => {
  const intensity = Number(value);
  return Number.isFinite(intensity)
    ? Math.max(
        MIN_METABLOOM_ACTION_INTENSITY,
        Math.min(intensity, MAX_METABLOOM_ACTION_INTENSITY),
      )
    : fallback;
};

const normalizeSequenceSteps = (steps) => {
  if (!Array.isArray(steps)) return [];

  return steps
    .filter((step) => step && typeof step === "object" && !Array.isArray(step))
    .slice(0, MAX_METABLOOM_ACTION_STEPS)
    .map((step) => {
      const formAction = FORM_ACTIONS[step.form];
      const action = resolveMetabloomAction(
        step.action || step.expression || step.name || formAction,
      );
      return action
        ? {
            action: action.id,
            duration: normalizeDuration(step.duration, action.duration),
            intensity: normalizeIntensity(step.intensity, action.intensity),
            talking:
              typeof step.talking === "boolean"
                ? step.talking
                : action.id !== "reform",
          }
        : null;
    })
    .filter(Boolean);
};

const normalizeStrictToolStep = (step) => {
  if (!isPlainObject(step) || !hasOnlyKeys(step, TOOL_EXPRESSION_KEYS)) {
    return null;
  }
  if (typeof step.action !== "string") return null;
  const actionId = step.action.trim();
  if (!METABLOOM_ACTION_IDS.includes(actionId)) return null;
  const action = resolveMetabloomAction(actionId);
  const duration = step.duration === undefined ? action.duration : step.duration;
  const intensity = step.intensity === undefined
    ? action.intensity
    : step.intensity;
  if (
    !Number.isInteger(duration)
    || duration < MIN_METABLOOM_ACTION_DURATION_MS
    || duration > MAX_METABLOOM_ACTION_DURATION_MS
  ) {
    return null;
  }
  if (
    typeof intensity !== "number"
    || !Number.isFinite(intensity)
    || intensity < MIN_METABLOOM_ACTION_INTENSITY
    || intensity > MAX_METABLOOM_ACTION_INTENSITY
  ) {
    return null;
  }
  if (step.talking !== undefined && typeof step.talking !== "boolean") {
    return null;
  }
  return {
    action: action.id,
    duration,
    intensity,
    talking: step.talking === undefined ? action.id !== "reform" : step.talking,
  };
};

const normalizeToolSequence = (request) => {
  if (!isPlainObject(request) || !hasOnlyKeys(request, TOOL_SEQUENCE_KEYS)) {
    return null;
  }
  if (!Array.isArray(request.steps)) return null;
  if (
    request.steps.length < 1
    || request.steps.length > MAX_METABLOOM_ACTION_STEPS
  ) {
    return null;
  }
  const id = request.id === undefined ? "agent" : request.id;
  if (
    typeof id !== "string"
    || id.length < 1
    || id.length > MAX_TOOL_SEQUENCE_ID_CHARS
    || !TOOL_SEQUENCE_ID_PATTERN.test(id)
  ) {
    return null;
  }
  const steps = request.steps.map(normalizeStrictToolStep);
  if (steps.some((step) => !step)) return null;
  if (steps[steps.length - 1].action !== "reform") {
    if (steps.length >= MAX_METABLOOM_ACTION_STEPS) return null;
    steps.push({
      action: DEFAULT_ACTION_RECORD.id,
      duration: DEFAULT_ACTION_RECORD.duration,
      intensity: DEFAULT_ACTION_RECORD.intensity,
      talking: false,
    });
  }
  const totalDuration = steps.reduce((sum, step) => sum + step.duration, 0);
  if (totalDuration > MAX_METABLOOM_CHAIN_DURATION_MS) return null;
  return { id, steps };
};

const normalizeEmptyToolRequest = (request = {}) =>
  isPlainObject(request) && hasOnlyKeys(request, EMPTY_TOOL_KEYS);

const cloneSchema = (schema) => JSON.parse(JSON.stringify(schema));

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

const clearOwnedGlobal = (name, value) => {
  if (window[name] === value) window[name] = null;
};

const cloneActionChain = (actionChain = []) =>
  actionChain.map(({ action, duration, intensity, talking }) => ({
    action,
    duration,
    intensity,
    talking,
  }));

const cloneMessage = ({ id, role, content, actionChain = [], source, emote, segments = [], status, sources, researchDetails, researchBrief }) => {
  let researchSources = parseMetabloomResearchSources(sources);
  const researchReport = role === "assistant" ? parseMetabloomResearchReport(researchDetails) : null;
  if (researchReport && researchSources?.some((source) => {
    const original = researchReport.sources[source.id - 1];
    return !original || original.url !== source.url || original.title !== source.title;
  })) researchSources = null;
  const brief = researchReport ? parseMetabloomResearchBrief(researchBrief, { sources: researchReport.sources }) : null;
  return {
    id,
    emote,
    segments: segments.map((segment) => ({ ...segment })),
    status,
    role,
    content,
    actionChain: cloneActionChain(actionChain),
    source,
    ...(researchSources ? { sources: researchSources } : {}),
    ...(researchReport ? { researchDetails: researchReport } : {}),
    ...(brief ? { researchBrief: brief } : {}),
  };
};

// Render a small, non-executable subset of report formatting. Links still come
// exclusively from the canonical citation map, never Markdown or model HTML.
const renderMetabloomResearchBlocks = (report) => report.notes.split(/\n[ \t]*\n/).map((block, index) => {
  const lines = block.trim().split("\n");
  const heading = lines[0]?.match(/^#{1,6}\s+(.+)$/);
  if (heading) return <React.Fragment key={index}>
    <h4>{renderMetabloomResearchText(heading[1], report.sources)}</h4>
    {lines.length > 1 && <p>{renderMetabloomResearchText(lines.slice(1).join("\n"), report.sources)}</p>}
  </React.Fragment>;
  if (lines.every((line) => /^[-*]\s+/.test(line))) return <ul key={index}>
    {lines.map((line, lineIndex) => <li key={lineIndex}>{renderMetabloomResearchText(line.replace(/^[-*]\s+/, ""), report.sources)}</li>)}
  </ul>;
  if (lines.every((line) => /^\d+[.)]\s+/.test(line))) return <ol key={index}>
    {lines.map((line, lineIndex) => <li key={lineIndex} value={Number(line.match(/^\d+/)[0])}>{renderMetabloomResearchText(line.replace(/^\d+[.)]\s+/, ""), report.sources)}</li>)}
  </ol>;
  return <p key={index}>{renderMetabloomResearchText(block, report.sources)}</p>;
});

const renderMetabloomResearchText = (text, sources) => {
  if (!sources?.length) return text;
  return text.split(/(\[[1-9]\d*\])/g).map((part, index) => {
    const source = /^\[[1-9]\d*\]$/.test(part) ? sources[Number(part.slice(1, -1)) - 1] : null;
    return source ? (
      <a key={index} className="metabloom-chat__citation" href={source.url} target="_blank" rel="noopener noreferrer"
        aria-label={`Source ${source.id}: ${source.title}`}>{part}</a>
    ) : part;
  });
};

const MetabloomFullResearch = ({ report }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [sourcesExpanded, setSourcesExpanded] = React.useState(false);
  const [visibleSources, setVisibleSources] = React.useState(20);
  return (
    <details className="metabloom-chat__full-research" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>Full research</summary>
      {expanded && (
        <div className="metabloom-chat__research-report" role="group" aria-label="Completed research">
          <div className="metabloom-chat__research-report-text">{renderMetabloomResearchBlocks(report)}</div>
          <details className="metabloom-chat__sources" onToggle={(event) => setSourcesExpanded(event.currentTarget.open)}>
            <summary>Research sources ({report.sources.length})</summary>
            {sourcesExpanded && (
              <>
                <ol>
                  {report.sources.slice(0, visibleSources).map((source) => (
                    <li key={source.id}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
                      <span className="metabloom-chat__source-domain">{new URL(source.url).hostname}</span>
                    </li>
                  ))}
                </ol>
                {visibleSources < report.sources.length && (
                  <button type="button" className="metabloom-chat__more-sources" onClick={() => setVisibleSources((count) => count + 20)}>
                    Show {Math.min(20, report.sources.length - visibleSources)} more sources
                  </button>
                )}
              </>
            )}
          </details>
        </div>
      )}
    </details>
  );
};

const extractCorrelatedResponse = (detail) => {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return null;
  }

  const requestId =
    typeof detail.requestId === "string" ? detail.requestId.trim() : "";
  if (!requestId) return null;

  if (Object.prototype.hasOwnProperty.call(detail, "payload")) {
    return { requestId, payload: detail.payload };
  }

  if (
    Object.prototype.hasOwnProperty.call(detail, "response") &&
    Object.prototype.hasOwnProperty.call(detail, "actionChain")
  ) {
    return {
      requestId,
      payload: {
        response: detail.response,
        actionChain: detail.actionChain,
      },
    };
  }

  return null;
};

const OrbSection = ({
  isActive = true,
  onConversationStateChange,
  onReady,
}) => {
  const { isDark } = useThemeMode();
  const navigation = useAppNavigation();
  const [savedConversation] = React.useState(() => navigation?.getToolState('orb'));
  const initialMessages = React.useMemo(
    () => INITIAL_MESSAGES.map((message) => ({ ...message, actionChain: [] })),
    [],
  );
  const sequenceTimerRef = React.useRef(0);
  const sequenceTokenRef = React.useRef(0);
  const mountIdRef = React.useRef("");
  if (!mountIdRef.current) mountIdRef.current = createMetabloomMountId();
  const previewTimerRef = React.useRef(0);
  const requestTokenRef = React.useRef(0);
  const activeRequestRef = React.useRef(null);
  const requestAbortRef = React.useRef(null);
  const replyRef = React.useRef(null);
  const replyDisplayRef = React.useRef(null);
  const messageCounterRef = React.useRef(savedConversation?.counter || 0);
  const mountedRef = React.useRef(true);
  const sectionRef = React.useRef(null);
  const transcriptRef = React.useRef(null);
  const composerRef = React.useRef(null);
  const composerAreaRef = React.useRef(null);
  const followLatestRef = React.useRef(true);
  const surfacedBriefScrollRef = React.useRef(null);
  const reactionPlayerRef = React.useRef(null);
  const thinkingTimerRef = React.useRef(0);
  const activityPreviewTimerRef = React.useRef(0);
  const activityReturnTimerRef = React.useRef(0);
  const underHoodTimerRef = React.useRef(0);
  const requestSceneRef = React.useRef(null);
  const requestSceneTimerRef = React.useRef(0);
  const [requestScene, setRequestScene] = React.useState(null);
  const [underHoodPhase, setUnderHoodPhase] = React.useState(null);
  const [activityId, setActivityId] = React.useState("idle");
  const [activityPreview, setActivityPreview] = React.useState(false);
  const [researchPhase, setResearchPhase] = React.useState(null);
  const [researchProgress, setResearchProgress] = React.useState(null);
  const [researchSummary, setResearchSummary] = React.useState(null);
  const [readingEarlier, setReadingEarlier] = React.useState(false);
  const [composerFocused, setComposerFocused] = React.useState(false);
  const [activeReaction, setActiveReaction] = React.useState(null);
  const [expressiveness, setExpressiveness] = React.useState(savedConversation?.expressiveness ?? 0.8);
  const expressivenessRef = React.useRef(expressiveness);
  expressivenessRef.current = expressiveness;
  const stateRef = React.useRef(null);
  const [emoteId, setEmoteId] = React.useState("neutral");
  const [allowEmoteChanges, setAllowEmoteChanges] = React.useState(savedConversation?.allowEmoteChanges || false);
  const [deepResearch, setDeepResearch] = React.useState(savedConversation?.deepResearch === true);
  const [actionId, setActionId] = React.useState(DEFAULT_ACTION);
  const [actionDuration, setActionDuration] = React.useState(
    DEFAULT_ACTION_RECORD.duration,
  );
  const [actionIntensity, setActionIntensity] = React.useState(
    DEFAULT_ACTION_RECORD.intensity,
  );
  const [actionVersion, setActionVersion] = React.useState(0);
  const [talking, setTalking] = React.useState(false);
  const [paused, setPaused] = React.useState(savedConversation?.paused || false);
  const [pulseVersion, setPulseVersion] = React.useState(0);
  const [resetVersion, setResetVersion] = React.useState(0);
  const [sequenceId, setSequenceId] = React.useState(null);
  const [fieldState, setFieldState] = React.useState("forming");
  const [messages, setMessages] = React.useState(() => (savedConversation?.messages || initialMessages).map(cloneMessage));
  const messagesRef = React.useRef(messages);
  const [draft, setDraft] = React.useState(savedConversation?.draft || '');
  const [pending, setPending] = React.useState(false);
  const [toolPending, setToolPending] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState(savedConversation?.interrupted ? 'The response was interrupted when you changed tools. Any visible reply is incomplete. Send another message to continue.' : '');
  const [responseSource, setResponseSource] = React.useState(savedConversation?.responseSource || 'interface');
  const retainedConversation = React.useRef(null);
  retainedConversation.current = { draft, expressiveness, pending, responseSource, paused, allowEmoteChanges, deepResearch };
  const saveToolState = navigation?.saveToolState;
  React.useEffect(() => () => {
    const snapshot = retainedConversation.current;
    saveToolState?.('orb', { ...snapshot, interrupted: snapshot.pending, counter: messageCounterRef.current,
      messages: messagesRef.current.map(message => message.status === 'streaming' ? { ...message, status: 'interrupted' } : message) });
  }, [saveToolState]);
  const activeAction =
    resolveMetabloomAction(actionId) || getDefaultMetabloomAction();
  const legacyForm = ACTION_FORMS[activeAction.id] || "companion";
  const conversationStarted = messages.length > 0 || pending;
  // A reply owns its presentation separately from confirmed worker activity and
  // timed previews. Text and ordinary emotes can update without dismissing it.
  const visibleTheme = requestScene ? requestScene.theme : METABLOOM_ACTIVITIES[activityId].theme;
  const visibleResearchPhase = requestScene ? requestScene.researchPhase : researchPhase;
  const visibleUnderHoodPhase = requestScene ? requestScene.underHoodPhase : underHoodPhase;
  const visibleActivityPreview = !requestScene && activityPreview;
  const sceneAction = requestScene?.sceneAction || "none";
  const scenePhase = requestScene?.scenePhase || null;

  messagesRef.current = messages;
  stateRef.current = {
    underHoodPhase,
    activity: activityId,
    researchPhase,
    researchProgress,
    researchSummary,
    sceneAction,
    scenePhase,
    theme: METABLOOM_ACTIVITIES[activityId].theme,
    action: activeAction.id,
    emote: emoteId,
    protocolVersion: METABLOOM_PROTOCOL_VERSION,
    actionDuration,
    actionIntensity,
    actionVersion,
    colorway: activeAction.colorway,
    conversationStarted,
    expression: activeAction.id,
    fieldState,
    form: legacyForm,
    messageCount: messages.length,
    motion: activeAction.motion,
    paused,
    pending,
    pulseVersion,
    responseSource,
    sequenceId,
    talking,
  };

  const updateStateSnapshot = React.useCallback((updates) => {
    stateRef.current = {
      ...(stateRef.current || {}),
      ...updates,
    };
    return stateRef.current;
  }, []);

  const publishMessages = React.useCallback((nextMessages) => {
    messagesRef.current = nextMessages;
    updateStateSnapshot({ conversationStarted: nextMessages.length > 0, messageCount: nextMessages.length });
    if (mountedRef.current) setMessages(nextMessages);
  }, [updateStateSnapshot]);

  const cancelRequestScene = React.useCallback(() => {
    window.clearTimeout(requestSceneTimerRef.current);
    requestSceneTimerRef.current = 0;
    requestSceneRef.current = null;
    updateStateSnapshot({ sceneAction: "none", scenePhase: null });
    if (mountedRef.current) setRequestScene(null);
  }, [updateStateSnapshot]);

  const updateRequestScene = React.useCallback((owner, updates) => {
    if (requestSceneRef.current !== owner || !mountedRef.current || document.hidden) return false;
    owner.presentation = { ...owner.presentation, ...updates };
    updateStateSnapshot({ sceneAction: owner.presentation.sceneAction, scenePhase: owner.presentation.scenePhase });
    setRequestScene(owner.presentation);
    return true;
  }, [updateStateSnapshot]);

  const waitForRequestScenePaint = React.useCallback((owner, callback) => {
    if (requestSceneRef.current !== owner) return;
    if (stateRef.current?.fieldState !== "crossfading") { callback(); return; }
    owner.onFieldSettled = () => {
      if (requestSceneRef.current !== owner) return;
      window.clearTimeout(requestSceneTimerRef.current);
      requestSceneTimerRef.current = 0;
      owner.onFieldSettled = null;
      callback();
    };
    // Renderer confirmation avoids releasing text just before its last blend
    // frame. A lost/static renderer still has a bounded path through the scene.
    requestSceneTimerRef.current = window.setTimeout(owner.onFieldSettled, METABLOOM_SCENE_TRANSITION_SECONDS * 1000);
  }, []);

  const cancelUnderHood = React.useCallback(() => {
    window.clearTimeout(underHoodTimerRef.current);
    underHoodTimerRef.current = 0;
    updateStateSnapshot({ underHoodPhase: null });
    if (mountedRef.current) setUnderHoodPhase(null);
  }, [updateStateSnapshot]);

  const setActivity = React.useCallback((id, preview = false) => {
    cancelUnderHood();
    window.clearTimeout(activityPreviewTimerRef.current);
    activityPreviewTimerRef.current = 0;
    window.clearTimeout(activityReturnTimerRef.current);
    activityReturnTimerRef.current = 0;
    const phase = id === "deep-research" ? "diving" : null;
    updateStateSnapshot({ activity: id, theme: METABLOOM_ACTIVITIES[id].theme, researchPhase: phase });
    if (mountedRef.current) {
      setActivityId(id);
      setActivityPreview(preview);
      setResearchPhase(phase);
    }
  }, [cancelUnderHood, updateStateSnapshot]);

  const completeActivity = React.useCallback(() => {
    if (stateRef.current?.researchPhase === "surfacing") return;
    if (stateRef.current?.activity !== "deep-research" || document.hidden) {
      setActivity("idle");
      return;
    }
    window.clearTimeout(activityPreviewTimerRef.current);
    activityPreviewTimerRef.current = 0;
    updateStateSnapshot({ researchPhase: "surfacing" });
    setResearchPhase("surfacing");
    // Give the exit cue a readable lead, then retain it through the scene blend.
    // Response text and its reactions never wait for this presentation timer.
    activityReturnTimerRef.current = window.setTimeout(() => {
      updateStateSnapshot({ activity: "idle", theme: METABLOOM_ACTIVITIES.idle.theme });
      setActivityId("idle");
      if (document.hidden || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        setActivity("idle");
      } else {
        activityReturnTimerRef.current = window.setTimeout(() => setActivity("idle"), METABLOOM_SCENE_TRANSITION_SECONDS * 1000);
      }
    }, RESEARCH_SURFACING_LEAD_MS);
  }, [setActivity, updateStateSnapshot]);

  const completeRequestScene = React.useCallback((session) => {
    const owner = requestSceneRef.current;
    if (!owner || owner.session !== session || owner.complete) return false;
    if (owner.action === "deep-research") {
      owner.returnRequested = true;
      // Early content waits for both the think lead and the entry blend. Its
      // arrival requests the return; network completion is independent of it.
      if (!owner.entryReady) return true;
    }
    owner.complete = true;
    window.clearTimeout(requestSceneTimerRef.current);
    requestSceneTimerRef.current = 0;
    // The hood keeps its existing quick-reply behavior. Research completes its
    // whole entry/return sequence before releasing its queued presentation.
    if (document.hidden || owner.presentation.scenePhase === "think") {
      cancelRequestScene();
      return true;
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const finish = () => {
      if (requestSceneRef.current !== owner) return;
      if (owner.action === "deep-research") setActivity("idle");
      cancelRequestScene();
      const display = replyDisplayRef.current;
      if (owner.action === "deep-research" && display?.session === session) display.gate.release();
    };
    if (owner.action === "deep-research") {
      updateRequestScene(owner, { scenePhase: METABLOOM_SCENE_ACTIONS[owner.action].complete, researchPhase: "surfacing" });
      requestSceneTimerRef.current = window.setTimeout(() => {
        if (!updateRequestScene(owner, { theme: "metabloom" })) return;
        if (reduced) finish();
        else requestSceneTimerRef.current = window.setTimeout(() => waitForRequestScenePaint(owner, finish), METABLOOM_SCENE_TRANSITION_SECONDS * 1000);
      }, RESEARCH_SURFACING_LEAD_MS);
    } else {
      updateRequestScene(owner, { scenePhase: METABLOOM_SCENE_ACTIONS[owner.action].complete, underHoodPhase: "closing" });
      requestSceneTimerRef.current = window.setTimeout(finish,
        reduced ? RESEARCH_SURFACING_LEAD_MS : METABLOOM_HOOD_SEQUENCE[2].duration);
    }
    return true;
  }, [cancelRequestScene, setActivity, updateRequestScene, waitForRequestScenePaint]);

  const cancelResponse = React.useCallback((reason = "interrupted") => {
    cancelRequestScene();
    setActivity("idle");
    window.clearTimeout(thinkingTimerRef.current);
    thinkingTimerRef.current = 0;
    reactionPlayerRef.current?.cancel();
    if (mountedRef.current) setActiveReaction(null);
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    requestTokenRef.current += 1;
    activeRequestRef.current = null;
    window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = 0;
    replyRef.current?.interrupt(reason);
    replyDisplayRef.current?.gate.cancel(reason);
    replyDisplayRef.current = null;
    replyRef.current = null;
    updateStateSnapshot({ researchProgress: null, researchSummary: null });
    if (mountedRef.current) {
      setToolPending(false);
      setResearchProgress(null);
      setResearchSummary(null);
    }
  }, [cancelRequestScene, setActivity, updateStateSnapshot]);

  const cancelSequenceTimer = React.useCallback(() => {
    sequenceTokenRef.current += 1;
    window.clearTimeout(sequenceTimerRef.current);
    sequenceTimerRef.current = 0;
  }, []);

  const clearSequence = React.useCallback(() => {
    cancelSequenceTimer();
    updateStateSnapshot({ sequenceId: null });
    setSequenceId(null);
  }, [cancelSequenceTimer, updateStateSnapshot]);

  const pulse = React.useCallback(() => {
    const nextPulseVersion = (stateRef.current?.pulseVersion ?? 0) + 1;
    updateStateSnapshot({ pulseVersion: nextPulseVersion });
    setPulseVersion(nextPulseVersion);
  }, [updateStateSnapshot]);

  const performAction = React.useCallback(
    (nextAction, options = {}) => {
      const request = isPlainObject(nextAction)
        ? nextAction
        : { ...options, action: nextAction };
      const resolved = resolveMetabloomAction(request.action);
      if (!resolved) return false;
      if (!options.preserveReaction) {
        reactionPlayerRef.current?.cancel();
        setActiveReaction(null);
      }

      cancelUnderHood();
      const duration = normalizeDuration(request.duration, resolved.duration);
      const intensity = normalizeIntensity(
        request.intensity,
        resolved.intensity,
      );
      const nextTalking =
        typeof request.talking === "boolean" ? request.talking : false;
      clearSequence();
      const nextActionVersion = (stateRef.current?.actionVersion ?? 0) + 1;
      const nextPulseVersion = (stateRef.current?.pulseVersion ?? 0) + (options.pulse === false ? 0 : 1);
      updateStateSnapshot({
        action: resolved.id,
        actionDuration: duration,
        actionIntensity: intensity,
        actionVersion: nextActionVersion,
        colorway: resolved.colorway,
        expression: resolved.id,
        form: ACTION_FORMS[resolved.id] || "companion",
        motion: resolved.motion,
        paused: false,
        pulseVersion: nextPulseVersion,
        sequenceId: null,
        talking: nextTalking,
      });
      setActionId(resolved.id);
      setActionDuration(duration);
      setActionIntensity(intensity);
      setActionVersion(nextActionVersion);
      setTalking(nextTalking);
      setPaused(false);
      setPulseVersion(nextPulseVersion);
      return true;
    },
    [cancelUnderHood, clearSequence, updateStateSnapshot],
  );

  const performEmote = React.useCallback((nextEmote, preserveReaction = false) => {
    const emote = resolveMetabloomEmote(nextEmote);
    if (!emote) return false;
    updateStateSnapshot({ emote: emote.id });
    setEmoteId(emote.id);
    return performAction({ action: emote.action || "reform", duration: emote.duration, intensity: Math.min(1, emote.intensity * (expressivenessRef.current / 0.8)), talking: false }, { pulse: false, preserveReaction });
  }, [performAction, updateStateSnapshot]);

  const beginRequestScene = React.useCallback((action, session) => {
    if (document.hidden || !mountedRef.current) return false;
    cancelRequestScene();
    window.clearTimeout(thinkingTimerRef.current);
    thinkingTimerRef.current = 0;
    if (action === "deep-research" && replyDisplayRef.current?.session === session) replyDisplayRef.current.gate.hold();
    const owner = { action, session, complete: false, presentation: {
      sceneAction: action, scenePhase: METABLOOM_SCENE_ACTIONS[action].start[0],
      theme: "metabloom", researchPhase: null, underHoodPhase: null,
    } };
    requestSceneRef.current = owner;
    updateRequestScene(owner, {});
    performAction({ action: "thinking", duration: SCENE_THINK_LEAD_MS, intensity: 0.3 * expressivenessRef.current / 0.8, talking: false },
      { pulse: false, preserveReaction: true });
    const enter = () => {
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!updateRequestScene(owner, {
        scenePhase: METABLOOM_SCENE_ACTIONS[action].start[1],
        theme: action === "deep-research" ? "tidal-weave" : "metabloom",
        researchPhase: action === "deep-research" ? "diving" : null,
        underHoodPhase: action === "under-the-hood" ? (reduced ? "open" : "seam") : null,
      })) return;
      if (action === "under-the-hood" && !reduced) {
        requestSceneTimerRef.current = window.setTimeout(() => {
          if (updateRequestScene(owner, { underHoodPhase: "open" })) requestSceneTimerRef.current = 0;
        }, METABLOOM_HOOD_SEQUENCE[0].duration);
      } else if (action === "deep-research" && !reduced) {
        requestSceneTimerRef.current = window.setTimeout(() => waitForRequestScenePaint(owner, () => {
          owner.entryReady = true;
          requestSceneTimerRef.current = 0;
          if (owner.returnRequested) completeRequestScene(session);
        }), METABLOOM_SCENE_TRANSITION_SECONDS * 1000);
      } else {
        requestSceneTimerRef.current = 0;
        owner.entryReady = true;
      }
    };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) enter();
    else requestSceneTimerRef.current = window.setTimeout(enter, SCENE_THINK_LEAD_MS);
    return true;
  }, [cancelRequestScene, completeRequestScene, performAction, updateRequestScene, waitForRequestScenePaint]);

  const reactionPlayer = React.useMemo(() => createMetabloomReactionPlayer({
    onPlay: (emote, messageId, index) => {
      if (!mountedRef.current) return;
      performEmote(emote, true);
      setActiveReaction({ emote, messageId, index });
    },
    onIdle: () => { if (mountedRef.current) setActiveReaction(null); },
  }), [performEmote]);
  reactionPlayerRef.current = reactionPlayer;

  const attendToComposer = React.useCallback(() => {
    setComposerFocused(true);
    if (!isActive || stateRef.current?.pending || stateRef.current?.sequenceId || activeReaction) return;
    performAction({ action: "listening", intensity: 0.32 * expressivenessRef.current / 0.8, talking: false }, { pulse: false });
  }, [activeReaction, isActive, performAction]);

  const transform = React.useCallback(
    (nextForm) => {
      const mappedAction = FORM_ACTIONS[nextForm];
      return mappedAction ? performAction(mappedAction) : false;
    },
    [performAction],
  );

  const stop = React.useCallback(() => {
    cancelResponse();
    clearSequence();
    updateStateSnapshot({ talking: false, pending: false });
    setTalking(false);
    setPending(false);
  }, [cancelResponse, clearSequence, updateStateSnapshot]);

  const reset = React.useCallback(() => {
    cancelResponse();
    setEmoteId("neutral");
    clearSequence();
    requestTokenRef.current += 1;
    activeRequestRef.current = null;
    window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = 0;
    const nextActionVersion = (stateRef.current?.actionVersion ?? 0) + 1;
    const nextPulseVersion = (stateRef.current?.pulseVersion ?? 0) + 1;
    updateStateSnapshot({
      action: DEFAULT_ACTION,
      actionDuration: DEFAULT_ACTION_RECORD.duration,
      actionIntensity: 0,
      emote: "neutral",
      actionVersion: nextActionVersion,
      colorway: DEFAULT_ACTION_RECORD.colorway,
      expression: DEFAULT_ACTION,
      form: ACTION_FORMS[DEFAULT_ACTION] || "companion",
      motion: DEFAULT_ACTION_RECORD.motion,
      paused: false,
      pending: false,
      pulseVersion: nextPulseVersion,
      sequenceId: null,
      talking: false,
    });
    setActionId(DEFAULT_ACTION);
    setActionDuration(DEFAULT_ACTION_RECORD.duration);
    setActionIntensity(0);
    setActionVersion(nextActionVersion);
    setTalking(false);
    setPaused(false);
    setPending(false);
    setErrorMessage("");
    setResetVersion((value) => value + 1);
    setPulseVersion(nextPulseVersion);
  }, [cancelResponse, clearSequence, updateStateSnapshot]);

  const playSequence = React.useCallback(
    (steps, nextSequenceId = "custom") => {
      const normalizedSteps = normalizeSequenceSteps(steps);
      clearSequence();
      if (normalizedSteps.length === 0) return false;
      cancelUnderHood();
      reactionPlayerRef.current?.cancel();
      setActiveReaction(null);

      const token = sequenceTokenRef.current;
      let index = 0;
      updateStateSnapshot({
        paused: false,
        sequenceId: nextSequenceId,
      });
      setSequenceId(nextSequenceId);
      setPaused(false);

      const advance = () => {
        if (sequenceTokenRef.current !== token) return;
        const step = normalizedSteps[index];
        if (!step) {
          updateStateSnapshot({
            sequenceId: null,
            talking: false,
          });
          setTalking(false);
          setSequenceId(null);
          sequenceTimerRef.current = 0;
          return;
        }

        const action =
          resolveMetabloomAction(step.action) || DEFAULT_ACTION_RECORD;
        const nextActionVersion =
          (stateRef.current?.actionVersion ?? 0) + 1;
        const nextPulseVersion =
          (stateRef.current?.pulseVersion ?? 0) + 1;
        updateStateSnapshot({
          action: action.id,
          actionDuration: step.duration,
          actionIntensity: step.intensity,
          actionVersion: nextActionVersion,
          colorway: action.colorway,
          expression: action.id,
          form: ACTION_FORMS[action.id] || "companion",
          motion: action.motion,
          paused: false,
          pulseVersion: nextPulseVersion,
          sequenceId: nextSequenceId,
          talking: step.talking,
        });
        setActionId(action.id);
        setActionDuration(step.duration);
        setActionIntensity(step.intensity);
        setActionVersion(nextActionVersion);
        setTalking(step.talking);
        setPulseVersion(nextPulseVersion);
        index += 1;
        sequenceTimerRef.current = window.setTimeout(advance, step.duration);
      };

      advance();
      return true;
    },
    [cancelUnderHood, clearSequence, updateStateSnapshot],
  );

  const playExternalSequence = React.useCallback(
    (steps) => playSequence(steps, "custom"),
    [playSequence],
  );

  const startTalking = React.useCallback(() => {
    updateStateSnapshot({ talking: true });
    setTalking(true);
  }, [updateStateSnapshot]);

  const stopTalking = React.useCallback(() => {
    updateStateSnapshot({ talking: false });
    setTalking(false);
  }, [updateStateSnapshot]);

  const reactToUser = React.useCallback(
    (request) => {
      if (!request || typeof request !== "object" || Array.isArray(request)) {
        return false;
      }

      const formAction = FORM_ACTIONS[request.form];
      const requestedAction =
        resolveMetabloomAction(request.action) ||
        resolveMetabloomAction(request.expression) ||
        resolveMetabloomAction(formAction);
      const requestedTalking =
        typeof request.talking === "boolean" ? request.talking : null;
      const requestedPaused =
        typeof request.paused === "boolean" ? request.paused : null;
      const requestedPulse = request.pulse === true;

      if (
        !requestedAction &&
        requestedTalking === null &&
        requestedPaused === null &&
        !requestedPulse
      ) {
        return false;
      }

      cancelUnderHood();
      reactionPlayerRef.current?.cancel();
      setActiveReaction(null);
      clearSequence();
      const snapshotUpdates = { sequenceId: null };
      if (requestedAction) {
        const duration = normalizeDuration(
          request.duration,
          requestedAction.duration,
        );
        const intensity = normalizeIntensity(
          request.intensity,
          requestedAction.intensity,
        );
        const nextActionVersion =
          (stateRef.current?.actionVersion ?? 0) + 1;
        const nextPulseVersion =
          (stateRef.current?.pulseVersion ?? 0) + 1;
        Object.assign(snapshotUpdates, {
          action: requestedAction.id,
          actionDuration: duration,
          actionIntensity: intensity,
          actionVersion: nextActionVersion,
          colorway: requestedAction.colorway,
          expression: requestedAction.id,
          form: ACTION_FORMS[requestedAction.id] || "companion",
          motion: requestedAction.motion,
          pulseVersion: nextPulseVersion,
        });
        setActionId(requestedAction.id);
        setActionDuration(duration);
        setActionIntensity(intensity);
        setActionVersion(nextActionVersion);
        setPulseVersion(nextPulseVersion);
      }
      if (requestedTalking !== null) {
        snapshotUpdates.talking = requestedTalking;
        setTalking(requestedTalking);
      }
      if (requestedPaused !== null) {
        snapshotUpdates.paused = requestedPaused;
        setPaused(requestedPaused);
      }
      updateStateSnapshot(snapshotUpdates);
      if (requestedPulse && !requestedAction) pulse();
      return true;
    },
    [cancelUnderHood, clearSequence, pulse, updateStateSnapshot],
  );

  const appendMessage = React.useCallback(
    (role, content, actionChain = [], source = "interface", emote = null, segments = [], status = "complete", sources = null, researchDetails = null, researchBrief = null) => {
      const message = {
        id: `${role}-${++messageCounterRef.current}`, role, content, emote,
        actionChain: cloneActionChain(actionChain), source, segments, status,
        ...(sources ? { sources: sources.map((item) => ({ ...item })) } : {}),
        ...(researchDetails ? { researchDetails } : {}),
        ...(researchBrief ? { researchBrief } : {}),
      };
      publishMessages([...messagesRef.current.slice(-(MAX_CHAT_MESSAGES - 1)), message]);
      return message;
    },
    [publishMessages],
  );

  const finishReplyPresentation = React.useCallback((session) => {
    if (replyRef.current !== session || !mountedRef.current) return;
    activeRequestRef.current = null;
    requestAbortRef.current = null;
    requestTokenRef.current += 1;
    updateStateSnapshot({ pending: false, researchProgress: null, researchSummary: null });
    setPending(false);
    setToolPending(false);
    setResearchProgress(null);
    setResearchSummary(null);
  }, [updateStateSnapshot]);

  const failReply = React.useCallback((session, error) => {
    if (replyRef.current !== session || session.closed) return false;
    const code = typeof error?.code === "string" && Object.prototype.hasOwnProperty.call(METABLOOM_REQUEST_ERROR_MESSAGES, error.code)
      ? error.code : "stream_interrupted";
    const requestRef = parseMetabloomRequestRef(error?.requestRef);
    const status = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? error.status : null;
    const hasVisibleReply = messagesRef.current.some((message) => message.role === "assistant" && message.status === "streaming");
    // Never expose an adapter/provider message or request content in diagnostics.
    console.error("[Metabloom] Request failed", { code, requestRef, status });
    if (session.snapshot().researchDetails) {
      // A completed research pass remains useful even if its short writer fails.
      // Close the request while its existing scene safely returns this report.
      requestAbortRef.current?.abort();
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = 0;
      window.clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = 0;
      reactionPlayerRef.current?.cancel();
      setActiveReaction(null);
      updateStateSnapshot({ responseSource: "error" });
      setResponseSource("error");
      setErrorMessage(`${getMetabloomApiErrorMessage(code)}${hasVisibleReply ? " Any visible short answer is incomplete." : ""} The completed research is retained. Code: ${code}.${requestRef ? ` Reference: ${requestRef}.` : ""}`);
      session.finishResearch();
      const display = replyDisplayRef.current;
      if (display?.session === session) display.gate.complete(() => finishReplyPresentation(session));
      else finishReplyPresentation(session);
      return false;
    }
    cancelResponse("error");
    setToolPending(false);
    updateStateSnapshot({ pending: false, responseSource: "error" });
    setPending(false);
    setResponseSource("error");
    setErrorMessage(`${getMetabloomApiErrorMessage(code)}${hasVisibleReply ? " Any visible reply is incomplete." : ""} Code: ${code}.${requestRef ? ` Reference: ${requestRef}.` : ""}`);
    return false;
  }, [cancelResponse, finishReplyPresentation, updateStateSnapshot]);

  const beginReply = React.useCallback((source, allowMultiple = false) => {
    cancelResponse();
    clearSequence();
    let messageId = null;
    let gate;
    let deliveryKind = null;
    const publishSnapshot = (snapshot) => {
      if (!mountedRef.current) return;
      const replySource = replyRef.current === session ? stateRef.current.responseSource : source;
      if (!messageId) {
        completeActivity();
        window.clearTimeout(thinkingTimerRef.current);
        thinkingTimerRef.current = 0;
        messageId = appendMessage("assistant", snapshot.content, [], replySource, snapshot.emote, snapshot.segments, snapshot.status, snapshot.sources, snapshot.researchDetails, snapshot.researchBrief).id;
      } else {
        publishMessages(messagesRef.current.map((message) => message.id === messageId ? { ...message, ...snapshot, source: replySource } : message));
      }
    };
    const validationSession = createMetabloomReplySession({
      allowMultiple,
      onEmote: (emote) => {
        const index = session.snapshot().segments.length - 1;
        gate.deferReaction(`segment-${index}`, () => {
          completeActivity();
          window.clearTimeout(thinkingTimerRef.current);
          thinkingTimerRef.current = 0;
          reactionPlayer.enqueue(emote, messageId, index,
            document.hidden || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
        });
      },
      onUpdate: (snapshot) => {
        if (!mountedRef.current) return;
        const request = activeRequestRef.current;
        // Custom adapters may return only a completed envelope. An explicit
        // selection still owns its scene and display before that payload appears.
        if (!gate.enabled && !gate.hasContent && request?.session === session && request.actionMode === "deep-research" && !request.skipScene) {
          request.actionReceived = true;
          beginRequestScene("deep-research", session);
        }
        gate.update(snapshot, { incremental: deliveryKind === "delta", researchFailure: deliveryKind === "research-failure" });
      },
    });
    const deliver = (kind, callback) => {
      deliveryKind = kind;
      try { return callback(); } finally { deliveryKind = null; }
    };
    const session = Object.freeze({
      attachResearchDetails: validationSession.attachResearchDetails,
      attachResearchBrief: validationSession.attachResearchBrief,
      attachSources: validationSession.attachSources,
      appendText: (delta, index) => deliver("delta", () => validationSession.appendText(delta, index)),
      append: (segment, index) => deliver("segment", () => validationSession.append(segment, index)),
      finish: (payload) => deliver("finish", () => validationSession.finish(payload)),
      finishResearch: () => deliver("research-failure", () => validationSession.finishResearch()),
      interrupt: (reason) => deliver("interrupt", () => validationSession.interrupt(reason)),
      snapshot: validationSession.snapshot,
      get closed() { return validationSession.closed; },
    });
    gate = createMetabloomResearchDisplayGate({
      onUpdate: publishSnapshot,
      onFirstContent: () => completeRequestScene(session),
    });
    replyDisplayRef.current = { session, gate };
    replyRef.current = session;
    updateStateSnapshot({ pending: true, responseSource: source });
    setPending(true);
    setResponseSource(source);
    setErrorMessage("");
    // Fast replies go straight into their own gesture without a distracting flash.
    thinkingTimerRef.current = window.setTimeout(() => {
      if (replyRef.current === session && !session.closed && !session.snapshot().segments.length && stateRef.current?.activity === "idle") {
        performAction({ action: "thinking", intensity: 0.3 * expressivenessRef.current / 0.8, talking: false }, { pulse: false });
      }
    }, 650);
    previewTimerRef.current = window.setTimeout(() => failReply(session, { code: "answer_timeout" }), RESPONSE_TIMEOUT_MS);
    return session;
  }, [appendMessage, beginRequestScene, cancelResponse, clearSequence, completeActivity, completeRequestScene, failReply, performAction, reactionPlayer, publishMessages, updateStateSnapshot]);

  const finishReply = React.useCallback((session, payload) => {
    if (replyRef.current !== session || session.closed) return false;
    try {
      session.finish(payload);
      const display = replyDisplayRef.current;
      if (!display?.gate.enabled) completeRequestScene(session);
      completeActivity();
      // The network has validated. Its deadline must not cancel presentation
      // still draining after a slow response; no network budget is extended.
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = 0;
      if (display?.session === session) display.gate.complete(() => finishReplyPresentation(session));
      else finishReplyPresentation(session);
      return true;
    } catch { return failReply(session); }
  }, [completeActivity, completeRequestScene, failReply, finishReplyPresentation]);

  const reportActivity = React.useCallback((requestId, event) => {
    const request = activeRequestRef.current;
    const activity = parseMetabloomActivity(event);
    if (!activity || !request || request.requestId !== requestId || request.session.closed
      || !mountedRef.current || request.session.snapshot().segments.length) return false;
    if (activity.state === "complete" && stateRef.current?.activity !== activity.activity) return false;
    if (activity.state === "running") {
      reactionPlayer.cancel();
      setActiveReaction(null);
    }
    if (activity.state === "running") setActivity(activity.activity);
    else completeActivity();
    window.clearTimeout(previewTimerRef.current);
    // Long work has an absolute five-minute ceiling. Heartbeats cannot extend it.
    const remaining = Math.max(0, request.startedAt + MAX_ACTIVITY_TIMEOUT_MS - Date.now());
    const timeout = activity.state === "running" ? remaining : Math.min(RESPONSE_TIMEOUT_MS, remaining);
    previewTimerRef.current = window.setTimeout(() => failReply(request.session), timeout);
    return true;
  }, [completeActivity, failReply, reactionPlayer, setActivity]);

  const previewUnderHood = React.useCallback(() => {
    if (stateRef.current?.pending || !isActive) return;
    cancelRequestScene();
    setActivity("idle");
    performAction({ action: "reform", intensity: 0, talking: false }, { pulse: false });
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const advance = (index) => {
      const step = METABLOOM_HOOD_SEQUENCE[index];
      if (!step || !mountedRef.current) { cancelUnderHood(); return; }
      updateStateSnapshot({ underHoodPhase: step.phase });
      setUnderHoodPhase(step.phase);
      underHoodTimerRef.current = window.setTimeout(
        () => reduced ? cancelUnderHood() : advance(index + 1), step.duration,
      );
    };
    advance(reduced ? 1 : 0);
  }, [cancelRequestScene, cancelUnderHood, isActive, performAction, setActivity, updateStateSnapshot]);

  const previewResearchScene = React.useCallback(() => {
    if (stateRef.current?.pending || !isActive) return;
    cancelRequestScene();
    // Match the hood preview: retire old gestures and resume a paused field.
    performAction({ action: "reform", intensity: 0, talking: false }, { pulse: false });
    setActivity("deep-research", true);
    activityPreviewTimerRef.current = window.setTimeout(completeActivity, 4000);
  }, [cancelRequestScene, completeActivity, isActive, performAction, setActivity]);

  const receiveModelResponse = React.useCallback((payload, options = {}) => {
    const expectedRequestId = options?.requestId;
    const source = typeof options?.source === "string" ? options.source : "external";
    const activeRequest = activeRequestRef.current;
    if (expectedRequestId && (!activeRequest || activeRequest.requestId !== expectedRequestId)) return false;
    if (expectedRequestId && activeRequest.session.snapshot().segments.length && !activeRequest.claimed) return false;
    const allowMultiple = expectedRequestId ? activeRequest.allowMultiple : options?.allowMultiple === true;
    const parsed = parseMetabloomChatEnvelope(payload, { allowMultiple });
    if (parsed.ok) {
      const session = expectedRequestId ? activeRequest.session : beginReply(source, allowMultiple);
      updateStateSnapshot({ responseSource: source });
      setResponseSource(source);
      return finishReply(session, parsed.value);
    }
    // Explicit backwards compatibility only. A streamed reply never falls back to a playlist.
    const legacy = parseMetabloomModelResponse(payload);
    if (!legacy.ok || activeRequest?.session.snapshot().segments.length) {
      if (activeRequest) return failReply(activeRequest.session);
      setErrorMessage(parsed.error);
      return false;
    }
    const display = replyDisplayRef.current;
    if (activeRequest && display?.session === activeRequest.session
      && (display.gate.enabled || activeRequest.actionMode === "deep-research")) {
      const session = activeRequest.session;
      if (session.closed) return false;
      if (!display.gate.enabled) beginRequestScene("deep-research", session);
      // This explicit compatibility format has its own validator and character
      // bound. Close its unused segment session without publishing its payload.
      session.interrupt();
      updateStateSnapshot({ responseSource: source });
      setResponseSource(source);
      display.gate.update({
        content: legacy.value.response, segments: [{ response: legacy.value.response }],
        actionChain: legacy.value.actionChain, emote: "neutral", status: "complete",
      }, { legacy: true });
      display.gate.deferReaction("legacy-actions", () => playSequence(legacy.value.actionChain, "legacy-model-response"));
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = 0;
      display.gate.complete(() => finishReplyPresentation(session));
      return true;
    }
    cancelResponse();
    updateStateSnapshot({ pending: false, responseSource: source });
    setPending(false);
    setResponseSource(source);
    setErrorMessage("");
    appendMessage("assistant", legacy.value.response, legacy.value.actionChain, source);
    playSequence(legacy.value.actionChain, "legacy-model-response");
    return true;
  }, [appendMessage, beginReply, beginRequestScene, cancelResponse, failReply, finishReply, finishReplyPresentation, playSequence, updateStateSnapshot]);

  const createStream = React.useCallback((options = {}) => {
    const allowMultiple = options?.allowMultiple === true;
    const session = beginReply("external", allowMultiple);
    const decoder = createMetabloomSegmentStreamDecoder({
      allowMultiple,
      onTextDelta: (delta, index) => session.appendText(delta, index),
      onSegment: (segment, index) => session.append(segment, index),
    });
    return Object.freeze({
      push(chunk) {
        if (replyRef.current !== session || session.closed) return false;
        try { return decoder.push(chunk) || failReply(session); }
        catch { return failReply(session); }
      },
      finish() {
        if (replyRef.current !== session || session.closed) return false;
        const result = decoder.finish();
        return result.ok ? finishReply(session, result.value) : failReply(session);
      },
      cancel() {
        if (replyRef.current === session && !session.closed) stop();
      },
    });
  }, [beginReply, failReply, finishReply, stop]);

  const getState = React.useCallback(() => ({
    ...stateRef.current,
    ...requestSceneRef.current?.presentation,
    researchDisplayPhase: replyDisplayRef.current?.gate.enabled ? replyDisplayRef.current.gate.phase : null,
    researchBufferedChars: replyDisplayRef.current?.gate.enabled ? replyDisplayRef.current.gate.bufferedChars : 0,
  }), []);

  const getMessages = React.useCallback(
    () => messagesRef.current.map(cloneMessage),
    [],
  );

  const toolExpress = React.useCallback(
    (request) => {
      const command = normalizeStrictToolStep(request);
      return command ? performAction(command) : false;
    },
    [performAction],
  );

  const toolReact = React.useCallback((request) => {
    if (!isPlainObject(request) || !hasOnlyKeys(request, TOOL_REACTION_KEYS)
      || !resolveMetabloomEmote(request.emote) || stateRef.current?.pending) return false;
    cancelRequestScene();
    setActivity("idle");
    reactionPlayer.cancel();
    return reactionPlayer.enqueue(request.emote, null, 0,
      document.hidden || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }, [cancelRequestScene, reactionPlayer, setActivity]);

  const previewReaction = React.useCallback((request) => {
    if (stateRef.current?.pending) return false;
    cancelRequestScene();
    setActivity("idle");
    reactionPlayer.cancel();
    setActiveReaction(null);
    return performAction(request, { pulse: false });
  }, [cancelRequestScene, performAction, reactionPlayer, setActivity]);

  const replaySegment = React.useCallback((message, segment, index) => {
    if (!isActive || stateRef.current?.pending || message.status !== "complete") return;
    cancelRequestScene();
    setActivity("idle");
    reactionPlayer.cancel();
    reactionPlayer.enqueue(segment.emote, message.id, index,
      document.hidden || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }, [cancelRequestScene, isActive, reactionPlayer, setActivity]);

  const toolSequence = React.useCallback(
    (request) => {
      const sequence = normalizeToolSequence(request);
      return sequence ? playSequence(sequence.steps, sequence.id) : false;
    },
    [playSequence],
  );

  const toolTalk = React.useCallback((request) => {
    if (
      !isPlainObject(request)
      || !hasOnlyKeys(request, TOOL_TALK_KEYS)
      || typeof request.active !== "boolean"
    ) {
      return false;
    }
    updateStateSnapshot({ talking: request.active });
    setTalking(request.active);
    return true;
  }, [updateStateSnapshot]);

  const toolPulse = React.useCallback(
    (request = {}) => {
      if (!normalizeEmptyToolRequest(request)) return false;
      pulse();
      return true;
    },
    [pulse],
  );

  const toolSettle = React.useCallback(
    (request = {}) => {
      if (!normalizeEmptyToolRequest(request)) return false;
      return performAction({
        action: DEFAULT_ACTION,
        duration: 1180,
        intensity: 0,
        talking: false,
      });
    },
    [performAction],
  );

  const toolGetState = React.useCallback(
    (request = {}) =>
      normalizeEmptyToolRequest(request) ? getState() : null,
    [getState],
  );

  const handleFieldStateChange = React.useCallback((nextState) => {
    updateStateSnapshot({ fieldState: nextState });
    setFieldState(nextState);
    if (nextState !== "crossfading") requestSceneRef.current?.onFieldSettled?.();
  }, [updateStateSnapshot]);

  const sendMessage = React.useCallback(
    (value) => {
      if (!isActive) return false;
      const message = typeof value === "string" ? value.trim() : "";
      if (!message) return false;
      if (message.length > MAX_USER_MESSAGE_CHARS) {
        setErrorMessage("Your message is longer than this interface allows.");
        return false;
      }
      cancelResponse();
      let artifactContext;
      try { artifactContext = window.__metabloomVisualSnapshot?.(); } catch { /* Optional context only. */ }
      // A multi-segment reply remains one history entry. Exclude incomplete replies
      // and bound the history by characters as well as message count.
      let historyChars = 0;
      const history = [];
      for (const item of [...messagesRef.current].reverse()) {
        if (item.status === "interrupted" || item.status === "error") continue;
        if (history.length >= MAX_HISTORY_MESSAGES || historyChars + item.content.length > 16000) break;
        history.unshift({ role: item.role, content: item.content });
        historyChars += item.content.length;
      }
      followLatestRef.current = true;
      setReadingEarlier(false);
      appendMessage("user", message);
      const demo = METABLOOM_DEMOS.find((item) => item.prompt === message);
      const allowMultiple = deepResearch || (demo ? demo.segments.length > 1 : allowEmoteChanges);
      const source = demo ? "preview" : "model";
      const session = beginReply(source, allowMultiple);
      const requestToken = ++requestTokenRef.current;
      const requestId = `${mountIdRef.current}-${requestToken}`;
      const activeRequest = { claimed: false, requestId, requestToken, allowMultiple,
        actionMode: deepResearch ? "deep-research" : "auto", skipScene: document.hidden, session, startedAt: Date.now() };
      activeRequestRef.current = activeRequest;
      const controller = new AbortController();
      requestAbortRef.current = controller;
      updateStateSnapshot({ conversationStarted: true, talking: false });
      setDraft("");
      setTalking(false);
      const current = () => mountedRef.current && requestTokenRef.current === requestToken
        && activeRequestRef.current === activeRequest && !session.closed;
      const onTextDelta = (delta, index) => {
        if (current()) session.appendText(delta, index);
      };
      const onSegment = (segment, index) => {
        if (!current()) return;
        session.append(segment, index);
      };
      const onReaction = (reaction) => {
        if (!current() || !reaction || !resolveMetabloomEmote(reaction.emote)
          || !["input", "response"].includes(reaction.phase)) return;
        if (reaction.phase === "input") {
          window.clearTimeout(thinkingTimerRef.current);
          thinkingTimerRef.current = 0;
        }
        const play = () => reactionPlayer.enqueue(reaction.emote, requestId, reaction.phase === "input" ? -1 : -2,
          document.hidden || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
        const display = replyDisplayRef.current;
        if (reaction.phase === "response" && display?.session === session) display.gate.deferReaction("response", play);
        else play();
      };
      const onAction = (action) => {
        if (!current() || typeof action !== "string" || !Object.prototype.hasOwnProperty.call(METABLOOM_SCENE_ACTIONS, action)
          || activeRequest.actionReceived || session.snapshot().segments.length) return false;
        activeRequest.actionReceived = true;
        activeRequest.action = action;
        return action === "none" || activeRequest.skipScene || beginRequestScene(action, session);
      };
      const onResearch = (research) => {
        if (!current() || !isPlainObject(research) || Object.keys(research).length !== 1
          || !Object.prototype.hasOwnProperty.call(research, "state")
          || activeRequest.action !== "deep-research" || session.snapshot().segments.length) return false;
        if (research.state === "searching" && !activeRequest.researchState) {
          // Confirmed research gets one absolute budget. Progress cannot renew it.
          window.clearTimeout(previewTimerRef.current);
          const remaining = Math.max(0, activeRequest.startedAt + METABLOOM_RESEARCH_TIMEOUT_MS - Date.now());
          previewTimerRef.current = window.setTimeout(() => failReply(session, { code: "research_timeout" }), remaining);
        } else if (research.state !== "synthesizing" || activeRequest.researchState !== "searching" || !activeRequest.sourcesReceived) return false;
        activeRequest.researchState = research.state;
        updateStateSnapshot({ researchProgress: research.state, researchSummary: null });
        setResearchProgress(research.state);
        setResearchSummary(null);
        return true;
      };
      const onResearchProgress = (progress) => {
        if (!current() || !isPlainObject(progress) || Object.keys(progress).length !== 1
          || !Object.prototype.hasOwnProperty.call(progress, "summary")
          || activeRequest.action !== "deep-research" || !["searching", "synthesizing"].includes(activeRequest.researchState)
          || session.snapshot().segments.length || typeof progress.summary !== "string" || !progress.summary.trim()
          || progress.summary !== progress.summary.trim() || progress.summary.length > MAX_METABLOOM_RESEARCH_PROGRESS_CHARS
          || Array.from(progress.summary).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
          || (activeRequest.researchProgressCount || 0) >= MAX_METABLOOM_RESEARCH_PROGRESS_EVENTS) return false;
        activeRequest.researchProgressCount = (activeRequest.researchProgressCount || 0) + 1;
        updateStateSnapshot({ researchSummary: progress.summary });
        setResearchSummary(progress.summary);
        return true;
      };
      const onSources = (sources) => {
        if (!current() || activeRequest.researchState !== "searching" || activeRequest.sourcesReceived
          || session.snapshot().segments.length) return false;
        if (!session.attachSources(sources)) return false;
        activeRequest.sourcesReceived = true;
        return true;
      };
      const onResearchDetails = (details) => {
        if (!current() || activeRequest.action !== "deep-research" || activeRequest.researchState !== "searching"
          || activeRequest.researchDetailsReceived || activeRequest.sourcesReceived || session.snapshot().segments.length) return false;
        try {
          if (!session.attachResearchDetails(details)) return false;
        } catch { return false; }
        activeRequest.researchDetailsReceived = true;
        return true;
      };
      const onResearchBrief = (brief) => {
        if (!current() || activeRequest.action !== "deep-research" || activeRequest.researchState !== "synthesizing"
          || !activeRequest.researchDetailsReceived || !activeRequest.sourcesReceived || activeRequest.researchBriefReceived
          || session.snapshot().segments.length) return false;
        try { if (!session.attachResearchBrief(brief)) return false; } catch { return false; }
        activeRequest.researchBriefReceived = true;
        return true;
      };
      const onToolActivity = (phase) => {
        if (!current() || !['start', 'complete'].includes(phase)) return false;
        setToolPending(phase === 'start');
        window.clearTimeout(previewTimerRef.current);
        const remaining = Math.max(0, activeRequest.startedAt + METABLOOM_TOOL_TURN_TIMEOUT_MS - Date.now());
        previewTimerRef.current = window.setTimeout(() => failReply(session, { code: 'tool_timeout' }),
          phase === 'start' ? remaining : Math.min(RESPONSE_TIMEOUT_MS, remaining));
        return true;
      };
      const request = {
        requestId, message, history, artifactContext, allowMultiple, actionMode: activeRequest.actionMode, onToolActivity,
        signal: controller.signal, onTextDelta, onSegment, onReaction, onAction, onResearch, onResearchProgress, onResearchDetails, onResearchBrief, onSources,
        onActivity: (event) => current() && reportActivity(requestId, event),
        reactionQuestion: METABLOOM_REACTION_QUESTION,
        resolveDecision: resolveMetabloomDecision,
      };
      const runDemo = () => {
        if (!current()) return;
        // Source label belongs to this reply, not to every arriving segment.
        updateStateSnapshot({ responseSource: "preview" });
        setResponseSource("preview");
        if (deepResearch) onAction("deep-research");
        return streamMetabloomDemoResponse(request).then((payload) => {
          if (!current()) return;
          // Unconfigured live requests use the same reply, honestly labelled preview.
          publishMessages(messagesRef.current.map((item) => item.status === "streaming" ? { ...item, source: "preview" } : item));
          finishReply(session, payload);
        }).catch((error) => { if (current()) failReply(session, error); });
      };
      if (demo) { runDemo(); return true; }
      const claimRequest = () => {
        if (!current()) return false;
        activeRequest.claimed = true;
        return true;
      };
      const respond = (payload) => claimRequest() && receiveModelResponse(payload, { requestId, source: "external" });
      const requestEvent = new CustomEvent(MODEL_REQUEST_EVENT, {
        cancelable: true,
        detail: { ...request, claim: claimRequest, respond },
      });
      window.dispatchEvent(requestEvent);
      if (requestEvent.defaultPrevented) claimRequest();
      if (!current() || activeRequest.claimed) return true;
      const externalAdapter = window.__metabloomRequest;
      if (typeof externalAdapter !== "function" && typeof globalThis.fetch !== "function") {
        runDemo();
        return true;
      }
      Promise.resolve().then(() => {
        if (!current()) return null;
        return typeof externalAdapter === "function" ? externalAdapter(request)
          : requestMetabloomResponse({ ...request, optional: true });
      }).then((payload) => {
        if (!current()) return;
        if (!payload && !session.snapshot().segments.length) { runDemo(); return; }
        if (parseMetabloomChatEnvelope(payload, { allowMultiple }).ok) finishReply(session, payload);
        else receiveModelResponse(payload, { requestId, source: "model" });
      }).catch((error) => { if (current()) failReply(session, error); });
      return true;
    },
    [allowEmoteChanges, appendMessage, beginReply, beginRequestScene, cancelResponse, deepResearch, failReply, finishReply, isActive, publishMessages, reactionPlayer, receiveModelResponse, reportActivity, updateStateSnapshot],
  );

  const handleSubmit = React.useCallback(
    (event) => {
      event.preventDefault();
      sendMessage(draft);
    },
    [draft, sendMessage],
  );

  const handleComposerKeyDown = React.useCallback(
    (event) => {
      if (
        event.key !== "Enter"
        || event.shiftKey
        || event.nativeEvent?.isComposing
        || event.nativeEvent?.keyCode === 229
      ) {
        return;
      }
      event.preventDefault();
      sendMessage(draft);
    },
    [draft, sendMessage],
  );

  React.useEffect(() => {
    if (isActive) return;
    stop();
  }, [isActive, stop]);

  React.useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        // A hidden tab may pause animation frames. Skip its scene without
        // cancelling the request or discarding the bounded answer buffer.
        if (activeRequestRef.current) activeRequestRef.current.skipScene = true;
        cancelRequestScene();
        replyDisplayRef.current?.gate.release();
        cancelUnderHood();
        reactionPlayer.cancel();
        setActiveReaction(null);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [cancelRequestScene, cancelUnderHood, reactionPlayer]);

  React.useEffect(() => {
    onConversationStateChange?.(conversationStarted);
  }, [conversationStarted, onConversationStateChange]);

  const scrollToLatest = React.useCallback(() => {
    followLatestRef.current = true;
    setReadingEarlier(false);
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, []);

  const handleTranscriptScroll = () => {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    const nearBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 72;
    followLatestRef.current = nearBottom;
    setReadingEarlier(!nearBottom);
  };

  React.useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    const latestMessage = messages[messages.length - 1];
    const brief = latestMessage?.researchBrief && latestMessage.status !== "streaming"
      ? Array.from(transcript?.querySelectorAll(".metabloom-chat__message") || [])
        .find((message) => message.dataset.messageId === latestMessage.id)
        ?.querySelector(".metabloom-research-brief")
      : null;
    const newlySurfacedBrief = brief && surfacedBriefScrollRef.current !== latestMessage.id;
    if (newlySurfacedBrief) surfacedBriefScrollRef.current = latestMessage.id;
    // Never move the whole page or pull a reader away from an earlier reply.
    if (!followLatestRef.current) return;
    if (newlySurfacedBrief) {
      const style = window.getComputedStyle(transcript);
      const mask = style.getPropertyValue("mask-image") || style.getPropertyValue("-webkit-mask-image");
      // The transcript's existing fade becomes opaque at 38% of its height.
      // Open a long brief below that fade, then let the reader control scrolling.
      const inset = mask && mask !== "none" ? transcript.clientHeight * 0.4
        : Math.max(16, parseFloat(style.scrollPaddingTop) || 0);
      transcript.scrollTop = Math.max(0, transcript.scrollTop
        + brief.getBoundingClientRect().top - transcript.getBoundingClientRect().top - inset);
      const nearBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 72;
      followLatestRef.current = nearBottom;
      setReadingEarlier(!nearBottom);
      return;
    }
    scrollToLatest();
  }, [messages, pending, visibleResearchPhase, scenePhase, scrollToLatest]);

  const resizeComposer = React.useCallback(() => {
    const input = composerRef.current;
    // Let native field sizing preserve the caret and scroll position. Older
    // browsers use the same CSS bounds, without resetting a scrolled draft.
    if (!input || window.CSS?.supports?.("field-sizing", "content")) return;
    const scrollTop = input.scrollTop;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
    input.scrollTop = scrollTop;
  }, []);

  React.useLayoutEffect(() => {
    resizeComposer();
  }, [draft, resizeComposer]);

  React.useEffect(() => {
    const input = composerRef.current;
    if (!input || typeof ResizeObserver === "undefined"
      || window.CSS?.supports?.("field-sizing", "content")) return undefined;
    let width = input.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(resizeComposer);
    });
    observer.observe(input);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [resizeComposer]);

  React.useEffect(() => {
    const area = composerAreaRef.current;
    if (!area || typeof ResizeObserver === "undefined") return undefined;
    const resize = () => {
      const height = area.getBoundingClientRect().height;
      area.closest(".metabloom-chat")?.style.setProperty("--orb-composer-clearance", `${height + 48}px`);
      area.closest(".metabloom-chat")?.style.setProperty("--orb-composer-height", `${height}px`);
      if (followLatestRef.current) scrollToLatest();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(area);
    resize();
    return () => observer.disconnect();
  }, [scrollToLatest]);

  React.useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const section = sectionRef.current;
    const page = section?.closest(".orb-page") || section;
    if (!page) return undefined;
    let frame = 0;
    const resize = () => {
      // Follow the keyboard and browser chrome, never counteract pinch zoom.
      if (viewport?.scale > 1.05) return;
      const height = viewport?.height || window.innerHeight;
      page.style.setProperty("--orb-viewport-height", `${height}px`);
      page.style.setProperty("--orb-viewport-top", `${viewport?.offsetTop || 0}px`);
      page.dataset.compactViewport = String(height < 520);
      page.dataset.keyboardOpen = String(document.activeElement === composerRef.current
        && (window.innerHeight - height > 100 || height < 520));
      resizeComposer();
      if (followLatestRef.current) scrollToLatest();
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(resize);
    };
    resize();
    window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    section.addEventListener("focusin", schedule);
    section.addEventListener("focusout", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      section.removeEventListener("focusin", schedule);
      section.removeEventListener("focusout", schedule);
      page.style.removeProperty("--orb-viewport-height");
      page.style.removeProperty("--orb-viewport-top");
      delete page.dataset.compactViewport;
      delete page.dataset.keyboardOpen;
    };
  }, [resizeComposer, scrollToLatest]);

  React.useEffect(() => {
    const handleModelResponse = (event) => {
      const correlated = extractCorrelatedResponse(event.detail);
      if (!correlated) return;
      receiveModelResponse(correlated.payload, {
        requestId: correlated.requestId,
        source: "external",
      });
    };

    window.addEventListener(MODEL_RESPONSE_EVENT, handleModelResponse);
    return () => {
      window.removeEventListener(MODEL_RESPONSE_EVENT, handleModelResponse);
    };
  }, [receiveModelResponse]);

  React.useEffect(() => {
    const publicActions = METABLOOM_ACTIONS.map(
      ({ id, label, intent, motion, colorway, colors, duration, intensity, beats }) => ({
        id,
        label,
        intent,
        motion,
        colorway,
        colors: [...colors],
        beats: [...beats],
        duration,
        intensity,
      }),
    );
    const expressions = [...METABLOOM_ACTION_IDS];
    const forms = [...LEGACY_FORMS];
    const responseSchema = cloneSchema(METABLOOM_MODEL_RESPONSE_SCHEMA);
    const toolSchemas = Object.freeze(
      Object.fromEntries(
        Object.entries(METABLOOM_TOOL_SCHEMAS).map(([name, schema]) => [
          name,
          deepFreeze(cloneSchema(schema)),
        ]),
      ),
    );
    const metabloomTools = Object.freeze({
      version: "1.1.0",
      react: toolReact,
      express: toolExpress,
      sequence: toolSequence,
      talk: toolTalk,
      pulse: toolPulse,
      settle: toolSettle,
      getState: toolGetState,
    });

    const emoteProtocol = deepFreeze({
      version: METABLOOM_PROTOCOL_VERSION,
      emotes: [...METABLOOM_EMOTE_IDS],
      schema: cloneSchema(METABLOOM_EMOTE_RESPONSE_SCHEMA),
      respond: receiveModelResponse,
      createStream,
      getState,
      decisionSchema: cloneSchema(METABLOOM_DECISION_SCHEMA),
      reactionQuestion: cloneSchema(METABLOOM_REACTION_QUESTION),
      resolveDecision: resolveMetabloomDecision,
      activities: cloneSchema(METABLOOM_ACTIVITIES),
      reportActivity,
    });
    window.__metabloomProtocol = emoteProtocol;
    window.__bhModeActive = false;
    window.__metabloomTools = metabloomTools;
    window.__metabloomToolSchemas = toolSchemas;
    window.__orbPop = pulse;
    window.__orbExpress = performAction;
    window.__orbTransform = transform;
    window.__orbReact = reactToUser;
    window.__orbPlaySequence = playExternalSequence;
    window.__orbStop = stop;
    window.__orbReset = reset;
    window.__orbActions = publicActions;
    window.__orbExpressions = expressions;
    window.__orbForms = forms;
    window.__orbState = getState;
    window.__orbTalk = startTalking;
    window.__orbStopTalk = stopTalking;
    window.__orbRespond = receiveModelResponse;
    window.__orbResponseSchema = responseSchema;
    window.__orbMessages = getMessages;

    return () => {
      mountedRef.current = false;
      cancelResponse();
      clearOwnedGlobal("__metabloomProtocol", emoteProtocol);
      cancelSequenceTimer();
      requestTokenRef.current += 1;
      activeRequestRef.current = null;
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = 0;
      clearOwnedGlobal("__metabloomTools", metabloomTools);
      clearOwnedGlobal("__metabloomToolSchemas", toolSchemas);
      clearOwnedGlobal("__orbPop", pulse);
      clearOwnedGlobal("__orbExpress", performAction);
      clearOwnedGlobal("__orbTransform", transform);
      clearOwnedGlobal("__orbReact", reactToUser);
      clearOwnedGlobal("__orbPlaySequence", playExternalSequence);
      clearOwnedGlobal("__orbStop", stop);
      clearOwnedGlobal("__orbReset", reset);
      clearOwnedGlobal("__orbActions", publicActions);
      clearOwnedGlobal("__orbExpressions", expressions);
      clearOwnedGlobal("__orbForms", forms);
      clearOwnedGlobal("__orbState", getState);
      clearOwnedGlobal("__orbTalk", startTalking);
      clearOwnedGlobal("__orbStopTalk", stopTalking);
      clearOwnedGlobal("__orbRespond", receiveModelResponse);
      clearOwnedGlobal("__orbResponseSchema", responseSchema);
      clearOwnedGlobal("__orbMessages", getMessages);
      window.__bhModeActive = false;
    };
  }, [
    cancelResponse,
    createStream,
    cancelSequenceTimer,
    getMessages,
    getState,
    performAction,
    playExternalSequence,
    pulse,
    reactToUser,
    receiveModelResponse,
    reportActivity,
    reset,
    startTalking,
    stop,
    stopTalking,
    toolExpress,
    toolReact,
    toolGetState,
    toolPulse,
    toolSequence,
    toolSettle,
    toolTalk,
    transform,
  ]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const hasStreamingReply = messages.some((message) => message.status === "streaming");
  const showResearchStatus = Boolean(visibleResearchPhase || (pending && researchProgress && !hasStreamingReply));
  const statusText = visibleUnderHoodPhase
    ? (visibleUnderHoodPhase === "seam" ? "Opening the seam..." : visibleUnderHoodPhase === "closing" ? "Sealing the seam..." : `Under the hood · Forward Pass ${requestScene ? "scene" : "preview"}`)
    : visibleResearchPhase === "surfacing" ? "Surfacing..." : scenePhase === "think" ? "Thinking"
    : sceneAction === "deep-research" ? "Diving deep..." : activityId !== "idle"
    ? (activityPreview ? "Research scene preview" : METABLOOM_ACTIVITIES[activityId].label)
    : showResearchStatus ? "Researching"
    : pending
    ? (toolPending ? "Building your visual" : hasStreamingReply ? "Responding" : "Thinking")
    : sequenceId
      ? "Responding"
      : paused
        ? "Paused"
        : talking
          ? "Speaking"
          : activeReaction
            ? resolveMetabloomEmote(activeReaction.emote)?.label
            : composerFocused ? "Listening" : "Here with you";
  const researchStatus = showResearchStatus ? <MetabloomResearchStatus phase={visibleResearchPhase} preview={visibleActivityPreview} progress={researchProgress} summary={researchSummary} /> : null;
  const statusBeforeReply = visibleResearchPhase === "surfacing" && !visibleActivityPreview && messages[messages.length - 1]?.role === "assistant";
  const showHoodStatus = sceneAction === "under-the-hood";
  return (
    <section
      id="orb"
      ref={sectionRef}
      className="metabloom-chat"
      aria-label="Metabloom model chat interface"
      data-conversation-started={conversationStarted ? "true" : "false"}
      data-orb-action={activeAction.id}
      data-orb-action-version={actionVersion}
      data-orb-renderer="creatoros-metabloom"
      data-response-contract="emote+response"
      data-emote-protocol={METABLOOM_PROTOCOL_VERSION}
      data-response-presentation="single-message-stream"
      data-emote={emoteId}
      data-agent-activity={activityId}
      data-scene-action={sceneAction}
      data-scene-phase={scenePhase || undefined}
      data-activity-preview={visibleActivityPreview ? "true" : "false"}
      data-research-phase={visibleResearchPhase || undefined}
      data-activity-theme={visibleTheme}
      data-chat-phase={pending ? (hasStreamingReply ? "responding" : "thinking") : composerFocused ? "listening" : "ready"}
    >
      <h1 className="metabloom-chat__sr-only">
        Metabloom model chat interface
      </h1>

      <div className="metabloom-chat__field">
        <MetabloomAvatar
          activityTheme={visibleTheme}
          underHoodPhase={visibleUnderHoodPhase}
          action={activeAction.id}
          actionVersion={actionVersion}
          duration={actionDuration}
          intensity={actionIntensity}
          isActive={isActive}
          isDark={isDark}
          onFieldStateChange={handleFieldStateChange}
          onReady={onReady}
          onPulse={pulse}
          paused={paused}
          pulseVersion={pulseVersion}
          resetVersion={resetVersion}
          talking={talking}
        />
      </div>

      <div className="metabloom-chat__scrim" aria-hidden="true" />

      <div className="metabloom-chat__interface">
        <div className="metabloom-chat__shell">
          <div
            className="metabloom-chat__presence"
            role="status"
            aria-live={showResearchStatus || showHoodStatus ? "off" : "polite"}
          >
            <span className="metabloom-chat__presence-dot" aria-hidden="true" />
            <span>Metabloom</span>
            <span aria-hidden="true">·</span>
            <span>{statusText}</span>
          </div>

          <div
            ref={transcriptRef}
            onScroll={handleTranscriptScroll}
            tabIndex={0}
            className="metabloom-chat__messages"
            role="log"
            aria-live="polite"
            aria-label="Conversation"
            aria-relevant="additions text"
          >
            <div className="metabloom-chat__message-list">
              {messages.map((message, messageIndex) => {
                const sources = message.role === "assistant" ? parseMetabloomResearchSources(message.sources) : null;
                const researchDetails = message.role === "assistant" ? parseMetabloomResearchReport(message.researchDetails) : null;
                const researchBrief = researchDetails ? parseMetabloomResearchBrief(message.researchBrief, { sources: researchDetails.sources }) : null;
                return (
                <React.Fragment key={message.id}>
                  {statusBeforeReply && messageIndex === messages.length - 1 && researchStatus}
                  <article
                    className={`metabloom-chat__message metabloom-chat__message--${message.role}`}
                    aria-label={`${message.role === "assistant" ? "Metabloom" : "You"} message`}
                    aria-busy={message.status === "streaming"}
                    data-message-id={message.id}
                    data-emote={message.emote || undefined}
                    data-stream-status={message.status}
                  >
                    <span className="metabloom-chat__speaker">
                      {message.role === "assistant" ? "Metabloom" : "You"}
                    </span>
                    <div className="metabloom-chat__bubble">
                      {message.segments?.length
                        ? message.segments.map((segment, index) => (
                          <React.Fragment key={index}>
                            {segment.emote && <button
                              type="button"
                              className="metabloom-chat__reaction-cue"
                              aria-label={`Replay ${resolveMetabloomEmote(segment.emote)?.label.toLowerCase()} reaction for paragraph ${index + 1}`}
                              aria-pressed={activeReaction?.messageId === message.id && activeReaction?.index === index}
                              disabled={pending || !isActive || message.status !== "complete"}
                              onClick={() => replaySegment(message, segment, index)}
                            >
                              <span aria-hidden="true">↻</span> {resolveMetabloomEmote(segment.emote)?.label}
                            </button>}
                            <p data-segment-index={index} data-reaction-active={activeReaction?.messageId === message.id && activeReaction?.index === index ? "true" : "false"}>{renderMetabloomResearchText(segment.response, sources)}</p>
                          </React.Fragment>
                        ))
                        : message.content ? <p>{renderMetabloomResearchText(message.content, sources)}</p> : null}
                      {researchBrief && message.status !== "streaming" && <MetabloomResearchBrief brief={researchBrief} sources={researchDetails.sources} />}
                      {sources && !researchBrief && message.status === "complete" && (
                        <div className="metabloom-chat__sources" role="group" aria-label="Sources for this answer">
                          <span className="metabloom-chat__sources-heading">Sources</span>
                          <ol>
                            {sources.map((source) => (
                              <li key={source.id}>
                                <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
                                <span className="metabloom-chat__source-domain">{new URL(source.url).hostname}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                      {researchDetails && (
                        <>
                          {message.status === "error" && <p className="metabloom-chat__research-notice">Research completed. The short answer could not be prepared.</p>}
                          {message.status === "interrupted" && <p className="metabloom-chat__research-notice">Research completed. The short answer was stopped.</p>}
                          <MetabloomFullResearch report={researchDetails} />
                        </>
                      )}
                      {message.status === "streaming" && <span className="metabloom-chat__stream-status">Receiving response…</span>}
                      {["interrupted", "error"].includes(message.status) && message.content && <span className="metabloom-chat__stream-status">{researchDetails ? "Short answer incomplete" : "Response incomplete"}</span>}
                      {message.source === "preview" && (
                        <span className="metabloom-chat__preview-label">
                          Preview response
                        </span>
                      )}
                    </div>
                  </article>
                </React.Fragment>
                );
              })}

              {!conversationStarted && (
                <div
                  className="metabloom-chat__suggestions"
                  data-demo-count="4"
                  aria-label="Suggested messages"
                >
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => sendMessage(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {conversationStarted && !statusBeforeReply && researchStatus}
              {showHoodStatus && <div className="metabloom-chat__scene-status" role="status" aria-label="Scene progress" aria-live="polite" aria-atomic="true">{statusText}</div>}
              {pending && !hasStreamingReply && !showResearchStatus && !showHoodStatus && (
                <article
                  className="metabloom-chat__message metabloom-chat__message--assistant"
                  aria-label={`Metabloom is ${statusText.toLowerCase()}`}
                >
                  <span className="metabloom-chat__speaker">Metabloom</span>
                  <div className="metabloom-chat__bubble metabloom-chat__typing">
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                    <span className="metabloom-chat__sr-only">{statusText}</span>
                  </div>
                </article>
              )}

            </div>
          </div>

          <div className="metabloom-chat__composer-area" ref={composerAreaRef}>
            {!conversationStarted && researchStatus && <div className="metabloom-chat__research-preview">{researchStatus}</div>}
            <div className="metabloom-chat__conversation-tools">
              <MetabloomReactionPanel
                onReact={previewReaction}
                disabled={pending || !isActive}
                intensity={expressiveness}
                onIntensityChange={setExpressiveness}
              >
                {({ close }) => (
                  <>
                    <label className="metabloom-chat__stream-option">
                      <input type="checkbox" checked={allowEmoteChanges} onChange={(event) => setAllowEmoteChanges(event.target.checked)} />
                      Allow separate response paragraphs
                    </label>
                    <div className="metabloom-reactions__recipes" role="group" aria-label="Authored reaction chains">
                      <strong>Reaction chains</strong>
                      {METABLOOM_REACTION_RECIPES.map((recipe) => (
                        <button key={recipe.id} type="button" disabled={pending || !isActive} onClick={() => { if (toolReact({ emote: recipe.id })) close(); }} title={recipe.description}>{recipe.label}</button>
                      ))}
                    </div>
                    <div className="metabloom-reactions__recipes" role="group" aria-label="Scene previews">
                      <strong>Scene previews</strong>
                      <button type="button" disabled={pending || !isActive} onClick={() => { previewResearchScene(); close(); }}>Preview research scene</button>
                      <button type="button" disabled={pending || !isActive} title="Part Metabloom to reveal the Forward Pass neural-network visualization" onClick={() => { previewUnderHood(); close(); }}>Preview under the hood</button>
                    </div>
                    <details className="metabloom-chat__demos">
                      <summary>Try a conversation demo</summary>
                      <div>
                        {SUGGESTED_PROMPTS.map((prompt) => (
                          <button key={prompt} type="button" disabled={pending || !isActive} onClick={() => sendMessage(prompt)}>{prompt}</button>
                        ))}
                      </div>
                    </details>
                  </>
                )}
              </MetabloomReactionPanel>
              <label className="metabloom-chat__research-toggle" data-enabled={deepResearch ? "true" : "false"} data-disabled={pending || !isActive ? "true" : "false"}>
                <input type="checkbox" checked={deepResearch} disabled={pending || !isActive} onChange={(event) => setDeepResearch(event.target.checked)} />
                <span>Deep Research</span>
              </label>
              {readingEarlier && <button type="button" className="metabloom-chat__latest" onClick={scrollToLatest}>Latest message ↓</button>}
            </div>
            {errorMessage && (
              <p className="metabloom-chat__error" role="alert">
                {errorMessage}
              </p>
            )}
            <form
              className="metabloom-chat__composer"
              data-has-stop={pending && draft.trim() ? "true" : "false"}
              onSubmit={handleSubmit}
              aria-label="Message Metabloom"
            >
              <label
                className="metabloom-chat__sr-only"
                htmlFor="metabloom-message"
              >
                Message Metabloom
              </label>
              <textarea
                ref={composerRef}
                id="metabloom-message"
                onFocus={attendToComposer}
                onBlur={() => setComposerFocused(false)}
                aria-describedby="metabloom-composer-help"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Message Metabloom"
                rows={1}
                wrap="soft"
                enterKeyHint="send"
                maxLength={MAX_USER_MESSAGE_CHARS}
              />
              {pending && draft.trim() && (
                <button type="button" onClick={stop} aria-label="Stop response">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7H17V17H7Z" stroke="currentColor" strokeWidth="1.8" /></svg>
                </button>
              )}
              <button
                type={pending && !draft.trim() ? "button" : "submit"}
                disabled={!pending && !draft.trim()}
                onClick={pending && !draft.trim() ? stop : undefined}
                aria-label={pending && !draft.trim() ? "Stop response" : "Send message"}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d={pending && !draft.trim() ? "M7 7H17V17H7Z" : "M12 19V5M6.5 10.5 12 5l5.5 5.5"}
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </form>
            <p id="metabloom-composer-help" className="metabloom-chat__composer-help">
              {conversationStarted ? "Enter to send · Shift + Enter for a new line" : "Say what’s on your mind, or try a conversation below."}
            </p>
          </div>
        </div>
      </div>

    </section>
  );
};

export default OrbSection;
