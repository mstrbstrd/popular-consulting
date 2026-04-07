// OrbSection.js
// Transparent container — DitherBackground renders the sphere (shape 7).
// Includes single-emote buttons and preset chain sequence buttons for testing.

import React from 'react';
import BlackHoleCanvas from './BlackHoleCanvas';
import { useThemeMode } from '../contexts/ThemeContext';

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

const OrbSection = ({ isActive }) => {
  const { isDark } = useThemeMode();
  const [bhMounted, setBhMounted] = React.useState(false);
  const [bhVisible, setBhVisible] = React.useState(false);
  const popCanvasRef = React.useRef(null);
  const popRafRef = React.useRef(null);
  const bhZoomRef = React.useRef(null); // null = BH controls its own zoom

  const enterBH = React.useCallback(() => {
    window.__ditherSetOrb?.();
    setBhMounted(true);
    requestAnimationFrame(() => setBhVisible(true));
  }, []);

  const exitBH = React.useCallback(() => {
    setBhVisible(false);
  }, []);

  React.useEffect(() => {
    window.__ditherSetBH = enterBH;
    return () => { window.__ditherSetBH = null; };
  }, [enterBH]);

  const handleBHPop = React.useCallback(() => {
    const cvs = popCanvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    cvs.width  = window.innerWidth;
    cvs.height = window.innerHeight;

    const cw = cvs.width, ch = cvs.height;
    const cx = cw * 0.5, cy = ch * 0.5;
    const sr = Math.min(cw, ch) * 0.3;
    const now = () => performance.now() / 1000;
    const hs = (h, s, l, a) => `hsla(${h|0},${s}%,${l}%,${a.toFixed(3)})`;

    const COLLAPSE_DUR  = 0.65;
    const FLASH_DUR     = 0.18;
    const ZOOM_START    = 32.0;
    const ZOOM_END      = 80.0;
    bhZoomRef.current   = ZOOM_START;
    const collapseStart = now();
    let phase = 'collapse';
    let flashStart = 0;
    let live = [];
    let lastT = collapseStart;

    const spawnExplosion = (t0) => {
      const parts = [];
      // More streaks — blackhole tears space harder
      for (let i = 0; i < 22; i++) {
        const ang = (i / 22) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
        const spd = sr * (2.4 + Math.random() * 2.0);
        const life = 0.32 + Math.random() * 0.28;
        const sR = sr * (0.05 + Math.random() * 0.15); // spawn from near-center after collapse
        parts.push({ type:'streak', hue:Math.random()*360, life, maxLife:life, born:t0,
          x:cx+Math.cos(ang)*sR, y:cy+Math.sin(ang)*sR,
          vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd,
          len:sr*(0.22+Math.random()*0.55), angle:ang, width:1.5+Math.random()*2.5 });
      }
      // More drops, bigger radius
      for (let i = 0; i < 42; i++) {
        const ang = Math.random()*Math.PI*2;
        const spd = sr*(1.6+Math.random()*3.0);
        const life = 0.6+Math.random()*0.8;
        parts.push({ type:'drop', hue:Math.random()*360, life, maxLife:life, born:t0,
          x:cx, y:cy,
          vx:Math.cos(ang)*spd*(0.8+Math.random()*0.5), vy:Math.sin(ang)*spd*(0.8+Math.random()*0.5),
          size:2+Math.random()*6, isSquare:Math.random()<0.35,
          gravity:sr*1.4+Math.random()*sr*1.0, drag:0.91+Math.random()*0.05,
          spin:0, spinRate:(Math.random()-0.5)*22 });
      }
      // Sparkles
      for (let i = 0; i < 35; i++) {
        const ang = Math.random()*Math.PI*2;
        const r = sr*(0.02+Math.random()*0.2);
        const life = 0.1+Math.random()*0.28;
        parts.push({ type:'sparkle', hue:Math.random()*360, life, maxLife:life, born:t0,
          x:cx+Math.cos(ang)*r, y:cy+Math.sin(ang)*r,
          vx:(Math.random()-0.5)*sr*1.2, vy:(Math.random()-0.5)*sr*1.2,
          size:3+Math.random()*7, arms:4+Math.floor(Math.random()*4) });
      }
      // Arc ring shockwave — large rings expanding outward
      for (let i = 0; i < 14; i++) {
        const ang = (i/14)*Math.PI*2+Math.random()*0.3;
        const spanRad = (25+Math.random()*45)*Math.PI/180;
        const life = 0.28+Math.random()*0.24;
        const spd2 = sr*(0.8+Math.random()*1.2);
        parts.push({ type:'arc', hue:Math.random()*360, life, maxLife:life, born:t0,
          x:cx, y:cy, r:sr*0.05,
          startAngle:ang-spanRad/2, endAngle:ang+spanRad/2,
          vr:sr*(1.2+Math.random()*1.0),
          vx:Math.cos(ang)*spd2, vy:Math.sin(ang)*spd2, width:2+Math.random()*3 });
      }
      return parts;
    };

    const draw = () => {
      const n = now();
      const dt = Math.min(n - lastT, 1/15);
      lastT = n;
      ctx.clearRect(0, 0, cw, ch);

      if (phase === 'collapse') {
        const elapsed = n - collapseStart;
        const t = Math.min(elapsed / COLLAPSE_DUR, 1);
        const ease = t * t * t; // cubic ease-in — slow start, dramatic finish

        // Zoom camera out rapidly — ease-in so it accelerates toward singularity
        bhZoomRef.current = ZOOM_START + (ZOOM_END - ZOOM_START) * ease;

        // Darkening vignette closing in from edges
        const outerR = Math.sqrt(cw*cw + ch*ch);
        const innerR = outerR * (1 - ease * 1.05);
        const vgGrad = ctx.createRadialGradient(cx, cy, Math.max(0, innerR), cx, cy, outerR);
        vgGrad.addColorStop(0, `rgba(0,0,0,0)`);
        vgGrad.addColorStop(0.4, `rgba(0,0,0,${ease * 0.5})`);
        vgGrad.addColorStop(1, `rgba(0,0,0,${ease * 0.95})`);
        ctx.fillStyle = vgGrad;
        ctx.fillRect(0, 0, cw, ch);

        // Outer contracting ring
        const ring1R = sr * (1.8 - ease * 1.85);
        if (ring1R > 2) {
          ctx.beginPath(); ctx.arc(cx, cy, ring1R, 0, Math.PI*2);
          ctx.strokeStyle = hs(280 + t*80, 100, 75, Math.min(t*2, 1) * 0.9);
          ctx.lineWidth = 2 + ease * 8; ctx.stroke();
        }
        // Inner faster ring
        const ring2R = sr * (1.1 - ease * 1.15);
        if (ring2R > 2 && t > 0.25) {
          const t2 = (t - 0.25) / 0.75;
          ctx.beginPath(); ctx.arc(cx, cy, ring2R, 0, Math.PI*2);
          ctx.strokeStyle = hs(180 + t*120, 100, 90, t2 * 0.7);
          ctx.lineWidth = 1.5 + t2 * 5; ctx.stroke();
        }
        // Singularity core intensifying
        const coreR = sr * (0.35 + ease * 0.15);
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        coreGrad.addColorStop(0, `rgba(255,255,255,${ease * 0.95})`);
        coreGrad.addColorStop(0.3, hs(280, 100, 70, ease * 0.7));
        coreGrad.addColorStop(1, `rgba(0,0,0,0)`);
        ctx.fillStyle = coreGrad; ctx.fillRect(0, 0, cw, ch);

        if (t >= 1) {
          phase = 'flash';
          flashStart = n;
          live = spawnExplosion(n);
          bhZoomRef.current = ZOOM_END; // stay zoomed out through the fade
          exitBH();
          window.__orbPop?.();
        }
        popRafRef.current = requestAnimationFrame(draw);
        return;
      }

      if (phase === 'flash') {
        const ft = Math.min((n - flashStart) / FLASH_DUR, 1);
        // White flash that fades out quickly
        ctx.fillStyle = `rgba(255,255,255,${Math.pow(1 - ft, 2) * 0.95})`;
        ctx.fillRect(0, 0, cw, ch);
        if (ft >= 1) phase = 'explode';
        popRafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Explosion phase — draw particles
      live = live.filter(p => {
        const age = n - p.born;
        if (age >= p.maxLife) return false;
        const t = age / p.maxLife;
        const alpha = Math.pow(1 - t, 1.6);

        if (p.type === 'streak') {
          p.x += p.vx*dt; p.y += p.vy*dt; p.vx *= 0.88; p.vy *= 0.88;
          const tx = p.x - Math.cos(p.angle)*p.len*(1-t*0.4);
          const ty = p.y - Math.sin(p.angle)*p.len*(1-t*0.4);
          const g = ctx.createLinearGradient(tx, ty, p.x, p.y);
          g.addColorStop(0, hs(p.hue,100,70,0));
          g.addColorStop(0.4, hs(p.hue,100,80,alpha*0.5));
          g.addColorStop(1, hs(p.hue,100,95,alpha));
          ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(p.x,p.y);
          ctx.strokeStyle=g; ctx.lineWidth=p.width*(1-t*0.5); ctx.lineCap='round'; ctx.stroke();
          return true;
        }
        if (p.type === 'drop') {
          p.vy += p.gravity*dt; p.vx *= p.drag; p.vy *= p.drag;
          p.x += p.vx*dt; p.y += p.vy*dt; p.spin += p.spinRate*dt;
          ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.spin);
          const glow = ctx.createRadialGradient(0,0,0,0,0,p.size*2.5);
          glow.addColorStop(0, hs(p.hue,100,85,alpha*0.4));
          glow.addColorStop(1, hs(p.hue,100,70,0));
          ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(0,0,p.size*2.5,0,Math.PI*2); ctx.fill();
          ctx.fillStyle=hs(p.hue,100,75,alpha);
          if (p.isSquare) ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);
          else { ctx.beginPath(); ctx.arc(0,0,p.size,0,Math.PI*2); ctx.fill(); }
          ctx.restore(); return true;
        }
        if (p.type === 'sparkle') {
          p.x += p.vx*dt; p.y += p.vy*dt; p.vx *= 0.85; p.vy *= 0.85;
          const pa = Math.min(alpha*1.2,1);
          ctx.save(); ctx.translate(p.x,p.y);
          const oR = p.size*(1-t*0.5), iR = oR*0.35;
          ctx.fillStyle = hs(p.hue,80,97,pa);
          ctx.beginPath();
          for (let j=0; j<p.arms*2; j++) {
            const r2=j%2===0?oR:iR, a2=(j*Math.PI)/p.arms;
            j===0 ? ctx.moveTo(r2*Math.cos(a2),r2*Math.sin(a2)) : ctx.lineTo(r2*Math.cos(a2),r2*Math.sin(a2));
          }
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle=hs(p.hue,60,100,Math.min(pa*0.8,1)); ctx.lineWidth=0.8;
          const g2=oR*1.8;
          ctx.beginPath(); ctx.moveTo(-g2,0); ctx.lineTo(g2,0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0,-g2); ctx.lineTo(0,g2); ctx.stroke();
          ctx.restore(); return true;
        }
        if (p.type === 'arc') {
          p.r += p.vr*dt; p.x += p.vx*dt; p.y += p.vy*dt;
          p.vr *= 0.82; p.vx *= 0.88; p.vy *= 0.88;
          ctx.beginPath(); ctx.arc(p.x,p.y,p.r,p.startAngle,p.endAngle);
          ctx.strokeStyle=hs(p.hue,100,90,alpha*0.9);
          ctx.lineWidth=p.width*(1-t*0.6); ctx.lineCap='round'; ctx.stroke();
          return true;
        }
        return false;
      });

      if (live.length > 0) {
        popRafRef.current = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, cw, ch);
      }
    };

    cancelAnimationFrame(popRafRef.current);
    popRafRef.current = requestAnimationFrame(draw);
  }, [exitBH]);

  React.useEffect(() => {
    if (!isActive) {
      window.__ditherSetOrb?.();
      exitBH();
    }
  }, [isActive, exitBH]);

  React.useEffect(() => {
    return () => cancelAnimationFrame(popRafRef.current);
  }, []);

  // Sphere hit-test in section-relative UV space — matches R2D=0.299 in shader
  const handleClick = (e) => {
    // When BH is active, any click on the canvas or section triggers the pop
    if (bhMounted && bhVisible) {
      handleBHPop();
      return;
    }
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
      height: '100dvh',
      background: 'transparent',
      cursor: 'crosshair',
    }}
  >
    {bhMounted && (
      <BlackHoleCanvas
        isDark={isDark}
        visible={bhVisible}
        zoomRef={bhZoomRef}
        onFadeOutEnd={() => { bhZoomRef.current = null; setBhMounted(false); }}
      />
    )}
    <canvas
      ref={popCanvasRef}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 6,
      }}
    />
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

      {/* Mode toggle: Orb / CD / Black Hole */}
      <div style={pillStyle}>
        <button
          onClick={() => { exitBH(); window.__ditherSetOrb?.(); }}
          title="orb mode"
          style={{ ...btnStyle, fontSize: '0.85rem' }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          ◉ orb
        </button>
        <span style={{ width: '1px', height: '1.2rem', background: 'rgba(255,255,255,0.18)', margin: '0 0.2rem' }} />
        <button
          onClick={() => { exitBH(); window.__ditherSetCD?.(false); }}
          title="stationary CD"
          style={{ ...btnStyle, fontSize: '0.85rem', color: 'rgba(180,255,220,0.85)' }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          ◎ CD
        </button>
        <button
          onClick={() => { exitBH(); window.__ditherSetCD?.(true); }}
          title="spinning CD"
          style={{ ...btnStyle, fontSize: '0.85rem', color: 'rgba(180,255,220,0.85)' }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          ◎ spin
        </button>
        <span style={{ width: '1px', height: '1.2rem', background: 'rgba(255,255,255,0.18)', margin: '0 0.2rem' }} />
        <button
          onClick={enterBH}
          title="black hole"
          style={{ ...btnStyle, fontSize: '0.85rem', color: 'rgba(255,200,120,0.85)' }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          ◈ BH
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
