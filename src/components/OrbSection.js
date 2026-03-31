// OrbSection.js
// Transparent container — DitherBackground renders the sphere (shape 7).
// Includes single-emote buttons and preset chain sequence buttons for testing.

import React from 'react';

const EMOTES = [
  { name: 'happy',     emoji: '😊' },
  { name: 'excited',   emoji: '🤩' },
  { name: 'sad',       emoji: '😢' },
  { name: 'surprised', emoji: '😮' },
  { name: 'thinking',  emoji: '🤔' },
  { name: 'sleepy',    emoji: '😴' },
  { name: 'angry',     emoji: '😠' },
];

const CHAINS = [
  {
    label: '🎭 drama',
    steps: [
      { name: 'surprised', duration: 1200 },
      { name: 'angry',     duration: 1500 },
      { name: 'sad',       duration: 1800 },
    ],
  },
  {
    label: '🤩 hyped',
    steps: [
      { name: 'thinking',  duration: 1000 },
      { name: 'surprised', duration: 800  },
      { name: 'excited',   duration: 2000 },
    ],
  },
  {
    label: '😴 winding down',
    steps: [
      { name: 'happy',    duration: 1200 },
      { name: 'thinking', duration: 1000 },
      { name: 'sleepy',   duration: 2500 },
    ],
  },
  {
    label: '🔄 mood swing',
    steps: [
      { name: 'happy',     duration: 900 },
      { name: 'excited',   duration: 900 },
      { name: 'thinking',  duration: 900 },
      { name: 'sad',       duration: 900 },
      { name: 'angry',     duration: 900 },
      { name: 'surprised', duration: 900 },
    ],
  },
];

const pillStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.1rem',
  padding: '0.55rem 0.8rem',
  background: 'rgba(255, 255, 255, 0.09)',
  backdropFilter: 'blur(32px) saturate(160%)',
  WebkitBackdropFilter: 'blur(32px) saturate(160%)',
  border: '1px solid rgba(255, 255, 255, 0.22)',
  borderRadius: '100px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.30)',
  pointerEvents: 'auto',
};

const btnStyle = {
  background: 'transparent',
  border: 'none',
  borderRadius: '100px',
  padding: '0.35rem 0.75rem',
  cursor: 'pointer',
  fontSize: '1rem',
  color: 'rgba(255,255,255,0.82)',
  fontFamily: "'Poppins', sans-serif",
  fontWeight: 300,
  letterSpacing: '0.03em',
  transition: 'background 0.2s ease, transform 0.15s ease',
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
};

const onEnter = e => {
  e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
  e.currentTarget.style.transform  = 'scale(1.08)';
};
const onLeave = e => {
  e.currentTarget.style.background = 'transparent';
  e.currentTarget.style.transform  = 'scale(1)';
};

