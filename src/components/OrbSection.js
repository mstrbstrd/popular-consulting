import React from "react";
import { useThemeMode } from "../contexts/ThemeContext";
import MetabloomAvatar from "./MetabloomAvatar";
import {
  METABLOOM_ACTIONS,
  METABLOOM_ACTION_IDS,
  getDefaultMetabloomAction,
  resolveMetabloomAction,
} from "./metabloomActions";
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

const SEQUENCES = Object.freeze([
  Object.freeze({
    id: "greet",
    label: "Greet",
    steps: Object.freeze([
      Object.freeze({ action: "reform", duration: 380 }),
      Object.freeze({ action: "agree", duration: 920 }),
      Object.freeze({ action: "happy", duration: 1080 }),
      Object.freeze({ action: "reform", duration: 900 }),
    ]),
  }),
  Object.freeze({
    id: "consider",
    label: "Consider",
    steps: Object.freeze([
      Object.freeze({ action: "thinking", duration: 1460 }),
      Object.freeze({ action: "surprised", duration: 900 }),
      Object.freeze({ action: "agree", duration: 920 }),
      Object.freeze({ action: "reform", duration: 900 }),
    ]),
  }),
  Object.freeze({
    id: "celebrate",
    label: "Celebrate",
    steps: Object.freeze([
      Object.freeze({ action: "excited", duration: 1320 }),
      Object.freeze({ action: "happy", duration: 1050 }),
      Object.freeze({ action: "agree", duration: 920 }),
      Object.freeze({ action: "reform", duration: 900 }),
    ]),
  }),
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
            duration: normalizeDuration(step.duration),
            talking: Boolean(step.talking),
          }
        : null;
    })
    .filter(Boolean);
};

const clearOwnedGlobal = (name, value) => {
  if (window[name] === value) window[name] = null;
};

