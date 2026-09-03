from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, content):
    Path(path).write_text(content, encoding="utf-8")


def replace_once(path, old, new, label):
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    write(path, content.replace(old, new, 1))


def replace_region(path, start_marker, end_marker, replacement, label):
    content = read(path)
    start_count = content.count(start_marker)
    end_count = content.count(end_marker)
    if start_count != 1 or end_count != 1:
        raise SystemExit(
            f"{label}: expected unique markers, found start={start_count}, end={end_count}"
        )
    start = content.index(start_marker)
    end = content.index(end_marker, start)
    write(path, content[:start] + replacement + content[end:])


ORB_CSS = r'''.metabloom-chat {
  --metabloom-chat-ink: var(--aetheris-ink, #201a1b);
  --metabloom-chat-ink-2: var(--aetheris-ink-2, #4c4546);
  --metabloom-chat-muted: var(--aetheris-muted, #7e7576);
  --metabloom-chat-line: var(--aetheris-line, rgba(32, 26, 27, 0.08));
  --metabloom-chat-line-strong: var(
    --aetheris-line-strong,
    rgba(32, 26, 27, 0.15)
  );
  --metabloom-chat-surface: var(
    --aetheris-glass-panel,
    rgba(255, 251, 250, 0.74)
  );
  --metabloom-chat-surface-raised: var(
    --aetheris-glass-panel-raised,
    rgba(255, 253, 252, 0.86)
  );
  --metabloom-chat-control: var(
    --aetheris-glass-surface,
    rgba(255, 252, 251, 0.58)
  );
  --metabloom-chat-edge: rgba(253, 241, 242, 0.62);
  --metabloom-chat-edge-soft: rgba(253, 241, 242, 0.2);
  --metabloom-chat-bottom: rgba(253, 241, 242, 0.84);
  --metabloom-chat-center-half: clamp(15rem, 18vw, 31rem);
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  isolation: isolate;
  color: var(--metabloom-chat-ink);
}

[data-theme="dark"] .metabloom-chat {
  --metabloom-chat-edge: rgba(8, 8, 12, 0.54);
  --metabloom-chat-edge-soft: rgba(8, 8, 12, 0.18);
  --metabloom-chat-bottom: rgba(8, 8, 12, 0.86);
}

.standalone-experience--orb .standalone-experience__grid,
.standalone-experience--orb .standalone-experience__orb-ambient {
  display: none;
}

.metabloom-chat__field,
.metabloom-chat__scrim,
.metabloom-chat__interface {
  position: absolute;
  inset: 0;
}

.metabloom-chat__field {
  z-index: 0;
}

.metabloom-chat__scrim {
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(
      90deg,
      var(--metabloom-chat-edge) 0%,
      var(--metabloom-chat-edge-soft) 18%,
      transparent 39%,
      transparent 61%,
      var(--metabloom-chat-edge-soft) 82%,
      var(--metabloom-chat-edge) 100%
    ),
    linear-gradient(
      180deg,
      transparent 0%,
      transparent 54%,
      var(--metabloom-chat-edge-soft) 78%,
      var(--metabloom-chat-bottom) 100%
    );
}

.metabloom-chat__interface {
  z-index: 2;
  pointer-events: none;
}

.metabloom-chat__shell {
  display: grid;
  min-width: 0;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: 100%;
  height: 100%;
  padding:
    max(9.1rem, calc(env(safe-area-inset-top) + 8rem))
    clamp(1.8rem, 2.8vw, 4.8rem)
    max(1.4rem, env(safe-area-inset-bottom));
}

.metabloom-chat__presence {
  position: relative;
  isolation: isolate;
  justify-self: center;
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 3.4rem;
  padding: 0.55rem 0.95rem;
  overflow: hidden;
  border: 1px solid var(--metabloom-chat-line);
  border-radius: var(--aetheris-radius-pill, 999px);
  color: var(--metabloom-chat-ink-2);
  background: var(--metabloom-chat-control);
  box-shadow:
    var(--aetheris-shadow, 0 1px 3px rgba(0, 0, 0, 0.08)),
    var(--aetheris-glass-specular, inset 0 1px 0 rgba(255, 255, 255, 0.5));
  backdrop-filter: var(--aetheris-glass-blur-chrome, blur(24px));
  -webkit-backdrop-filter: var(--aetheris-glass-blur-chrome, blur(24px));
  font-family: var(--aetheris-font-mono, ui-monospace, monospace);
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0.055em;
  line-height: 1;
  text-transform: uppercase;
  pointer-events: none;
}

.metabloom-chat__presence::after,
.metabloom-chat__composer::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 4;
  border-radius: inherit;
  padding: 1px;
  pointer-events: none;
  background:
    var(--aetheris-glass-ring-veil, linear-gradient(transparent, transparent)),
    var(--aetheris-spectral-border-soft);
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
  opacity: 0.72;
}

.metabloom-chat__presence > * {
  position: relative;
  z-index: 5;
}

.metabloom-chat__presence-dot {
  width: 0.55rem;
  height: 0.55rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--aetheris-spectral);
  box-shadow: 0 0 1rem var(--aetheris-spectral-glow);
}

.metabloom-chat__messages {
  min-width: 0;
  min-height: 0;
  padding: clamp(2.2rem, 6vh, 6rem) 0 1.6rem;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  pointer-events: none;
}

.metabloom-chat__messages::-webkit-scrollbar {
  display: none;
}

.metabloom-chat__message-list {
  display: flex;
  min-width: 0;
  min-height: 100%;
  flex-direction: column;
  gap: 1.35rem;
  padding: 0.2rem 0;
  pointer-events: none;
}

.metabloom-chat__message:first-child {
  margin-top: auto;
}

.metabloom-chat__message {
  display: flex;
  min-width: 0;
  width: min(62rem, 88%);
  flex-direction: column;
  gap: 0.55rem;
  pointer-events: auto;
}

.metabloom-chat__message--assistant {
  align-self: flex-start;
  align-items: flex-start;
}

.metabloom-chat__message--user {
  align-self: flex-end;
  align-items: flex-end;
}

.metabloom-chat__speaker {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0 0.75rem;
  color: var(--metabloom-chat-muted);
  font-family: var(--aetheris-font-mono, ui-monospace, monospace);
  font-size: 0.82rem;
  font-weight: 500;
  letter-spacing: 0.075em;
  line-height: 1.2;
  text-transform: uppercase;
}

.metabloom-chat__speaker::before,
.metabloom-chat__message--user .metabloom-chat__speaker::after {
  content: "";
  width: 0.45rem;
  height: 0.45rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--aetheris-spectral);
  box-shadow: 0 0 0.8rem var(--aetheris-spectral-glow);
}

.metabloom-chat__message--user .metabloom-chat__speaker::before {
  display: none;
}

.metabloom-chat__bubble {
  position: relative;
  isolation: isolate;
  max-width: 100%;
  padding: 1.35rem 1.55rem;
  overflow: hidden;
  border: 1px solid var(--metabloom-chat-line);
  border-radius: var(--aetheris-radius-xl, 18px);
  color: var(--metabloom-chat-ink);
  background: var(--metabloom-chat-surface);
  box-shadow:
    var(--aetheris-shadow, 0 1px 3px rgba(0, 0, 0, 0.08)),
    var(--aetheris-glass-specular, inset 0 1px 0 rgba(255, 255, 255, 0.5));
  backdrop-filter: var(--aetheris-glass-blur, blur(22px));
  -webkit-backdrop-filter: var(--aetheris-glass-blur, blur(22px));
}

.metabloom-chat__bubble::before {
  content: "";
  position: absolute;
  top: 1rem;
  bottom: 1rem;
  left: 0;
  width: 2px;
  border-radius: var(--aetheris-radius-pill, 999px);
  background: var(--aetheris-spectral-v);
  opacity: 0.66;
}

.metabloom-chat__message--user .metabloom-chat__bubble {
  border-color: var(--metabloom-chat-line-strong);
  background: var(--metabloom-chat-surface-raised);
}

.metabloom-chat__message--user .metabloom-chat__bubble::before {
  right: 0;
  left: auto;
  transform: rotate(180deg);
}

.metabloom-chat__bubble > p {
  position: relative;
  z-index: 1;
  margin: 0;
  color: inherit;
  font-family: var(--aetheris-font-sans, ui-sans-serif, sans-serif);
  font-size: clamp(1.3rem, 1.25vw, 1.5rem);
  font-weight: 420;
  letter-spacing: -0.012em;
  line-height: 1.58;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.metabloom-chat__preview-label {
  position: relative;
  z-index: 1;
  display: block;
  margin-top: 0.85rem;
  padding-top: 0.7rem;
  border-top: 1px solid var(--metabloom-chat-line);
  color: var(--metabloom-chat-muted);
  font-family: var(--aetheris-font-mono, ui-monospace, monospace);
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.metabloom-chat__suggestions {
  display: flex;
  align-self: flex-start;
  flex-wrap: wrap;
  gap: 0.65rem;
  max-width: 100%;
  pointer-events: auto;
}

.metabloom-chat__suggestions button {
  position: relative;
  min-height: 4.4rem;
  padding: 0.8rem 1.15rem;
  overflow: hidden;
  border: 1px solid var(--metabloom-chat-line);
  border-radius: var(--aetheris-radius-md, 10px);
  color: var(--metabloom-chat-ink-2);
  background: var(--metabloom-chat-control);
  box-shadow: var(--aetheris-shadow, 0 1px 3px rgba(0, 0, 0, 0.08));
  backdrop-filter: var(--aetheris-glass-blur, blur(22px));
  -webkit-backdrop-filter: var(--aetheris-glass-blur, blur(22px));
  font-family: var(--aetheris-font-mono, ui-monospace, monospace);
  font-size: 0.9rem;
  font-weight: 500;
  letter-spacing: 0.025em;
  line-height: 1.35;
  text-align: left;
  cursor: pointer;
  transition:
    color var(--aetheris-motion-fast, 150ms) var(--aetheris-ease-standard),
    background var(--aetheris-motion-fast, 150ms) var(--aetheris-ease-standard),
    transform var(--aetheris-motion-medium, 240ms) var(--aetheris-ease-spring);
}

.metabloom-chat__suggestions button::before {
  content: "";
  position: absolute;
  top: 18%;
  bottom: 18%;
  left: 0;
  width: 2px;
  border-radius: var(--aetheris-radius-pill, 999px);
  background: var(--aetheris-spectral-v);
  opacity: 0;
  transform: scaleY(0.35);
  transition:
    opacity var(--aetheris-motion-fast, 150ms) var(--aetheris-ease-standard),
    transform var(--aetheris-motion-medium, 240ms) var(--aetheris-ease-spring);
}

.metabloom-chat__suggestions button:hover {
  color: var(--metabloom-chat-ink);
  background: var(--metabloom-chat-surface-raised);
  transform: translateX(2px);
}

.metabloom-chat__suggestions button:hover::before,
.metabloom-chat__suggestions button:focus-visible::before {
  opacity: 1;
  transform: scaleY(1);
}

.metabloom-chat__typing {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 6.2rem;
  min-height: 4.4rem;
}

.metabloom-chat__typing > span:not(.metabloom-chat__sr-only) {
  width: 0.58rem;
  height: 0.58rem;
  border-radius: 50%;
  opacity: 0.38;
  animation: metabloomChatTyping 1.05s ease-in-out infinite;
}

.metabloom-chat__typing > span:nth-child(1) {
  background: #00eeff;
}

.metabloom-chat__typing > span:nth-child(2) {
  background: #ff00ff;
  animation-delay: 140ms;
}

.metabloom-chat__typing > span:nth-child(3) {
  background: #9d00ff;
  animation-delay: 280ms;
}

.metabloom-chat__composer-area {
  display: grid;
  min-width: 0;
  width: min(72rem, 100%);
  justify-self: center;
  gap: 0.65rem;
  pointer-events: auto;
}

.metabloom-chat__error {
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
  padding: 0.7rem 1rem;
  border: 1px solid color-mix(in srgb, #d22c50 44%, transparent);
  border-radius: var(--aetheris-radius-md, 10px);
  color: var(--metabloom-chat-ink);
  background: var(--metabloom-chat-surface-raised);
  box-shadow: var(--aetheris-shadow, 0 1px 3px rgba(0, 0, 0, 0.08));
  font-family: var(--aetheris-font-sans, ui-sans-serif, sans-serif);
  font-size: 1rem;
  line-height: 1.35;
}

.metabloom-chat__composer {
  position: relative;
  isolation: isolate;
  display: grid;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 0.8rem;
  padding: 0.7rem 0.75rem 0.7rem 1.3rem;
  border: 1px solid var(--metabloom-chat-line);
  border-radius: var(--aetheris-radius-xl, 18px);
  background: var(--metabloom-chat-surface);
  box-shadow:
    var(--aetheris-shadow, 0 1px 3px rgba(0, 0, 0, 0.08)),
    var(--aetheris-glass-specular, inset 0 1px 0 rgba(255, 255, 255, 0.5));
  backdrop-filter: var(--aetheris-glass-blur-chrome, blur(24px));
  -webkit-backdrop-filter: var(--aetheris-glass-blur-chrome, blur(24px));
  transition:
    border-color var(--aetheris-motion-fast, 150ms) var(--aetheris-ease-standard),
    box-shadow var(--aetheris-motion-fast, 150ms) var(--aetheris-ease-standard);
}

.metabloom-chat__composer:focus-within {
  border-color: var(--aetheris-focus-line);
  box-shadow:
    var(--aetheris-shadow, 0 1px 3px rgba(0, 0, 0, 0.08)),
    var(--aetheris-glass-specular, inset 0 1px 0 rgba(255, 255, 255, 0.5)),
    var(--aetheris-focus-halo);
}

.metabloom-chat__composer textarea {
  position: relative;
  z-index: 5;
  width: 100%;
  min-width: 0;
  min-height: 4.4rem;
  max-height: 12rem;
  padding: 1rem 0.2rem 0.75rem;
  border: 0;
  outline: 0;
  resize: none;
  field-sizing: content;
  caret-color: var(--aetheris-teal);
  color: var(--metabloom-chat-ink);
  background: transparent;
  font-family: var(--aetheris-font-sans, ui-sans-serif, sans-serif);
  font-size: 1.38rem;
  font-weight: 420;
  letter-spacing: -0.01em;
  line-height: 1.5;
}

.metabloom-chat__composer textarea:focus-visible {
  box-shadow: none;
}

.metabloom-chat__composer textarea::placeholder {
  color: var(--metabloom-chat-muted);
  opacity: 1;
}

.metabloom-chat__composer textarea:disabled {
  cursor: wait;
}

.metabloom-chat__composer button {
  position: relative;
  z-index: 5;
  display: grid;
  width: 4.4rem;
  height: 4.4rem;
  min-width: 4.4rem;
  min-height: 4.4rem;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--aetheris-radius-md, 10px);
  color: var(--metabloom-chat-ink);
  background:
    linear-gradient(
      var(--aetheris-panel-strong),
      var(--aetheris-panel-strong)
    ) padding-box,
    var(--aetheris-spectral-border-soft) border-box;
  box-shadow: 0 0 1.8rem var(--aetheris-spectral-glow);
  font: inherit;
  line-height: 1;
  cursor: pointer;
  transition:
    background var(--aetheris-motion-fast, 150ms) var(--aetheris-ease-standard),
    box-shadow var(--aetheris-motion-fast, 150ms) var(--aetheris-ease-standard),
    opacity var(--aetheris-motion-fast, 150ms) var(--aetheris-ease-standard),
    transform var(--aetheris-motion-medium, 240ms) var(--aetheris-ease-spring);
}

.metabloom-chat__composer button svg {
  width: 1.8rem;
  height: 1.8rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.metabloom-chat__composer button:hover:not(:disabled) {
  background:
    linear-gradient(
      var(--aetheris-panel-raised),
      var(--aetheris-panel-raised)
    ) padding-box,
    var(--aetheris-spectral) border-box;
  box-shadow: 0 0 2.2rem var(--aetheris-spectral-glow-strong);
  transform: translateY(-2px);
}

.metabloom-chat__composer button:disabled {
  opacity: 0.28;
  box-shadow: none;
  cursor: default;
}

.metabloom-chat__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes metabloomChatTyping {
  0%, 70%, 100% {
    opacity: 0.28;
    transform: translateY(0);
  }
  35% {
    opacity: 0.82;
    transform: translateY(-0.3rem);
  }
}

@media (min-width: 1024px) {
  .metabloom-chat__message {
    width: min(
      48rem,
      calc(50% - var(--metabloom-chat-center-half))
    );
  }

  .metabloom-chat__suggestions {
    width: min(
      48rem,
      calc(50% - var(--metabloom-chat-center-half))
    );
  }
}

@media (max-width: 720px) {
  .metabloom-chat__scrim {
    background:
      linear-gradient(
        180deg,
        transparent 0%,
        transparent 42%,
        var(--metabloom-chat-edge-soft) 68%,
        var(--metabloom-chat-bottom) 100%
      ),
      linear-gradient(
        90deg,
        var(--metabloom-chat-edge-soft),
        transparent 20%,
        transparent 80%,
        var(--metabloom-chat-edge-soft)
      );
  }

  .metabloom-chat__shell {
    padding:
      max(7.8rem, calc(env(safe-area-inset-top) + 6.9rem))
      0.8rem
      max(0.8rem, env(safe-area-inset-bottom));
  }

  .metabloom-chat__presence {
    min-height: 3rem;
    padding: 0.5rem 0.8rem;
    font-size: 0.72rem;
  }

  .metabloom-chat__presence > span:nth-child(n + 3) {
    display: none;
  }

  .metabloom-chat__messages {
    padding: 1.3rem 0 1rem;
  }

  .metabloom-chat__message-list {
    gap: 0.95rem;
  }

  .metabloom-chat__message {
    width: min(94%, 58rem);
  }

  .metabloom-chat__speaker {
    font-size: 0.7rem;
  }

  .metabloom-chat__bubble {
    padding: 1rem 1.15rem;
    border-radius: var(--aetheris-radius-lg, 14px);
  }

  .metabloom-chat__bubble > p {
    font-size: 1.18rem;
    line-height: 1.52;
  }

  .metabloom-chat__suggestions {
    display: grid;
    width: 100%;
  }

  .metabloom-chat__suggestions button {
    width: fit-content;
    max-width: 100%;
    min-height: 4rem;
    padding: 0.7rem 1rem;
    font-size: 0.82rem;
  }

  .metabloom-chat__composer {
    gap: 0.5rem;
    padding: 0.5rem 0.55rem 0.5rem 1rem;
    border-radius: var(--aetheris-radius-lg, 14px);
  }

  .metabloom-chat__composer textarea {
    min-height: 4rem;
    padding-top: 0.9rem;
    font-size: 1.23rem;
  }

  .metabloom-chat__composer button {
    width: 4rem;
    height: 4rem;
    min-width: 4rem;
    min-height: 4rem;
  }
}

@media (max-height: 650px) {
  .metabloom-chat__shell {
    grid-template-rows: minmax(0, 1fr) auto;
    padding-top: max(7.1rem, calc(env(safe-area-inset-top) + 6.2rem));
  }

  .metabloom-chat__presence {
    display: none;
  }

  .metabloom-chat__messages {
    padding-top: 0.8rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .metabloom-chat__typing > span:not(.metabloom-chat__sr-only) {
    animation: none;
    opacity: 0.58;
  }

  .metabloom-chat__suggestions button,
  .metabloom-chat__composer,
  .metabloom-chat__composer button {
    transition: none;
  }
}

@media (forced-colors: active) {
  .metabloom-chat__scrim {
    display: none;
  }

  .metabloom-chat__presence,
  .metabloom-chat__bubble,
  .metabloom-chat__suggestions button,
  .metabloom-chat__composer,
  .metabloom-chat__error {
    border: 1px solid CanvasText;
    color: CanvasText;
    background: Canvas;
    box-shadow: none;
  }

  .metabloom-chat__presence::after,
  .metabloom-chat__composer::after,
  .metabloom-chat__bubble::before,
  .metabloom-chat__speaker::before,
  .metabloom-chat__speaker::after,
  .metabloom-chat__suggestions button::before {
    display: none;
  }

  .metabloom-chat__composer button {
    border: 1px solid ButtonText;
    color: ButtonText;
    background: ButtonFace;
  }
}
'''

