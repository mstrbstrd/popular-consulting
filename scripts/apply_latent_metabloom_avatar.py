from pathlib import Path
import json
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return updated


def write(path, content):
    Path(path).write_text(content, encoding="utf-8", newline="\n")


canvas_path = Path("src/components/LivingMetabloomCanvas.js")
canvas = canvas_path.read_text(encoding="utf-8")

canvas = replace_once(
    canvas,
    "const EMOTION_COLOR_DURATION_SECONDS = 6.4;\nconst STATIC_TIME_SECONDS = 18;",
    "const EMOTION_COLOR_DURATION_SECONDS = 6.4;\nconst SPEECH_RELEASE_DURATION_SECONDS = 2.6;\nconst STATIC_TIME_SECONDS = 18;",
    "speech duration constant",
)

canvas = replace_once(
    canvas,
    '''const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));''',
    '''const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

const smoothstep = (minimum, maximum, value) => {
  const normalized = clamp((value - minimum) / (maximum - minimum));
  return normalized * normalized * (3 - 2 * normalized);
};

const responseEnvelope = (age, attackEnd, holdEnd, releaseEnd) => {
  const safeAge = Number.isFinite(age) ? Math.max(0, age) : releaseEnd + 1;
  const attack = smoothstep(0, attackEnd, safeAge);
  const release = 1 - smoothstep(holdEnd, releaseEnd, safeAge);
  return clamp(Math.min(attack, release));
};

export const resolveMetabloomCoherence = ({
  emotionAge,
  energy,
  pulseAge,
  speechAge,
  talking,
}) =>
  clamp(
    Math.max(
      responseEnvelope(emotionAge, 0.09, 2.45, 6.4),
      responseEnvelope(pulseAge, 0.05, 1.2, 4.8) * 0.88,
      talking
        ? 1
        : responseEnvelope(
            speechAge,
            0.03,
            0.18,
            SPEECH_RELEASE_DURATION_SECONDS,
          ) * 0.92,
      smoothstep(0.18, 0.72, energy) * 0.34,
    ),
  );''',
    "coherence envelope helper",
)

canvas = replace_once(
    canvas,
    '''  const normalizedEmotionVersion = normalizePulseVersion(emotionVersion);
  const rootRef = useRef(null);''',
    '''  const normalizedEmotionVersion = normalizePulseVersion(emotionVersion);
  const normalizedPulseVersion = normalizePulseVersion(pulseVersion);
  const rootRef = useRef(null);''',
    "normalized pulse version",
)

canvas = replace_once(
    canvas,
    '''  const expressionResponseRequestRef = useRef(0);
  const emotionVersionRef = useRef(normalizedEmotionVersion);''',
    '''  const expressionResponseRequestRef = useRef(0);
  const speechResponseRequestRef = useRef(0);
  const emotionVersionRef = useRef(normalizedEmotionVersion);''',
    "speech response request ref",
)

canvas = replace_once(
    canvas,
    '''  const externalPulseRequestRef = useRef(normalizePulseVersion(pulseVersion));
  const appliedExternalPulseVersionRef = useRef(
    normalizePulseVersion(pulseVersion),
  );''',
    '''  const externalPulseRequestRef = useRef(normalizedPulseVersion);
  const appliedExternalPulseVersionRef = useRef(normalizedPulseVersion);''',
    "normalized pulse refs",
)

canvas = replace_once(
    canvas,
    '''  const [fallback, setFallback] = useState(!enabled);
  const [contextVersion, setContextVersion] = useState(0);''',
    '''  const [fallback, setFallback] = useState(!enabled);
  const [fallbackResponseVisible, setFallbackResponseVisible] = useState(false);
  const [contextVersion, setContextVersion] = useState(0);''',
    "fallback response state",
)

canvas = replace_once(
    canvas,
    '''  useEffect(() => {
    talkingRef.current = Boolean(talking);
    redrawRef.current();
  }, [talking]);''',
    '''  useEffect(() => {
    const nextTalking = Boolean(talking);
    if (talkingRef.current !== nextTalking) {
      talkingRef.current = nextTalking;
      speechResponseRequestRef.current += 1;
    }
    redrawRef.current();
  }, [talking]);''',
    "speech transition effect",
)

canvas = replace_once(
    canvas,
    '''  useEffect(() => {
    if (emotionVersionRef.current !== normalizedEmotionVersion) {
      emotionVersionRef.current = normalizedEmotionVersion;
      expressionResponseRequestRef.current += 1;
    }
    redrawRef.current();
  }, [normalizedEmotionVersion]);''',
    '''  useEffect(() => {
    if (emotionVersionRef.current !== normalizedEmotionVersion) {
      emotionVersionRef.current = normalizedEmotionVersion;
      if (normalizedEmotionVersion > 0) {
        expressionResponseRequestRef.current += 1;
      }
    }
    redrawRef.current();
  }, [normalizedEmotionVersion]);''',
    "zero-safe emotion response effect",
)

canvas = replace_once(
    canvas,
    '''  useEffect(() => {
    externalPulseRequestRef.current = normalizePulseVersion(pulseVersion);
    redrawRef.current();
  }, [pulseVersion]);

  useEffect(() => {''',
    '''  useEffect(() => {
    externalPulseRequestRef.current = normalizedPulseVersion;
    redrawRef.current();
  }, [normalizedPulseVersion]);

  useEffect(() => {
    if (!fallback) {
      setFallbackResponseVisible(false);
      return undefined;
    }

    if (talking) {
      setFallbackResponseVisible(true);
      return undefined;
    }

    if (normalizedEmotionVersion <= 0 && normalizedPulseVersion <= 0) {
      setFallbackResponseVisible(false);
      return undefined;
    }

    setFallbackResponseVisible(true);
    const responseTimer = window.setTimeout(
      () => setFallbackResponseVisible(false),
      EMOTION_COLOR_DURATION_SECONDS * 1000,
    );
    return () => window.clearTimeout(responseTimer);
  }, [
    fallback,
    normalizedEmotionVersion,
    normalizedPulseVersion,
    talking,
  ]);

  useEffect(() => {''',
    "fallback response lifecycle",
)

canvas = replace_once(
    canvas,
    '''    let pulseAge = PULSE_LIFETIME_SECONDS + 1;
    let emotionAge = EMOTION_COLOR_DURATION_SECONDS + 1;
    let energy = 0;''',
    '''    let pulseAge = PULSE_LIFETIME_SECONDS + 1;
    let emotionAge = EMOTION_COLOR_DURATION_SECONDS + 1;
    let speechAge = SPEECH_RELEASE_DURATION_SECONDS + 1;
    let coherence = 0;
    let energy = 0;''',
    "runtime response ages",
)

canvas = replace_once(
    canvas,
    '''    let appliedExpressionResponseRequest =
      expressionResponseRequestRef.current;''',
    '''    let appliedExpressionResponseRequest =
      expressionResponseRequestRef.current;
    let appliedSpeechResponseRequest = speechResponseRequestRef.current;''',
    "applied speech request",
)

