import React from "react";
import { useThemeMode } from "../contexts/ThemeContext";
import { useAppNavigation } from '../contexts/AppNavigationContext';
import { METABLOOM_HOOD_SEQUENCE } from "./metabloomUnderHood";
import MetabloomAvatar from "./MetabloomAvatar";
import MetabloomReactionPanel from "./MetabloomReactionPanel";
import MetabloomResearchStatus from "./MetabloomResearchStatus";
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
import { parseMetabloomEmoteEnvelope, createMetabloomSegmentStreamDecoder } from "./metabloomEmoteProtocol";
import { resolveMetabloomEmote, METABLOOM_PROTOCOL_VERSION, METABLOOM_EMOTE_IDS, METABLOOM_EMOTE_RESPONSE_SCHEMA } from "./metabloomEmoteLibrary";
import { METABLOOM_ACTIVITIES, METABLOOM_REACTION_RECIPES, METABLOOM_DECISION_SCHEMA, METABLOOM_REACTION_QUESTION, resolveMetabloomDecision, parseMetabloomActivity } from "./metabloomDecisionMapping";
import { createMetabloomReactionPlayer } from "./metabloomReactionPlayer";
import { createMetabloomReplySession } from "./metabloomReplySession";
import { requestMetabloomResponse } from "./metabloomApiClient";
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