write("src/components/OrbSection.css", ORB_CSS)

replace_once(
    "src/components/OrbSection.js",
    '''              >
                <span aria-hidden="true">↑</span>
              </button>''',
    '''              >
                <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                  <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
                </svg>
              </button>''',
    "send icon",
)

replace_once(
    "src/components/StandaloneExperiencePage.js",
    '''import React, { lazy, Suspense } from "react";
import ManagedDitherBackground from "./ManagedDitherBackground";''',
    '''import React, { lazy, Suspense } from "react";
import logo from "../assets/icons/logo2026_128.png";
import ManagedDitherBackground from "./ManagedDitherBackground";''',
    "standalone logo import",
)

replace_once(
    "src/components/StandaloneExperiencePage.js",
    '''      style={{
        "--experience-page-bg": isDark ? "#0b0b18" : "#ffffff",
        "--experience-nav-bg": isDark
          ? "rgba(6, 6, 16, 0.84)"
          : "rgba(255, 255, 255, 0.72)",
        "--experience-nav-text": isDark
          ? "rgba(235, 235, 252, 0.9)"
          : "rgba(20, 20, 34, 0.84)",
        "--experience-nav-muted": isDark
          ? "rgba(225, 225, 245, 0.58)"
          : "rgba(20, 20, 34, 0.55)",
      }}''',
    '''      style={{
        "--experience-page-bg": isDark ? "#0b0b18" : "#ffffff",
      }}''',
    "unused standalone navigation variables",
)