canvas = replace_once(
    canvas,
    '''        "u_pulseAge",
        "u_emotionAge",
        "u_expressionA",''',
    '''        "u_pulseAge",
        "u_emotionAge",
        "u_coherence",
        "u_expressionA",''',
    "coherence uniform collection",
)

canvas = replace_once(
    canvas,
    '''      pulseAge = PULSE_LIFETIME_SECONDS + 1;
      emotionAge = EMOTION_COLOR_DURATION_SECONDS + 1;
      energy = 0;''',
    '''      pulseAge = PULSE_LIFETIME_SECONDS + 1;
      emotionAge = EMOTION_COLOR_DURATION_SECONDS + 1;
      speechAge = SPEECH_RELEASE_DURATION_SECONDS + 1;
      coherence = 0;
      energy = 0;''',
    "reset response ages",
)

canvas = replace_once(
    canvas,
    '''      appliedExpressionResponseRequest =
        expressionResponseRequestRef.current;
      activeState = "forming";
      window.clearTimeout(reducedMotionEmotionTimer);
      onFieldStateChangeRef.current?.("forming");''',
    '''      appliedExpressionResponseRequest =
        expressionResponseRequestRef.current;
      appliedSpeechResponseRequest = speechResponseRequestRef.current;
      appliedExternalPulseVersionRef.current = externalPulseRequestRef.current;
      activeState = "diffusing";
      root.dataset.fieldState = "diffusing";
      window.clearTimeout(reducedMotionEmotionTimer);
      onFieldStateChangeRef.current?.("diffusing");''',
    "latent reset state",
)

canvas = replace_once(
    canvas,
    '''      pulseAge = 0;
      energy = 1;''',
    '''      pulseAge = 0.05;
      energy = 1;''',
    "visible pulse attack",
)

canvas = replace_once(
    canvas,
    '''      appliedExpressionResponseRequest = requestedVersion;
      emotionAge = 0;
      energy = Math.max(energy, 0.48);''',
    '''      appliedExpressionResponseRequest = requestedVersion;
      emotionAge = 0.09;
      energy = Math.max(energy, 0.48);''',
    "visible emotion attack",
)

canvas = replace_once(
    canvas,
    '''      return true;
    };

    const beginExpressionTransition = () => {''',
    '''      return true;
    };

    const applyPendingSpeechResponse = () => {
      const requestedVersion = speechResponseRequestRef.current;
      if (requestedVersion === appliedSpeechResponseRequest) {
        return false;
      }

      appliedSpeechResponseRequest = requestedVersion;
      speechAge = 0.03;
      energy = Math.max(energy, talkingRef.current ? 0.62 : 0.28);
      reportState(talkingRef.current ? "speaking" : "releasing");
      forceRender = true;
      return true;
    };

    const beginExpressionTransition = () => {''',
    "speech response application",
)

canvas = replace_once(
    canvas,
    '''      gl.uniform1f(uniforms.u_energy, energy);
      gl.uniform1f(uniforms.u_seed, seed);''',
    '''      coherence = resolveMetabloomCoherence({
        emotionAge,
        energy,
        pulseAge,
        speechAge,
        talking: talkingRef.current,
      });
      root.dataset.coherence = coherence.toFixed(3);
      root.dataset.anatomy = coherence >= 0.52 ? "present" : "absent";
      gl.uniform1f(uniforms.u_energy, energy);
      gl.uniform1f(uniforms.u_coherence, coherence);
      gl.uniform1f(uniforms.u_seed, seed);''',
    "coherence draw uniform",
)

canvas = regex_once(
    canvas,
    r'''    const updateReportedState = \(\) => \{.*?\n    \};\n\n    const drawStatic = \(\) => \{''',
    '''    const updateReportedState = () => {
      if ((expressionMix < 1 || formMix < 1) && coherence >= 0.12) {
        reportState("organizing");
      } else if (talkingRef.current) {
        reportState("speaking");
      } else if (coherence >= 0.74) {
        reportState("expressing");
      } else if (coherence >= 0.32) {
        reportState("gathering");
      } else if (coherence >= 0.08) {
        reportState("attentive");
      } else if (introElapsed < INTRO_DURATION_SECONDS) {
        reportState("diffusing");
      } else {
        reportState("latent");
      }
    };

    const drawStatic = () => {''',
    "field state reporting",
)

canvas = regex_once(
    canvas,
    r'''    const drawStatic = \(\) => \{.*?\n    \};\n\n    const renderFrame =''',
    '''    const drawStatic = () => {
      applyRestart();
      expressionA = expressionTargetRef.current;
      expressionB = expressionA;
      expressionMix = 1;
      formA = formTargetRef.current;
      formB = formA;
      formMix = 1;
      localTime = STATIC_TIME_SECONDS;
      introElapsed = INTRO_DURATION_SECONDS;
      const emotionChanged = applyPendingEmotionResponse();
      const pulsed = applyPendingPulse();
      const speechChanged = applyPendingSpeechResponse();
      if (emotionChanged) emotionAge = 0.9;
      if (pulsed) {
        pulseAge = 0.34;
        energy = 0.82;
      }
      if (speechChanged) speechAge = talkingRef.current ? 0.18 : 0.9;
      pointer.x = pointer.targetX;
      pointer.y = pointer.targetY;
      draw();
      updateReportedState();
      forceRender = false;
    };

    const renderFrame =''',
    "static coherence draw",
)

canvas = replace_once(
    canvas,
    '''      applyPendingEmotionResponse();
      applyPendingPulse();
      beginExpressionTransition();''',
    '''      applyPendingEmotionResponse();
      applyPendingPulse();
      applyPendingSpeechResponse();
      beginExpressionTransition();''',
    "render speech response",
)

canvas = replace_once(
    canvas,
    '''        emotionAge = Math.min(
          EMOTION_COLOR_DURATION_SECONDS + 1,
          emotionAge + delta,
        );
        energy *= Math.pow(0.958, delta * 60);''',
    '''        emotionAge = Math.min(
          EMOTION_COLOR_DURATION_SECONDS + 1,
          emotionAge + delta,
        );
        speechAge = Math.min(
          SPEECH_RELEASE_DURATION_SECONDS + 1,
          speechAge + delta,
        );
        energy *= Math.pow(0.958, delta * 60);''',
    "advance speech release",
)

canvas = replace_once(
    canvas,
    '''    const reportState = (nextState) => {
      if (activeState === nextState) return;
      activeState = nextState;
      onFieldStateChangeRef.current?.(nextState);
    };''',
    '''    const reportState = (nextState) => {
      root.dataset.fieldState = nextState;
      if (activeState === nextState) return;
      activeState = nextState;
      onFieldStateChangeRef.current?.(nextState);
    };''',
    "field state dataset",
)

