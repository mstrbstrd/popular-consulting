import React from "react";
import { useThemeMode } from "../contexts/ThemeContext";
import MetabloomAvatar from "./MetabloomAvatar";
import "./OrbSection.css";

const DEFAULT_EXPRESSION = "happy";
const DEFAULT_FORM = "companion";

const EMOTIONS = Object.freeze([
  Object.freeze({ id: "happy", label: "Happy", emoji: "😊" }),
  Object.freeze({ id: "excited", label: "Excited", emoji: "🤩" }),
  Object.freeze({ id: "sad", label: "Sad", emoji: "😢" }),
  Object.freeze({ id: "surprised", label: "Surprised", emoji: "😮" }),
  Object.freeze({ id: "thinking", label: "Curious", emoji: "🤔" }),
  Object.freeze({ id: "sleepy", label: "Sleepy", emoji: "😴" }),
  Object.freeze({ id: "angry", label: "Grumpy", emoji: "😠" }),
]);

const FORMS = Object.freeze([
  Object.freeze({
    id: "companion",
    label: "Companion",
    description: "Draws its living lobes together into a social form",
  }),
  Object.freeze({
    id: "bloom",
    label: "Bloom",
    description: "Opens the same field into petal-like lobes",
  }),
  Object.freeze({
    id: "focus",
    label: "Focus",
    description: "Raises surface tension into reflective Metalbloom",
  }),
  Object.freeze({
    id: "drift",
    label: "Drift",
    description: "Stretches the living field into a travelling current",
  }),
]);

const SEQUENCES = Object.freeze([
  Object.freeze({
    id: "greet",
    label: "Greet",
    steps: Object.freeze([
      Object.freeze({ expression: "happy", form: "companion", duration: 700 }),
      Object.freeze({ expression: "excited", form: "bloom", duration: 1100 }),
      Object.freeze({ expression: "happy", form: "companion", duration: 1300 }),
    ]),
  }),
  Object.freeze({
    id: "wonder",
    label: "Wonder",
    steps: Object.freeze([
      Object.freeze({ expression: "thinking", form: "focus", duration: 1100 }),
      Object.freeze({ expression: "surprised", form: "bloom", duration: 850 }),
      Object.freeze({ expression: "happy", form: "companion", duration: 1250 }),
    ]),
  }),
  Object.freeze({
    id: "wind-down",
    label: "Wind down",
    steps: Object.freeze([
      Object.freeze({ expression: "happy", form: "drift", duration: 900 }),
      Object.freeze({ expression: "thinking", form: "drift", duration: 900 }),
      Object.freeze({ expression: "sleepy", form: "drift", duration: 1800 }),
    ]),
  }),
]);

const VALID_EXPRESSIONS = new Set(EMOTIONS.map(({ id }) => id));
const VALID_FORMS = new Set(FORMS.map(({ id }) => id));

const normalizeExpression = (value) =>
  VALID_EXPRESSIONS.has(value) ? value : DEFAULT_EXPRESSION;

const normalizeForm = (value) =>
  VALID_FORMS.has(value) ? value : DEFAULT_FORM;

const normalizeDuration = (value) => {
  const duration = Number(value);
  return Number.isFinite(duration)
    ? Math.max(160, Math.min(duration, 8000))
    : 900;
};

const normalizeSequenceSteps = (steps) =>
  Array.isArray(steps)
    ? steps
        .filter((step) => step && typeof step === "object")
        .slice(0, 16)
        .map((step) => ({
          duration: normalizeDuration(step.duration),
          expression: normalizeExpression(step.expression || step.name),
          form: step.form ? normalizeForm(step.form) : null,
          talking: Boolean(step.talking),
        }))
    : [];

const clearOwnedGlobal = (name, value) => {
  if (window[name] === value) window[name] = null;
};

