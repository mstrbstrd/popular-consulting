// BlackHoleCanvas.js
// Psychedelic black-hole dither — full-screen WebGL2 overlay for the Orb section.
import React, { useEffect, useRef } from 'react';

const PIXEL_SCALE = 0.35;

const VS_SRC = `#version 300 es
in vec2 a_pos;
out vec2 vUv;
void main(){
  vUv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FS_SRC = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform float u_time;
uniform vec2 u_res;
uniform vec2 u_mouse;
uniform float u_zoom;
uniform float u_lightMode;

#define PI 3.14159265359
#define TAU 6.28318530718
#define BH_MASS 1.0
#define SCHWARZSCHILD_R (2.0 * BH_MASS)
#define PHOTON_SPHERE_R (1.5 * SCHWARZSCHILD_R)
#define ISCO_R (3.0 * SCHWARZSCHILD_R)
#define DISK_INNER 2.8
#define DISK_OUTER 12.0
#define NUM_STEPS 200
#define STEP_SIZE 0.08

float bayer4(vec2 p) {
  ivec2 ip = ivec2(mod(p, 4.0));
  int b[16] = int[16](
     0, 8, 2,10,
    12, 4,14, 6,
     3,11, 1, 9,
    15, 7,13, 5
  );
  return float(b[ip.x + ip.y * 4]) / 16.0;
}

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3d(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i+vec3(1,0,0)), f.x),
        mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x),
        mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise3d(p);
    p *= 2.1; a *= 0.48;
  }
  return v;
}

vec3 psychePalette(float t, float shift) {
  vec3 a = vec3(0.5);
  vec3 b = vec3(0.6);
  vec3 c = vec3(1.0);
  vec3 d = vec3(0.00, 0.15, 0.40);
  return a + b * cos(TAU * (c * t + d + shift));
}

vec3 schwarzschildAccel(vec3 pos, vec3 vel) {
  float r = length(pos);
  if (r < 0.5) return vec3(0.0);
  float r2 = r * r;
  vec3 L = cross(pos, vel);
  float L2 = dot(L, L);
  return -BH_MASS / (r2 * r) * pos * (1.0 + 3.0 * L2 / r2);
}

void rk4Step(inout vec3 pos, inout vec3 vel, float h) {
  vec3 k1v = schwarzschildAccel(pos, vel);
  vec3 k1x = vel;
  vec3 p2 = pos + 0.5*h*k1x; vec3 v2 = vel + 0.5*h*k1v;
  vec3 k2v = schwarzschildAccel(p2, v2); vec3 k2x = v2;
  vec3 p3 = pos + 0.5*h*k2x; vec3 v3 = vel + 0.5*h*k2v;
  vec3 k3v = schwarzschildAccel(p3, v3); vec3 k3x = v3;
  vec3 p4 = pos + h*k3x; vec3 v4 = vel + h*k3v;
  vec3 k4v = schwarzschildAccel(p4, v4); vec3 k4x = v4;
  pos += (h/6.0) * (k1x + 2.0*k2x + 2.0*k3x + k4x);
  vel += (h/6.0) * (k1v + 2.0*k2v + 2.0*k3v + k4v);
  vel = normalize(vel);
}

vec3 stars(vec3 rd, float t) {
  vec2 sp = vec2(atan(rd.z, rd.x), asin(clamp(rd.y, -1.0, 1.0)));
  vec3 col = vec3(0.0);
  vec2 grid1 = floor(sp * 120.0);
  float h1 = hash2(grid1);
  if (h1 > 0.95) {
    float b = pow((h1 - 0.95) / 0.05, 0.4);
    b *= 0.6 + 0.4 * sin(t * 2.5 + h1 * 80.0);
    col += psychePalette(h1 * 4.0 + t * 0.03, 0.0) * b;
  }
  vec2 grid2 = floor(sp * 40.0);
  float h2 = hash2(grid2 + 99.0);
  if (h2 > 0.985) {
    float b = pow((h2 - 0.985) / 0.015, 0.3) * 1.5;
    b *= 0.7 + 0.3 * sin(t * 1.8 + h2 * 60.0);
    col += psychePalette(h2 * 6.0 + t * 0.05, 0.2) * b;
  }
  float neb = fbm(rd * 3.0 + t * 0.01);
  neb = smoothstep(0.45, 0.75, neb) * 0.08;
  col += psychePalette(rd.x + rd.y + t * 0.02, 0.4) * neb;
  return col;
}

vec3 diskColor(vec3 hitPos, vec3 camPos, float t) {
  float r = length(hitPos.xz);
  if (r < DISK_INNER || r > DISK_OUTER) return vec3(0.0);
  float angle = atan(hitPos.z, hitPos.x);
  float v_orb = sqrt(BH_MASS / r);
  vec3 velDir = normalize(vec3(-sin(angle), 0.0, cos(angle)));
  vec3 velocity = velDir * v_orb;
  vec3 toCamera = normalize(camPos - hitPos);
  float v_los = dot(velocity, toCamera);
  float gamma = 1.0 / sqrt(1.0 - min(v_orb * v_orb, 0.99));
  float doppler = 1.0 / (gamma * (1.0 - v_los));
  doppler = clamp(doppler, 0.3, 3.5);
  float g_redshift = sqrt(max(1.0 - SCHWARZSCHILD_R / r, 0.01));
  float totalShift = doppler * g_redshift;
  float radialNorm = (r - DISK_INNER) / (DISK_OUTER - DISK_INNER);
  float temperature = pow(1.0 - radialNorm, 1.8);
  float rotSpeed = 1.0 / pow(r, 1.5);
  float rotAngle = angle + rotSpeed * t * 2.0;
  float spiral1 = sin(rotAngle * 4.0 - log(r) * 5.0);
  float spiral2 = sin(rotAngle * 7.0 + log(r) * 3.0);
  float turb = fbm(vec3(hitPos.xz * 0.8, t * 0.15));
  float density = 0.55 + 0.25 * spiral1 + 0.15 * spiral2 + turb * 0.3;
  density *= smoothstep(DISK_INNER, DISK_INNER + 0.8, r);
  density *= smoothstep(DISK_OUTER, DISK_OUTER - 1.5, r);
  float hue = angle / TAU + 0.5;
  hue += r * 0.05 + t * 0.08;
  hue += (totalShift - 1.0) * 0.3;
  vec3 col = psychePalette(hue, 0.0);
  vec3 hotCol = psychePalette(hue + 0.15, 0.25) * 2.5;
  col = mix(col, hotCol, temperature * 0.7);
  float beaming = pow(totalShift, 3.5);
  float iscoGlow = exp(-(r - DISK_INNER) * 2.0);
  vec3 plasmaCol = psychePalette(t * 0.2 + angle / TAU, 0.1) * 3.5;
  col += plasmaCol * iscoGlow;
  col *= density * beaming * (0.5 + temperature * 1.2);
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - u_res * 0.5) / min(u_res.x, u_res.y);
  float t = u_time;
  float aberr = 0.006 + 0.003 * sin(t * 1.8);
  float camAngle = t * 0.06;
  vec2 ms = u_mouse * 2.0 - 1.0;
  camAngle += ms.x * 1.0;
  float camElev = 0.35 + ms.y * 0.5 + 0.1 * sin(t * 0.05);
  vec3 ro = vec3(
    u_zoom * cos(camAngle) * cos(camElev),
    u_zoom * sin(camElev),
    u_zoom * sin(camAngle) * cos(camElev)
  );
  vec3 ta = vec3(0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 finalCol = vec3(0.0);

  for (int ch = 0; ch < 3; ch++) {
    float chOff = (ch == 0) ? aberr : (ch == 2) ? -aberr : 0.0;
    vec3 rd = normalize((uv.x + chOff) * uu + uv.y * vv + 1.4 * ww);
    vec3 pos = ro;
    vec3 vel = rd;
    vec3 accumulated = vec3(0.0);
    float alpha = 0.0;
    bool absorbed = false;
    float minR = 100.0;

    for (int i = 0; i < NUM_STEPS; i++) {
      float r = length(pos);
      minR = min(minR, r);
      if (r < SCHWARZSCHILD_R * 0.48) { absorbed = true; break; }
      float prevY = pos.y;
      float adaptiveH = STEP_SIZE * clamp(r * 0.3, 0.3, 4.0);
      rk4Step(pos, vel, adaptiveH);
      float currY = pos.y;
      if (prevY * currY < 0.0 && alpha < 0.95) {
        float frac = abs(prevY) / (abs(prevY) + abs(currY) + 0.0001);
        vec3 hitP = pos - vel * adaptiveH * (1.0 - frac);
        float hitR = length(hitP.xz);
        if (hitR > DISK_INNER && hitR < DISK_OUTER) {
          vec3 dCol = diskColor(hitP, ro, t);
          float hitAlpha = clamp(length(dCol) * 0.7, 0.0, 0.9);
          accumulated += dCol * (1.0 - alpha) * hitAlpha;
          alpha += hitAlpha * (1.0 - alpha);
        }
      }
      if (r > 120.0) break;
    }

    vec3 c;
    if (absorbed) {
      float glow = exp(-(minR - SCHWARZSCHILD_R * 0.48) * 4.0);
      c = psychePalette(t * 0.15, 0.0) * glow * 0.15;
    } else {
      c = stars(normalize(vel), t);
    }
    c = mix(c, accumulated / max(alpha, 0.001), alpha);
    float ringDist = abs(minR - PHOTON_SPHERE_R);
    float ringGlow = exp(-ringDist * ringDist * 8.0) * 0.8;
    float nearOrbit = exp(-ringDist * 20.0) * 1.5;
    vec3 ringCol = psychePalette(t * 0.12 + minR * 0.3, 0.15);
    c += ringCol * (ringGlow + nearOrbit);
    if (minR < PHOTON_SPHERE_R * 1.3 && !absorbed) {
      float lensAmp = 1.0 + 2.0 * exp(-(minR - PHOTON_SPHERE_R) * 3.0);
      c *= lensAmp;
    }
    if (ch == 0) finalCol.r = c.r;
    else if (ch == 1) finalCol.g = c.g;
    else finalCol.b = c.b;
  }

  finalCol = finalCol / (finalCol + 0.65);
  float gray = dot(finalCol, vec3(0.299, 0.587, 0.114));
  finalCol = mix(vec3(gray), finalCol, 1.3);

  float threshold = bayer4(gl_FragCoord.xy);
  float levels = 3.0;
  finalCol = floor(finalCol * levels + threshold) / levels;

  float scanline = 0.78 + 0.22 * sin(gl_FragCoord.y * PI * 2.0);
  finalCol *= scanline;
  float interference = 0.96 + 0.04 * sin(gl_FragCoord.y * 0.5 + t * 14.0);
  finalCol *= interference;

  vec2 cv = vUv * 2.0 - 1.0;
  float curv = 1.0 - 0.35 * dot(cv * cv, cv * cv);
  finalCol *= clamp(curv, 0.0, 1.0);

  float lum = dot(finalCol, vec3(0.299, 0.587, 0.114));
  finalCol += finalCol * smoothstep(0.4, 1.0, lum) * 0.3;

  if (u_lightMode > 0.5) finalCol = 1.0 - finalCol;

  fragColor = vec4(finalCol, 1.0);
}`;

