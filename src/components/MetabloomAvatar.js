import React from "react";
import { hasHardwareWebGL } from "../utils/deviceTier";
import LivingMetabloomCanvas from "./LivingMetabloomCanvas";
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
  bloom: "open bloom",
  companion: "companion",
  drift: "drifting",
  focus: "focused metalbloom",
});

const normalizeExpression = (expression) =>
  Object.prototype.hasOwnProperty.call(EXPRESSION_LABELS, expression)
    ? expression
    : "happy";

const normalizeForm = (form) =>
  Object.prototype.hasOwnProperty.call(FORM_LABELS, form)
    ? form
    : "companion";

const MetabloomAvatar = ({
  emotionVersion = 0,
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
  const normalizedExpression = normalizeExpression(expression);
  const normalizedForm = normalizeForm(form);
  const accessibleLabel =
    `Living Metabloom expressing ${EXPRESSION_LABELS[normalizedExpression]} ` +
    `in its ${FORM_LABELS[normalizedForm]} form` +
    `${talking ? " and speaking" : ""}`;

  const handleKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onPulse?.();
  };

  return (
    <div
      className="metabloom-avatar"
      data-avatar-active={isActive && !paused ? "true" : "false"}
      data-avatar-expression={normalizedExpression}
      data-avatar-form={normalizedForm}
      data-avatar-material="living-metabloom"
      data-avatar-talking={talking ? "true" : "false"}
      data-testid="metabloom-avatar"
      role="button"
      tabIndex={0}
      aria-label={`${accessibleLabel}. Activate to send a pulse through the creature.`}
      onClick={onPulse}
      onKeyDown={handleKeyDown}
    >
      <LivingMetabloomCanvas
        enabled={hasHardwareWebGL}
        emotionVersion={emotionVersion}
        expression={normalizedExpression}
        form={normalizedForm}
        isDark={isDark}
        onFieldStateChange={onFieldStateChange}
        paused={!isActive || paused}
        pulseVersion={pulseVersion}
        resetVersion={resetVersion}
        talking={talking}
      />
    </div>
  );
};

export default MetabloomAvatar;
