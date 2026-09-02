import React from "react";
import CreatorOSFieldCanvas from "./CreatorOSFieldCanvas";
import "./CreatorOSFieldCanvas.css";
import "./MetabloomAvatar.css";

const EXPRESSION_LABELS = Object.freeze({
  angry: "angry",
  excited: "excited",
  happy: "happy",
  sad: "sad",
  sleepy: "sleepy",
  surprised: "surprised",
  thinking: "curious",
});

const FORM_LABELS = Object.freeze({
  bloom: "bloom",
  companion: "companion",
  drift: "drift",
  focus: "focus",
});

const normalizeExpression = (expression) =>
  Object.prototype.hasOwnProperty.call(EXPRESSION_LABELS, expression)
    ? expression
    : "happy";

const normalizeForm = (form) =>
  Object.prototype.hasOwnProperty.call(FORM_LABELS, form)
    ? form
    : "companion";

const OpenEye = ({ cx, cy = 43, large = false }) => (
  <g className="metabloom-avatar__open-eye">
    <ellipse
      className="metabloom-avatar__eye-white"
      cx={cx}
      cy={cy}
      rx={large ? 10.8 : 9.4}
      ry={large ? 12.4 : 10.8}
    />
    <g className="metabloom-avatar__pupil">
      <ellipse
        className="metabloom-avatar__pupil-core"
        cx={cx}
        cy={cy + 0.8}
        rx={large ? 4.8 : 4.2}
        ry={large ? 5.6 : 4.9}
      />
      <circle
        className="metabloom-avatar__pupil-glint"
        cx={cx - 1.8}
        cy={cy - 2.1}
        r={large ? 1.6 : 1.35}
      />
    </g>
  </g>
);

const HappyEyes = () => (
  <g className="metabloom-avatar__closed-eyes">
    <path d="M22 45 C27 37 36 37 41 45" />
    <path d="M59 45 C64 37 73 37 78 45" />
  </g>
);

const SleepyEyes = () => (
  <g className="metabloom-avatar__closed-eyes metabloom-avatar__closed-eyes--sleepy">
    <path d="M22 44 C28 48 35 48 41 44" />
    <path d="M59 44 C65 48 72 48 78 44" />
  </g>
);

const AngryEyes = () => (
  <g className="metabloom-avatar__angry-eyes">
    <path d="M22 40 L41 46" />
    <path d="M59 46 L78 40" />
    <path d="M24 46 C29 49 35 49 39 45" />
    <path d="M61 45 C65 49 71 49 76 46" />
  </g>
);

const ThinkingEyes = () => (
  <g>
    <OpenEye cx={32} cy={43} />
    <g className="metabloom-avatar__thinking-eye">
      <path d="M60 45 C65 49 72 49 78 44" />
      <path className="metabloom-avatar__brow" d="M59 34 C66 30 73 31 79 35" />
    </g>
  </g>
);

const SadEyes = () => (
  <g>
    <OpenEye cx={32} cy={45} />
    <OpenEye cx={68} cy={45} />
    <path className="metabloom-avatar__brow" d="M22 35 C28 30 35 31 41 36" />
    <path className="metabloom-avatar__brow" d="M59 36 C65 31 72 30 78 35" />
    <path className="metabloom-avatar__tear" d="M74 55 C77 59 78 62 74 65 C70 62 71 59 74 55 Z" />
  </g>
);

const ExpressionEyes = ({ expression }) => {
  if (expression === "happy") return <HappyEyes />;
  if (expression === "sleepy") return <SleepyEyes />;
  if (expression === "angry") return <AngryEyes />;
  if (expression === "thinking") return <ThinkingEyes />;
  if (expression === "sad") return <SadEyes />;

  const large = expression === "excited" || expression === "surprised";
  return (
    <g>
      <OpenEye cx={32} cy={43} large={large} />
      <OpenEye cx={68} cy={43} large={large} />
      {expression === "excited" && (
        <g className="metabloom-avatar__eye-sparkles">
          <path d="M18 29 L20 34 L25 36 L20 38 L18 43 L16 38 L11 36 L16 34 Z" />
          <path d="M82 29 L84 33 L88 35 L84 37 L82 41 L80 37 L76 35 L80 33 Z" />
        </g>
      )}
    </g>
  );
};

const ExpressionMouth = ({ expression, talking }) => {
  if (talking) {
    return (
      <g className="metabloom-avatar__talking-mouth">
        <ellipse cx="50" cy="70" rx="8.5" ry="6.5" />
        <path d="M45 72 C48 75 52 75 55 72" />
      </g>
    );
  }

  if (expression === "excited") {
    return (
      <g className="metabloom-avatar__open-smile">
        <path d="M35 63 C39 79 61 79 65 63 C57 68 43 68 35 63 Z" />
        <path d="M42 72 C47 76 53 76 58 72" />
      </g>
    );
  }

  if (expression === "surprised") {
    return <ellipse className="metabloom-avatar__surprised-mouth" cx="50" cy="70" rx="7" ry="9" />;
  }

  if (expression === "sad") {
    return <path className="metabloom-avatar__mouth-line" d="M38 74 C45 66 55 66 62 74" />;
  }

  if (expression === "angry") {
    return <path className="metabloom-avatar__mouth-line" d="M38 73 C45 67 55 67 62 73" />;
  }

  if (expression === "thinking") {
    return <path className="metabloom-avatar__mouth-line" d="M43 70 C48 67 54 68 59 71" />;
  }

  if (expression === "sleepy") {
    return <path className="metabloom-avatar__mouth-line" d="M45 70 C48 72 52 72 55 70" />;
  }

  return <path className="metabloom-avatar__mouth-line" d="M36 65 C41 76 59 76 64 65" />;
};