canvas = replace_once(
    canvas,
    '''      data-context-recovery="local"
      data-emotion-color-response="transient"
      data-emotion-version={normalizedEmotionVersion}''',
    '''      data-anatomy-lifecycle="event"
      data-context-recovery="local"
      data-emotion-color-response="transient"
      data-emotion-version={normalizedEmotionVersion}
      data-idle-state="latent-fluid"
      data-response-model="coherence-envelope"''',
    "latent model data attributes",
)

canvas = replace_once(
    canvas,
    '''      data-render-scale={RENDER_SCALE}
      aria-hidden="true"
    >''',
    '''      data-render-scale={RENDER_SCALE}
      data-fallback-response={fallbackResponseVisible ? "visible" : "latent"}
      aria-hidden="true"
    >''',
    "fallback response data attribute",
)

canvas = regex_once(
    canvas,
    r'''      \{fallback && \(\n        <div\n          className="living-metabloom-canvas__fallback".*?\n        </div>\n      \)\}''',
    '''      {fallback && (
        <div
          className="living-metabloom-canvas__fallback"
          data-renderer-fallback="css"
        >
          {Array.from({ length: 7 }, (_, index) => (
            <span
              key={`latent-fluid-${index}`}
              className="living-metabloom-canvas__fallback-fluid"
            />
          ))}

          {fallbackResponseVisible && (
            <div
              key={`gesture-${normalizedEmotionVersion}-${normalizedPulseVersion}-${talking}`}
              className="living-metabloom-canvas__fallback-gesture"
            >
              {Array.from({ length: 5 }, (_, index) => (
                <span
                  key={`gesture-mass-${index}`}
                  className="living-metabloom-canvas__fallback-gesture-mass"
                />
              ))}

              {normalizedEmotionVersion > 0 && (
                <span className="living-metabloom-canvas__fallback-emotion" />
              )}

              <div className="living-metabloom-canvas__fallback-face">
                <span className="living-metabloom-canvas__fallback-eye living-metabloom-canvas__fallback-eye--left" />
                <span className="living-metabloom-canvas__fallback-eye living-metabloom-canvas__fallback-eye--right" />
                <span className="living-metabloom-canvas__fallback-mouth" />
                <span className="living-metabloom-canvas__fallback-accent living-metabloom-canvas__fallback-accent--one" />
                <span className="living-metabloom-canvas__fallback-accent living-metabloom-canvas__fallback-accent--two" />
                <span className="living-metabloom-canvas__fallback-accent living-metabloom-canvas__fallback-accent--three" />
              </div>
            </div>
          )}

          {normalizedPulseVersion > 0 && (
            <span
              key={normalizedPulseVersion}
              className="living-metabloom-canvas__fallback-pulse"
            />
          )}
        </div>
      )}''',
    "latent fallback markup",
)

write(canvas_path, canvas)


avatar_path = Path("src/components/MetabloomAvatar.js")
avatar = avatar_path.read_text(encoding="utf-8")
avatar = replace_once(
    avatar,
    '''  expression = "happy",
  form = "companion",
  isActive = true,''',
    '''  expression = "happy",
  fieldState = "latent",
  form = "companion",
  isActive = true,''',
    "avatar field state prop",
)
avatar = replace_once(
    avatar,
    '''  const accessibleLabel =
    `Living Metabloom expressing ${EXPRESSION_LABELS[normalizedExpression]} ` +
    `in its ${FORM_LABELS[normalizedForm]} form` +
    `${talking ? " and speaking" : ""}`;''',
    '''  const isLatent = fieldState === "latent" || fieldState === "diffusing";
  const accessibleLabel = isLatent
    ? "Living Metabloom fluid drifting without a fixed body or face"
    : `Living Metabloom temporarily expressing ${EXPRESSION_LABELS[normalizedExpression]} ` +
      `through its ${FORM_LABELS[normalizedForm]} response pattern` +
      `${talking ? " and speaking" : ""}`;''',
    "avatar latent accessible label",
)
avatar = replace_once(
    avatar,
    '''      data-avatar-expression={normalizedExpression}
      data-avatar-form={normalizedForm}
      data-avatar-material="living-metabloom"
      data-avatar-talking={talking ? "true" : "false"}''',
    '''      data-avatar-anatomy={isLatent ? "absent" : "temporary"}
      data-avatar-expression={normalizedExpression}
      data-avatar-form={normalizedForm}
      data-avatar-material="living-metabloom"
      data-avatar-model="latent-fluid"
      data-avatar-state={fieldState}
      data-avatar-talking={talking ? "true" : "false"}''',
    "avatar latent data attributes",
)
avatar = replace_once(
    avatar,
    '''      aria-label={`${accessibleLabel}. Activate to send a pulse through the creature.`}''',
    '''      aria-label={`${accessibleLabel}. Activate to gather the fluid into a response.`}''',
    "avatar activation label",
)
write(avatar_path, avatar)


