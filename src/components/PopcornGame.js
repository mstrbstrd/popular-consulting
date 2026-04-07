import React, { useRef, useEffect, useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const KERNEL_R = 22;
const MAX_KERNELS = 10;
const SPAWN_INTERVAL = 1500;    // ms between spawns
const GOLDEN_INTERVAL = 7000;   // ms between golden kernel appearances
const GAME_DURATION = 30;        // seconds
const POP_ANIM_DURATION = 420;  // ms
const POPPED_LINGER = 3000;     // ms popcorn stays visible before fading
const PARTICLE_COLORS = [
  '#FF6BAE', '#9B72FF', '#52E5A0', '#FFD166',
  '#FF6B6B', '#4FC3F7', '#FFAB40', '#CE93D8',
];
const PASTEL_BG_CENTER = '#FFF8EE';
const PASTEL_BG_EDGE   = '#FFD5EC';

// ---------------------------------------------------------------------------
// Seeded random (stable per-kernel)
// ---------------------------------------------------------------------------
function seededRand(seed) {
  const s = Math.sin(seed * 9301 + 49297) * 233280;
  return s - Math.floor(s);
}

function seededRandN(seed, n) {
  // Returns array of n values in [0,1)
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(seededRand(seed + i * 1.618));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Audio Engine
// ---------------------------------------------------------------------------
class MusicEngine {
  constructor(audioCtx) {
    this.ctx = audioCtx;
    this.bpm = 130;
    this.stepDur = (60 / this.bpm) / 2; // eighth notes
    this.step = 0;
    this.nextTime = 0;
    this.intervalId = null;
    this.running = false;

    // Master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.18;

    // Delay node for warmth
    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.22;
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.value = 0.18;
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // C major pentatonic ascending/descending pattern
    // C4 D4 E4 G4 A4 G4 E4 D4 C4 D4 E4 G4 A4 C5 A4 G4
    this.melodyFreqs = [
      261.63, 293.66, 329.63, 392.00, 440.00,
      392.00, 329.63, 293.66, 261.63, 293.66,
      329.63, 392.00, 440.00, 523.25, 440.00, 392.00,
    ];

    // Bass pattern: C3 on beat 1, G3 on beat 3
    this.bassFreqs = [130.81, null, null, null, 196.00, null, null, null,
                      130.81, null, null, null, 196.00, null, null, null];
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.step = 0;
    this._schedule();
    this.intervalId = setInterval(() => this._schedule(), 100);
  }

  stop() {
    this.running = false;
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Fade out master gain quickly to avoid clicks
    const g = this.masterGain.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(g.value, this.ctx.currentTime);
    g.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
  }

  resume() {
    if (this.running) return;
    const g = this.masterGain.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(0, this.ctx.currentTime);
    g.linearRampToValueAtTime(0.18, this.ctx.currentTime + 0.1);
    this.running = true;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.intervalId = setInterval(() => this._schedule(), 100);
  }

  _schedule() {
    const lookahead = 0.25;
    while (this.nextTime < this.ctx.currentTime + lookahead) {
      this._playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % 16;
      this.nextTime += this.stepDur;
    }
  }

  _playStep(step, time) {
    const ctx = this.ctx;

    // ---- Lead melody ----
    {
      const freq = this.melodyFreqs[step];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.55, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, time + this.stepDur * 0.9);
      osc.connect(gain);
      gain.connect(this.delay);
      osc.start(time);
      osc.stop(time + this.stepDur);
    }

    // ---- Bass ----
    {
      const freq = this.bassFreqs[step];
      if (freq) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.8, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + this.stepDur * 1.8);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(time);
        osc.stop(time + this.stepDur * 2);
      }
    }

    // ---- Hi-hat every step ----
    {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      src.connect(hp);
      hp.connect(gain);
      gain.connect(this.masterGain);
      src.start(time);
    }

    // ---- Kick on beats 1 and 3 (steps 0, 8) ----
    if (step === 0 || step === 8) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
      gain.gain.setValueAtTime(1.0, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.3);
    }
  }
}

