export const VISUAL_RUNTIME_DARK_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv=a_pos*0.5+0.5;
  gl_Position=vec4(a_pos,0.0,1.0);
}`;

export const VISUAL_RUNTIME_DARK_TRANSPORT_SHADER = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
out vec4 fragColor;
uniform float u_time;
uniform vec2 u_res;
uniform vec2 u_mouse;
uniform float u_zoom;

#define PI 3.14159265359
#define TAU 6.28318530718
#define BH_MASS 1.0
#define SCHWARZSCHILD_R (2.0 * BH_MASS)
#define DISK_INNER 2.8
#define DISK_OUTER 12.0
#define NUM_STEPS 200
#define STEP_SIZE 0.08

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
  vec3 p2 = pos + 0.5*h*k1x;
  vec3 v2 = vel + 0.5*h*k1v;
  vec3 k2v = schwarzschildAccel(p2, v2);
  vec3 k2x = v2;
  vec3 p3 = pos + 0.5*h*k2x;
  vec3 v3 = vel + 0.5*h*k2v;
  vec3 k3v = schwarzschildAccel(p3, v3);
  vec3 k3x = v3;
  vec3 p4 = pos + h*k3x;
  vec3 v4 = vel + h*k3v;
  vec3 k4v = schwarzschildAccel(p4, v4);
  vec3 k4x = v4;
  pos += (h/6.0) * (k1x + 2.0*k2x + 2.0*k3x + k4x);
  vel += (h/6.0) * (k1v + 2.0*k2v + 2.0*k3v + k4v);
  vel = normalize(vel);
}

float pack12x2(vec2 value) {
  vec2 quantized = floor(clamp(value, 0.0, 1.0) * 4095.0 + 0.5);
  return quantized.x + quantized.y * 4096.0;
}

vec2 signNotZero(vec2 value) {
  return vec2(
    value.x >= 0.0 ? 1.0 : -1.0,
    value.y >= 0.0 ? 1.0 : -1.0
  );
}

vec2 octEncode(vec3 direction) {
  vec3 normalizedDirection = direction /
    (abs(direction.x) + abs(direction.y) + abs(direction.z));
  vec2 encoded = normalizedDirection.xy;
  if (normalizedDirection.z < 0.0) {
    encoded = (1.0 - abs(encoded.yx)) * signNotZero(encoded.xy);
  }
  return encoded * 0.5 + 0.5;
}

float packMeta(float minR, bool absorbed, int hitCount) {
  float minQuantized = floor(
    clamp(minR / 128.0, 0.0, 1.0) * 65535.0 + 0.5
  );
  return minQuantized
    + (absorbed ? 65536.0 : 0.0)
    + float(hitCount) * 131072.0;
}

float packHit(vec2 hitXZ) {
  float radius = length(hitXZ);
  float angle = atan(hitXZ.y, hitXZ.x);
  vec2 normalizedHit = vec2(
    clamp((radius - DISK_INNER) / (DISK_OUTER - DISK_INNER), 0.0, 1.0),
    fract(angle / TAU + 0.5)
  );
  return pack12x2(normalizedHit);
}

void main() {
  vec2 uv = (v_uv * u_res - u_res * 0.5) /
    min(u_res.x, u_res.y);
  float t = u_time;
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
  vec3 pos = ro;
  vec3 vel = normalize(uv.x * uu + uv.y * vv + 1.4 * ww);
  bool absorbed = false;
  float minR = 100.0;
  int hitCount = 0;
  vec2 hit0 = vec2(0.0);
  vec2 hit1 = vec2(0.0);

  for (int i = 0; i < NUM_STEPS; i++) {
    float r = length(pos);
    minR = min(minR, r);
    if (r < SCHWARZSCHILD_R * 0.48) {
      absorbed = true;
      break;
    }
    float prevY = pos.y;
    float adaptiveH = STEP_SIZE * clamp(r * 0.3, 0.3, 4.0);
    rk4Step(pos, vel, adaptiveH);
    float currY = pos.y;
    if (prevY * currY < 0.0 && hitCount < 2) {
      float frac = abs(prevY) /
        (abs(prevY) + abs(currY) + 0.0001);
      vec3 hitP = pos - vel * adaptiveH * (1.0 - frac);
      float hitR = length(hitP.xz);
      if (hitR > DISK_INNER && hitR < DISK_OUTER) {
        if (hitCount == 0) hit0 = hitP.xz;
        else hit1 = hitP.xz;
        hitCount += 1;
      }
    }
    if (r > 120.0) break;
  }

  fragColor = vec4(
    pack12x2(octEncode(normalize(vel))),
    packMeta(minR, absorbed, hitCount),
    hitCount > 0 ? packHit(hit0) : 0.0,
    hitCount > 1 ? packHit(hit1) : 0.0
  );
}`;

export const VISUAL_RUNTIME_DARK_MATERIAL_SHADER = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_transport;
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
#define DISK_INNER 2.8
#define DISK_OUTER 12.0

struct TransportSample {
  vec3 exitDirection;
  float minR;
  float absorbed;
  int hitCount;
  vec2 hit0;
  vec2 hit1;
};

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
    p *= 2.1;
    a *= 0.48;
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