orb_path = Path("src/components/OrbSection.js")
orb = orb_path.read_text(encoding="utf-8")
orb = replace_once(
    orb,
    '''    description: "Draws its living lobes together into a social form",''',
    '''    description: "Guides the next reaction toward a social, readable gathering",''',
    "companion response description",
)
orb = replace_once(
    orb,
    '''    description: "Opens the same organism into petal-like lobes",''',
    '''    description: "Guides the next reaction into a radiant petal-like opening",''',
    "bloom response description",
)
orb = replace_once(
    orb,
    '''    description: "Raises surface tension into reflective Metalbloom",''',
    '''    description: "Guides the next reaction into a dense reflective focus",''',
    "focus response description",
)
orb = replace_once(
    orb,
    '''    description: "Stretches the living organism into a travelling current",''',
    '''    description: "Guides the next reaction into a travelling current",''',
    "drift response description",
)
orb = replace_once(
    orb,
    '''const clearOwnedGlobal = (name, value) => {
  if (window[name] === value) window[name] = null;
};

const OrbSection = ({ isActive = true }) => {
  const { isDark } = useThemeMode();''',
    '''const clearOwnedGlobal = (name, value) => {
  if (window[name] === value) window[name] = null;
};

const readOrbCaptureState = () => {
  if (typeof window === "undefined") return null;

  const parameters = new URLSearchParams(window.location.search);
  if (
    parameters.get("visual-capture") !== "orb" ||
    parameters.get("orb-force-webgl") !== "1"
  ) {
    return null;
  }

  const requestedExpression = parameters.get("orb-capture-expression");
  const requestedForm = parameters.get("orb-capture-form");
  const respond = parameters.get("orb-capture-response") === "1";
  return {
    emotionVersion: respond ? 1 : 0,
    expression: VALID_EXPRESSIONS.has(requestedExpression)
      ? requestedExpression
      : DEFAULT_EXPRESSION,
    form: VALID_FORMS.has(requestedForm)
      ? requestedForm
      : DEFAULT_FORM,
    pulseVersion: respond ? 1 : 0,
    talking: respond && parameters.get("orb-capture-talking") === "1",
  };
};

const OrbSection = ({ isActive = true }) => {
  const { isDark } = useThemeMode();
  const captureState = React.useMemo(readOrbCaptureState, []);''',
    "bounded Orb capture state",
)
orb = replace_once(
    orb,
    '''  const [expression, setExpression] = React.useState(DEFAULT_EXPRESSION);
  const [form, setForm] = React.useState(DEFAULT_FORM);
  const [talking, setTalking] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [emotionVersion, setEmotionVersion] = React.useState(0);
  const [pulseVersion, setPulseVersion] = React.useState(0);
  const [resetVersion, setResetVersion] = React.useState(0);
  const [sequenceId, setSequenceId] = React.useState(null);
  const [fieldState, setFieldState] = React.useState("forming");''',
    '''  const [expression, setExpression] = React.useState(
    () => captureState?.expression || DEFAULT_EXPRESSION,
  );
  const [form, setForm] = React.useState(
    () => captureState?.form || DEFAULT_FORM,
  );
  const [talking, setTalking] = React.useState(
    () => captureState?.talking || false,
  );
  const [paused, setPaused] = React.useState(false);
  const [emotionVersion, setEmotionVersion] = React.useState(
    () => captureState?.emotionVersion || 0,
  );
  const [pulseVersion, setPulseVersion] = React.useState(
    () => captureState?.pulseVersion || 0,
  );
  const [resetVersion, setResetVersion] = React.useState(0);
  const [sequenceId, setSequenceId] = React.useState(null);
  const [fieldState, setFieldState] = React.useState("latent");''',
    "latent initial state",
)
orb = replace_once(
    orb,
    '''    setPaused(false);
    setResetVersion((value) => value + 1);
    setPulseVersion((value) => value + 1);''',
    '''    setPaused(false);
    setEmotionVersion(0);
    setPulseVersion(0);
    setResetVersion((value) => value + 1);''',
    "reset to latent fluid",
)
orb = replace_once(
    orb,
    '''  const startTalking = React.useCallback(() => {
    clearSequence();
    setTalking(true);
    const currentExpression = stateRef.current?.expression;
    if (currentExpression === "sleepy" || currentExpression === "angry") {
      setExpression("happy");
      respondWithEmotion();
    }
  }, [clearSequence, respondWithEmotion]);''',
    '''  const startTalking = React.useCallback(() => {
    clearSequence();
    setTalking(true);
    const currentExpression = stateRef.current?.expression;
    if (currentExpression === "sleepy" || currentExpression === "angry") {
      setExpression("happy");
    }
    respondWithEmotion();
  }, [clearSequence, respondWithEmotion]);''',
    "speech gathers fluid",
)
orb = replace_once(
    orb,
    '''  const toggleTalking = React.useCallback(() => {
    clearSequence();
    setTalking((value) => !value);
  }, [clearSequence]);''',
    '''  const toggleTalking = React.useCallback(() => {
    clearSequence();
    const nextTalking = !stateRef.current?.talking;
    setTalking(nextTalking);
    if (nextTalking) respondWithEmotion();
  }, [clearSequence, respondWithEmotion]);''',
    "toggle speech response",
)
orb = replace_once(
    orb,
    '''      if (requestedTalking !== null) setTalking(requestedTalking);
      if (requestedPaused !== null) setPaused(requestedPaused);''',
    '''      if (requestedTalking !== null) {
        setTalking(requestedTalking);
        if (requestedTalking && !requestedExpression) respondWithEmotion();
      }
      if (requestedPaused !== null) setPaused(requestedPaused);''',
    "agent speech response",
)
orb = replace_once(
    orb,
    '''  const statusText = sequenceId
    ? `Playing ${sequenceId === "custom" ? "custom sequence" : sequenceId}`
    : paused
      ? "Creature paused"
      : talking
        ? `${activeEmotion.label} and speaking`
        : `${activeEmotion.label} · ${activeForm.label} form · ${fieldState}`;''',
    '''  const statusText = sequenceId
    ? `Playing ${sequenceId === "custom" ? "custom sequence" : sequenceId}`
    : paused
      ? "Metabloom paused"
      : talking
        ? `${activeEmotion.label} response · speaking`
        : fieldState === "latent" || fieldState === "diffusing"
          ? "Latent fluid · no fixed body or face"
          : `${activeEmotion.label} · ${activeForm.label} pattern · ${fieldState}`;''',
    "latent status text",
)
orb = replace_once(
    orb,
    '''      data-orb-renderer="living-metabloom"
      data-orb-expression={expression}''',
    '''      data-orb-anatomy="transient"
      data-orb-renderer="living-metabloom"
      data-orb-expression={expression}''',
    "transient anatomy section data",
)
orb = replace_once(
    orb,
    '''          One fluid organism · one bounded field
        </p>
        <h1>Meet Bloom</h1>
        <p>
          Bloom&apos;s body, face, gaze, and voice are one fluid Metabloom
          organism. Each feeling changes its physics, floods its material with
          color, then resolves back into its native spectrum.
        </p>''',
    '''          Latent intelligence · anatomy as an event
        </p>
        <h1>Meet Bloom</h1>
        <p>
          Bloom is the Metabloom field itself. At rest it drifts without a
          fixed body or face. Attention, emotion, touch, and speech temporarily
          organize the fluid into a readable response before it dissolves back
          into its native spectrum.
        </p>''',
    "latent Orb copy",
)
orb = replace_once(
    orb,
    '''          emotionVersion={emotionVersion}
          expression={expression}
          form={form}''',
    '''          emotionVersion={emotionVersion}
          expression={expression}
          fieldState={fieldState}
          form={form}''',
    "avatar field state wiring",
)
orb = replace_once(
    orb,
    '''          aria-label="Living Metabloom forms"
        >
          <span className="orb-avatar-lab__control-label">Form</span>''',
    '''          aria-label="Metabloom response patterns"
        >
          <span className="orb-avatar-lab__control-label">Pattern</span>''',
    "response pattern controls",
)
orb = replace_once(
    orb,
    '''              aria-label={`Transform Bloom into ${label} form. ${description}`}''',
    '''              aria-label={`Use the ${label} response pattern. ${description}`}''',
    "response pattern button labels",
)
write(orb_path, orb)


