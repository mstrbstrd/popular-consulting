import React from "react";
import { useMetabloomPalette } from "../contexts/MetabloomPaletteContext";
import CreatorOSFieldCanvas from "./CreatorOSFieldCanvas";
import "./CreatorOSFieldCanvas.css";
import {
  getDefaultMetabloomAction,
  resolveMetabloomAction,
} from "./metabloomActions";
import "./MetabloomAvatar.css";

const ACTION_CODES = Object.freeze({
  reform: 0,
  agree: 1,
  disagree: 2,
  happy: 3,
  excited: 4,
  sad: 5,
  surprised: 6,
  thinking: 7,
  sleepy: 8,
  angry: 9,
});

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

const normalizeDuration = (value, fallback) => {
  const duration = Number(value);
  return Number.isFinite(duration)
    ? clamp(duration, 160, 8000)
    : fallback;
};

const normalizeIntensity = (value, fallback) => {
  const intensity = Number(value);
  return Number.isFinite(intensity)
    ? clamp(intensity, 0, 1)
    : fallback;
};

const MetabloomAvatar = ({
  action = "reform",
  actionVersion = 0,
  duration,
  intensity,
  isActive = true,
  isDark = false,
  onFieldStateChange,
  onPulse,
  paused = false,
  pulseVersion = 0,
  resetVersion = 0,
  talking = false,
}) => {
  const metabloomPalette = useMetabloomPalette();
  const normalizedAction =
    resolveMetabloomAction(action) || getDefaultMetabloomAction();
  const active = isActive && !paused;
  const actionCode = ACTION_CODES[normalizedAction.id] ?? ACTION_CODES.reform;
  const actionDuration = normalizeDuration(duration, normalizedAction.duration);
  const actionIntensity = normalizeIntensity(
    intensity,
    normalizedAction.intensity,
  );
  const materialLabel =
    metabloomPalette === "metalbloom" ? "liquid metal" : "spectral fluid";

  const handleKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onPulse?.();
  };

  const accessibleLabel =
    `Faceless Metabloom avatar expressing ${normalizedAction.label.toLowerCase()}. `
    + `${normalizedAction.motion}. ${normalizedAction.colorway} colorway, `
    + `${materialLabel} finish.`;

  return (
    <div
      className="metabloom-avatar"
      data-avatar-action={normalizedAction.id}
      data-avatar-action-version={actionVersion}
      data-avatar-active={active ? "true" : "false"}
      data-avatar-colorway={normalizedAction.colorway}
      data-avatar-duration={actionDuration}
      data-avatar-engine="intrinsic-shader"
      data-avatar-faceless="true"
      data-avatar-finish={metabloomPalette}
      data-avatar-intensity={actionIntensity}
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
      }}
    >
      <CreatorOSFieldCanvas
        externalPulseVersion={pulseVersion}
        isDark={isDark}
        metabloomAvatarAction={actionCode}
        metabloomAvatarColorA={normalizedAction.colors[0]}
        metabloomAvatarColorB={normalizedAction.colors[1]}
        metabloomAvatarColorC={normalizedAction.colors[2]}
        metabloomAvatarDuration={actionDuration}
        metabloomAvatarEnabled
        metabloomAvatarIntensity={actionIntensity}
        metabloomAvatarTalking={talking}
        metabloomAvatarVersion={actionVersion}
        metabloomPalette={metabloomPalette}
        mode={0}
        onFieldStateChange={onFieldStateChange}
        paused={!active}
        resetVersion={resetVersion}
      />
    </div>
  );
};

export default MetabloomAvatar;
