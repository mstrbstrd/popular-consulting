import React from "react";
import CreatorOSFieldCanvas from "./CreatorOSFieldCanvas";
import "./CreatorOSFieldCanvas.css";
import {
  getDefaultMetabloomAction,
  resolveMetabloomAction,
} from "./metabloomActions";
import "./MetabloomAvatar.css";

const BURST_FRAGMENTS = Object.freeze([1, 2, 3, 4, 5, 6]);

const MetabloomAvatar = ({
  action = "reform",
  actionVersion = 0,
  isActive = true,
  isDark = false,
  onFieldStateChange,
  onPulse,
  paused = false,
  pulseVersion = 0,
  resetVersion = 0,
  talking = false,
}) => {
  const motionRef = React.useRef(null);
  const actionTimerRef = React.useRef(0);
  const normalizedAction =
    resolveMetabloomAction(action) || getDefaultMetabloomAction();
  const active = isActive && !paused;

  React.useEffect(() => {
    const motion = motionRef.current;
    window.clearTimeout(actionTimerRef.current);
    actionTimerRef.current = 0;
    if (!motion) return undefined;

    motion.classList.remove("is-acting");
    if (!active) return undefined;

    motion.getBoundingClientRect();
    motion.classList.add("is-acting");
    actionTimerRef.current = window.setTimeout(() => {
      motion.classList.remove("is-acting");
      actionTimerRef.current = 0;
    }, normalizedAction.duration);

    return () => {
      window.clearTimeout(actionTimerRef.current);
      actionTimerRef.current = 0;
      motion.classList.remove("is-acting");
    };
  }, [
    actionVersion,
    active,
    normalizedAction.duration,
    normalizedAction.id,
  ]);

  const handleKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onPulse?.();
  };

  const accessibleLabel =
    `Faceless Metabloom avatar expressing ${normalizedAction.label.toLowerCase()}. ` +
    `${normalizedAction.motion}. ${normalizedAction.colorway} colorway.`;

  return (
    <div
      className="metabloom-avatar"
      data-avatar-action={normalizedAction.id}
      data-avatar-action-version={actionVersion}
      data-avatar-active={active ? "true" : "false"}
      data-avatar-colorway={normalizedAction.colorway}
      data-avatar-faceless="true"
      data-avatar-material="creatoros-metabloom"
      data-avatar-talking={talking ? "true" : "false"}
      data-testid="metabloom-avatar"
      role="button"
      tabIndex={0}
      aria-label={`${accessibleLabel} Activate to send a pulse through it.`}
      onClick={onPulse}
      onKeyDown={handleKeyDown}
      style={{
        "--avatar-color-a": normalizedAction.colors[0],
        "--avatar-color-b": normalizedAction.colors[1],
        "--avatar-color-c": normalizedAction.colors[2],
        "--avatar-color-intensity": normalizedAction.intensity,
        "--avatar-action-duration": `${normalizedAction.duration}ms`,
      }}
    >
      <div className="metabloom-avatar__pose">
        <div ref={motionRef} className="metabloom-avatar__motion">
          <div className="metabloom-avatar__blob">
            <div className="metabloom-avatar__field">
              <CreatorOSFieldCanvas
                externalPulseVersion={pulseVersion}
                isDark={isDark}
                metabloomPalette="spectral"
                mode={0}
                onFieldStateChange={onFieldStateChange}
                paused={!active}
                resetVersion={resetVersion}
              />
            </div>
            <span className="metabloom-avatar__colorwash" aria-hidden="true" />
          </div>

          <span className="metabloom-avatar__burst" aria-hidden="true" />
          {BURST_FRAGMENTS.map((fragment) => (
            <span
              key={fragment}
              className={`metabloom-avatar__fragment metabloom-avatar__fragment--${fragment}`}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default MetabloomAvatar;