avatar_css_path = Path("src/components/MetabloomAvatar.css")
avatar_css = avatar_css_path.read_text(encoding="utf-8")
avatar_css += '''

/* Latent Metabloom owns no permanent body. The grounding glow concentrates
 * only while the field is gathering into a readable response. */
.metabloom-avatar[data-avatar-state="latent"]::before,
.metabloom-avatar[data-avatar-state="diffusing"]::before {
  right: 12%;
  left: 12%;
  height: 8%;
  opacity: 0.32;
  filter: blur(2rem);
  transform: scaleX(1.34);
}

.metabloom-avatar[data-avatar-state="attentive"]::before {
  opacity: 0.48;
  transform: scaleX(1.22);
}

.metabloom-avatar[data-avatar-state="gathering"]::before,
.metabloom-avatar[data-avatar-state="organizing"]::before,
.metabloom-avatar[data-avatar-state="expressing"]::before,
.metabloom-avatar[data-avatar-state="speaking"]::before {
  opacity: 0.82;
}
'''
write(avatar_css_path, avatar_css)


polish_path = Path("src/components/LivingMetabloomPolish.css")
polish = polish_path.read_text(encoding="utf-8")
polish += r'''

/* The degraded renderer obeys the same ontology as the shader. Its idle
 * material is a dispersed Metabloom field. A body and face only exist inside
 * the short-lived gesture container mounted for a response. */
.living-metabloom-canvas__fallback {
  opacity: 1 !important;
  translate: none !important;
  transform: none !important;
}

.living-metabloom-canvas__fallback-fluid,
.living-metabloom-canvas__fallback-gesture-mass {
  position: absolute;
  display: block;
  border-radius: 48% 52% 46% 54% / 52% 45% 55% 48%;
  background:
    radial-gradient(
      circle at 30% 24%,
      rgba(255, 255, 255, 0.72),
      transparent 18%
    ),
    radial-gradient(
      circle at 62% 70%,
      rgba(0, 238, 255, 0.70),
      transparent 52%
    ),
    linear-gradient(
      135deg,
      rgba(255, 0, 255, 0.86),
      rgba(99, 68, 245, 0.80)
    );
  box-shadow:
    inset 0 0 1.8rem rgba(255, 255, 255, 0.20),
    0 0 2.1rem rgba(99, 68, 245, 0.16);
  mix-blend-mode: multiply;
}

[data-theme="dark"] .living-metabloom-canvas__fallback-fluid,
[data-theme="dark"] .living-metabloom-canvas__fallback-gesture-mass {
  mix-blend-mode: screen;
}

.living-metabloom-canvas__fallback-fluid {
  width: 19%;
  height: 15%;
  opacity: 0.78;
  animation: livingMetabloomLatentDrift 7.8s ease-in-out infinite alternate;
}

.living-metabloom-canvas__fallback-fluid:nth-of-type(1) {
  top: 28%;
  left: 24%;
  width: 25%;
  height: 20%;
  animation-delay: -1.4s;
}

.living-metabloom-canvas__fallback-fluid:nth-of-type(2) {
  top: 24%;
  left: 52%;
  width: 18%;
  height: 16%;
  animation-delay: -4.1s;
}

.living-metabloom-canvas__fallback-fluid:nth-of-type(3) {
  top: 45%;
  left: 18%;
  width: 16%;
  height: 21%;
  animation-delay: -2.5s;
}

.living-metabloom-canvas__fallback-fluid:nth-of-type(4) {
  top: 43%;
  left: 43%;
  width: 27%;
  height: 18%;
  animation-delay: -6.2s;
}

.living-metabloom-canvas__fallback-fluid:nth-of-type(5) {
  top: 60%;
  left: 30%;
  width: 20%;
  height: 14%;
  animation-delay: -3.3s;
}

.living-metabloom-canvas__fallback-fluid:nth-of-type(6) {
  top: 57%;
  left: 58%;
  width: 15%;
  height: 19%;
  animation-delay: -5.2s;
}

.living-metabloom-canvas__fallback-fluid:nth-of-type(7) {
  top: 37%;
  left: 68%;
  width: 11%;
  height: 12%;
  animation-delay: -0.8s;
}

.living-metabloom-canvas__fallback-gesture {
  position: absolute;
  inset: 7%;
  z-index: 4;
  opacity: 0;
  transform: scale(0.72) rotate(-3deg);
  transform-origin: center;
  animation: livingMetabloomGatherGesture 6.4s cubic-bezier(0.16, 1, 0.3, 1)
    both;
}

.living-metabloom-canvas[data-fallback-talking="true"]
  .living-metabloom-canvas__fallback-gesture {
  opacity: 1;
  transform: scale(1);
  animation: none;
}

.living-metabloom-canvas__fallback-gesture-mass {
  top: 50%;
  left: 50%;
  width: 48%;
  height: 44%;
  transform: translate(-50%, -50%);
}

.living-metabloom-canvas__fallback-gesture-mass:nth-of-type(1) {
  width: 62%;
  height: 58%;
}

.living-metabloom-canvas__fallback-gesture-mass:nth-of-type(2) {
  transform: translate(-92%, -76%) rotate(-24deg);
}

.living-metabloom-canvas__fallback-gesture-mass:nth-of-type(3) {
  transform: translate(-8%, -80%) rotate(30deg);
}

.living-metabloom-canvas__fallback-gesture-mass:nth-of-type(4) {
  transform: translate(-94%, -12%) rotate(24deg);
}

.living-metabloom-canvas__fallback-gesture-mass:nth-of-type(5) {
  transform: translate(-6%, -10%) rotate(-28deg);
}

.metabloom-avatar[data-avatar-form="bloom"]
  .living-metabloom-canvas__fallback-gesture {
  transform: scale(1.04);
}

.metabloom-avatar[data-avatar-form="focus"]
  .living-metabloom-canvas__fallback-gesture {
  transform: scaleX(0.74) scaleY(1.22);
}

.metabloom-avatar[data-avatar-form="drift"]
  .living-metabloom-canvas__fallback-gesture {
  transform: rotate(-7deg) scaleX(1.28) scaleY(0.76);
}

@keyframes livingMetabloomLatentDrift {
  0% {
    translate: -8% 5%;
    rotate: -7deg;
    scale: 0.90;
  }

  45% {
    translate: 5% -7%;
    rotate: 5deg;
    scale: 1.04;
  }

  100% {
    translate: 11% 4%;
    rotate: -2deg;
    scale: 0.96;
  }
}

@keyframes livingMetabloomGatherGesture {
  0% {
    opacity: 0;
    transform: scale(0.72) rotate(-3deg);
  }

  8% {
    opacity: 0.96;
    transform: scale(1.04) rotate(1deg);
  }

  42% {
    opacity: 1;
    transform: scale(1);
  }

  76% {
    opacity: 0.92;
    transform: scale(0.98);
  }

  100% {
    opacity: 0;
    transform: scale(0.68) rotate(4deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .living-metabloom-canvas__fallback-fluid {
    animation: none !important;
  }

  .living-metabloom-canvas__fallback-gesture {
    animation-duration: 1ms !important;
  }
}

@media (forced-colors: active) {
  .living-metabloom-canvas__fallback-fluid,
  .living-metabloom-canvas__fallback-gesture-mass {
    background: CanvasText;
    box-shadow: none;
    mix-blend-mode: normal;
  }
}
'''
write(polish_path, polish)