const BlackHoleCanvas = ({ isDark = true, visible = true, onFadeOutEnd, zoomRef, currentZoomRef }) => {
  const canvasRef = useRef(null);
  const isDarkRef = useRef(isDark);
  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) return;

    // Compile helpers
    const compileShader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('BH shader error:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };

    const vs = compileShader(gl.VERTEX_SHADER, VS_SRC);
    const fs = compileShader(gl.FRAGMENT_SHADER, FS_SRC);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('BH program link error:', gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime      = gl.getUniformLocation(prog, 'u_time');
    const uRes       = gl.getUniformLocation(prog, 'u_res');
    const uMouse     = gl.getUniformLocation(prog, 'u_mouse');
    const uZoom      = gl.getUniformLocation(prog, 'u_zoom');
    const uLightMode = gl.getUniformLocation(prog, 'u_lightMode');

    const mouse = [0.5, 0.5];
    let zoom = 32.0;
    const ZOOM_MIN = 4.0, ZOOM_MAX = 80.0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width  = Math.floor(parent.clientWidth  * PIXEL_SCALE);
      canvas.height = Math.floor(parent.clientHeight * PIXEL_SCALE);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse[0] = (e.clientX - rect.left) / rect.width;
      mouse[1] = 1.0 - (e.clientY - rect.top) / rect.height;
    };
    const onWheel = (e) => {
      e.preventDefault();
      zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + e.deltaY * 0.02));
    };

    let lastPinchDist = 0;
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        lastPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    };
    const onTouchMove = (e) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + (lastPinchDist - dist) * 0.06));
        lastPinchDist = dist;
      } else if (e.touches.length === 1) {
        const rect = canvas.getBoundingClientRect();
        mouse[0] = (e.touches[0].clientX - rect.left) / rect.width;
        mouse[1] = 1.0 - (e.touches[0].clientY - rect.top) / rect.height;
      }
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });

    let animId;
    const render = (t) => {
      gl.uniform1f(uTime,      t * 0.001);
      gl.uniform2f(uRes,       canvas.width, canvas.height);
      gl.uniform2f(uMouse,     mouse[0], mouse[1]);
      const effectiveZoom = (zoomRef && zoomRef.current !== null) ? zoomRef.current : zoom;
      if (currentZoomRef) currentZoomRef.current = effectiveZoom;
      gl.uniform1f(uZoom, effectiveZoom);
      gl.uniform1f(uLightMode, isDarkRef.current ? 0.0 : 1.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onTransitionEnd={() => { if (!visible) onFadeOutEnd?.(); }}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        imageRendering: 'pixelated',
        zIndex: 5,
        display: 'block',
        opacity: visible ? 1 : 0,
        transition: 'opacity 1.2s ease',
      }}
    />
  );
};

export default BlackHoleCanvas;