replace_once(
    "src/components/StandaloneExperiencePage.js",
    '''        <header className="standalone-experience__header">
          <a href="/" aria-label="Return to Popular Consulting home">
            <span aria-hidden="true">←</span>
            Popular Consulting
          </a>
          <span className="standalone-experience__header-label">
            {config.label}
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "Use light theme" : "Use dark theme"}
          >
            {isDark ? "Light" : "Dark"}
          </button>
        </header>''',
    '''        <nav
          className="standalone-experience__header"
          aria-label="Experience navigation"
        >
          <a
            className="standalone-experience__brand"
            href="/"
            aria-label="Return to Popular Consulting home"
          >
            <img
              className="standalone-experience__brand-logo"
              src={logo}
              alt=""
              aria-hidden="true"
            />
            <span className="standalone-experience__brand-name">
              Popular Consulting
            </span>
          </a>
          <span
            className="standalone-experience__separator"
            aria-hidden="true"
          />
          <span
            className="standalone-experience__route"
            aria-current="page"
          >
            <span
              className="standalone-experience__route-dot"
              aria-hidden="true"
            />
            {config.label}
          </span>
          <button
            className="standalone-experience__theme"
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "Use light theme" : "Use dark theme"}
          >
            {isDark ? (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle
                  cx="12"
                  cy="12"
                  r="4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </nav>''',
    "standalone navigation markup",
)