metadata_path = Path("src/content/routeMetadata.json")
metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
metadata["orb"]["description"] = (
    "An interactive Metabloom field by Popular Consulting that drifts without "
    "a fixed body or face, then temporarily organizes into expressive forms "
    "when it reacts."
)
metadata["orb"]["socialDescription"] = (
    "Meet Bloom, a living Metabloom fluid whose body and face emerge only as "
    "temporary gestures of attention, emotion, touch, and speech."
)
write(metadata_path, json.dumps(metadata, indent=2, ensure_ascii=False) + "\n")


claude_path = Path("CLAUDE.md")
claude = claude_path.read_text(encoding="utf-8")
claude = replace_once(
    claude,
    "| `/orb` | `StandaloneExperiencePage` (orb) | noindex; one intrinsic living Metabloom field plus static CSS atmosphere |",
    "| `/orb` | `StandaloneExperiencePage` (orb) | noindex; one latent Metabloom fluid field that temporarily organizes into expressive anatomy plus static CSS atmosphere |",
    "Orb route architecture documentation",
)
write(claude_path, claude)


workflow_path = Path(".github/workflows/orb-review-capture.yml")
workflow = workflow_path.read_text(encoding="utf-8")
workflow = replace_once(
    workflow,
    '''    branches:
      - feature/living-metabloom-creature-20260902''',
    '''    branches:
      - feature/living-metabloom-creature-20260902
      - feature/latent-metabloom-avatar-20260902''',
    "Orb review branch coverage",
)
write(workflow_path, workflow)


capture_path = Path("scripts/capture-orb-review.mjs")
capture = capture_path.read_text(encoding="utf-8")
capture = replace_once(
    capture,
    '''const captureCases = Object.freeze([
  Object.freeze({ id: "orb-mobile", width: 390, height: 844 }),
  Object.freeze({ id: "orb-desktop", width: 1440, height: 900 }),
]);''',
    '''const captureCases = Object.freeze([
  Object.freeze({ id: "orb-mobile-idle", width: 390, height: 844, response: false }),
  Object.freeze({ id: "orb-mobile-response", width: 390, height: 844, response: true }),
  Object.freeze({ id: "orb-desktop-idle", width: 1440, height: 900, response: false }),
  Object.freeze({ id: "orb-desktop-response", width: 1440, height: 900, response: true }),
]);''',
    "latent Orb capture cases",
)
capture = replace_once(
    capture,
    '''    const url = `${origin}/orb?graphics=webgl`;''',
    '''    const parameters = new URLSearchParams({
      graphics: "webgl",
      "orb-force-webgl": "1",
      "visual-capture": "orb",
    });
    if (captureCase.response) {
      parameters.set("orb-capture-response", "1");
      parameters.set("orb-capture-expression", "happy");
      parameters.set("orb-capture-form", "companion");
      parameters.set("orb-capture-talking", "1");
    }
    const url = `${origin}/orb?${parameters.toString()}`;''',
    "capture response query",
)
capture = replace_once(
    capture,
    '''      if (!documentHtml.includes('data-renderer-id="living-metabloom"')) {
        throw new Error(
          `${captureCase.id}: the living Metabloom renderer did not mount.`,
        );
      }''',
    '''      if (!documentHtml.includes('data-renderer-id="living-metabloom"')) {
        throw new Error(
          `${captureCase.id}: the living Metabloom renderer did not mount.`,
        );
      }
      const expectedAnatomy = captureCase.response ? "temporary" : "absent";
      if (!documentHtml.includes(`data-avatar-anatomy="${expectedAnatomy}"`)) {
        throw new Error(
          `${captureCase.id}: expected ${expectedAnatomy} anatomy state was not rendered.`,
        );
      }''',
    "capture anatomy assertion",
)
write(capture_path, capture)