const OrbSection = ({ isActive = true }) => {
  const { isDark } = useThemeMode();
  const sequenceTimerRef = React.useRef(0);
  const sequenceTokenRef = React.useRef(0);
  const stateRef = React.useRef(null);
  const [actionId, setActionId] = React.useState(DEFAULT_ACTION);
  const [actionVersion, setActionVersion] = React.useState(0);
  const [talking, setTalking] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [pulseVersion, setPulseVersion] = React.useState(0);
  const [resetVersion, setResetVersion] = React.useState(0);
  const [sequenceId, setSequenceId] = React.useState(null);
  const [fieldState, setFieldState] = React.useState("forming");
  const activeAction =
    resolveMetabloomAction(actionId) || getDefaultMetabloomAction();
  const legacyForm = ACTION_FORMS[activeAction.id] || "companion";

  stateRef.current = {
    action: activeAction.id,
    actionVersion,
    colorway: activeAction.colorway,
    expression: activeAction.id,
    fieldState,
    form: legacyForm,
    motion: activeAction.motion,
    paused,
    pulseVersion,
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
    setActionId(DEFAULT_ACTION);
    setActionVersion((value) => value + 1);
    setTalking(false);
    setPaused(false);
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

  const toggleTalking = React.useCallback(() => {
    clearSequence();
    setTalking((value) => !value);
  }, [clearSequence]);

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

  const getState = React.useCallback(() => ({ ...stateRef.current }), []);

  const handleFieldStateChange = React.useCallback((nextState) => {
    setFieldState(nextState);
  }, []);

  React.useEffect(() => {
    if (isActive) return;
    stop();
  }, [isActive, stop]);

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

    return () => {
      cancelSequenceTimer();
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
      window.__bhModeActive = false;
    };
  }, [
    cancelSequenceTimer,
    getState,
    performAction,
    playExternalSequence,
    pulse,
    reactToUser,
    reset,
    startTalking,
    stop,
    stopTalking,
    transform,
  ]);

  const statusText = sequenceId
    ? `Playing ${sequenceId === "custom" ? "custom sequence" : sequenceId}`
    : paused
      ? "Avatar paused"
      : talking
        ? `${activeAction.label}, speaking through ripples`
        : `${activeAction.label}: ${activeAction.motion}`;

  return (
    <section
      id="orb"
      className="orb-avatar-lab"
      aria-label="Interactive Orb faceless Metabloom avatar lab"
      data-orb-action={activeAction.id}
      data-orb-action-version={actionVersion}
      data-orb-renderer="creatoros-metabloom"
    >
      <div className="orb-avatar-lab__layout">
        <div className="orb-avatar-lab__experience">
          <header className="orb-avatar-lab__copy">
            <p className="orb-avatar-lab__eyebrow">The theme is the body</p>
            <h1>Metabloom, embodied</h1>
            <p>
              The original Metabloom field remains visually intact. It becomes
              a faceless avatar through whole-body gesture and bounded
              chameleon colorways, never eyes, a mouth, or a costume.
            </p>
            <span
              className="orb-avatar-lab__status"
              role="status"
              aria-live="polite"
            >
              <span aria-hidden="true" />
              {statusText}
            </span>
          </header>

          <div className="orb-avatar-lab__stage">
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

          <div className="orb-avatar-lab__control-deck">
            <div
              className="orb-avatar-lab__sequence-row"
              role="group"
              aria-label="Metabloom expression sequences"
            >
              <span>Sequence</span>
              {SEQUENCES.map(({ id, label, steps }) => (
                <button
                  key={id}
                  type="button"
                  className={sequenceId === id ? "is-active" : ""}
                  onClick={() => playSequence(steps, id)}
                  aria-pressed={sequenceId === id}
                >
                  {label}
                </button>
              ))}
            </div>

            <div
              className="orb-avatar-lab__utility-row"
              role="group"
              aria-label="Metabloom avatar controls"
            >
              <button type="button" onClick={pulse}>Pulse</button>
              <button
                type="button"
                className={talking ? "is-active" : ""}
                onClick={toggleTalking}
                aria-pressed={talking}
              >
                {talking ? "Quiet" : "Speak"}
              </button>
              <button
                type="button"
                className={paused ? "is-active" : ""}
                onClick={() => setPaused((value) => !value)}
                aria-pressed={paused}
              >
                {paused ? "Resume" : "Pause"}
              </button>
              <button type="button" onClick={reset}>Reform</button>
            </div>
          </div>
        </div>

        <div className="orb-avatar-lab__language" aria-labelledby="action-language-title">
          <div className="orb-avatar-lab__language-heading">
            <p>Expression vocabulary</p>
            <h2 id="action-language-title">Action language</h2>
            <span>
              Every signal maps one intent to one bounded gesture and one
              colorway.
            </span>
          </div>

          <div
            className="orb-avatar-lab__table-wrap"
            role="group"
            aria-label="Orb emotions"
          >
            <table>
              <caption className="orb-avatar-lab__sr-only">
                Metabloom avatar actions, motions, colorways, and meanings
              </caption>
              <thead>
                <tr>
                  <th scope="col">Signal</th>
                  <th scope="col">Motion</th>
                  <th scope="col">Color</th>
                  <th scope="col">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {METABLOOM_ACTIONS.map((action) => (
                  <tr
                    key={action.id}
                    className={activeAction.id === action.id ? "is-active" : ""}
                  >
                    <th scope="row">
                      <button
                        type="button"
                        onClick={() => performAction(action.id)}
                        aria-label={`Express ${action.label.toLowerCase()}`}
                        aria-pressed={activeAction.id === action.id}
                      >
                        {action.label}
                      </button>
                    </th>
                    <td>{action.motion}</td>
                    <td>
                      <span className="orb-avatar-lab__colorway">
                        <span className="orb-avatar-lab__swatches" aria-hidden="true">
                          {action.colors.map((color) => (
                            <span key={color} style={{ background: color }} />
                          ))}
                        </span>
                        <span>{action.colorway}</span>
                      </span>
                    </td>
                    <td>{action.intent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};

export default OrbSection;