const cloneMessage = ({ id, role, content, actionChain = [], source, emote, segments = [], status }) => ({
  id,
  emote,
  segments: segments.map((segment) => ({ ...segment })),
  status,
  role,
  content,
  actionChain: cloneActionChain(actionChain),
  source,
});

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
  const messageCounterRef = React.useRef(savedConversation?.counter || 0);
  const mountedRef = React.useRef(true);
  const sectionRef = React.useRef(null);
  const transcriptRef = React.useRef(null);
  const composerRef = React.useRef(null);
  const composerAreaRef = React.useRef(null);
  const followLatestRef = React.useRef(true);
  const reactionPlayerRef = React.useRef(null);
  const thinkingTimerRef = React.useRef(0);
  const activityPreviewTimerRef = React.useRef(0);
  const activityReturnTimerRef = React.useRef(0);
  const underHoodTimerRef = React.useRef(0);
  const [underHoodPhase, setUnderHoodPhase] = React.useState(null);
  const [activityId, setActivityId] = React.useState("idle");
  const [activityPreview, setActivityPreview] = React.useState(false);
  const [researchPhase, setResearchPhase] = React.useState(null);
  const [readingEarlier, setReadingEarlier] = React.useState(false);
  const [composerFocused, setComposerFocused] = React.useState(false);
  const [touchComposer, setTouchComposer] = React.useState(() =>
    Boolean(window.matchMedia?.("(hover: none) and (pointer: coarse)").matches));
  const [activeReaction, setActiveReaction] = React.useState(null);
  const [expressiveness, setExpressiveness] = React.useState(savedConversation?.expressiveness ?? 0.8);
  const expressivenessRef = React.useRef(expressiveness);
  expressivenessRef.current = expressiveness;
  const stateRef = React.useRef(null);
  const [emoteId, setEmoteId] = React.useState("neutral");
  const [allowEmoteChanges, setAllowEmoteChanges] = React.useState(savedConversation?.allowEmoteChanges || false);
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
  const [messages, setMessages] = React.useState(savedConversation?.messages || initialMessages);
  const messagesRef = React.useRef(messages);
  const [draft, setDraft] = React.useState(savedConversation?.draft || '');
  const [pending, setPending] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState(savedConversation?.interrupted ? 'The response was interrupted when you changed tools. Any visible reply is incomplete. Send another message to continue.' : '');
  const [responseSource, setResponseSource] = React.useState(savedConversation?.responseSource || 'interface');
  const retainedConversation = React.useRef(null);
  retainedConversation.current = { draft, expressiveness, pending, responseSource, paused, allowEmoteChanges };
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

  messagesRef.current = messages;
  stateRef.current = {
    underHoodPhase,
    activity: activityId,
    researchPhase,
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

  const cancelResponse = React.useCallback((reason = "interrupted") => {
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
    replyRef.current = null;
  }, [setActivity]);

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
    (role, content, actionChain = [], source = "interface", emote = null, segments = [], status = "complete") => {
      const message = {
        id: `${role}-${++messageCounterRef.current}`, role, content, emote,
        actionChain: cloneActionChain(actionChain), source, segments, status,
      };
      publishMessages([...messagesRef.current.slice(-(MAX_CHAT_MESSAGES - 1)), message]);
      return message;
    },
    [publishMessages],
  );

  const failReply = React.useCallback((session) => {
    if (replyRef.current !== session || session.closed) return false;
    cancelResponse("error");
    updateStateSnapshot({ pending: false, responseSource: "error" });
    setPending(false);
    setResponseSource("error");
    setErrorMessage("The response stream was interrupted. Any visible reply is incomplete. Try again or use a local demo.");
    return false;
  }, [cancelResponse, updateStateSnapshot]);

  const beginReply = React.useCallback((source, allowMultiple = false) => {
    cancelResponse();
    clearSequence();
    let messageId = null;
    const session = createMetabloomReplySession({
      allowMultiple,
      onEmote: (emote) => {
        completeActivity();
        window.clearTimeout(thinkingTimerRef.current);
        thinkingTimerRef.current = 0;
        const index = session.snapshot().segments.length - 1;
        reactionPlayer.enqueue(emote, messageId, index,
          document.hidden || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
      },
      onUpdate: (snapshot) => {
        if (!mountedRef.current) return;
        const replySource = replyRef.current === session ? stateRef.current.responseSource : source;
        if (!messageId) {
          messageId = appendMessage("assistant", snapshot.content, [], replySource, snapshot.emote, snapshot.segments, snapshot.status).id;
        } else {
          publishMessages(messagesRef.current.map((message) => message.id === messageId ? { ...message, ...snapshot, source: replySource } : message));
        }
      },
    });
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
    previewTimerRef.current = window.setTimeout(() => failReply(session), RESPONSE_TIMEOUT_MS);
    return session;
  }, [appendMessage, cancelResponse, clearSequence, completeActivity, failReply, performAction, reactionPlayer, publishMessages, updateStateSnapshot]);

  const finishReply = React.useCallback((session, payload) => {
    if (replyRef.current !== session || session.closed) return false;
    try {
      session.finish(payload);
      completeActivity();
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = 0;
      activeRequestRef.current = null;
      requestAbortRef.current = null;
      requestTokenRef.current += 1;
      updateStateSnapshot({ pending: false });
      setPending(false);
      return true;
    } catch { return failReply(session); }
  }, [completeActivity, failReply, updateStateSnapshot]);

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
  }, [cancelUnderHood, isActive, performAction, setActivity, updateStateSnapshot]);

  const previewResearchScene = React.useCallback(() => {
    if (stateRef.current?.pending || !isActive) return;
    // Match the hood preview: retire old gestures and resume a paused field.
    performAction({ action: "reform", intensity: 0, talking: false }, { pulse: false });
    setActivity("deep-research", true);
    activityPreviewTimerRef.current = window.setTimeout(completeActivity, 4000);
  }, [completeActivity, isActive, performAction, setActivity]);

  const receiveModelResponse = React.useCallback((payload, options = {}) => {
    const expectedRequestId = options?.requestId;
    const source = typeof options?.source === "string" ? options.source : "external";
    const activeRequest = activeRequestRef.current;
    if (expectedRequestId && (!activeRequest || activeRequest.requestId !== expectedRequestId)) return false;
    if (expectedRequestId && activeRequest.session.snapshot().segments.length && !activeRequest.claimed) return false;
    const allowMultiple = expectedRequestId ? activeRequest.allowMultiple : options?.allowMultiple === true;
    const parsed = parseMetabloomEmoteEnvelope(payload, { allowMultiple });
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
    cancelResponse();
    updateStateSnapshot({ pending: false, responseSource: source });
    setPending(false);
    setResponseSource(source);
    setErrorMessage("");
    appendMessage("assistant", legacy.value.response, legacy.value.actionChain, source);
    playSequence(legacy.value.actionChain, "legacy-model-response");
    return true;
  }, [appendMessage, beginReply, cancelResponse, failReply, finishReply, playSequence, updateStateSnapshot]);

  const createStream = React.useCallback((options = {}) => {
    const allowMultiple = options?.allowMultiple === true;
    const session = beginReply("external", allowMultiple);
    const decoder = createMetabloomSegmentStreamDecoder({
      allowMultiple,
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

  const getState = React.useCallback(() => ({ ...stateRef.current }), []);

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
    setActivity("idle");
    reactionPlayer.cancel();
    return reactionPlayer.enqueue(request.emote, null, 0,
      document.hidden || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }, [reactionPlayer, setActivity]);

  const previewReaction = React.useCallback((request) => {
    if (stateRef.current?.pending) return false;
    setActivity("idle");
    reactionPlayer.cancel();
    setActiveReaction(null);
    return performAction(request, { pulse: false });
  }, [performAction, reactionPlayer, setActivity]);

  const replaySegment = React.useCallback((message, segment, index) => {
    if (!isActive || stateRef.current?.pending || message.status !== "complete") return;
    setActivity("idle");
    reactionPlayer.cancel();
    reactionPlayer.enqueue(segment.emote, message.id, index,
      document.hidden || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }, [isActive, reactionPlayer, setActivity]);

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
      const allowMultiple = demo ? demo.segments.length > 1 : allowEmoteChanges;
      const source = demo ? "preview" : "model";
      const session = beginReply(source, allowMultiple);
      const requestToken = ++requestTokenRef.current;
      const requestId = `${mountIdRef.current}-${requestToken}`;
      const activeRequest = { claimed: false, requestId, requestToken, allowMultiple, session, startedAt: Date.now() };
      activeRequestRef.current = activeRequest;
      const controller = new AbortController();
      requestAbortRef.current = controller;
      updateStateSnapshot({ conversationStarted: true, talking: false });
      setDraft("");
      setTalking(false);
      const current = () => mountedRef.current && requestTokenRef.current === requestToken
        && activeRequestRef.current === activeRequest && !session.closed;
      const onSegment = (segment, index) => {
        if (!current()) return;
        session.append(segment, index);
      };
      const request = {
        requestId, message, history, allowMultiple, signal: controller.signal, onSegment,
        onActivity: (event) => current() && reportActivity(requestId, event),
        reactionQuestion: METABLOOM_REACTION_QUESTION,
        resolveDecision: resolveMetabloomDecision,
      };
      const runDemo = () => {
        if (!current()) return;
        // Source label belongs to this reply, not to every arriving segment.
        updateStateSnapshot({ responseSource: "preview" });
        setResponseSource("preview");
        return streamMetabloomDemoResponse(request).then((payload) => {
          if (!current()) return;
          // Unconfigured live requests use the same reply, honestly labelled preview.
          publishMessages(messagesRef.current.map((item) => item.status === "streaming" ? { ...item, source: "preview" } : item));
          finishReply(session, payload);
        }).catch(() => { if (current()) failReply(session); });
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
        if (parseMetabloomEmoteEnvelope(payload, { allowMultiple }).ok) finishReply(session, payload);
        else receiveModelResponse(payload, { requestId, source: "model" });
      }).catch(() => { if (current()) failReply(session); });
      return true;
    },
    [allowEmoteChanges, appendMessage, beginReply, cancelResponse, failReply, finishReply, isActive, publishMessages, receiveModelResponse, reportActivity, updateStateSnapshot],
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
        || (touchComposer && !event.ctrlKey && !event.metaKey)
      ) {
        return;
      }
      event.preventDefault();
      sendMessage(draft);
    },
    [draft, sendMessage, touchComposer],
  );

  React.useEffect(() => {
    const media = window.matchMedia?.("(hover: none) and (pointer: coarse)");
    if (!media) return undefined;
    const update = () => setTouchComposer(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  React.useEffect(() => {
    if (isActive) return;
    stop();
  }, [isActive, stop]);

  React.useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        cancelUnderHood();
        reactionPlayer.cancel();
        setActiveReaction(null);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [cancelUnderHood, reactionPlayer]);

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
    // Never move the whole page or pull a reader away from an earlier reply.
    if (followLatestRef.current) scrollToLatest();
  }, [messages, pending, researchPhase, scrollToLatest]);

  React.useLayoutEffect(() => {
    const input = composerRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(116, Math.max(46, input.scrollHeight))}px`;
  }, [draft]);

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
  }, [scrollToLatest]);

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
  const statusText = underHoodPhase
    ? (underHoodPhase === "seam" ? "Opening the seam..." : underHoodPhase === "closing" ? "Sealing the seam..." : "Under the hood · Forward Pass preview")
    : researchPhase === "surfacing" ? "Surfacing..." : activityId !== "idle"
    ? (activityPreview ? "Research scene preview" : METABLOOM_ACTIVITIES[activityId].label)
    : pending
    ? (hasStreamingReply ? "Responding" : "Thinking")
    : sequenceId
      ? "Responding"
      : paused
        ? "Paused"
        : talking
          ? "Speaking"
          : activeReaction
            ? resolveMetabloomEmote(activeReaction.emote)?.label
            : composerFocused ? "Listening" : "Here with you";
  const researchStatus = researchPhase ? <MetabloomResearchStatus phase={researchPhase} preview={activityPreview} /> : null;
  const statusBeforeReply = researchPhase === "surfacing" && !activityPreview && messages[messages.length - 1]?.role === "assistant";
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
      data-activity-preview={activityPreview ? "true" : "false"}
      data-research-phase={researchPhase || undefined}
      data-activity-theme={METABLOOM_ACTIVITIES[activityId].theme}
      data-chat-phase={pending ? (hasStreamingReply ? "responding" : "thinking") : composerFocused ? "listening" : "ready"}
    >
      <h1 className="metabloom-chat__sr-only">
        Metabloom model chat interface
      </h1>

      <div className="metabloom-chat__field">
        <MetabloomAvatar
          activityTheme={METABLOOM_ACTIVITIES[activityId].theme}
          underHoodPhase={underHoodPhase}
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
            aria-live={researchPhase ? "off" : "polite"}
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
              {messages.map((message, messageIndex) => (
                <React.Fragment key={message.id}>
                  {statusBeforeReply && messageIndex === messages.length - 1 && researchStatus}
                  <article
                    className={`metabloom-chat__message metabloom-chat__message--${message.role}`}
                    aria-label={`${message.role === "assistant" ? "Metabloom" : "You"} message`}
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
                            <button
                              type="button"
                              className="metabloom-chat__reaction-cue"
                              aria-label={`Replay ${resolveMetabloomEmote(segment.emote)?.label.toLowerCase()} reaction for paragraph ${index + 1}`}
                              aria-pressed={activeReaction?.messageId === message.id && activeReaction?.index === index}
                              disabled={pending || !isActive || message.status !== "complete"}
                              onClick={() => replaySegment(message, segment, index)}
                            >
                              <span aria-hidden="true">↻</span> {resolveMetabloomEmote(segment.emote)?.label}
                            </button>
                            <p data-segment-index={index} data-reaction-active={activeReaction?.messageId === message.id && activeReaction?.index === index ? "true" : "false"}>{segment.response}</p>
                          </React.Fragment>
                        ))
                        : <p>{message.content}</p>}
                      {message.status === "streaming" && <span className="metabloom-chat__stream-status">Receiving response…</span>}
                      {["interrupted", "error"].includes(message.status) && <span className="metabloom-chat__stream-status">Response incomplete</span>}
                      {message.source === "preview" && (
                        <span className="metabloom-chat__preview-label">
                          Preview response
                        </span>
                      )}
                    </div>
                  </article>
                </React.Fragment>
              ))}

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
              {pending && !hasStreamingReply && !researchPhase && (
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
                      Match reactions to each paragraph
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
                enterKeyHint={touchComposer ? "enter" : "send"}
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
              {conversationStarted ? touchComposer ? "Return for a new line · Tap ↑ to send" : "Enter to send · Shift + Enter for a new line" : "Say what’s on your mind, or try a conversation below."}
            </p>
          </div>
        </div>
      </div>

    </section>
  );
};

export default OrbSection;