canvas_test_path = Path("src/components/LivingMetabloomCanvas.test.js")
canvas_test = canvas_test_path.read_text(encoding="utf-8")
canvas_test = replace_once(
    canvas_test,
    '''import LivingMetabloomCanvas from "./LivingMetabloomCanvas";''',
    '''import LivingMetabloomCanvas, {
  resolveMetabloomCoherence,
} from "./LivingMetabloomCanvas";''',
    "coherence helper test import",
)
canvas_test = regex_once(
    canvas_test,
    r'''  test\("constructs a bounded asymmetric organism rather than a textured rectangle", \(\) => \{.*?\n  \}\);''',
    '''  test("keeps latent Metabloom fluid free of permanent body geometry", () => {
    const shader = LIVING_METABLOOM_FRAGMENT_SHADER;

    expect(shader).toContain("uniform float u_coherence");
    expect(shader).toContain("for (int index = 0; index < 9; index++)");
    expect(shader).toContain(
      "vec2 center = mix(idleCenter, organizedCenter, organization)",
    );
    expect(shader).toContain("coreField *");
    expect(shader).toContain("organization *");
    expect(shader).toContain("float facePresence =");
    expect(shader).toContain("anatomy *");
    expect(shader).toContain("float metalAmount = focus * organization");
    expect(shader).toContain("fragColor = vec4(0.0)");
    expect(shader).not.toContain("sampler2D");
    expect(shader).not.toContain("texture(");
  });''',
    "latent shader test",
)
canvas_test = regex_once(
    canvas_test,
    r'''  test\("grows the face as relief and cavities in the same material", \(\) => \{.*?\n  \}\);''',
    '''  test("creates anatomy only as a coherence-gated material gesture", () => {
    const shader = LIVING_METABLOOM_FRAGMENT_SHADER;

    expect(shader).toContain("float facialNeed =");
    expect(shader).toContain("float facePresence =");
    expect(shader).toContain("facePresence = max(facePresence, u_talking * 0.98)");
    expect(shader).toContain("float eyeSocket");
    expect(shader).toContain("float mouthCavity");
    expect(shader).toContain("float surfaceHeight =");
    expect(shader).toContain("eyeSocket * 0.078");
    expect(shader).toContain("mouthCavity * 0.100");
    expect(shader).toContain("vec2 gradient = vec2(");
    expect(shader).toContain("vec3 normal = normalize(");
    expect(shader).not.toContain("faceVoid");
  });''',
    "temporary anatomy test",
)
canvas_test = replace_once(
    canvas_test,
    '''    expect(source).toContain("const EMOTION_COLOR_DURATION_SECONDS = 6.4");''',
    '''    expect(source).toContain("const EMOTION_COLOR_DURATION_SECONDS = 6.4");
    expect(source).toContain("const SPEECH_RELEASE_DURATION_SECONDS = 2.6");
    expect(source).toContain("export const resolveMetabloomCoherence");
    expect(source).toContain("gl.uniform1f(uniforms.u_coherence, coherence)");''',
    "coherence source expectations",
)
canvas_test = replace_once(
    canvas_test,
    '''    expect(shader).toContain("float emotionEnvelope=smoothstep(0.0,.20");
    expect(shader).toContain("1.0-smoothstep(2.1,6.4,u_emotionAge)");
    expect(shader).toContain(
      "vec3 materialTint=mix(baseTint,moodTint,emotionEnvelope*.78)",
    );''',
    '''    expect(shader).toContain("float emotionEnvelope =");
    expect(shader).toContain("smoothstep(2.45, 6.4, u_emotionAge)");
    expect(shader).toContain("vec3 materialTint = mix(");''',
    "emotion envelope expectations",
)
canvas_test = replace_once(
    canvas_test,
    '''    expect(shader).toContain("float broadHighlight");
    expect(shader).toContain("float ocularDome");
    expect(shader).toContain("float secondaryEyeSpark");
    expect(shader).toContain("float permanentBlush");
    expect(shader).toContain("float orderedDither=bayer8");
    expect(shader).toContain("float colorLevels=18.0");
    expect(shader).toContain("mix(color,ditheredColor,.90)");
    expect(shader).toContain("float mirror=sat(");
    expect(shader).toContain("vec3 color=mix(gel,metal,focus)");
    expect(shader).toContain("fragColor=vec4(color*alpha,alpha)");''',
    '''    expect(shader).toContain("float broadHighlight");
    expect(shader).toContain("float ocularDome");
    expect(shader).toContain("float eyeSpark");
    expect(shader).toContain("float blush");
    expect(shader).toContain("float orderedDither = bayer8");
    expect(shader).toContain("float colorLevels = 18.0");
    expect(shader).toContain("mix(color, ditheredColor, 0.90)");
    expect(shader).toContain("float mirror = sat(");
    expect(shader).toContain("float metalAmount = focus * organization");
    expect(shader).toContain("fragColor = vec4(color * alpha, alpha)");''',
    "new shader material expectations",
)
canvas_test = replace_once(
    canvas_test,
    '''  test("inherits Metabloom iridescence, fluid lighting, Metalbloom, and premultiplied output", () => {''',
    '''  test("resolves coherence from bounded attack, hold, and release envelopes", () => {
    expect(
      resolveMetabloomCoherence({
        emotionAge: 8,
        energy: 0,
        pulseAge: 8,
        speechAge: 8,
        talking: false,
      }),
    ).toBe(0);
    expect(
      resolveMetabloomCoherence({
        emotionAge: 1,
        energy: 0,
        pulseAge: 8,
        speechAge: 8,
        talking: false,
      }),
    ).toBeGreaterThan(0.9);
    expect(
      resolveMetabloomCoherence({
        emotionAge: 8,
        energy: 1,
        pulseAge: 8,
        speechAge: 8,
        talking: false,
      }),
    ).toBeLessThanOrEqual(0.34);
    expect(
      resolveMetabloomCoherence({
        emotionAge: 8,
        energy: 0,
        pulseAge: 8,
        speechAge: 8,
        talking: true,
      }),
    ).toBe(1);
  });

  test("inherits Metabloom iridescence, fluid lighting, Metalbloom, and premultiplied output", () => {''',
    "coherence helper behavior test",
)
write(canvas_test_path, canvas_test)


orb_test_path = Path("src/components/OrbSection.test.js")
orb_test = orb_test_path.read_text(encoding="utf-8")
orb_test = replace_once(
    orb_test,
    '''      "data-form": props.form,
      "data-paused": String(props.paused),''',
    '''      "data-field-state": props.fieldState,
      "data-form": props.form,
      "data-paused": String(props.paused),''',
    "mock avatar field state",
)
orb_test = replace_once(
    orb_test,
    '''  test("opens as one fluid Metabloom organism with complete mood controls", () => {''',
    '''  test("opens as latent Metabloom fluid with complete response controls", () => {''',
    "latent opening test name",
)
orb_test = replace_once(
    orb_test,
    '''      screen.getByText(/body, face, gaze, and voice are one fluid/i),''',
    '''      screen.getByText(/at rest it drifts without a fixed body or face/i),''',
    "latent opening copy test",
)
orb_test = replace_once(
    orb_test,
    '''    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-form",
      "companion",
    );''',
    '''    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-form",
      "companion",
    );
    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-field-state",
      "latent",
    );''',
    "initial latent field state test",
)
orb_test = replace_once(
    orb_test,
    '''      name: "Living Metabloom forms",''',
    '''      name: "Metabloom response patterns",''',
    "response pattern group test",
)
orb_test = replace_once(
    orb_test,
    '''        name: /transform bloom into focus form/i,''',
    '''        name: /use the focus response pattern/i,''',
    "response pattern button test",
)
orb_test = replace_once(
    orb_test,
    '''    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-talking",
      "false",
    );''',
    '''    expect(screen.getByTestId("metabloom-avatar")).toHaveAttribute(
      "data-talking",
      "false",
    );
    expect(mockAvatarProps.emotionVersion).toBe(0);
    expect(mockAvatarProps.pulseVersion).toBe(0);''',
    "reset returns latent versions",
)
write(orb_test_path, orb_test)


avatar_test_path = Path("src/components/MetabloomAvatar.test.js")
avatar_test = avatar_test_path.read_text(encoding="utf-8")
avatar_test = replace_once(
    avatar_test,
    '''        expression="sad"
        form="drift"''',
    '''        expression="sad"
        fieldState="expressing"
        form="drift"''',
    "avatar expressive field state test input",
)
avatar_test = replace_once(
    avatar_test,
    '''    expect(avatar).toHaveAttribute("data-avatar-material", "living-metabloom");''',
    '''    expect(avatar).toHaveAttribute("data-avatar-material", "living-metabloom");
    expect(avatar).toHaveAttribute("data-avatar-model", "latent-fluid");
    expect(avatar).toHaveAttribute("data-avatar-anatomy", "temporary");
    expect(avatar).toHaveAttribute("data-avatar-state", "expressing");''',
    "avatar state data expectations",
)
avatar_test = replace_once(
    avatar_test,
    '''        expression="thinking"
        form="focus"''',
    '''        expression="thinking"
        fieldState="speaking"
        form="focus"''',
    "avatar speaking state rerender",
)
avatar_test = replace_once(
    avatar_test,
    '''      name: /activate to send a pulse through the creature/i,''',
    '''      name: /activate to gather the fluid into a response/i,''',
    "avatar activation name test",
)
avatar_test = replace_once(
    avatar_test,
    '''  test("pauses the one field when inactive or explicitly paused", () => {''',
    '''  test("describes the idle field without claiming a permanent face", () => {
    render(<MetabloomAvatar fieldState="latent" />);

    const avatar = screen.getByRole("button", {
      name: /drifting without a fixed body or face/i,
    });
    expect(avatar).toHaveAttribute("data-avatar-anatomy", "absent");
    expect(avatar).toHaveAttribute("data-avatar-state", "latent");
  });

  test("pauses the one field when inactive or explicitly paused", () => {''',
    "latent accessible avatar test",
)
write(avatar_test_path, avatar_test)