function playPop(audioCtx, golden) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  // Sawtooth sweep
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(650, now);
  osc.frequency.exponentialRampToValueAtTime(120, now + 0.09);
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.1);

  // Noise burst through bandpass
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.09, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2000;
  bp.Q.value = 1.5;
  const ng = audioCtx.createGain();
  ng.gain.setValueAtTime(0.15, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  src.connect(bp);
  bp.connect(ng);
  ng.connect(audioCtx.destination);
  src.start(now);

  if (golden) {
    // Ascending chime triad: C5 E5 G5
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const t = now + i * 0.06;
      const co = audioCtx.createOscillator();
      const cg = audioCtx.createGain();
      co.type = 'triangle';
      co.frequency.value = freq;
      cg.gain.setValueAtTime(0.25, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      co.connect(cg);
      cg.connect(audioCtx.destination);
      co.start(t);
      co.stop(t + 0.42);
    });
  }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------
function drawKernel(ctx, x, y, r, golden) {
  ctx.save();
  ctx.translate(x, y);

  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;

  // Body gradient
  const bodyGrad = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.05, 0, 0, r * 1.1);
  if (golden) {
    bodyGrad.addColorStop(0, '#FFF176');
    bodyGrad.addColorStop(0.45, '#F5D020');
    bodyGrad.addColorStop(1, '#E6A800');
  } else {
    bodyGrad.addColorStop(0, '#EAA84A');
    bodyGrad.addColorStop(0.45, '#C87D35');
    bodyGrad.addColorStop(1, '#8B4A10');
  }

  // Ellipse body (taller than wide)
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.65, r, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // 3 vertical ridge bezier lines
  ctx.strokeStyle = golden ? 'rgba(180,120,0,0.35)' : 'rgba(90,40,0,0.3)';
  ctx.lineWidth = 1.2;
  for (let i = -1; i <= 1; i++) {
    const xo = i * r * 0.25;
    ctx.beginPath();
    ctx.moveTo(xo, -r * 0.7);
    ctx.bezierCurveTo(
      xo + (i * r * 0.12), -r * 0.3,
      xo + (i * r * 0.12),  r * 0.3,
      xo,                    r * 0.7
    );
    ctx.stroke();
  }

  // Highlight ellipse
  const hlGrad = ctx.createRadialGradient(-r * 0.22, -r * 0.38, 0, -r * 0.22, -r * 0.38, r * 0.45);
  hlGrad.addColorStop(0, 'rgba(255,255,255,0.55)');
  hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.ellipse(-r * 0.2, -r * 0.35, r * 0.3, r * 0.22, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = hlGrad;
  ctx.fill();

  // Golden sparkle star
  if (golden) {
    ctx.save();
    ctx.translate(r * 0.35, -r * 0.8);
    ctx.fillStyle = '#FFE57F';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 6;
    drawStar(ctx, 0, 0, 4, 8, 4);
    ctx.restore();
  }

  ctx.restore();
}

function drawStar(ctx, cx, cy, spikes, outerR, innerR) {
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerR);
  ctx.closePath();
  ctx.fill();
}