const OrbSection = ({ isActive = true }) => {
  const { isDark } = useThemeMode();
  const sequenceTimerRef = React.useRef(0);
  const sequenceTokenRef = React.useRef(0);
  const [expression, setExpression] = React.useState(DEFAULT_EXPRESSION);
  const [form, setForm] = React.useState(DEFAULT_FORM);
  const [talking, setTalking] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [pulseVersion, setPulseVersion] = React.useState(0);
  const [resetVersion, setResetVersion] = React.useState(0);
  const [sequenceId, setSequenceId] = React.useState(null);
  const [fieldState, setFieldState] = React.useState("forming");

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

  const express = React.useCallback((nextExpression) => {
    clearSequence();
    setExpression(normalizeExpression(nextExpression));
    setTalking(false);
    pulse();
  }, [clearSequence, pulse]);

  const transform = React.useCallback((nextForm) => {
    clearSequence();
    setForm(normalizeForm(nextForm));
    setTalking(false);
    pulse();
  }, [clearSequence, pulse]);

  const stop = React.useCallback(() => {
    clearSequence();
    setTalking(false);
  }, [clearSequence]);

  const reset = React.useCallback(() => {
    clearSequence();
    setExpression(DEFAULT_EXPRESSION);
    setForm(DEFAULT_FORM);
    setTalking(false);
    setPaused(false);
    setResetVersion((value) => value + 1);
    setPulseVersion((value) => value + 1);
  }, [clearSequence]);

  const playSequence = React.useCallback((steps, nextSequenceId = "custom") => {
    const normalizedSteps = normalizeSequenceSteps(steps);
    clearSequence();
    if (normalizedSteps.length === 0) return;

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

      setExpression(step.expression);
      if (step.form) setForm(step.form);
      setTalking(step.talking);
      setPulseVersion((value) => value + 1);
      index += 1;
      sequenceTimerRef.current = window.setTimeout(advance, step.duration);
    };

    advance();
  }, [clearSequence]);

  const playExternalSequence = React.useCallback((steps) => {
    playSequence(steps, "custom");
  }, [playSequence]);

  const startTalking = React.useCallback(() => {
    clearSequence();
    setTalking(true);
    setExpression((current) =>
      current === "sleepy" || current === "angry" ? "happy" : current,
    );
  }, [clearSequence]);

  const stopTalking = React.useCallback(() => {
    setTalking(false);
  }, []);

  const toggleTalking = React.useCallback(() => {
    clearSequence();
    setTalking((value) => !value);
  }, [clearSequence]);

  const handleFieldStateChange = React.useCallback((nextState) => {
    setFieldState(nextState);
  }, []);

  React.useEffect(() => {
    if (isActive) return;
    stop();
  }, [isActive, stop]);

  React.useEffect(() => {
    const expressions = EMOTIONS.map(({ id }) => id);

    window.__bhModeActive = false;
    window.__orbPop = pulse;
    window.__orbExpress = express;
    window.__orbPlaySequence = playExternalSequence;
    window.__orbStop = stop;
    window.__orbReset = reset;
    window.__orbExpressions = expressions;
    window.__orbTalk = startTalking;
    window.__orbStopTalk = stopTalking;

    return () => {
      cancelSequenceTimer();
      clearOwnedGlobal("__orbPop", pulse);
      clearOwnedGlobal("__orbExpress", express);
      clearOwnedGlobal("__orbPlaySequence", playExternalSequence);
      clearOwnedGlobal("__orbStop", stop);
      clearOwnedGlobal("__orbReset", reset);
      clearOwnedGlobal("__orbExpressions", expressions);
      clearOwnedGlobal("__orbTalk", startTalking);
      clearOwnedGlobal("__orbStopTalk", stopTalking);
      window.__bhModeActive = false;
    };
  }, [
    cancelSequenceTimer,
    express,
    playExternalSequence,
    pulse,
    reset,
    startTalking,
    stop,
    stopTalking,
  ]);

  const activeEmotion = EMOTIONS.find(({ id }) => id === expression);
  const activeForm = FORMS.find(({ id }) => id === form);
  const statusText = sequenceId
    ? `Playing ${sequenceId === "custom" ? "custom sequence" : sequenceId}`
    : paused
      ? "Creature paused"
      : talking
        ? `${activeEmotion.label} and speaking`
        : `${activeEmotion.label} · ${activeForm.label} form · ${fieldState}`;

  return (
    <section
      id="orb"
      className="orb-avatar-lab"
      aria-label="Interactive Orb living Metabloom lab"
      data-orb-renderer="living-metabloom"
      data-orb-expression={expression}
      data-orb-form={form}
    >
      <div className="orb-avatar-lab__copy">
        <p className="orb-avatar-lab__eyebrow">
          The field is the character · one bounded draw
        </p>
        <h1>Meet Bloom</h1>
        <p>
          Bloom is not a shell with a texture. Its silhouette, gaze, voice,
          expressions, and transformations are formed by one living Metabloom
          field.
        </p>
        <span
          className="orb-avatar-lab__status"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true" />
          {statusText}
        </span>
      </div>

      <div className="orb-avatar-lab__stage">
        <MetabloomAvatar
          expression={expression}
          form={form}
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

      <div className="orb-avatar-lab__controls">
        <div
          className="orb-pill orb-avatar-lab__control-row"
          role="group"
          aria-label="Living Metabloom forms"
        >
          <span className="orb-avatar-lab__control-label">Form</span>
          {FORMS.map(({ id, label, description }) => (
            <button
              key={id}
              type="button"
              className={form === id ? "is-active" : ""}
              onClick={() => transform(id)}
              aria-label={`Transform Bloom into ${label} form. ${description}`}
              aria-pressed={form === id}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className="orb-pill orb-avatar-lab__control-row orb-avatar-lab__emotion-row"
          role="group"
          aria-label="Orb emotions"
        >
          <span className="orb-avatar-lab__control-label">Mood</span>
          {EMOTIONS.map(({ id, label, emoji }) => (
            <button
              key={id}
              type="button"
              className={expression === id ? "is-active" : ""}
              onClick={() => express(id)}
              aria-label={`Express ${label.toLowerCase()}`}
              aria-pressed={expression === id}
            >
              <span aria-hidden="true">{emoji}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="orb-avatar-lab__utility-row">
          <div
            className="orb-pill orb-avatar-lab__control-row"
            role="group"
            aria-label="Living Metabloom sequences"
          >
            <span className="orb-avatar-lab__control-label">Sequence</span>
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
            className="orb-pill orb-avatar-lab__control-row orb-avatar-lab__action-row"
            role="group"
            aria-label="Living Metabloom actions"
          >
            <button type="button" onClick={pulse}>
              Pulse
            </button>
            <button
              type="button"
              className={talking ? "is-active" : ""}
              onClick={toggleTalking}
              aria-pressed={talking}
            >
              {talking ? "Quiet" : "Talk"}
            </button>
            <button
              type="button"
              className={paused ? "is-active" : ""}
              onClick={() => setPaused((value) => !value)}
              aria-pressed={paused}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button type="button" onClick={reset}>
              Reset
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default OrbSection;
