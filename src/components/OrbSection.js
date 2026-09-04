import React from "react";
import { useThemeMode } from "../contexts/ThemeContext";
import MetabloomAvatar from "./MetabloomAvatar";
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
  MAX_METABLOOM_RESPONSE_CHARS,
  MIN_METABLOOM_ACTION_DURATION_MS,
  MIN_METABLOOM_ACTION_INTENSITY,
  METABLOOM_MODEL_RESPONSE_SCHEMA,
  createMetabloomPreviewResponse,
  parseMetabloomModelResponse,
} from "./metabloomResponseContract";
import "./OrbSection.css";

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
const PREVIEW_RESPONSE_DELAY_MS = 520;
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

const METABLOOM_TOOL_SCHEMAS = Object.freeze({
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

const SUGGESTED_PROMPTS = Object.freeze([
  "How should this interface feel?",
  "Show me a thoughtful response",
  "Celebrate a small win",
]);

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

const cloneMessage = ({ role, content, actionChain = [], source }) => ({
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
}) => {
  const { isDark } = useThemeMode();
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
  const messageCounterRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const messagesEndRef = React.useRef(null);
  const stateRef = React.useRef(null);
  const [actionId, setActionId] = React.useState(DEFAULT_ACTION);
  const [actionDuration, setActionDuration] = React.useState(
    DEFAULT_ACTION_RECORD.duration,
  );
  const [actionIntensity, setActionIntensity] = React.useState(
    DEFAULT_ACTION_RECORD.intensity,
  );
  const [actionVersion, setActionVersion] = React.useState(0);
  const [talking, setTalking] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [pulseVersion, setPulseVersion] = React.useState(0);
  const [resetVersion, setResetVersion] = React.useState(0);
  const [sequenceId, setSequenceId] = React.useState(null);
  const [fieldState, setFieldState] = React.useState("forming");
  const [messages, setMessages] = React.useState(initialMessages);
  const messagesRef = React.useRef(initialMessages);
  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");
  const [responseSource, setResponseSource] = React.useState("interface");
  const activeAction =
    resolveMetabloomAction(actionId) || getDefaultMetabloomAction();
  const legacyForm = ACTION_FORMS[activeAction.id] || "companion";
  const conversationStarted = messages.length > 0 || pending;

  messagesRef.current = messages;
  stateRef.current = {
    action: activeAction.id,
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

  const cancelSequenceTimer = React.useCallback(() => {
    sequenceTokenRef.current += 1;
    window.clearTimeout(sequenceTimerRef.current);
    sequenceTimerRef.current = 0;
  }, []);

  const clearSequence = React.useCallback(() => {
    cancelSequenceTimer();
    setSequenceId(null);
  }, [cancelSequenceTimer]);

  const pulse = React.useCallback(() => {
    setPulseVersion((value) => value + 1);
  }, []);

  const performAction = React.useCallback(
    (nextAction, options = {}) => {
      const request = isPlainObject(nextAction)
        ? nextAction
        : { ...options, action: nextAction };
      const resolved = resolveMetabloomAction(request.action);
      if (!resolved) return false;

      clearSequence();
      setActionId(resolved.id);
      setActionDuration(normalizeDuration(request.duration, resolved.duration));
      setActionIntensity(normalizeIntensity(request.intensity, resolved.intensity));
      setActionVersion((value) => value + 1);
      setTalking(
        typeof request.talking === "boolean" ? request.talking : false,
      );
      setPaused(false);
      setPulseVersion((value) => value + 1);
      return true;
    },
    [clearSequence],
  );

  const transform = React.useCallback(
    (nextForm) => {
      const mappedAction = FORM_ACTIONS[nextForm];
      return mappedAction ? performAction(mappedAction) : false;
    },
    [performAction],
  );

  const stop = React.useCallback(() => {
    clearSequence();
    setTalking(false);
  }, [clearSequence]);

  const reset = React.useCallback(() => {
    clearSequence();
    requestTokenRef.current += 1;
    activeRequestRef.current = null;
    window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = 0;
    setActionId(DEFAULT_ACTION);
    setActionDuration(DEFAULT_ACTION_RECORD.duration);
    setActionIntensity(DEFAULT_ACTION_RECORD.intensity);
    setActionVersion((value) => value + 1);
    setTalking(false);
    setPaused(false);
    setPending(false);
    setErrorMessage("");
    setResetVersion((value) => value + 1);
    setPulseVersion((value) => value + 1);
  }, [clearSequence]);

  const playSequence = React.useCallback(
    (steps, nextSequenceId = "custom") => {
      const normalizedSteps = normalizeSequenceSteps(steps);
      clearSequence();
      if (normalizedSteps.length === 0) return false;

      const token = sequenceTokenRef.current;
      let index = 0;
      setSequenceId(nextSequenceId);
      setPaused(false);

      const advance = () => {
        if (sequenceTokenRef.current !== token) return;
        const step = normalizedSteps[index];
        if (!step) {
          setTalking(false);
          setSequenceId(null);
          sequenceTimerRef.current = 0;
          return;
        }

        setActionId(step.action);
        setActionDuration(step.duration);
        setActionIntensity(step.intensity);
        setActionVersion((value) => value + 1);
        setTalking(step.talking);
        setPulseVersion((value) => value + 1);
        index += 1;
        sequenceTimerRef.current = window.setTimeout(advance, step.duration);
      };

      advance();
      return true;
    },
    [clearSequence],
  );

  const playExternalSequence = React.useCallback(
    (steps) => playSequence(steps, "custom"),
    [playSequence],
  );

  const startTalking = React.useCallback(() => {
    setTalking(true);
  }, []);

  const stopTalking = React.useCallback(() => {
    setTalking(false);
  }, []);

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

      clearSequence();
      if (requestedAction) {
        setActionId(requestedAction.id);
        setActionDuration(
          normalizeDuration(request.duration, requestedAction.duration),
        );
        setActionIntensity(
          normalizeIntensity(request.intensity, requestedAction.intensity),
        );
        setActionVersion((value) => value + 1);
        setPulseVersion((value) => value + 1);
      }
      if (requestedTalking !== null) setTalking(requestedTalking);
      if (requestedPaused !== null) setPaused(requestedPaused);
      if (requestedPulse && !requestedAction) pulse();
      return true;
    },
    [clearSequence, pulse],
  );

  const appendMessage = React.useCallback(
    (role, content, actionChain = [], source = "interface") => {
      messageCounterRef.current += 1;
      const message = {
        id: `${role}-${messageCounterRef.current}`,
        role,
        content,
        actionChain: cloneActionChain(actionChain),
        source,
      };
      const nextMessages = [
        ...messagesRef.current.slice(-(MAX_CHAT_MESSAGES - 1)),
        message,
      ];
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      return message;
    },
    [],
  );

  const applyModelResponse = React.useCallback(
    (payload, source = "external") => {
      const parsed = parseMetabloomModelResponse(payload);
      if (!parsed.ok) {
        setPending(false);
        setErrorMessage(parsed.error);
        return false;
      }

      setErrorMessage("");
      setPending(false);
      setResponseSource(source);
      appendMessage(
        "assistant",
        parsed.value.response,
        parsed.value.actionChain,
        source,
      );
      playSequence(parsed.value.actionChain, "model-response");
      return true;
    },
    [appendMessage, playSequence],
  );

  const receiveModelResponse = React.useCallback(
    (payload, options = {}) => {
      const expectedRequestId =
        options && typeof options === "object" ? options.requestId : null;
      const source =
        options &&
        typeof options === "object" &&
        typeof options.source === "string"
          ? options.source
          : "external";
      const activeRequest = activeRequestRef.current;

      if (
        expectedRequestId &&
        (!activeRequest || activeRequest.requestId !== expectedRequestId)
      ) {
        return false;
      }

      requestTokenRef.current += 1;
      activeRequestRef.current = null;
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = 0;
      return applyModelResponse(payload, source);
    },
    [applyModelResponse],
  );

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
    setTalking(request.active);
    return true;
  }, []);

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
    setFieldState(nextState);
  }, []);

  const sendMessage = React.useCallback(
    (value) => {
      if (pending) return false;

      const message = typeof value === "string" ? value.trim() : "";
      if (!message) return false;
      if (message.length > MAX_USER_MESSAGE_CHARS) {
        setErrorMessage("Your message is longer than this interface allows.");
        return false;
      }

      const userMessage = appendMessage("user", message);
      const history = [...messagesRef.current]
        .slice(-MAX_HISTORY_MESSAGES)
        .map(({ role, content }) => ({ role, content }));
      const requestToken = requestTokenRef.current + 1;
      const requestId = `${mountIdRef.current}-${requestToken}`;
      const activeRequest = {
        claimed: false,
        requestId,
        requestToken,
      };
      requestTokenRef.current = requestToken;
      activeRequestRef.current = activeRequest;

      setDraft("");
      setPending(true);
      setErrorMessage("");
      setResponseSource("pending");
      performAction("thinking");

      const claimRequest = () => {
        if (
          !mountedRef.current ||
          requestTokenRef.current !== requestToken ||
          activeRequestRef.current !== activeRequest
        ) {
          return false;
        }
        activeRequest.claimed = true;
        return true;
      };
      const respond = (payload) => {
        if (!claimRequest()) return false;
        return receiveModelResponse(payload, {
          requestId,
          source: "external",
        });
      };
      const requestEvent = new CustomEvent(MODEL_REQUEST_EVENT, {
        cancelable: true,
        detail: {
          requestId,
          message: userMessage.content,
          history,
          claim: claimRequest,
          respond,
        },
      });
      window.dispatchEvent(requestEvent);
      if (requestEvent.defaultPrevented) claimRequest();

      if (requestTokenRef.current !== requestToken) return true;

      const requestAdapter = window.__metabloomRequest;
      if (typeof requestAdapter === "function") {
        Promise.resolve()
          .then(() =>
            requestAdapter({
              requestId,
              message: userMessage.content,
              history,
            }),
          )
          .then((payload) => {
            if (
              !mountedRef.current
              || requestTokenRef.current !== requestToken
            ) {
              return;
            }
            receiveModelResponse(payload, {
              requestId,
              source: "model",
            });
          })
          .catch(() => {
            if (
              !mountedRef.current
              || requestTokenRef.current !== requestToken
            ) {
              return;
            }
            activeRequestRef.current = null;
            requestTokenRef.current += 1;
            setPending(false);
            setResponseSource("error");
            setErrorMessage(
              "No valid model response was received. Please try again.",
            );
            performAction("sad");
          });
        return true;
      }

      if (activeRequest.claimed) return true;

      previewTimerRef.current = window.setTimeout(() => {
        previewTimerRef.current = 0;
        if (
          !mountedRef.current ||
          requestTokenRef.current !== requestToken ||
          activeRequestRef.current !== activeRequest
        ) {
          return;
        }
        receiveModelResponse(createMetabloomPreviewResponse(message), {
          requestId,
          source: "preview",
        });
      }, PREVIEW_RESPONSE_DELAY_MS);
      return true;
    },
    [appendMessage, pending, performAction, receiveModelResponse],
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
    onConversationStateChange?.(conversationStarted);
  }, [conversationStarted, onConversationStateChange]);

  React.useEffect(() => {
    const end = messagesEndRef.current;
    if (end && typeof end.scrollIntoView === "function") {
      end.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, pending]);

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
      ({ id, label, intent, motion, colorway, colors, duration, intensity }) => ({
        id,
        label,
        intent,
        motion,
        colorway,
        colors: [...colors],
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
      version: "1.0.0",
      express: toolExpress,
      sequence: toolSequence,
      talk: toolTalk,
      pulse: toolPulse,
      settle: toolSettle,
      getState: toolGetState,
    });

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
    cancelSequenceTimer,
    getMessages,
    getState,
    performAction,
    playExternalSequence,
    pulse,
    reactToUser,
    receiveModelResponse,
    reset,
    startTalking,
    stop,
    stopTalking,
    toolExpress,
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

  const statusText = pending
    ? "Thinking"
    : sequenceId
      ? "Responding"
      : paused
        ? "Paused"
        : talking
          ? "Speaking"
          : activeAction.label;
  return (
    <section
      id="orb"
      className="metabloom-chat"
      aria-label="Metabloom model chat interface"
      data-conversation-started={conversationStarted ? "true" : "false"}
      data-orb-action={activeAction.id}
      data-orb-action-version={actionVersion}
      data-orb-renderer="creatoros-metabloom"
      data-response-contract="response+actionChain"
    >
      <h1 className="metabloom-chat__sr-only">
        Metabloom model chat interface
      </h1>

      <div className="metabloom-chat__field">
        <MetabloomAvatar
          action={activeAction.id}
          actionVersion={actionVersion}
          duration={actionDuration}
          intensity={actionIntensity}
          isActive={isActive}
          isDark={isDark}
          onFieldStateChange={handleFieldStateChange}
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
            aria-live="polite"
          >
            <span className="metabloom-chat__presence-dot" aria-hidden="true" />
            <span>Metabloom</span>
            <span aria-hidden="true">·</span>
            <span>{statusText}</span>
          </div>

          <div
            className="metabloom-chat__messages"
            role="log"
            aria-live="polite"
            aria-label="Conversation"
            aria-relevant="additions text"
          >
            <div className="metabloom-chat__message-list">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`metabloom-chat__message metabloom-chat__message--${message.role}`}
                  aria-label={`${message.role === "assistant" ? "Metabloom" : "You"} message`}
                >
                  <span className="metabloom-chat__speaker">
                    {message.role === "assistant" ? "Metabloom" : "You"}
                  </span>
                  <div className="metabloom-chat__bubble">
                    <p>{message.content}</p>
                    {message.source === "preview" && (
                      <span className="metabloom-chat__preview-label">
                        Preview response
                      </span>
                    )}
                  </div>
                </article>
              ))}

              {!conversationStarted && (
                <div
                  className="metabloom-chat__suggestions"
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

              {pending && (
                <article
                  className="metabloom-chat__message metabloom-chat__message--assistant"
                  aria-label="Metabloom is thinking"
                >
                  <span className="metabloom-chat__speaker">Metabloom</span>
                  <div className="metabloom-chat__bubble metabloom-chat__typing">
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                    <span className="metabloom-chat__sr-only">Thinking</span>
                  </div>
                </article>
              )}

              <div ref={messagesEndRef} aria-hidden="true" />
            </div>
          </div>

          <div className="metabloom-chat__composer-area">
            {errorMessage && (
              <p className="metabloom-chat__error" role="alert">
                {errorMessage}
              </p>
            )}
            <form
              className="metabloom-chat__composer"
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
                id="metabloom-message"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Message Metabloom"
                rows={1}
                maxLength={MAX_USER_MESSAGE_CHARS}
                disabled={pending}
              />
              <button
                type="submit"
                disabled={pending || !draft.trim()}
                aria-label="Send message"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M12 19V5M6.5 10.5 12 5l5.5 5.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>

      <span className="metabloom-chat__sr-only" aria-live="polite">
        {activeAction.label}: {activeAction.motion}. Maximum response length is
        {` ${MAX_METABLOOM_RESPONSE_CHARS} characters.`}
      </span>
    </section>
  );
};

export default OrbSection;