const AvatarFace = ({ expression, talking }) => (
  <svg
    className="metabloom-avatar__face"
    viewBox="0 0 100 100"
    aria-hidden="true"
    focusable="false"
  >
    <g key={expression} className="metabloom-avatar__expression">
      <ExpressionEyes expression={expression} />
      <ExpressionMouth expression={expression} talking={talking} />
      {(expression === "happy" || expression === "excited") && (
        <g className="metabloom-avatar__blush">
          <ellipse cx="19" cy="61" rx="6" ry="3" />
          <ellipse cx="81" cy="61" rx="6" ry="3" />
        </g>
      )}
      {expression === "thinking" && (
        <g className="metabloom-avatar__thought-bubbles">
          <circle cx="82" cy="25" r="2.2" />
          <circle cx="88" cy="18" r="3.2" />
          <circle cx="95" cy="10" r="4.4" />
        </g>
      )}
      {expression === "sleepy" && (
        <g className="metabloom-avatar__sleep-marks">
          <path d="M78 29 H88 L78 39 H88" />
          <path d="M87 18 H95 L87 26 H95" />
        </g>
      )}
    </g>
  </svg>
);

const MetabloomAvatar = ({
  expression = "happy",
  form = "companion",
  isActive = true,
  isDark = false,
  onFieldStateChange,
  onPulse,
  paused = false,
  pulseVersion = 0,
  resetVersion = 0,
  talking = false,
}) => {
  const rootRef = React.useRef(null);
  const lookFrameRef = React.useRef(0);
  const pendingLookRef = React.useRef({ x: 0, y: 0 });
  const normalizedExpression = normalizeExpression(expression);
  const normalizedForm = normalizeForm(form);
  const materialPalette = normalizedForm === "focus" ? "metalbloom" : "spectral";

  const commitLook = React.useCallback(() => {
    lookFrameRef.current = 0;
    const root = rootRef.current;
    if (!root) return;

    const { x, y } = pendingLookRef.current;
    root.style.setProperty("--avatar-look-x", `${(x * 2.2).toFixed(2)}px`);
    root.style.setProperty("--avatar-look-y", `${(y * 1.8).toFixed(2)}px`);
    root.style.setProperty("--avatar-tilt-x", `${(-y * 2.4).toFixed(2)}deg`);
    root.style.setProperty("--avatar-tilt-y", `${(x * 3.2).toFixed(2)}deg`);
  }, []);

  const scheduleLook = React.useCallback(() => {
    if (lookFrameRef.current) return;
    lookFrameRef.current = window.requestAnimationFrame(commitLook);
  }, [commitLook]);

  const handlePointerMove = React.useCallback((event) => {
    const root = rootRef.current;
    if (!root) return;

    const bounds = root.getBoundingClientRect();
    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);
    pendingLookRef.current = {
      x: Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / width - 0.5) * 2)),
      y: Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / height - 0.5) * 2)),
    };
    scheduleLook();
  }, [scheduleLook]);

  const resetLook = React.useCallback(() => {
    pendingLookRef.current = { x: 0, y: 0 };
    scheduleLook();
  }, [scheduleLook]);

  React.useEffect(() => () => {
    window.cancelAnimationFrame(lookFrameRef.current);
  }, []);

  const handleKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onPulse?.();
  };

  const accessibleLabel = `${FORM_LABELS[normalizedForm]} Metabloom avatar expressing ${EXPRESSION_LABELS[normalizedExpression]}${talking ? " and speaking" : ""}`;

  return (
    <div
      ref={rootRef}
      className="metabloom-avatar"
      data-avatar-expression={normalizedExpression}
      data-avatar-form={normalizedForm}
      data-avatar-talking={talking ? "true" : "false"}
      data-testid="metabloom-avatar"
      role="button"
      tabIndex={0}
      aria-label={`${accessibleLabel}. Activate to send a pulse through the material.`}
      onClick={onPulse}
      onKeyDown={handleKeyDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetLook}
    >
      <div className="metabloom-avatar__presence" aria-hidden="true">
        <span className="metabloom-avatar__orbit metabloom-avatar__orbit--outer" />
        <span className="metabloom-avatar__orbit metabloom-avatar__orbit--inner" />
        <span className="metabloom-avatar__satellite metabloom-avatar__satellite--one" />
        <span className="metabloom-avatar__satellite metabloom-avatar__satellite--two" />

        <div className="metabloom-avatar__petals">
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="metabloom-avatar__body">
          <div className="metabloom-avatar__material">
            <CreatorOSFieldCanvas
              isDark={isDark}
              metabloomPalette={materialPalette}
              mode={0}
              onFieldStateChange={onFieldStateChange}
              paused={!isActive || paused}
              resetVersion={resetVersion}
            />
          </div>
          <div className="metabloom-avatar__dither-veil" />
          <div className="metabloom-avatar__sheen" />
          <AvatarFace
            expression={normalizedExpression}
            talking={talking}
          />
          <span className="metabloom-avatar__core-mark" />
          {pulseVersion > 0 && (
            <span
              key={pulseVersion}
              className="metabloom-avatar__pulse"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default MetabloomAvatar;
