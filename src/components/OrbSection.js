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
  MAX_METABLOOM_RESPONSE_CHARS,
  METABLOOM_MODEL_RESPONSE_SCHEMA,
  createMetabloomPreviewResponse,
  parseMetabloomModelResponse,
} from "./metabloomResponseContract";
import "./OrbSection.css";

const DEFAULT_ACTION = getDefaultMetabloomAction().id;
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

const INITIAL_MESSAGES = Object.freeze([
  Object.freeze({
    id: "assistant-introduction",
    role: "assistant",
    content:
      "Ask anything. I will answer here while the Metabloom field carries the emotional rhythm of the response.",
    actionChain: Object.freeze([]),
    source: "interface",
  }),
]);

const SUGGESTED_PROMPTS = Object.freeze([
  "How should this interface feel?",
  "Show me a thoughtful response",
  "Celebrate a small win",
]);

const normalizeDuration = (value) => {
  const duration = Number(value);
  return Number.isFinite(duration)
    ? Math.max(160, Math.min(duration, 8000))
    : 900;
};

const normalizeSequenceSteps = (steps) => {
  if (!Array.isArray(steps)) return [];

  return steps
    .filter((step) => step && typeof step === "object" && !Array.isArray(step))
    .slice(0, 16)
    .map((step) => {
      const formAction = FORM_ACTIONS[step.form];
      const action = resolveMetabloomAction(
        step.action || step.expression || step.name || formAction,
      );
      return action
        ? {
            action: action.id,
            duration: normalizeDuration(step.duration || action.duration),
            talking: Boolean(step.talking),
          }
        : null;
    })
    .filter(Boolean);
};

const clearOwnedGlobal = (name, value) => {
  if (window[name] === value) window[name] = null;
};

const cloneActionChain = (actionChain = []) =>
  actionChain.map(({ action, duration, talking }) => ({
    action,
    duration,
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

const OrbSection = ({ isActive = true }) => {
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
  const hasUserMessage = messages.some((message) => message.role === "user");

  messagesRef.current = messages;
  stateRef.current = {
    action: activeAction.id,
    actionVersion,
    colorway: activeAction.colorway,
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
    (nextAction) => {
      const resolved = resolveMetabloomAction(nextAction);
      if (!resolved) return false;

      clearSequence();
      setActionId(resolved.id);
      setActionVersion((value) => value + 1);
      setTalking(false);
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
    clearSequence();
    setTalking(true);
  }, [clearSequence]);

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
      ({ id, label, intent, motion, colorway, colors, duration }) => ({
        id,
        label,
        intent,
        motion,
        colorway,
        colors: [...colors],
        duration,
      }),
    );
    const expressions = [...METABLOOM_ACTION_IDS];
    const forms = [...LEGACY_FORMS];
    const responseSchema = JSON.parse(
      JSON.stringify(METABLOOM_MODEL_RESPONSE_SCHEMA),
    );

    window.__bhModeActive = false;
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

              {!hasUserMessage && !pending && (
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
                <span aria-hidden="true">↑</span>
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