replace_region(
    "src/components/StandaloneExperiencePage.js",
    "        .standalone-experience__header {\n",
    "        .standalone-experience__content {\n",
    "",
    "remove legacy embedded standalone navigation styles",
)

replace_once(
    "src/components/StandaloneExperiencePage.js",
    '''        @media (max-width: 720px) {
          .standalone-experience__header {
            grid-template-columns: 1fr auto;
          }
          .standalone-experience__header-label {
            display: none;
          }
        }

''',
    "",
    "remove legacy embedded mobile navigation styles",
)

AETHERIS_NAV = r'''/* Standalone experience navigation follows the same compact floating
   construction as the immersive site navigation. */

html body .standalone-experience__header {
  position: fixed;
  top: max(2rem, env(safe-area-inset-top));
  right: auto;
  left: 50%;
  z-index: 1000;
  isolation: isolate;
  display: flex;
  width: max-content;
  max-width: calc(100% - 4.8rem);
  min-height: 5.8rem;
  align-items: center;
  padding: 0.7rem;
  border: 1px solid var(--aetheris-line) !important;
  border-radius: var(--aetheris-radius-pill) !important;
  background: var(--aetheris-glass-surface) !important;
  backdrop-filter: var(--aetheris-glass-blur-chrome) !important;
  -webkit-backdrop-filter: var(--aetheris-glass-blur-chrome) !important;
  box-shadow: var(--aetheris-shadow), var(--aetheris-glass-specular) !important;
  transform: translateX(-50%);
}

html body .standalone-experience__header > * {
  position: relative;
  z-index: 6;
}

html body .standalone-experience__brand {
  display: inline-flex;
  min-height: 4.4rem;
  align-items: center;
  gap: 1rem;
  padding: 0.55rem 1.1rem;
  border: 0 !important;
  border-radius: var(--aetheris-radius-md) !important;
  color: var(--aetheris-ink) !important;
  background: transparent !important;
  box-shadow: none !important;
  font-family: var(--aetheris-font-sans) !important;
  font-size: 1.35rem !important;
  font-weight: 650 !important;
  letter-spacing: -0.02em !important;
  line-height: 1 !important;
  text-decoration: none;
  text-transform: none !important;
  white-space: nowrap;
  transition:
    background var(--aetheris-motion-fast) var(--aetheris-ease-standard),
    transform var(--aetheris-motion-medium) var(--aetheris-ease-spring) !important;
}

html body .standalone-experience__brand:hover {
  color: var(--aetheris-ink) !important;
  background: var(--aetheris-state-layer) !important;
  box-shadow: none !important;
  transform: translateX(2px) !important;
}

html body .standalone-experience__brand-logo {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  object-fit: contain;
}

html body .standalone-experience__brand-name {
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
}

html body .standalone-experience__separator {
  width: 1px;
  height: 1.8rem;
  flex: 0 0 auto;
  margin: 0 0.7rem;
  border-radius: var(--aetheris-radius-pill);
  background: var(--aetheris-spectral-v);
  opacity: 0.62;
}

html body .standalone-experience__route {
  display: inline-flex;
  min-height: 4.4rem;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 1rem;
  border-radius: var(--aetheris-radius-md);
  color: var(--aetheris-ink-2);
  font-family: var(--aetheris-font-mono);
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.065em;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
}

html body .standalone-experience__route-dot {
  width: 4px;
  height: 4px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--aetheris-spectral);
  box-shadow: 0 0 10px var(--aetheris-spectral-glow);
}

html body .standalone-experience__theme {
  position: relative;
  display: grid;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  margin-left: 1.2rem;
  padding: 0;
  place-items: center;
  border: 0 !important;
  border-radius: var(--aetheris-radius-md) !important;
  color: var(--aetheris-ink-2) !important;
  background: transparent !important;
  box-shadow: none !important;
  cursor: pointer;
  transition:
    color var(--aetheris-motion-fast) var(--aetheris-ease-standard),
    background var(--aetheris-motion-fast) var(--aetheris-ease-standard),
    transform var(--aetheris-motion-medium) var(--aetheris-ease-spring) !important;
}

html body .standalone-experience__theme::before {
  content: "";
  position: absolute;
  top: 25%;
  bottom: 25%;
  left: -0.7rem;
  width: 1px;
  border-radius: var(--aetheris-radius-pill);
  background: var(--aetheris-spectral-v);
  opacity: 0.56;
  pointer-events: none;
}

html body .standalone-experience__theme:hover {
  color: var(--aetheris-ink) !important;
  background: radial-gradient(
    circle at center,
    var(--aetheris-state-layer) 0 15px,
    transparent 16px
  ) !important;
  box-shadow: none !important;
  transform: translateX(2px) !important;
}

html body .standalone-experience__theme svg {
  width: 16px;
  height: 16px;
}

html body .standalone-experience__brand:focus-visible,
html body .standalone-experience__theme:focus-visible {
  outline: none !important;
  box-shadow: var(--aetheris-focus-halo) !important;
}

@media (max-width: 720px) {
  html body .standalone-experience__header {
    top: max(1.2rem, env(safe-area-inset-top));
    max-width: calc(100% - 2.4rem);
    min-height: 5.6rem;
    padding: 0.6rem;
  }

  html body .standalone-experience__brand {
    gap: 0.8rem;
    padding: 0.5rem 0.9rem;
    font-size: 1.15rem !important;
  }

  html body .standalone-experience__route {
    padding: 0.5rem 0.8rem;
    font-size: 0.86rem;
  }
}

@media (max-width: 520px) {
  html body .standalone-experience__brand {
    padding-right: 0.7rem;
    padding-left: 0.7rem;
  }

  html body .standalone-experience__brand-name {
    display: none;
  }

  html body .standalone-experience__separator {
    margin-right: 0.45rem;
    margin-left: 0.45rem;
  }

  html body .standalone-experience__route {
    padding-right: 0.7rem;
    padding-left: 0.7rem;
  }

  html body .standalone-experience__theme {
    margin-left: 0.9rem;
  }

  html body .standalone-experience__theme::before {
    left: -0.55rem;
  }
}

@media (forced-colors: active) {
  html body .standalone-experience__header {
    border: 1px solid CanvasText !important;
    background: Canvas !important;
    box-shadow: none !important;
  }

  html body .standalone-experience__header::after,
  html body .standalone-experience__route-dot,
  html body .standalone-experience__separator,
  html body .standalone-experience__theme::before {
    display: none;
  }

  html body .standalone-experience__brand,
  html body .standalone-experience__route,
  html body .standalone-experience__theme {
    color: CanvasText !important;
  }
}

'''