const OrbSection = () => {
  // Sphere hit-test in section-relative UV space — matches R2D=0.299 in shader
  const handleClick = (e) => {
    if (e.target !== e.currentTarget) return; // ignore button clicks bubbling up
    const rect   = e.currentTarget.getBoundingClientRect();
    const uvx    = (e.clientX - rect.left) / rect.width;
    const uvy    = (e.clientY - rect.top)  / rect.height;
    const aspect = rect.width / rect.height;
    const dx = (uvx - 0.5) * aspect;
    const dy = uvy - 0.5;
    if (Math.sqrt(dx * dx + dy * dy) < 0.31) window.__orbPop?.();
  };

  return (
  <section
    id="orb"
    aria-label="Interactive Orb — click to animate"
    onClick={handleClick}
    style={{
      position: 'relative',
      width: '100%',
      height: '100vh',
      background: 'transparent',
      cursor: 'crosshair',
    }}
  >
    <div style={{
      position: 'absolute',
      bottom: '2rem',
      left: 0,
      right: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '0.6rem',
      pointerEvents: 'none',
    }}>

      {/* Mode toggle: Orb / CD */}
      <div style={pillStyle}>
        <button
          onClick={() => window.__ditherSetOrb?.()}
          title="orb mode"
          style={{ ...btnStyle, fontSize: '0.85rem' }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          ◉ orb
        </button>
        <span style={{ width: '1px', height: '1.2rem', background: 'rgba(255,255,255,0.18)', margin: '0 0.2rem' }} />
        <button
          onClick={() => window.__ditherSetCD?.(false)}
          title="stationary CD"
          style={{ ...btnStyle, fontSize: '0.85rem', color: 'rgba(180,255,220,0.85)' }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          ◎ CD
        </button>
        <button
          onClick={() => window.__ditherSetCD?.(true)}
          title="spinning CD"
          style={{ ...btnStyle, fontSize: '0.85rem', color: 'rgba(180,255,220,0.85)' }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          ◎ spin
        </button>
      </div>

      {/* Chain sequence buttons */}
      <div style={pillStyle}>
        {CHAINS.map(({ label, steps }) => (
          <button
            key={label}
            onClick={() => window.__orbPlaySequence?.(steps)}
            title={steps.map(s => s.name).join(' → ')}
            style={{ ...btnStyle, fontSize: '0.8rem' }}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
          >
            {label}
          </button>
        ))}
        {/* Divider */}
        <span style={{ width: '1px', height: '1.2rem', background: 'rgba(255,255,255,0.18)', margin: '0 0.2rem' }} />
        {/* Divider */}
        <span style={{ width: '1px', height: '1.2rem', background: 'rgba(255,255,255,0.18)', margin: '0 0.2rem' }} />
        {/* Talk button */}
        <button
          onClick={() => window.__orbTalk?.()}
          title="talk"
          style={{ ...btnStyle, fontSize: '0.8rem', color: 'rgba(180,230,255,0.85)' }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          🗣 talk
        </button>
        <button
          onClick={() => window.__orbStopTalk?.()}
          title="stop talk"
          style={{ ...btnStyle, fontSize: '0.8rem', color: 'rgba(255,180,180,0.85)' }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          🤐 shush
        </button>
        {/* Divider */}
        <span style={{ width: '1px', height: '1.2rem', background: 'rgba(255,255,255,0.18)', margin: '0 0.2rem' }} />
        {/* Loading test */}
        <button
          onClick={() => window.__triggerLoading?.(4000)}
          title="trigger loading overlay"
          style={{ ...btnStyle, fontSize: '0.8rem', color: 'rgba(200,255,200,0.85)' }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          ⏳ loading
        </button>
        {/* Divider */}
        <span style={{ width: '1px', height: '1.2rem', background: 'rgba(255,255,255,0.18)', margin: '0 0.2rem' }} />
        {/* Stop button */}
        <button
          onClick={() => window.__orbStop?.()}
          title="stop"
          style={{ ...btnStyle, fontSize: '0.8rem', color: 'rgba(255,180,180,0.85)' }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          ✕ stop
        </button>
      </div>

      {/* Single emote buttons */}
      <div style={pillStyle} role="group" aria-label="Orb emotions">
        {EMOTES.map(({ name, emoji }) => (
          <button
            key={name}
            onClick={() => window.__orbExpress?.(name)}
            title={name}
            aria-label={`Express ${name}`}
            style={btnStyle}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
          >
            <span aria-hidden="true">{emoji}</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.72 }}>{name}</span>
          </button>
        ))}
      </div>

    </div>
  </section>
  );
};

export default OrbSection;

/* Orb section button focus styles injected via global style */
const orbFocusStyle = document.createElement('style');
orbFocusStyle.textContent = `
  #orb button:focus { outline: none; }
  #orb button:focus-visible {
    outline: 2px solid rgba(255,255,255,0.8);
    outline-offset: 2px;
    border-radius: 6px;
  }
`;
if (typeof document !== 'undefined' && !document.getElementById('orb-focus-style')) {
  orbFocusStyle.id = 'orb-focus-style';
  document.head.appendChild(orbFocusStyle);
}