function drawPopcornBlob(ctx, x, y, r, seed, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  const rng = seededRandN(seed, 21);
  // 7 circles arranged irregularly
  const circles = [];
  const angles = [0, 0.9, 1.85, 2.8, 3.7, 4.6, 5.5];
  for (let i = 0; i < 7; i++) {
    const ang = angles[i] + (rng[i] - 0.5) * 0.4;
    const dist = r * (0.38 + rng[i + 7] * 0.35);
    const cr = r * (0.42 + rng[i + 14] * 0.3);
    circles.push({ cx: Math.cos(ang) * dist, cy: Math.sin(ang) * dist, cr });
  }

  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;

  // Golden underfill on some blobs
  circles.forEach((c, i) => {
    if (i % 3 === 0) {
      ctx.beginPath();
      ctx.arc(c.cx + 2, c.cy + 3, c.cr * 0.85, 0, Math.PI * 2);
      ctx.fillStyle = '#F5C96A';
      ctx.fill();
    }
  });

  ctx.shadowColor = 'transparent';

  // Main cream blobs
  circles.forEach((c) => {
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, c.cr, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF8EB';
    ctx.fill();
  });

  // Per-blob highlight gradient
  circles.forEach((c) => {
    const hlGrad = ctx.createRadialGradient(
      c.cx - c.cr * 0.3, c.cy - c.cr * 0.3, 0,
      c.cx, c.cy, c.cr
    );
    hlGrad.addColorStop(0, 'rgba(255,255,255,0.7)');
    hlGrad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
    hlGrad.addColorStop(1, 'rgba(255,230,180,0.1)');
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, c.cr, 0, Math.PI * 2);
    ctx.fillStyle = hlGrad;
    ctx.fill();
  });

  ctx.restore();
}