replace_region(
    "src/aetheris-site.css",
    "/* Standalone experience header only. */\n",
    "/* Orb controls only. The orb visual remains owned by OrbSection. */\n",
    AETHERIS_NAV,
    "shared standalone navigation styling",
)

replace_once(
    "src/components/StandaloneExperiencePage.test.js",
    '''    expect(
      screen.getByRole("link", {
        name: "Return to Popular Consulting home",
      }),
    ).toHaveAttribute("href", "/");

    await waitFor(() => {''',
    '''    expect(
      screen.getByRole("link", {
        name: "Return to Popular Consulting home",
      }),
    ).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("navigation", { name: "Experience navigation" }),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".standalone-experience__brand-logo"),
    ).toHaveAttribute("src");
    expect(
      screen.getByRole("button", { name: "Use dark theme" }),
    ).toBeInTheDocument();

    await waitFor(() => {''',
    "standalone navigation rendering test",
)

replace_once(
    "src/__tests__/a11y/07_touch_targets.test.js",
    '''  test('standalone experience header declares >=4.4rem targets', () => {
    const js = fs.readFileSync(
      path.join(__dirname, '../../components/StandaloneExperiencePage.js'),
      'utf8',
    );
    expect(js).toContain('min-height: 4.4rem');
    expect(js).toContain('document.documentElement.style.fontSize = "62.5%"');
  });''',
    '''  test('standalone experience navigation declares >=4.4rem targets', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../aetheris-site.css'),
      'utf8',
    );
    expect(css).toMatch(
      /\.standalone-experience__brand \{[^}]*min-height: 4\.4rem;/,
    );
    expect(css).toMatch(
      /\.standalone-experience__route \{[^}]*min-height: 4\.4rem;/,
    );
    expect(css).toMatch(
      /\.standalone-experience__theme \{[^}]*min-height: 44px;/,
    );

    const js = fs.readFileSync(
      path.join(__dirname, '../../components/StandaloneExperiencePage.js'),
      'utf8',
    );
    expect(js).toContain('document.documentElement.style.fontSize = "62.5%"');
  });''',
    "standalone navigation touch target test",
)