contract_path = Path("src/components/OrbAvatarRuntimeContract.test.js")
contract = contract_path.read_text(encoding="utf-8")
contract = regex_once(
    contract,
    r'''  test\("one bounded transparent draw owns the complete high-fidelity organism", \(\) => \{.*?\n  \}\);''',
    '''  test("one bounded transparent draw owns both latent fluid and temporary anatomy", () => {
    expect(livingCanvas).toContain("const RENDER_SCALE_BY_PROFILE");
    expect(livingCanvas).toContain("createDitherCanvasCadence({");
    expect(livingCanvas).toContain('rendererId: "living-metabloom"');
    expect(livingCanvas).toContain('contextType: "webgl2"');
    expect(livingCanvas.match(/gl\\.drawArrays/g)).toHaveLength(1);
    expect(livingCanvas).toContain('data-anatomy-lifecycle="event"');
    expect(livingCanvas).toContain('data-idle-state="latent-fluid"');
    expect(livingCanvas).toContain('data-response-model="coherence-envelope"');
    expect(livingCanvas).toContain("gl.deleteBuffer(positionBuffer)");
    expect(livingCanvas).toContain("gl.deleteProgram(program)");

    expect(livingShader).toContain("uniform float u_coherence");
    expect(livingShader).toContain("for (int index = 0; index < 9; index++)");
    expect(livingShader).toContain(
      "vec2 center = mix(idleCenter, organizedCenter, organization)",
    );
    expect(livingShader).toContain("float coreContribution =");
    expect(livingShader).toContain("float facePresence =");
    expect(livingShader).toContain("float metalAmount = focus * organization");
    expect(livingShader).toContain("fragColor = vec4(color * alpha, alpha)");
    expect(livingShader).not.toContain("sampler2D");
    expect(livingShader).not.toContain("texture(");
    expect(livingPolish).toContain("image-rendering: pixelated");
  });''',
    "latent runtime draw contract",
)
contract = regex_once(
    contract,
    r'''  test\("the face is grown as material relief instead of painted over the body", \(\) => \{.*?\n  \}\);''',
    '''  test("the face has no existence outside a coherence-gated material gesture", () => {
    expect(livingShader).toContain("float organization = smoothstep");
    expect(livingShader).toContain("float anatomy = smoothstep");
    expect(livingShader).toContain("float facePresence =");
    expect(livingShader).toContain("anatomy *");
    expect(livingShader).toContain("facePresence = max(facePresence, u_talking * 0.98)");
    expect(livingShader).toContain("float eyeSocket");
    expect(livingShader).toContain("float mouthCavity");
    expect(livingShader).toContain("float surfaceHeight =");
    expect(livingShader).toContain("vec2 gradient = vec2(");
    expect(livingShader).not.toContain("faceVoid");
  });''',
    "temporary face contract",
)
contract = replace_once(
    contract,
    '''      "const EMOTION_COLOR_DURATION_SECONDS = 6.4",''',
    '''      "const EMOTION_COLOR_DURATION_SECONDS = 6.4",''',
    "emotion duration contract anchor",
)
contract = replace_once(
    contract,
    '''    expect(livingShader).toContain("float emotionEnvelope=smoothstep(0.0,.20");
    expect(livingShader).toContain("1.0-smoothstep(2.1,6.4,u_emotionAge)");''',
    '''    expect(livingShader).toContain("float emotionEnvelope =");
    expect(livingShader).toContain("smoothstep(2.45, 6.4, u_emotionAge)");
    expect(livingCanvas).toContain("export const resolveMetabloomCoherence");
    expect(livingCanvas).toContain("gl.uniform1f(uniforms.u_coherence, coherence)");''',
    "coherence color contract",
)
contract = replace_once(
    contract,
    '''    expect(livingShader).toContain("vec2 gaze=clamp(pointer*.18+idleGaze");''',
    '''    expect(livingShader).toContain("vec2 attentionDirection = clamp(");''',
    "attention direction contract",
)
contract = replace_once(
    contract,
    '''    expect(livingShader).toContain("shape=smin(shape,reach,.07+.08*attention)");''',
    '''    expect(livingShader).toContain("field += reachWeight");''',
    "fluid reach contract",
)
contract = replace_once(
    contract,
    '''    expect(livingShader).toContain("float talkCycle");''',
    '''    expect(livingShader).toContain("float talkCycle =");''',
    "talk cycle contract",
)
contract = replace_once(
    contract,
    '''    expect(livingShader).toContain("float heartbeat");''',
    '''    expect(livingShader).toContain("float heartbeat =");''',
    "heartbeat contract",
)
contract = replace_once(
    contract,
    '''    expect(livingShader).toContain("vec3 color=mix(gel,metal,focus)");''',
    '''    expect(livingShader).toContain("vec3 color = mix(gel, metal, metalAmount)");''',
    "organized Metalbloom contract",
)
contract = replace_once(
    contract,
    '''    expect(
      livingCanvas.match(/className="living-metabloom-canvas__fallback-blob"/g),
    ).toHaveLength(5);''',
    '''    expect(
      livingCanvas.match(/className="living-metabloom-canvas__fallback-fluid"/g),
    ).toHaveLength(1);
    expect(livingCanvas).toContain("Array.from({ length: 7 }");
    expect(livingCanvas).toContain("fallbackResponseVisible && (");
    expect(livingCanvas).toContain(
      'className="living-metabloom-canvas__fallback-gesture"',
    );''',
    "latent fallback contract",
)
contract = replace_once(
    contract,
    '''    ["bloom", "focus", "drift"].forEach((form) => {
      expect(livingCss).toContain(`[data-avatar-form="${form}"]`);
    });''',
    '''    ["bloom", "focus", "drift"].forEach((form) => {
      expect(livingPolish).toContain(`[data-avatar-form="${form}"]`);
    });''',
    "fallback response form contract",
)
contract = replace_once(
    contract,
    '''    expect(livingCss).toContain('[data-fallback-talking="true"]');''',
    '''    expect(livingPolish).toContain('[data-fallback-talking="true"]');
    expect(livingPolish).toContain("@keyframes livingMetabloomLatentDrift");
    expect(livingPolish).toContain("@keyframes livingMetabloomGatherGesture");''',
    "fallback speech and lifecycle contract",
)
contract = replace_once(
    contract,
    '''    expect(orb).toContain("orb-avatar-lab__form-row");''',
    '''    expect(orb).toContain("orb-avatar-lab__form-row");
    expect(orb).toContain('aria-label="Metabloom response patterns"');
    expect(orb).toContain(">Pattern</span>");
    expect(orb).toContain('data-orb-anatomy="transient"');''',
    "response pattern control contract",
)
write(contract_path, contract)