vec2 unpack12x2(float packedValue) {
  float y = floor(packedValue / 4096.0);
  float x = packedValue - y * 4096.0;
  return vec2(x, y) / 4095.0;
}

vec2 signNotZero(vec2 value) {
  return vec2(
    value.x >= 0.0 ? 1.0 : -1.0,
    value.y >= 0.0 ? 1.0 : -1.0
  );
}

vec3 octDecode(vec2 encoded) {
  vec2 f = encoded * 2.0 - 1.0;
  vec3 direction = vec3(f, 1.0 - abs(f.x) - abs(f.y));
  if (direction.z < 0.0) {
    direction.xy = (1.0 - abs(direction.yx)) * signNotZero(direction.xy);
  }
  return normalize(direction);
}

TransportSample decodeTransport(vec4 packedSample) {
  TransportSample decoded;
  decoded.exitDirection = octDecode(unpack12x2(packedSample.r));

  float hitCountValue = floor(packedSample.g / 131072.0);
  float remaining = packedSample.g - hitCountValue * 131072.0;
  decoded.absorbed = floor(remaining / 65536.0);
  float minQuantized = remaining - decoded.absorbed * 65536.0;
  decoded.minR = minQuantized / 65535.0 * 128.0;
  decoded.hitCount = int(clamp(hitCountValue, 0.0, 2.0));
  decoded.hit0 = unpack12x2(packedSample.b);
  decoded.hit1 = unpack12x2(packedSample.a);
  return decoded;
}

TransportSample sampleTransport(vec2 uv) {
  ivec2 size = textureSize(u_transport, 0);
  vec2 clampedUv = clamp(uv, vec2(0.0), vec2(0.999999));
  ivec2 coord = clamp(
    ivec2(floor(clampedUv * vec2(size))),
    ivec2(0),
    size - ivec2(1)
  );
  return decodeTransport(texelFetch(u_transport, coord, 0));
}

vec3 hitPosition(vec2 packedHit) {
  float radius = mix(DISK_INNER, DISK_OUTER, packedHit.x);
  float angle = (packedHit.y - 0.5) * TAU;
  return vec3(radius * cos(angle), 0.0, radius * sin(angle));
}

void accumulateDiskHit(
  vec2 packedHit,
  vec3 camPos,
  float t,
  inout vec3 accumulated,
  inout float alpha
) {
  vec3 dCol = diskColor(hitPosition(packedHit), camPos, t);
  float hitAlpha = clamp(length(dCol) * 0.7, 0.0, 0.9);
  accumulated += dCol * (1.0 - alpha) * hitAlpha;
  alpha += hitAlpha * (1.0 - alpha);
}

void main() {
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
  vec3 finalCol = vec3(0.0);
  float chromaticUvScale = min(u_res.x, u_res.y) / u_res.x;

  for (int ch = 0; ch < 3; ch++) {
    float chOff = (ch == 0) ? aberr : (ch == 2) ? -aberr : 0.0;
    TransportSample transport = sampleTransport(
      v_uv + vec2(chOff * chromaticUvScale, 0.0)
    );
    bool absorbed = transport.absorbed > 0.5;
    vec3 accumulated = vec3(0.0);
    float alpha = 0.0;

    if (transport.hitCount > 0) {
      accumulateDiskHit(transport.hit0, ro, t, accumulated, alpha);
    }
    if (transport.hitCount > 1) {
      accumulateDiskHit(transport.hit1, ro, t, accumulated, alpha);
    }

    vec3 c;
    if (absorbed) {
      float glow = exp(
        -(transport.minR - SCHWARZSCHILD_R * 0.48) * 4.0
      );
      c = psychePalette(t * 0.15, 0.0) * glow * 0.15;
    } else {
      c = stars(transport.exitDirection, t);
    }
    c = mix(c, accumulated / max(alpha, 0.001), alpha);
    float ringDist = abs(transport.minR - PHOTON_SPHERE_R);
    float ringGlow = exp(-ringDist * ringDist * 8.0) * 0.8;
    float nearOrbit = exp(-ringDist * 20.0) * 1.5;
    vec3 ringCol = psychePalette(
      t * 0.12 + transport.minR * 0.3,
      0.15
    );
    c += ringCol * (ringGlow + nearOrbit);
    if (transport.minR < PHOTON_SPHERE_R * 1.3 && !absorbed) {
      float lensAmp = 1.0 + 2.0 * exp(
        -(transport.minR - PHOTON_SPHERE_R) * 3.0
      );
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
  float interference = 0.96 + 0.04 * sin(
    gl_FragCoord.y * 0.5 + t * 14.0
  );
  finalCol *= interference;

  vec2 cv = v_uv * 2.0 - 1.0;
  float curv = 1.0 - 0.35 * dot(cv * cv, cv * cv);
  finalCol *= clamp(curv, 0.0, 1.0);

  float lum = dot(finalCol, vec3(0.299, 0.587, 0.114));
  finalCol += finalCol * smoothstep(0.4, 1.0, lum) * 0.3;

  if (u_lightMode > 0.5) finalCol = 1.0 - finalCol;
  fragColor = vec4(finalCol, 1.0);
}`;