UI_CONTRACT_TEST = r'''import fs from "fs";
import path from "path";

const source = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("Metabloom Aetheris chat interface", () => {
  const orb = source("src/components/OrbSection.js");
  const orbCss = source("src/components/OrbSection.css");
  const standalone = source("src/components/StandaloneExperiencePage.js");
  const aetheris = source("src/aetheris-site.css");

  test("reserves the desktop centre while messages occupy opposing edge lanes", () => {
    expect(orbCss).toContain("@media (min-width: 1024px)");
    expect(orbCss).toContain(
      "--metabloom-chat-center-half: clamp(15rem, 18vw, 31rem);",
    );
    expect(orbCss).toContain(
      "calc(50% - var(--metabloom-chat-center-half))",
    );
    expect(orbCss).toContain(".metabloom-chat__message--assistant");
    expect(orbCss).toContain("align-self: flex-start;");
    expect(orbCss).toContain(".metabloom-chat__message--user");
    expect(orbCss).toContain("align-self: flex-end;");
    expect(orbCss).toContain(".metabloom-chat__shell {\n  display: grid;");
    expect(orbCss).toContain("  width: 100%;");
  });

  test("keeps the field interactive through the empty centre of the chat", () => {
    expect(orbCss).toContain(
      ".metabloom-chat__messages {\n  min-width: 0;",
    );
    expect(orbCss).toContain("  pointer-events: none;");
    expect(orbCss).toContain(
      ".metabloom-chat__message {\n  display: flex;",
    );
    expect(orbCss).toContain("  pointer-events: auto;");
  });

  test("uses the shared Aetheris surface, type, motion, and spectral contracts", () => {
    [
      "var(--aetheris-glass-panel",
      "var(--aetheris-glass-panel-raised",
      "var(--aetheris-glass-specular",
      "var(--aetheris-font-sans",
      "var(--aetheris-font-mono",
      "var(--aetheris-spectral-border-soft)",
      "var(--aetheris-ease-spring)",
    ].forEach((contract) => expect(orbCss).toContain(contract));

    expect(orbCss).not.toContain('"Poppins"');
    expect(orbCss).not.toContain("rgba(18, 20, 31");
  });

  test("uses the project navigation construction rather than a full-width route bar", () => {
    expect(standalone).toContain(
      'import logo from "../assets/icons/logo2026_128.png";',
    );
    expect(standalone).toContain('aria-label="Experience navigation"');
    expect(standalone).toContain(
      'className="standalone-experience__brand-logo"',
    );
    expect(standalone).toContain(
      'className="standalone-experience__theme"',
    );
    expect(standalone).not.toContain('{isDark ? "Light" : "Dark"}');

    expect(aetheris).toContain(
      "html body .standalone-experience__brand {",
    );
    expect(aetheris).toContain(
      "html body .standalone-experience__route-dot {",
    );
    expect(aetheris).toContain("  left: 50%;");
    expect(aetheris).toContain("  width: max-content;");
    expect(aetheris).toContain(
      "radial-gradient(\n    circle at center,\n    var(--aetheris-state-layer) 0 15px,",
    );
  });

  test("keeps all visible conversation controls bounded and icon based", () => {
    expect(orb).toContain('aria-label="Send message"');
    expect(orb).toContain('<svg aria-hidden="true" viewBox="0 0 24 24"');
    expect(orbCss).toContain("  min-width: 4.4rem;");
    expect(orbCss).toContain("  min-height: 4.4rem;");
    expect(orbCss).not.toContain("metabloom-chat__action-chain");
    expect(orbCss).not.toContain("metabloom-chat__composer-note");
  });
});
'''

write(
    "src/components/MetabloomChatVisualContract.test.js",
    UI_CONTRACT_TEST,
)