function drawKernelCrack(ctx, x, y, r, progress) {
  // Crack lines radiating outward
  ctx.save();
  ctx.translate(x, y);
  const lines = 6;
  ctx.strokeStyle = 'rgba(255,200,100,0.75)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < lines; i++) {
    const ang = (i / lines) * Math.PI * 2 + 0.3;
    const len = r * 0.6 + r * progress * 1.2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * r * 0.4, Math.sin(ang) * r * 0.4);
    ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRadialFlash(ctx, x, y, r, progress) {
  const radius = r * 0.5 + r * progress * 4;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, `rgba(255,240,180,${0.9 * (1 - progress)})`);
  grad.addColorStop(0.5, `rgba(255,200,80,${0.5 * (1 - progress)})`);
  grad.addColorStop(1, 'rgba(255,200,80,0)');
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Background decorative kernels
// ---------------------------------------------------------------------------
function buildBgKernels(W, H, count = 28) {
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      x: seededRand(i * 3.1) * W,
      y: seededRand(i * 3.7) * H,
      r: 8 + seededRand(i * 4.3) * 10,
      angle: seededRand(i * 2.9) * Math.PI * 2,
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const PopcornGame = ({ isActive }) => {
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState('idle');    // 'idle' | 'playing' | 'gameover'
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [best, setBest] = useState(0);

  // Mutable game state (not React state — updated every frame)
  const G = useRef({
    kernels: [],
    particles: [],
    confetti: [],
    score: 0,
    timeLeft: GAME_DURATION,
    startMs: 0,
    lastSpawn: 0,
    lastGolden: 0,
    wobbleT: 0,
    running: false,
    nextId: 0,
    bgKernels: [],
    W: 0,
    H: 0,
    dpr: 1,
    phase: 'idle',
  });

  const rafRef = useRef(null);
  const confettiRafRef = useRef(null);
  const audioCtxRef = useRef(null);
  const musicRef = useRef(null);
  const phaseRef = useRef('idle');

  // Keep phaseRef in sync
  useEffect(() => {
    phaseRef.current = phase;
    G.current.phase = phase;
  }, [phase]);

  // ---------------------------------------------------------------------------
  // Audio context (created on first interaction)
  // ---------------------------------------------------------------------------
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // ---------------------------------------------------------------------------
  // Spawn a new kernel
  // ---------------------------------------------------------------------------
  const spawnKernel = useCallback((now, forceGolden = false) => {
    const g = G.current;
    if (g.kernels.length >= MAX_KERNELS) return;
    const safeMargin = KERNEL_R * 3;
    const x = safeMargin + Math.random() * (g.W - safeMargin * 2);
    const y = safeMargin + Math.random() * (g.H * 0.85 - safeMargin);
    const isGolden = forceGolden || false;
    g.kernels.push({
      id: g.nextId++,
      x, y,
      r: KERNEL_R,
      golden: isGolden,
      wobbleOffset: Math.random() * Math.PI * 2,
      spawnedAt: now,
      popping: false,
      popStartMs: 0,
      poppedAt: 0,
      state: 'kernel', // 'kernel' | 'popping' | 'popped' | 'fading' | 'done'
      seed: Math.random() * 9999,
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Spawn particles
  // ---------------------------------------------------------------------------
  const spawnParticles = useCallback((x, y) => {
    const g = G.current;
    const count = 10 + Math.floor(Math.random() * 7);
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 4.5;
      g.particles.push({
        x, y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - 2,
        r: 3 + Math.random() * 4,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        born: now,
        life: 500 + Math.random() * 350,
        shape: Math.random() < 0.5 ? 'circle' : 'rect',
      });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Handle kernel click / tap
  // ---------------------------------------------------------------------------
  const handleCanvasClick = useCallback((clientX, clientY) => {
    const g = G.current;
    if (g.phase !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = (clientX - rect.left);
    const cy = (clientY - rect.top);

    const audioCtx = getAudioCtx();

    // Check kernels in reverse order (top-most drawn last)
    for (let i = g.kernels.length - 1; i >= 0; i--) {
      const k = g.kernels[i];
      if (k.state !== 'kernel') continue;
      const dx = cx - k.x;
      const dy = cy - k.y;
      // Ellipse hit test
      if ((dx / (k.r * 0.85)) ** 2 + (dy / (k.r * 1.05)) ** 2 < 1.2) {
        k.state = 'popping';
        k.popStartMs = performance.now();
        spawnParticles(k.x, k.y);
        const pts = k.golden ? 3 : 1;
        g.score += pts;
        setScore(g.score);
        playPop(audioCtx, k.golden);
        break;
      }
    }
  }, [getAudioCtx, spawnParticles]);

  // ---------------------------------------------------------------------------
  // Spawn confetti
  // ---------------------------------------------------------------------------
  const spawnConfetti = useCallback(() => {
    const g = G.current;
    g.confetti = [];
    for (let i = 0; i < 100; i++) {
      g.confetti.push({
        x: Math.random() * g.W,
        y: -20 - Math.random() * g.H * 0.5,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        r: 5 + Math.random() * 8,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.2,
        shape: Math.random() < 0.5 ? 'rect' : 'circle',
        w: 6 + Math.random() * 10,
        h: 4 + Math.random() * 8,
      });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Stop game loop
  // ---------------------------------------------------------------------------
  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Main game / render loop
  // ---------------------------------------------------------------------------
  const startLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loop = (now) => {
      rafRef.current = requestAnimationFrame(loop);
      const g = G.current;

      // DPR-aware transform
      const dpr = g.dpr;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      g.W = W;
      g.H = H;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // ---- Background ----
      const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.75);
      bgGrad.addColorStop(0, PASTEL_BG_CENTER);
      bgGrad.addColorStop(1, PASTEL_BG_EDGE);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // ---- Decorative background kernels ----
      if (g.bgKernels.length === 0) {
        g.bgKernels = buildBgKernels(W, H);
      }
      ctx.save();
      ctx.globalAlpha = 0.08;
      g.bgKernels.forEach((bk) => {
        ctx.save();
        ctx.translate(bk.x, bk.y);
        ctx.rotate(bk.angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, bk.r * 0.65, bk.r, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#C87D35';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      });
      ctx.restore();

      // ---- Update wobble ----
      g.wobbleT += 0.025;

      // ---- Game state update ----
      if (g.running) {
        const elapsed = (now - g.startMs) / 1000;
        const tLeft = Math.max(0, GAME_DURATION - elapsed);
        g.timeLeft = tLeft;
        setTimeLeft(Math.ceil(tLeft));

        if (tLeft <= 0) {
          // Game over
          g.running = false;
          setPhase('gameover');
          setBest((prev) => {
            const newBest = Math.max(prev, g.score);
            return newBest;
          });
          spawnConfetti();
          if (musicRef.current) {
            musicRef.current.stop();
          }
          stopLoop();
          startConfettiLoop();
          return;
        }

        // Spawn regular kernels
        if (now - g.lastSpawn > SPAWN_INTERVAL && g.kernels.length < MAX_KERNELS) {
          spawnKernel(now, false);
          g.lastSpawn = now;
        }

        // Spawn golden kernel
        if (now - g.lastGolden > GOLDEN_INTERVAL) {
          spawnKernel(now, true);
          g.lastGolden = now;
        }
      }

      // ---- Draw particles ----
      g.particles = g.particles.filter((p) => {
        const age = now - p.born;
        if (age > p.life) return false;
        const alpha = 1 - age / p.life;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // gravity
        p.vx *= 0.97; // drag
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(age * 0.01);
          ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
          ctx.restore();
        }
        ctx.restore();
        return true;
      });

      // ---- Draw kernels ----
      g.kernels = g.kernels.filter((k) => {
        const bobY = k.y + Math.sin(g.wobbleT + k.wobbleOffset) * 2.5;

        if (k.state === 'kernel') {
          drawKernel(ctx, k.x, bobY, k.r, k.golden);
          return true;
        }

        if (k.state === 'popping') {
          const age = now - k.popStartMs;
          const t = Math.min(age / POP_ANIM_DURATION, 1);

          if (t < 0.30) {
            // Phase 0-30%: show kernel + crack lines
            const crackT = t / 0.30;
            drawKernel(ctx, k.x, bobY, k.r, k.golden);
            drawKernelCrack(ctx, k.x, bobY, k.r, crackT);
          } else if (t < 0.65) {
            // Phase 30-65%: radial flash, kernel fades
            const flashT = (t - 0.30) / 0.35;
            const kAlpha = 1 - flashT;
            ctx.save();
            ctx.globalAlpha = kAlpha;
            drawKernel(ctx, k.x, bobY, k.r, k.golden);
            ctx.restore();
            drawRadialFlash(ctx, k.x, bobY, k.r, flashT);
          } else {
            // Phase 65-100%: popcorn scales in with bounce
            const blobT = (t - 0.65) / 0.35;
            // Overshoot bounce: scale = 1 + 0.25*sin(pi*t) then settle
            const scale = blobT < 0.6
              ? blobT / 0.6 * 1.25
              : 1.25 - (blobT - 0.6) / 0.4 * 0.25;
            ctx.save();
            ctx.translate(k.x, bobY);
            ctx.scale(scale, scale);
            ctx.translate(-k.x, -bobY);
            drawPopcornBlob(ctx, k.x, bobY, k.r * 1.6, k.seed);
            ctx.restore();
          }

          if (t >= 1) {
            k.state = 'popped';
            k.poppedAt = now;
          }
          return true;
        }

        if (k.state === 'popped') {
          const age = now - k.poppedAt;
          if (age > POPPED_LINGER) {
            k.state = 'fading';
            k.fadeStart = now;
          }
          drawPopcornBlob(ctx, k.x, bobY, k.r * 1.6, k.seed);
          return true;
        }

        if (k.state === 'fading') {
          const age = now - k.fadeStart;
          const alpha = Math.max(0, 1 - age / 600);
          drawPopcornBlob(ctx, k.x, bobY, k.r * 1.6, k.seed, alpha);
          if (alpha <= 0) return false;
          return true;
        }

        return false; // 'done'
      });
    };

    rafRef.current = requestAnimationFrame(loop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spawnKernel, spawnParticles, spawnConfetti, stopLoop]);

  // ---------------------------------------------------------------------------
  // Confetti-only loop (after game over)
  // ---------------------------------------------------------------------------
  const startConfettiLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loop = (now) => {
      confettiRafRef.current = requestAnimationFrame(loop);
      const g = G.current;
      const dpr = g.dpr;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Background
      const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.75);
      bgGrad.addColorStop(0, PASTEL_BG_CENTER);
      bgGrad.addColorStop(1, PASTEL_BG_EDGE);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Draw remaining popped popcorns fading out
      g.kernels.forEach((k) => {
        if (k.state === 'popped' || k.state === 'fading') {
          const bobY = k.y + Math.sin(g.wobbleT + k.wobbleOffset) * 2.5;
          drawPopcornBlob(ctx, k.x, bobY, k.r * 1.6, k.seed);
        }
      });

      // Confetti
      let active = false;
      g.confetti.forEach((c) => {
        c.x += c.vx;
        c.y += c.vy;
        c.vy += 0.08;
        c.rot += c.rotV;
        if (c.y < H + 30) active = true;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        if (c.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, c.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        }
        ctx.restore();
      });

      if (!active) {
        cancelAnimationFrame(confettiRafRef.current);
        confettiRafRef.current = null;
      }
    };
    confettiRafRef.current = requestAnimationFrame(loop);
  }, []);

  // ---------------------------------------------------------------------------
  // Canvas resize observer
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      G.current.dpr = dpr;
      G.current.bgKernels = []; // rebuild on resize
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    return () => ro.disconnect();
  }, []);

  // ---------------------------------------------------------------------------
  // Start / stop game loop on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    startLoop();
    return () => {
      stopLoop();
      if (confettiRafRef.current) {
        cancelAnimationFrame(confettiRafRef.current);
        confettiRafRef.current = null;
      }
    };
  }, [startLoop, stopLoop]);

  // ---------------------------------------------------------------------------
  // isActive effect: stop/resume music
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isActive) {
      if (musicRef.current && musicRef.current.running) {
        musicRef.current.stop();
      }
    } else {
      if (G.current.running && musicRef.current && !musicRef.current.running) {
        musicRef.current.resume();
      }
    }
  }, [isActive]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const startGame = useCallback(() => {
    const g = G.current;
    g.kernels = [];
    g.particles = [];
    g.confetti = [];
    g.score = 0;
    g.timeLeft = GAME_DURATION;
    g.startMs = performance.now();
    g.lastSpawn = g.startMs - SPAWN_INTERVAL; // spawn immediately
    g.lastGolden = g.startMs;
    g.running = true;
    g.nextId = 0;

    setScore(0);
    setTimeLeft(GAME_DURATION);
    setPhase('playing');

    // Stop confetti loop if running
    if (confettiRafRef.current) {
      cancelAnimationFrame(confettiRafRef.current);
      confettiRafRef.current = null;
    }

    // Start main loop if not running
    if (!rafRef.current) {
      startLoop();
    }

    // Start music
    const audioCtx = getAudioCtx();
    if (!musicRef.current) {
      musicRef.current = new MusicEngine(audioCtx);
    }
    // Reset master gain in case it was faded out
    musicRef.current.masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
    musicRef.current.masterGain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    musicRef.current.start();
  }, [startLoop, getAudioCtx]);

  // Pointer events on canvas
  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    handleCanvasClick(e.clientX, e.clientY);
  }, [handleCanvasClick]);

  // ---------------------------------------------------------------------------
  // HUD helpers
  // ---------------------------------------------------------------------------
  const timerColor = timeLeft > 15 ? '#52E5A0' : timeLeft > 8 ? '#FFD166' : '#FF6B6B';
  const timerBarPct = (timeLeft / GAME_DURATION) * 100;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <section
      id="popcorn-game"
      aria-label="Popcorn Game"
      style={{
        height: '100dvh',
        position: 'relative',
        overflow: 'hidden',
        padding: 0,
        background: '#FFF8EE',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%' }}
        onPointerDown={handlePointerDown}
        onWheel={(e) => e.stopPropagation()}
        aria-label="Popcorn game canvas"
      />

      {/* ---- Timer bar (playing) ---- */}
      {phase === 'playing' && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 6,
          background: 'rgba(0,0,0,0.1)',
          zIndex: 10,
        }}>
          <div style={{
            height: '100%',
            width: `${timerBarPct}%`,
            background: timerColor,
            transition: 'width 0.5s linear, background 0.5s',
          }} />
        </div>
      )}

      {/* ---- HUD (playing) ---- */}
      {phase === 'playing' && (
        <div style={{
          position: 'absolute',
          top: 14,
          left: 0, right: 0,
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0 20px',
          zIndex: 10,
          pointerEvents: 'none',
        }}>
          <div>
            <div style={{
              fontWeight: 800,
              fontSize: '1.4rem',
              color: '#5A3A8A',
              textShadow: '0 1px 4px rgba(255,255,255,0.8)',
            }}>
              SCORE: {score}
            </div>
            {best > 0 && (
              <div style={{
                fontSize: '0.85rem',
                color: 'rgba(90,58,138,0.6)',
                fontWeight: 600,
              }}>
                BEST: {best}
              </div>
            )}
          </div>
          <div style={{
            fontWeight: 800,
            fontSize: '1.6rem',
            color: timerColor,
            textShadow: `0 0 12px ${timerColor}88`,
            transition: 'color 0.4s',
          }}>
            ⏱ {timeLeft}
          </div>
        </div>
      )}

      {/* ---- Start screen (idle) ---- */}
      {phase === 'idle' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
          gap: '1.2rem',
          pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 'clamp(2.5rem, 6vw, 5rem)',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #FF6BAE, #9B72FF)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            lineHeight: 1.1,
            textAlign: 'center',
          }}>
            🍿 POPCORN!
          </div>
          <div style={{
            fontSize: 'clamp(0.9rem, 2.5vw, 1.2rem)',
            color: 'rgba(80,40,120,0.8)',
            fontWeight: 500,
            textAlign: 'center',
            maxWidth: 340,
            padding: '0 1rem',
          }}>
            Click the kernels before time runs out!
          </div>
          <button
            style={{
              padding: '1rem 3rem',
              background: 'linear-gradient(135deg, #FF6BAE, #9B72FF)',
              border: 'none',
              borderRadius: 100,
              fontSize: '1.4rem',
              fontWeight: 700,
              color: 'white',
              cursor: 'pointer',
              boxShadow: '0 4px 24px rgba(155,114,255,0.5)',
              pointerEvents: 'all',
              transition: 'transform 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onClick={startGame}
          >
            PLAY
          </button>
        </div>
      )}

      {/* ---- Game over screen ---- */}
      {phase === 'gameover' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,240,250,0.88)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 20,
          gap: '1rem',
        }}>
          <div style={{
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #FF6BAE, #9B72FF)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textAlign: 'center',
          }}>
            TIME'S UP! 🎉
          </div>
          <div style={{
            fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
            fontWeight: 800,
            color: '#5A3A8A',
            textAlign: 'center',
          }}>
            SCORE: {score}
          </div>
          {best >= score && best > 0 && (
            <div style={{
              fontSize: '1.1rem',
              fontWeight: 700,
              color: score === best ? '#FF6BAE' : 'rgba(90,58,138,0.7)',
              textAlign: 'center',
            }}>
              {score === best ? '★ NEW BEST!' : `BEST: ${best}`}
            </div>
          )}
          <button
            style={{
              padding: '1rem 3rem',
              background: 'linear-gradient(135deg, #FF6BAE, #9B72FF)',
              border: 'none',
              borderRadius: 100,
              fontSize: '1.4rem',
              fontWeight: 700,
              color: 'white',
              cursor: 'pointer',
              boxShadow: '0 4px 24px rgba(155,114,255,0.5)',
              transition: 'transform 0.15s',
              marginTop: '0.5rem',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onClick={startGame}
          >
            PLAY AGAIN
          </button>
        </div>
      )}
    </section>
  );
};

export default PopcornGame;
