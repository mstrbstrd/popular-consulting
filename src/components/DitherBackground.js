// DitherBackground.js
// Persistent full-screen WebGL dither canvas. Lives in the fixed background layer.
//
// Each section has a distinct movement PATTERN (shape) + parameter preset.
// When activeSection changes, the shader smoothly cross-dissolves between the
// current movement pattern and the incoming one over ~1.5 seconds, while also
// interpolating speed, contrast, warp, and rainbow speed.
//
// Shape assignments:
//   0 Hero    → Ripples (6)  — interactive circular waves, reactive to cursor
//   1 Bio     → Waves   (3)  — sweeping horizontal flow, contemplative
//   2 Services → Mandala (4) — radial geometric symmetry, structured
//   3 Contact  → Plasma  (0) — smooth organic drift, warm and inviting
//
// Ripple interaction is forwarded from DitherHero via window.__addDitherRipple.

import React, { useRef, useEffect } from "react";
import { isMobileTier, MOBILE_DITHER_OVERRIDES } from "../utils/deviceTier";

// Per-section targets (all params lerp at lerpFactor ≈ 0.025/frame → ~2s settle)
// shape transitions use a linear blend over ~90 frames (~1.5s at 60fps)
const PRESETS = [
  { speed: 0.7, contrast: 3.0, warp: 0.59, rainbowSpeed: 1.08, shape: 6 }, // Hero     – Ripples
  { speed: 0.32, contrast: 1.9, warp: 0.28, rainbowSpeed: 0.45, shape: 3 }, // Bio      – Waves
  { speed: 0.48, contrast: 2.5, warp: 0.42, rainbowSpeed: 0.75, shape: 4 }, // Services – Mandala
  { speed: 0.22, contrast: 1.55, warp: 0.18, rainbowSpeed: 0.32, shape: 0 }, // Contact  – Plasma
  { speed: 0.55, contrast: 1.1, warp: 0.0, rainbowSpeed: 1.5, shape: 7 }, // Orb      – Sphere 3D
  { speed: 0.32, contrast: 1.9, warp: 0.28, rainbowSpeed: 0.45, shape: 3 }, // Game     – Waves (matches Bio)
];

const FIXED = {
  pattern: 0,
  threshold: 0.5,
  scale: 1,
  noiseMix: 0,
  invert: false,
  scanlines: false,
  fgHSB: [0, 0, 100],
  bgHSB: [195, 0, 100],
  renderMode: 2,
  cellSize: 6,
  rainbow: 3,
  rainbowBg: false,
};

const CHARSET = " ░▒▓█▄▀■□▪";
const ATLAS_CELL = 32;

// ── GLSL ──
const VERT = `#version 300 es
in vec2 a_pos;out vec2 v_uv;
void main(){v_uv=a_pos*.5+.5;gl_Position=vec4(a_pos,0,1);}`;

// Two-shape blend: u_shapeA is the current pattern, u_shapeB is the incoming
// pattern, u_shapeMix cross-dissolves between them.
const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 fragColor;
uniform float u_time,u_hueOffset,u_threshold,u_scale,u_contrast,u_warp,u_noiseMix,u_reveal;
uniform vec2 u_res;
uniform int u_shapeA,u_shapeB,u_renderMode;
uniform float u_shapeMix;
uniform bool u_invert,u_scanlines;
uniform vec3 u_fg,u_bg;
uniform int u_rainbow;
uniform float u_rainbowSpeed;
uniform bool u_rainbowBg;
uniform sampler2D u_atlas;
uniform float u_cellSize;
uniform int u_charCount,u_atlasCols,u_atlasRows;
uniform float u_atlasCellSize;
uniform int u_rippleCount;
uniform vec3 u_ripples[12];
// Face / expression uniforms (only used by sceneSphere3D / shape 7)
uniform float u_eyeOpen,u_eyeY,u_mouthCurve,u_mouthOpen,u_expressionBlend;
uniform int u_expressionId;
// Pop / reanimate uniforms (shape 7 only)
uniform float u_popPhase; // -1=idle  0→1=popping  1→1.6=gone  1.6→3.0=reforming
uniform int u_reanimIdx;  // 0=coalesce  1=slide from left  2=bubbles from left
uniform float u_cdBlend,u_cdSpinSpeed,u_cdSpinAngle; // CD morph: 0=orb  1=CD disc

const int bayer4[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
const int bayer8[64]=int[64](0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21);

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float hash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.1;a*=.5;}return v;}

vec3 hsb2rgb(float h,float s,float b){
  vec3 c=clamp(abs(mod(h*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);
  return b*mix(vec3(1),c,s);
}
vec3 getRainbow(vec2 uv,vec2 cellID,float bv,float flowMag,vec2 grad){
  float hue=0.;
  if(u_rainbow==1){hue=uv.x*.6+uv.y*.4+u_time*u_rainbowSpeed*.3;}
  else if(u_rainbow==2){hue=length(uv-.5)*2.+u_time*u_rainbowSpeed*.2;}
  else if(u_rainbow==3){hue=atan(grad.y,grad.x)/6.2832+bv*.5+u_hueOffset;}
  else{hue=(cellID.x*.13+cellID.y*.09)+u_time*u_rainbowSpeed*.2;}
  // Expression hue bias — tints entire orb toward red (angry) or blue (sad)
  if(u_expressionId==7&&u_expressionBlend>.001)
    hue=mix(hue,.02,u_expressionBlend*.65);   // angry → red-orange
  else if(u_expressionId==3&&u_expressionBlend>.001)
    hue=mix(hue,.60,u_expressionBlend*.45);   // sad → cool blue
  hue=fract(hue);
  vec3 raw=hsb2rgb(hue,1.,1.);
  float lum=dot(raw,vec3(.299,.587,.114));
  float boost=.55/max(lum,.1);
  raw=min(raw*boost,vec3(1.));
  float newLum=dot(raw,vec3(.299,.587,.114));
  raw=mix(vec3(newLum),raw,1.2);
  return clamp(raw,vec3(0),vec3(1));
}
vec3 getRainbowBg(vec2 uv,vec2 cellID,float flowMag,vec2 grad){
  float hue=0.;
  if(u_rainbow==1){hue=uv.x*.6+uv.y*.4+u_time*u_rainbowSpeed*.3;}
  else if(u_rainbow==2){hue=length(uv-.5)*2.+u_time*u_rainbowSpeed*.2;}
  else if(u_rainbow==3){hue=atan(grad.y,grad.x)/6.2832+u_hueOffset;}
  else{hue=(cellID.x*.13+cellID.y*.09)+u_time*u_rainbowSpeed*.2;}
  hue=fract(hue+.5);
  vec3 tint=hsb2rgb(hue,.6,.2);
  return vec3(.02,.03,.12)+tint*.3;
}

// ── CD single-pass: disc geometry + iridescence ──────────────────────────────
float sceneCDisc(vec2 uv,float t,float spinSpeed,out float normR,out float normA,out float iridMask,out float discHit){
  float aspect=u_res.x/u_res.y;
  float bob=0.018*sin(t*0.65)+0.006*sin(t*1.4);
  float sway=0.008*sin(t*0.45+1.2);
  // Align disc center precisely with orb screen-space center
  vec3 discC=vec3(sway*0.924*aspect,bob*0.924,1.05);
  float wA=0.05*sin(t*1.83+0.5);
  float wB=0.03*sin(t*2.31+1.2);
  vec3 discN=normalize(vec3(wB,sin(0.12+wA),cos(0.12+wA)));
  vec2 ndc=(uv-0.5)*vec2(aspect,1.0);
  vec3 ro=vec3(0.0);vec3 rd=normalize(vec3(ndc*0.88,1.0));
  float denom=dot(discN,rd);
  if(abs(denom)<0.0003){normR=0.;normA=0.;iridMask=0.;discHit=0.;return 0.;}
  float hitT=dot(discN,discC-ro)/denom;
  if(hitT<0.05){normR=0.;normA=0.;iridMask=0.;discHit=0.;return 0.;}
  vec3 hp=ro+rd*hitT;
  vec3 wu=vec3(0.,1.,0.);
  vec3 dR_=normalize(cross(wu,discN));
  vec3 dU_=cross(discN,dR_);
  vec2 local=vec2(dot(hp-discC,dR_),dot(hp-discC,dU_));
  float r=length(local);
  const float OUTER=0.295,INNER=0.031,HUB=0.068,TRACK=0.112;
  // Outside disc: no hit
  if(r>OUTER){normR=0.;normA=0.;iridMask=0.;discHit=0.;return 0.;}
  // Inside disc footprint (including center hole): mark as hit so orb gets suppressed
  discHit=smoothstep(OUTER,OUTER*0.94,r);
  if(r<INNER){normR=0.;normA=0.;iridMask=0.;return 0.;}
  float spinA=-u_cdSpinAngle;
  vec2 spun=vec2(cos(spinA)*local.x-sin(spinA)*local.y,sin(spinA)*local.x+cos(spinA)*local.y);
  float lon=atan(spun.y,spun.x);
  normR=clamp((r-INNER)/(OUTER-INNER),0.,1.);
  normA=fract((lon+3.14159265)/6.28318530);
  float lat=normR*3.14159265;
  float brite;
  if(r<HUB){
    vec3 V=normalize(-rd);
    vec3 H=normalize(normalize(vec3(-0.4,0.7,-1.0))+V);
    float spec=pow(max(dot(discN,H),0.),60.)*0.35;
    brite=0.82+spec;iridMask=0.;
  }else{
    float diffuse=clamp(dot(discN,normalize(vec3(-0.5,0.6,0.9))),0.,1.);
    float fill=clamp(dot(discN,normalize(vec3(0.6,-0.3,0.5))),0.,1.)*0.20;
    float rim_=pow(smoothstep(OUTER*0.72,OUTER,r),2.5)*0.30;
    float waves=0.22*sin(lat*7.+t*1.6)+0.16*sin(lon*5.-t*1.3+lat*2.)+0.12*sin(lat*11.+lon*3.+t*2.1)+0.08*cos(lon*8.+t*0.9-lat*4.)+0.06*sin(lat*15.-t*2.8);
    float sweep1=0.18*sin(lon*2.);
    float sweep2=0.10*sin(lon*1.+0.8);
    float streak=0.12*pow(normR,0.6)*sin(lon*4.)*smoothstep(0.2,0.8,normR);
    brite=clamp(0.68+0.22*diffuse+fill+rim_+waves*0.14+sweep1+sweep2+streak,0.10,1.);
    vec3 V=normalize(-rd);
    vec3 H=normalize(normalize(vec3(-0.5,0.6,0.9))+V);
    float spec=pow(max(dot(discN,H),0.),90.)*0.80;
    brite=clamp(brite+spec,0.,1.);
    iridMask=smoothstep(HUB,TRACK,r);
  }
  float outerFade=smoothstep(OUTER,OUTER*0.935,r);
  float innerFade=smoothstep(INNER,INNER*2.2,r);
  float rimCatch=smoothstep(OUTER*0.935,OUTER*0.99,r)*0.12;
  brite=brite*outerFade*innerFade+rimCatch;
  return clamp((brite-0.5)*1.18+0.5,0.,1.);
}
vec3 getCDIridescence(vec2 uv,float bv,float normR,float iridMask){
  vec2 fc=uv-0.5;fc.x*=u_res.x/u_res.y;
  float pa=atan(fc.y,fc.x);
  float bp=0.55+sin(u_time*u_rainbowSpeed*0.07)*0.65;
  float d1=pa-bp;d1-=6.28318*floor((d1+3.14159)/6.28318);
  float a1=smoothstep(1.45,0.05,abs(d1))*iridMask;
  float d2=pa-(bp+3.14159);d2-=6.28318*floor((d2+3.14159)/6.28318);
  float a2=smoothstep(1.10,0.05,abs(d2))*iridMask*0.75;
  float mask=clamp(a1+a2*(1.-a1),0.,1.);
  float hs=a2*(1.-a1)*0.18;
  float rh=fract(mix(0.,0.78,normR)+hs);
  vec3 raw=hsb2rgb(rh,1.,1.);
  float lum=dot(raw,vec3(.299,.587,.114));
  float boost=.55/max(lum,.1);
  raw=min(raw*boost,vec3(1.));
  float nl=dot(raw,vec3(.299,.587,.114));
  vec3 vivid=clamp(mix(vec3(nl),raw,1.2),vec3(0),vec3(1));
  float sl=mix(0.48,0.75,bv);
  return mix(vec3(sl*0.87,sl*0.90,sl),vivid,mask);
}

// ── Scene functions — each one is a distinct movement pattern ──
float scenePlasma(vec2 uv,float t){return .5+.5*sin(uv.x*3.+t)*sin(uv.y*3.-t*.7)+.25*sin(length(uv-.5)*8.-t*2.)+.25*fbm(uv*3.+t*.3);}
float sceneSpheres(vec2 uv,float t){float d=1.;for(int i=0;i<6;i++){float fi=float(i);vec2 c=vec2(.5)+.3*vec2(sin(t+fi*1.2),cos(t*.8+fi*.9));d=min(d,length(uv-c)-.06-fi*.02);}return clamp(smoothstep(.0,-.15,d)+.2*fbm(uv*5.+t*.5),0.,1.);}
float sceneTunnel(vec2 uv,float t){vec2 p=uv-.5;float a=atan(p.y,p.x),r=length(p);float v=.5+.5*sin(a*3.+1./max(r,.01)*1.5-t*3.);v*=smoothstep(.0,.1,r);return clamp(v,0.,1.);}
float sceneWaves(vec2 uv,float t){float v=0.;for(int i=0;i<5;i++){float fi=float(i);v+=sin(uv.x*6.+fi*1.5+t*(1.+fi*.3))*(.3-fi*.04);v+=cos(uv.y*4.+fi*2.-t*.7)*(.2-fi*.03);}return clamp(.5+v*.3,0.,1.);}
float sceneMandala(vec2 uv,float t){vec2 p=uv-.5;float a=atan(p.y,p.x),r=length(p);float v=.5+.25*sin(a*6.+t)+.25*cos(r*20.-t*3.);v+=.15*sin(a*12.-t*2.)*cos(r*10.+t);v*=smoothstep(.5,.1,r);return clamp(v,0.,1.);}
float sceneTerrain(vec2 uv,float t){vec2 p=uv*3.+vec2(t*.3,t*.1);return clamp(fbm(p)+.5*fbm(p*2.+3.7),0.,1.);}
float sceneRipples(vec2 uv,float t){
  float aspect=u_res.x/u_res.y;
  vec2 auv=vec2((uv.x-.5)*aspect,uv.y-.5);
  float v=0.;
  v+=.09*sin(uv.x*2.5+uv.y*1.2+t*.3);
  v+=.08*sin(-uv.x*1.8+uv.y*3.+t*.22);
  v+=.07*cos(uv.x*3.2-uv.y*2.+t*.38);
  v+=.055*sin(uv.x*5.5+uv.y*2.5+t*.6);
  v+=.05*cos(uv.x*3.5-uv.y*5.+t*.48);
  v+=.045*sin(uv.x*4.+uv.y*6.5+t*.72);
  v+=.025*sin(uv.x*10.-uv.y*2.+t*1.2);
  v+=.02*cos(uv.x*2.+uv.y*11.-t*1.0);
  v+=.05*sin(length(auv-vec2(.22,.15))*9.-t*.9);
  v+=.04*sin(length(auv+vec2(.2,-.2))*11.-t*1.1);
  v+=.035*sin(length(auv-vec2(-.25,.08))*8.-t*1.3);
  v+=.07*fbm(uv*2.5+vec2(t*.1,t*.07));
  v+=.04*fbm(uv*4.-vec2(t*.12,-t*.08));
  for(int i=0;i<12;i++){
    if(i>=u_rippleCount)break;
    vec2 center=u_ripples[i].xy;float birth=u_ripples[i].z;
    float age=t-birth;if(age<0.||age>10.)continue;
    vec2 ac_=vec2((center.x-.5)*aspect,center.y-.5);
    float dist=length(auv-ac_);
    float wf=.4*age;
    float wave=sin(dist*40.-.4*age*40.);
    float amp=.35*wave/(1.+dist*8.)*smoothstep(wf+.02,wf-.04,dist)*smoothstep(0.,wf*.3,dist)*exp(-.6*age)*smoothstep(0.,.03,dist);
    v+=amp;
  }
  return clamp(v+.5,0.,1.);
}

// Sphere 3D — the sphere's own material splits into face components on expression.
// The rest of the body dissolves; eyes + mouth retain the exact sphere texture,
// as if an intelligence within is reshaping its own form.

// Line-segment SDF helper
float sdSeg(vec2 p,vec2 a,vec2 b){
  vec2 pa=p-a,ba=b-a;
  float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);
  return length(pa-ba*h);
}

// Z-shape SDF — three segments in a [-0.5,0.5] box, scaled by s
float sdZ(vec2 p,float s){
  p/=s;
  return min(sdSeg(p,vec2(-.5,.5),vec2(.5,.5)),
         min(sdSeg(p,vec2(.5,.5),vec2(-.5,-.5)),
             sdSeg(p,vec2(-.5,-.5),vec2(.5,-.5))))*s;
}

// IQ 5-pointed star SDF — returns negative inside, positive outside
float sdStar5(vec2 p,float r,float rf){
  vec2 k1=vec2(0.809016994375,-0.587785252192);
  vec2 k2=vec2(-k1.x,k1.y);
  p.x=abs(p.x);
  p-=2.*max(dot(k1,p),0.)*k1;
  p-=2.*max(dot(k2,p),0.)*k2;
  p.x=abs(p.x);
  p.y-=r;
  vec2 ba=rf*vec2(-k1.y,k1.x)-vec2(0.,1.);
  float h=clamp(dot(p,ba)/dot(ba,ba),0.,r);
  return length(p-ba*h)*sign(p.y*ba.x-p.x*ba.y);
}

// ── Pop / reanimate helpers (shape 7 only) ──────────────────────────────────
// Sphere lit from a 2D disc point p (aspect-corrected from centre), radius R
float sphereLit(vec2 p,float R,float t){
  float dist=length(p);
  if(dist>=R)return 0.;
  float z=sqrt(max(0.,R*R-dist*dist));
  vec3 n=normalize(vec3(p.x,p.y,z));
  float diff=clamp(dot(n,normalize(vec3(-.5,.6,.9))),0.,1.);
  float fill=clamp(dot(n,normalize(vec3(.6,-.3,.5))),0.,1.)*.25;
  float rim=pow(1.-z/R,2.5)*.4;
  float lat=acos(clamp(n.y,-1.,1.)),lon=atan(n.z,n.x);
  float waves=.22*sin(lat*7.+t*1.6)+.16*sin(lon*5.-t*1.3+lat*2.)
             +.12*sin(lat*11.+lon*3.+t*2.1)+.08*cos(lon*8.+t*.9-lat*4.)
             +.06*sin(lat*15.-t*2.8);
  return clamp(.20+.50*diff+fill+rim+waves*.28,.04,1.);
}
float easeOutBack(float t){float c=1.70158;return 1.+(c+1.)*pow(t-1.,3.)+c*pow(t-1.,2.);}
float easeInOutCubic(float t){return t<.5?4.*t*t*t:(t-1.)*(2.*t-2.)*(2.*t-2.)+1.;}
float bubbleLit(vec2 uv,vec2 bc,float R,float t,float aspect){
  vec2 p=vec2((uv.x-bc.x)*aspect,uv.y-bc.y);
  return sphereLit(p,R,t);
}
// Full 3D ray-sphere brightness (no expression) — shared by idle path and reanimate crossfade
float idleSphereBase(vec2 uv,float aspect,vec2 restCenter,float t){
  vec2 ndc=(uv-restCenter)*vec2(aspect,1.)*2.;
  vec3 ro=vec3(0.,0.,2.5);
  vec3 rd=normalize(vec3(ndc,-2.));
  float r=.72;
  float b_=dot(ro,rd),c_=dot(ro,ro)-r*r,disc=b_*b_-c_;
  if(disc<0.)return 0.;
  float hit=-b_-sqrt(disc);
  if(hit<=0.)return 0.;
  vec3 p=ro+rd*hit;
  vec3 n=normalize(p);
  float ca=cos(t*.25),sa=sin(t*.25);
  vec3 pr=vec3(ca*p.x+sa*p.z,p.y,-sa*p.x+ca*p.z);
  float d1=fbm(pr.xz*2.5+vec2(t*.05,0.));
  float d2=fbm(pr.xy*4.5+vec2(17.3,t*.09));
  float d3=fbm(pr.yz*5.+vec2(t*.07,31.7));
  float detail=d1*.40+d2*.35+d3*.25;
  vec3 L=normalize(vec3(1.5,2.,2.));
  float diff=max(dot(n,L),0.);
  float spec=pow(max(dot(reflect(-L,n),-rd),0.),32.)*.35;
  float rim=pow(1.-abs(dot(-rd,n)),4.)*.45;
  return clamp(.22+diff*.45+detail*.42+spec+rim,0.,1.);
}

float sceneSphere3D(vec2 uv,float t){
  float aspect=u_res.x/u_res.y;

  // Bob/sway — same frequencies used in reanimate tapering for seamless handoff
  float bob=.018*sin(t*.65)+.006*sin(t*1.4);
  float sway=.008*sin(t*.45+1.2);
  vec2 restCenter=vec2(.5+sway,.5+bob);

  // 2D disc coords (aspect-corrected from restCenter) used by pop/reanimate paths
  const float R2D=.299;
  vec2 p2d=vec2((uv.x-restCenter.x)*aspect,uv.y-restCenter.y);

  // ── POPPING (u_popPhase 0→1) ────────────────────────────────────────────────
  if(u_popPhase>=0.&&u_popPhase<1.){
    float pt=u_popPhase;
    float expandR=R2D*(1.+pt*.55);
    float dist=length(p2d);
    if(dist>expandR*1.06)return 0.;
    float shellW=.028*(1.+pt*1.8);
    float shellT=max(0.,1.-abs(dist-expandR)/shellW);
    shellT=pow(shellT,.6);
    float interior=smoothstep(expandR*.92,expandR*.35,dist)*(1.-pt*.9);
    float flash=pow(smoothstep(.62,1.,pt),2.)*shellT*1.8;
    float fade=1.-smoothstep(.80,1.,pt);
    return clamp((shellT*.75+interior*.3+flash)*fade,0.,1.);
  }

  // ── GONE (u_popPhase 1→1.6) ─────────────────────────────────────────────────
  if(u_popPhase>=1.&&u_popPhase<1.6)return 0.;

  // ── REFORMING (u_popPhase 1.6→3.0) ──────────────────────────────────────────
  if(u_popPhase>=1.6){
    float rt=clamp((u_popPhase-1.6)/1.4,0.,1.);
    float reanimResult=0.;

    // Scenario 0 — coalesce from centre
    if(u_reanimIdx==0){
      float springR=R2D*(1.+.28*(1.-rt)*sin(rt*3.14159*1.4)*exp(-rt*2.5));
      float scatter=(1.-smoothstep(0.,.7,rt))*.12;
      float ang=atan(p2d.y,p2d.x)*3.;
      vec2 disp=p2d+scatter*vec2(cos(ang+t),sin(ang+t*1.3));
      if(length(disp)<=springR*1.08){
        float raw=sphereLit(p2d,springR,t);
        float fadeIn=smoothstep(0.,.45,rt);
        float sparkle=smoothstep(.3,.5,rt)*smoothstep(.7,.5,rt)
                     *smoothstep(springR*.95,springR,length(p2d))*.6;
        reanimResult=clamp(raw*fadeIn+sparkle,0.,1.);
      }
    }

    // Scenario 1 — bob in from left
    if(u_reanimIdx==1){
      float cx=mix(-.45,restCenter.x,easeInOutCubic(rt));
      float a1=mix(.080,.018,rt),a2=mix(.032,.006,rt);
      float cy=.5+a1*sin(t*.65)+a2*sin(t*1.4);
      vec2 sp=vec2((uv.x-cx)*aspect,uv.y-cy);
      if(length(sp)<=R2D*1.05)
        reanimResult=clamp(sphereLit(sp,R2D,t)*smoothstep(0.,.06,rt),0.,1.);
    }

    // Scenario 2 — bubbles blown in from left
    if(u_reanimIdx==2){
      // companion bubbles: [destX, yBase, radius, lag, fadeStart, bobAmp, bobFreq, bobPhase]
      const float CS[80]=float[80](
        1.20,-.17,.080,.00,.65,.048,2.10,.00,
        1.45, .22,.055,.03,.55,.062,2.80,1.30,
        1.08, .10,.100,.07,.75,.040,1.70,2.50,
        1.60,-.28,.042,.01,.48,.072,3.40,.80,
        0.92, .30,.090,.12,.82,.052,1.50,1.80,
        1.35,-.10,.065,.05,.60,.058,2.50,3.10,
        1.18, .18,.078,.09,.70,.044,1.95,4.20,
        1.75,-.22,.038,.02,.44,.075,3.70,.40,
        0.98, .25,.092,.15,.84,.046,1.40,2.20,
        1.28, .05,.070,.04,.66,.054,2.60,5.00
      );
      for(int i=0;i<10;i++){
        float dX=CS[i*8+0],yB=CS[i*8+1],cR=CS[i*8+2],lag=CS[i*8+3];
        float fSt=CS[i*8+4],bA=CS[i*8+5],bF=CS[i*8+6],bP=CS[i*8+7];
        float lrt=clamp((rt-lag)/max(1.-lag,.001),0.,1.);
        float cx=mix(-.50,dX,easeInOutCubic(lrt));
        float cy=.5+yB+bA*sin(t*bF+bP);
        float fIn=smoothstep(0.,.06,lrt),fOut=1.-smoothstep(fSt,fSt+.25,lrt);
        reanimResult=max(reanimResult,bubbleLit(uv,vec2(cx,cy),cR,t,aspect)*fIn*fOut);
      }
      // background bubbles: [destX, yBase, rise, radius, lag, fadeStart, bobAmp, bobFreq, bobPhase]
      const float BS[54]=float[54](
        .82, .06,-.10,.045,.25,.88,.032,3.10,.00,
        1.10,-.09,-.08,.032,.30,.82,.028,2.60,1.80,
        .74, .13,-.14,.058,.28,.92,.040,2.20,3.40,
        1.20,-.19,-.07,.028,.22,.78,.025,3.80,.90,
        .90, .21,-.12,.038,.35,.90,.035,2.80,5.10,
        .68,-.05,-.09,.052,.32,.94,.030,2.40,2.20
      );
      for(int i=0;i<6;i++){
        float dX=BS[i*9+0],yB=BS[i*9+1],rise=BS[i*9+2],cR=BS[i*9+3];
        float lag=BS[i*9+4],fSt=BS[i*9+5],bA=BS[i*9+6],bF=BS[i*9+7],bP=BS[i*9+8];
        float lrt=clamp((rt-lag)/max(1.-lag,.001),0.,1.);
        float cx=mix(-.52,dX,easeInOutCubic(lrt));
        float cy=.5+yB+rise*lrt+bA*sin(t*bF+bP);
        float fIn=smoothstep(0.,.06,lrt),fOut=1.-smoothstep(fSt,fSt+.12,lrt);
        reanimResult=max(reanimResult,bubbleLit(uv,vec2(cx,cy),cR,t,aspect)*fIn*fOut);
      }
      // main sphere (lagged) — amplitude tapers to exact idle values at rt=1
      float mLag=.20,mrt=clamp((rt-mLag)/max(1.-mLag,.001),0.,1.);
      float mcx=mix(-.48,restCenter.x,easeInOutCubic(mrt));
      float ma1=mix(.080,.018,mrt),ma2=mix(.032,.006,mrt);
      float mcy=.5+ma1*sin(t*.65)+ma2*sin(t*1.4);
      vec2 mp=vec2((uv.x-mcx)*aspect,uv.y-mcy);
      reanimResult=max(reanimResult,sphereLit(mp,R2D,t)*smoothstep(0.,.08,mrt));
    }

    // Crossfade into idle 3D sphere in final 15% of reform — eliminates visual snap
    float blendT=smoothstep(0.85,1.0,rt);
    if(blendT>0.001)
      reanimResult=mix(reanimResult,idleSphereBase(uv,aspect,restCenter,t),blendT);
    return clamp(reanimResult,0.,1.);
  }

  // ── IDLE — full 3D ray-sphere with expression system ────────────────────────
  vec2 ndc=(uv-restCenter)*vec2(aspect,1.)*2.;
  vec3 ro=vec3(0.,0.,2.5);
  vec3 rd=normalize(vec3(ndc,-2.));
  float r=.72;
  float b_=dot(ro,rd),c_=dot(ro,ro)-r*r,disc=b_*b_-c_;
  if(disc<0.) return 0.;
  float hit=-b_-sqrt(disc);
  if(hit<=0.) return 0.;

  // Surface hit — compute sphere texture + lighting
  vec3 p=ro+rd*hit;
  vec3 n=normalize(p);
  float ca=cos(t*.25),sa=sin(t*.25);
  vec3 pr=vec3(ca*p.x+sa*p.z,p.y,-sa*p.x+ca*p.z);
  float d1=fbm(pr.xz*2.5+vec2(t*.05,  0.));
  float d2=fbm(pr.xy*4.5+vec2(17.3,  t*.09));
  float d3=fbm(pr.yz*5. +vec2(t*.07, 31.7));
  float detail=d1*.40+d2*.35+d3*.25;
  vec3 L=normalize(vec3(1.5,2.,2.));
  float diff=max(dot(n,L),0.);
  float spec=pow(max(dot(reflect(-L,n),-rd),0.),32.)*.35;
  float rim=pow(1.-abs(dot(-rd,n)),4.)*.45;
  float sphereBrightness=clamp(.22+diff*.45+detail*.42+spec+rim,0.,1.);

  if(u_expressionBlend<.001) return sphereBrightness;

  // ── Face — Cheshire split: sphere material carves into floating features ──
  float blend=u_expressionBlend;
  float drift=blend*.055;
  float floatY=sin(t*.65)*.014*blend;

  // Per-eye geometry (can differ for asymmetric expressions)
  float eW=.082;
  float eHbase=.015+.073*u_eyeOpen;
  float eHL=eHbase, eHR=eHbase;
  float eyeYL=u_eyeY*.46+.10+floatY;
  float eyeYR=eyeYL;
  float eyeXL=.24+drift, eyeXR=.24+drift;
  float motX=0.,motY=0.,mouthAnimCurve=0.;

  // Universal blink — every ~5.5s. Skipped for surprised/sleepy (own eye motion).
  float blinkT=fract(t*.32+.55);
  float blinkAmt=0.;
  if(u_expressionId!=4&&u_expressionId!=6)
    blinkAmt=(smoothstep(.88,.93,blinkT)-smoothstep(.93,.98,blinkT))*blend;

  // ── Per-expression secondary animation ────────────────────────────────────
  if(u_expressionId==1){           // happy — soft warm bounce + gentle sway (calm, relaxed)
    motY=sin(t*3.5)*.010;
    motX=sin(t*1.8)*.006;          // subtle side-to-side sway
    mouthAnimCurve=sin(t*3.5+.5)*.07;

  } else if(u_expressionId==2){   // excited — fast chaotic bounce + multi-freq wiggle (manic energy)
    motY=sin(t*8.5)*.022;
    motX=sin(t*10.2+.5)*.014+sin(t*7.3+1.2)*.006; // two freqs = feels chaotic
    eHL+=sin(t*8.5+1.)*.012;
    eHR+=sin(t*8.5+1.)*.012;

  } else if(u_expressionId==3){   // sad — slow pendulum sway + quivering lip
    motX=sin(t*2.2)*.016;
    motY=-abs(sin(t*1.3+.7))*.007;
    mouthAnimCurve=sin(t*6.)*.040;

  } else if(u_expressionId==4){   // surprised — upward jolt on entry then quiver
    float entry=blend*(1.-blend)*4.;
    eyeYL+=entry*.022; eyeYR+=entry*.022;
    motX=sin(t*17.)*.006;
    motY=cos(t*14.)*.005;
    eHL+=sin(t*7.)*.010;
    eHR+=sin(t*7.+.8)*.010;

  } else if(u_expressionId==5){   // thinking — slow contemplative tilt + asymmetric squint
    motX=sin(t*1.7)*.013;
    motY=cos(t*1.3)*.007;
    eHR=eHL*.60;                   // right eye squints (quizzical)
    eyeYR+=.013*blend;

  } else if(u_expressionId==6){   // sleepy — eyes slowly droop on long cycle
    motY=sin(t*.9)*.010;
    float droop=.5+.5*sin(t*1.0-1.57);
    eHL*=(.45+droop*.55);
    eHR*=(.45+droop*.55);

  } else if(u_expressionId==7){   // angry — rapid tremble + inward-drawn eyes
    motX=sin(t*21.)*.007;
    motY=cos(t*19.)*.006;
    eyeXL-=.018*blend;
    eyeXR-=.018*blend;
  } else if(u_expressionId==8){   // talking — subtle alive micro-motion, mouth driven from JS
    motX=sin(t*2.3)*.004;
    motY=sin(t*1.7)*.003+cos(t*3.1)*.002;
  }

  // Gate motion, accumulate
  motX*=blend; motY*=blend; mouthAnimCurve*=blend;
  eyeYL+=motY; eyeYR+=motY;

  // Blink
  eHL=max(eHL*max(.04,1.-blinkAmt),.002);
  eHR=max(eHR*max(.04,1.-blinkAmt),.002);

  // Eye shapes
  float eyes;
  if(u_expressionId==2){
    // Excited — slowly spinning + pulsing 5-pointed star eyes (🤩 emoji style)
    float starR=.090+sin(t*8.5+.8)*.018; // pulses in sync with excited bounce
    float starRF=.38;
    float spinA=t*2.2;
    float cs=cos(spinA),ss=sin(spinA);
    float bS=max(.04,1.-blinkAmt);    // blink by squishing y
    vec2 qL=vec2(p.x+eyeXL+motX,(p.y-eyeYL)/bS);
    vec2 qR=vec2(p.x-eyeXR-motX,(p.y-eyeYR)/bS);
    vec2 rqL=vec2(qL.x*cs-qL.y*ss,qL.x*ss+qL.y*cs);
    vec2 rqR=vec2(qR.x*cs-qR.y*ss,qR.x*ss+qR.y*cs);
    float sL=sdStar5(rqL,starR,starRF);
    float sR=sdStar5(rqR,starR,starRF);
    eyes=max(smoothstep(.012,0.,sL),smoothstep(.012,0.,sR));
  } else {
    float dL=length(vec2((p.x+eyeXL+motX)/eW,(p.y-eyeYL)/eHL));
    float dR=length(vec2((p.x-eyeXR-motX)/eW,(p.y-eyeYR)/eHR));
    eyes=max(smoothstep(1.,.18,dL),smoothstep(1.,.18,dR));
  }

  // Mouth
  float mouth;
  if(u_expressionId==4){            // surprised — O-shaped ring mouth
    float oCX=motX;
    float oCY=-.18+motY*.6;
    float oW=.058+u_mouthOpen*.015;
    float oH=.072+u_mouthOpen*.022;
    float oThick=.018;
    float oEx=p.x-oCX;
    float oEy=(p.y-oCY)*oW/oH;
    float oDist=abs(length(vec2(oEx,oEy))-oW);
    mouth=smoothstep(oThick,oThick*.12,oDist);
  } else if(u_expressionId==2){     // excited — wide open grin, clear of star eyes
    float effMC=u_mouthCurve+mouthAnimCurve;
    float mBaseY=-.22-drift*.55+effMC*.02+floatY*.45+motY*.6; // lowered baseline
    float mCurve=effMC*.14*(p.x*p.x)/(.32*.32); // flatter arc so edges stay low
    float mDist=abs(p.y-(mBaseY+mCurve));
    float mThick=.022+u_mouthOpen*.110;          // tall open mouth
    float mMask=smoothstep(.42,.20,abs(p.x));    // wide ear-to-ear grin
    mouth=smoothstep(mThick,mThick*.10,mDist)*mMask;
  } else {
    float effMC=u_mouthCurve+mouthAnimCurve;
    float mBaseY=-.14-drift*.55+effMC*.02+floatY*.45+motY*.6;
    float mCurve=effMC*.15*(p.x*p.x)/(.28*.28);
    float mDist=abs(p.y-(mBaseY+mCurve));
    float mThick=.022+u_mouthOpen*.074;
    float mMask=smoothstep(.30,.15,abs(p.x));
    mouth=smoothstep(mThick,mThick*.12,mDist)*mMask;
  }

  // ── Eyebrows ───────────────────────────────────────────────────────────────
  float brows=0.;
  if(u_expressionId==7){
    // Angry — inward-angled V-shape
    float browHalf=.060,browGap=.040,browThick=.025,browSlope=.42;
    float lbCX=-(eyeXL+motX);
    float lbCY=eyeYL+eHL+browGap;
    float rbCX=eyeXR+motX;
    float rbCY=eyeYR+eHR+browGap;
    float lbDist=abs(p.y-(lbCY-browSlope*(p.x-lbCX)));
    float rbDist=abs(p.y-(rbCY+browSlope*(p.x-rbCX)));
    float lbMask=smoothstep(browHalf,browHalf*.25,abs(p.x-lbCX));
    float rbMask=smoothstep(browHalf,browHalf*.25,abs(p.x-rbCX));
    brows=max(smoothstep(browThick,browThick*.15,lbDist)*lbMask,
              smoothstep(browThick,browThick*.15,rbDist)*rbMask)*blend;
  } else if(u_expressionId==4){
    // Surprised — arched ⌒ brows lifted high, parabolic (center highest)
    float browHalf=.065,browGap=.058,browThick=.020,browArch=.12;
    float lbCX=-(eyeXL+motX);
    float lbCY=eyeYL+eHL+browGap;
    float rbCX=eyeXR+motX;
    float rbCY=eyeYR+eHR+browGap;
    float lbDist=abs(p.y-(lbCY-browArch*(p.x-lbCX)*(p.x-lbCX)/(browHalf*browHalf)));
    float rbDist=abs(p.y-(rbCY-browArch*(p.x-rbCX)*(p.x-rbCX)/(browHalf*browHalf)));
    float lbMask=smoothstep(browHalf,browHalf*.25,abs(p.x-lbCX));
    float rbMask=smoothstep(browHalf,browHalf*.25,abs(p.x-rbCX));
    brows=max(smoothstep(browThick,browThick*.15,lbDist)*lbMask,
              smoothstep(browThick,browThick*.15,rbDist)*rbMask)*blend;
  } else if(u_expressionId==5){
    // Thinking — exaggerated asymmetric brows (angry style but mismatched)
    float browThick=.025;
    // Left brow: cranked up very high, outer end tilted up sharply (classic skeptical raise)
    float lbCX=-(eyeXL+motX);
    float lbCY=eyeYL+eHL+.092*blend;
    float lbSlope=.38, lbHalf=.076;
    float lbDist=abs(p.y-(lbCY-lbSlope*(p.x-lbCX)));
    float lbMask=smoothstep(lbHalf,lbHalf*.25,abs(p.x-lbCX));
    float lb=smoothstep(browThick,browThick*.15,lbDist)*lbMask;
    // Right brow: low + angled opposite (inner end higher) — furrowed over squinting eye
    float rbCX=eyeXR+motX;
    float rbCY=eyeYR+eHR+.046*blend;
    float rbSlope=.28, rbHalf=.068;
    float rbDist=abs(p.y-(rbCY-rbSlope*(p.x-rbCX)));
    float rbMask=smoothstep(rbHalf,rbHalf*.25,abs(p.x-rbCX));
    float rb=smoothstep(browThick,browThick*.15,rbDist)*rbMask;
    brows=max(lb,rb)*blend;
  }

  // ── Sad tear — sphere material teardrop falling from left eye ─────────────
  float tear=0.;
  if(u_expressionId==3){
    float tearCX=-(eyeXL+motX);    // tracks left eye x position
    float tc=fract(t*.60+.2);      // one fall cycle every ~3s real time
    float tearY=eyeYL-eHL-.012-tc*.13;
    float tDist=length(vec2((p.x-tearCX)/.011,(p.y-tearY)/.022));
    tear=smoothstep(1.,.25,tDist)*(1.-tc)*blend;
  }

  // ── Sleepy Zzz — cartoon Z's floating upward from the face ───────────────
  float zzz=0.;
  if(u_expressionId==6){
    for(int i=0;i<3;i++){
      float fi=float(i);
      float phase=fract(t*.28+fi*.333); // ~3.6s cycle, staggered 1.2s apart
      float sz=.022+phase*.026;         // grows small→medium as it rises
      float xPos=.12+fi*.026+phase*.032;// slight rightward drift + per-Z stagger
      float yPos=.28+phase*.25;         // floats from y≈0.28 up to y≈0.53
      float zD=sdZ(vec2(p.x-xPos,p.y-yPos),sz);
      float fade=smoothstep(0.,.08,phase)*(1.-smoothstep(.68,1.,phase))*blend;
      zzz=max(zzz,smoothstep(.006,0.,zD)*fade);
    }
  }

  float features=max(max(eyes,mouth),max(max(brows,tear),zzz));
  return sphereBrightness*mix(1.,features,blend);
}

// ── Ambient rising bubbles (orb section atmosphere) ─────────────────────────
// Each row: [xNorm, period, phaseOffset, radius, wobbleAmp, wobbleFreq]
float ambientBubbles(vec2 uv,float t){
  float aspect=u_res.x/u_res.y;
  float result=0.;
  const float BD[72]=float[72](
    0.08, 9.5, 0.00, 0.014, 0.018, 0.85,
    0.19,12.0, 0.41, 0.020, 0.012, 1.10,
    0.31, 8.0, 0.67, 0.016, 0.022, 0.70,
    0.44,14.5, 0.23, 0.011, 0.015, 1.30,
    0.57,10.5, 0.82, 0.018, 0.020, 0.90,
    0.68, 7.5, 0.14, 0.013, 0.016, 1.50,
    0.79,11.0, 0.55, 0.021, 0.010, 0.75,
    0.91,13.5, 0.38, 0.015, 0.024, 1.20,
    0.25, 9.0, 0.72, 0.012, 0.018, 1.05,
    0.50,15.0, 0.09, 0.019, 0.014, 0.80,
    0.72, 8.5, 0.47, 0.017, 0.020, 1.40,
    0.13,11.5, 0.91, 0.014, 0.016, 0.95
  );
  for(int i=0;i<12;i++){
    float bx=BD[i*6+0],period=BD[i*6+1],phase=BD[i*6+2];
    float radius=BD[i*6+3],wobAmp=BD[i*6+4],wobFreq=BD[i*6+5];
    float lift=fract(t/period+phase);
    float py=mix(-.12,1.12,lift);
    float cx=bx+wobAmp*sin(t*wobFreq+phase*6.2832);
    float fadeEdge=smoothstep(0.,.08,lift)*smoothstep(1.,.92,lift);
    result=max(result,bubbleLit(uv,vec2(cx,py),radius,t,aspect)*fadeEdge*.80);
  }
  return result;
}

// Dispatch to one of the scene functions by index
float getSceneByShape(int shape,vec2 uv,float t){
  if(shape==0)return scenePlasma(uv,t);
  if(shape==1)return sceneSpheres(uv,t);
  if(shape==2)return sceneTunnel(uv,t);
  if(shape==3)return sceneWaves(uv,t);
  if(shape==4)return sceneMandala(uv,t);
  if(shape==5)return sceneTerrain(uv,t);
  if(shape==7)return max(sceneSphere3D(uv,t),ambientBubbles(uv,t));
  return sceneRipples(uv,t);
}

// Cross-dissolve between two movement patterns
float getScene(vec2 uv,float t){
  float a=getSceneByShape(u_shapeA,uv,t);
  if(u_shapeMix<0.001)return a;
  float b=getSceneByShape(u_shapeB,uv,t);
  return mix(a,b,clamp(u_shapeMix,0.,1.));
}

float getDither(vec2 pc){
  ivec2 ic=ivec2(mod(pc,vec2(u_renderMode==0&&false?4.:4.)));
  if(true){ivec2 ic2=ivec2(mod(pc,vec2(4.)));return float(bayer4[ic2.y*4+ic2.x])/16.;}
  return 0.;
}

vec4 sampleChar(int charIdx,vec2 cellUV){
  if(charIdx<0)charIdx=0;
  if(charIdx>=u_charCount)charIdx=u_charCount-1;
  int col_=charIdx%u_atlasCols;
  int row_=charIdx/u_atlasCols;
  vec2 atlasUV=vec2((float(col_)+cellUV.x)/float(u_atlasCols),(float(row_)+cellUV.y)/float(u_atlasRows));
  return texture(u_atlas,atlasUV);
}

void main(){
  vec2 uv=v_uv;
  vec2 pc=floor(v_uv*u_res/u_scale);
  if(u_warp>.001){vec2 p=uv-.5;float a_=atan(p.y,p.x)+u_warp*sin(u_time+length(p)*6.);uv=vec2(.5)+length(p)*vec2(cos(a_),sin(a_));}
  float scene=getScene(uv,u_time);
  if(u_noiseMix>.001)scene=mix(scene,hash(pc+fract(u_time)),u_noiseMix);
  scene=clamp((scene-.5)*u_contrast+.5,0.,1.);
  float th=u_threshold;
  vec3 col;

  if(u_renderMode==0){
    ivec2 ic=ivec2(mod(pc,vec2(4.)));
    float dither=float(bayer4[ic.y*4+ic.x])/16.;
    float result=step(dither,scene*(1.+th)-.5*th);
    if(u_invert)result=1.-result;
    if(u_rainbow>0){
      vec3 rc=getRainbow(uv,pc,scene,0.,vec2(0));
      vec3 bgc=u_rainbowBg?getRainbowBg(uv,pc,0.,vec2(0)):u_bg;
      col=mix(bgc,rc,result);
    }else{col=mix(u_bg,u_fg,result);}
  }else{
    float cellPx=u_cellSize;
    float cellH=cellPx*1.5;
    vec2 cellCount=vec2(floor(u_res.x/cellPx),floor(u_res.y/cellH));
    vec2 cellID=floor(v_uv*cellCount);
    vec2 cellUV=fract(v_uv*cellCount);
    vec2 cellCenter=(cellID+.5)/cellCount;
    vec2 ccW=cellCenter;
    if(u_warp>.001){vec2 p=cellCenter-.5;float a_=atan(p.y,p.x)+u_warp*sin(u_time+length(p)*6.);ccW=vec2(.5)+length(p)*vec2(cos(a_),sin(a_));}
    float cellScene=getScene(ccW,u_time);
    if(u_noiseMix>.001){vec2 cpc=floor(cellCenter*u_res/u_scale);cellScene=mix(cellScene,hash(cpc+fract(u_time)),u_noiseMix);}
    float transBlend=max(1.-u_shapeMix*(1.-u_shapeMix)*6.,0.);
    float effectiveContrast=mix(1.5,u_contrast,transBlend);
    cellScene=clamp((cellScene-.5)*effectiveContrast+.5,0.,1.);
    vec2 eps=1./cellCount;
    float scR=getScene(ccW+vec2(eps.x,0.),u_time);
    float scU=getScene(ccW+vec2(0.,eps.y),u_time);
    scR=clamp((scR-.5)*effectiveContrast+.5,0.,1.);
    scU=clamp((scU-.5)*effectiveContrast+.5,0.,1.);
    vec2 grad=vec2(scR-cellScene,scU-cellScene);
    float flowMag=length(grad)*12.*transBlend;
    float scPast=getScene(ccW,u_time-.04);
    scPast=clamp((scPast-.5)*effectiveContrast+.5,0.,1.);
    float flowTemporal=abs(cellScene-scPast)*8.;
    float totalFlow=min(flowMag+flowTemporal,2.);
    vec2 uvShift=grad*3.5*sin(u_time*1.5+cellID.x*.4+cellID.y*.3)*transBlend;
    vec2 distortedCellUV=cellUV+uvShift*.15;
    distortedCellUV=clamp(distortedCellUV,vec2(.02),vec2(.98));
    float bv=u_invert?1.-cellScene:cellScene;
    // CD morph: blend sphere scene toward disc brightness, keep bubbles visible
    float cdNR_=0.,cdNA_=0.,cdIM_=0.,cdB_=0.,cdHit_=0.;
    if(u_cdBlend>0.001){
      cdB_=sceneCDisc(ccW,u_time,u_cdSpinSpeed,cdNR_,cdNA_,cdIM_,cdHit_);
      if(cdHit_>0.001){
        // Suppress orb across full disc footprint (disc + center hole)
        // cdB_=0 in hole → transitions to background; cdB_>0 in disc → CD brightness
        cellScene=mix(cellScene,cdB_,u_cdBlend*cdHit_);
        bv=u_invert?1.-cellScene:cellScene;
      }
    }
    float wave1=sin(cellID.x*.4+cellID.y*.3+u_time*1.2)*.5;
    float wave2=sin(cellID.x*.8-cellID.y*.6+u_time*.7+flowMag*2.)*.35;
    float wave3=sin((cellID.x+cellID.y)*.2+u_time*1.8)*.15;
    float shimmer=(wave1+wave2+wave3)*smoothstep(0.,.3,totalFlow);
    float charF=bv*float(u_charCount-1)+shimmer;
    charF=clamp(charF,0.,float(u_charCount-1));
    int charA=int(floor(charF));
    int charB_=min(charA+1,u_charCount-1);
    float blend_=fract(charF);
    float alphaA=sampleChar(charA,distortedCellUV).r;
    float alphaB=sampleChar(charB_,distortedCellUV).r;
    float alpha=mix(alphaA,alphaB,blend_);
    vec3 bgc=(u_rainbow>0&&u_rainbowBg)?getRainbowBg(v_uv,cellID,totalFlow,grad):u_bg;
    vec3 charCol;
    if(u_rainbow>0){charCol=getRainbow(v_uv,cellID,bv,totalFlow,grad);}
    else{
      vec3 fgc=u_fg;
      float flowHueShift=atan(grad.y,grad.x)*.03*totalFlow;
      vec3 tinted=fgc+vec3(flowHueShift,-flowHueShift*.5,flowHueShift*.3);
      charCol=mix(bgc,tinted,bv);
    }
    if(u_cdBlend>0.001&&cdB_>0.001&&cdHit_>0.001){charCol=mix(charCol,getCDIridescence(v_uv,bv,cdNR_,cdIM_),u_cdBlend*cdHit_);}
    if(u_renderMode==2){
      ivec2 ic2=ivec2(mod(floor(v_uv*u_res/2.),vec2(4.)));
      float dither=float(bayer4[ic2.y*4+ic2.x])/16.;
      alpha=alpha*step(dither*.4+.2,alpha);
    }
    col=mix(bgc,charCol,alpha);
    float glow=smoothstep(.1,.5,bv)*alpha*.08;
    vec3 glowCol=u_rainbow>0?getRainbow(v_uv,cellID,1.,totalFlow,grad):u_fg;
    col+=glowCol*glow;
  }

  if(u_scanlines){
    float scanY=u_renderMode==0?pc.y:floor(v_uv.y*u_res.y/2.);
    float scanStr=u_renderMode==0?.15:.08;
    col*=(1.-scanStr)+scanStr*(.5+.5*sin(scanY*3.14159));
  }
  col*=1.-.2*pow(length(v_uv-.5),2.);
  // Intro reveal: pixels crystallize from pseudo-random cluster seeds as u_reveal → 1.
  // Three scales blend together — coarse large blobs + mid patches + fine grain —
  // giving the look of the animation materialising simultaneously from many points.
  if(u_reveal<.9999){
    float c1=hash(floor(gl_FragCoord.xy/128.));
    float c2=hash(floor(gl_FragCoord.xy/28.)+vec2(47.3,19.2));
    float c3=hash(floor(gl_FragCoord.xy/ 7.)+vec2(83.1,61.4));
    // Scale thresh to [0, 0.85] so reveal visually completes before u_reveal hits 1
    float thresh=(c1*.45+c2*.35+c3*.20)*.85;
    col=mix(vec3(1.),col,smoothstep(thresh-.05,thresh+.05,u_reveal));
  }
  fragColor=vec4(col,1);
}`;

function hsb2rgb(h, s, b) {
  s /= 100;
  b /= 100;
  const k = (n) => (n + h / 60) % 6;
  const f = (n) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  return [f(5), f(3), f(1)];
}

function buildAtlas(gl) {
  const n = CHARSET.length,
    atlasCols = 16,
    C = ATLAS_CELL;
  const atlasRows = Math.ceil(n / atlasCols);
  const ac = document.createElement("canvas");
  ac.width = atlasCols * C;
  ac.height = atlasRows * C;
  const ctx = ac.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, ac.width, ac.height);
  ctx.fillStyle = "#fff";
  ctx.font = `${C - 4}px monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  for (let i = 0; i < n; i++)
    ctx.fillText(
      CHARSET[i],
      (i % atlasCols) * C + C / 2,
      Math.floor(i / atlasCols) * C + C / 2,
    );
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ac);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { tex, atlasCols, atlasRows };
}

// ── Expression presets ────────────────────────────────────────────────────────
// eyeOpen: 0 = fully closed, 1 = wide open
// eyeY:    vertical centre of eyes on sphere face (~0.1 = slightly above centre)
// mouthCurve: -1 = deep frown, 0 = flat line, +1 = big smile
// mouthOpen:  0 = thin line, 1 = gaping open mouth
const EXPRESSIONS = {
  neutral: { id: 0, eyeOpen: 0.55, eyeY: 0.1, mouthCurve: 0.0, mouthOpen: 0.0 },
  happy: {
    id: 1,
    eyeOpen: 0.68,
    eyeY: 0.14,
    mouthCurve: 0.75,
    mouthOpen: 0.08,
  }, // soft squint, relaxed smile
  excited: { id: 2, eyeOpen: 1.0, eyeY: 0.2, mouthCurve: 1.0, mouthOpen: 1.0 }, // wide eyes, big open grin
  sad: { id: 3, eyeOpen: 0.55, eyeY: 0.05, mouthCurve: -0.9, mouthOpen: 0.0 },
  surprised: {
    id: 4,
    eyeOpen: 1.0,
    eyeY: 0.22,
    mouthCurve: 0.0,
    mouthOpen: 1.0,
  },
  thinking: { id: 5, eyeOpen: 0.4, eyeY: 0.1, mouthCurve: 0.2, mouthOpen: 0.0 },
  sleepy: { id: 6, eyeOpen: 0.12, eyeY: 0.05, mouthCurve: 0.1, mouthOpen: 0.0 },
  angry: {
    id: 7,
    eyeOpen: 0.55,
    eyeY: 0.05,
    mouthCurve: -0.75,
    mouthOpen: 0.2,
  },
  // Talking — gentle smile, stable eyes; mouthOpen driven by speech wave in render loop
  talking: { id: 8, eyeOpen: 0.65, eyeY: 0.12, mouthCurve: 0.38, mouthOpen: 0.0 },
};

const DitherBackground = ({ activeSection = 0, isDark = false }) => {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const glDataRef = useRef(null);
  const timeRef = useRef(0);
  const hueOffsetRef = useRef(0); // accumulated in [0,1) at hue scale — no large products in shader
  const lastTRef = useRef(0);
  const ripplesRef = useRef([]);
  const targetIdxRef = useRef(0);
  const lockedPresetIdxRef = useRef(null); // non-null locks shader to that preset (ignores activeSection)
  const isDarkRef = useRef(isDark);

  // Expression face state — lerped each frame toward faceTargetRef
  const faceRef = useRef({
    eyeOpen: 0.55,
    eyeY: 0.1,
    mouthCurve: 0.0,
    mouthOpen: 0.0,
    blend: 0.0,
  });
  const faceTargetRef = useRef({ ...EXPRESSIONS.neutral, blend: 0.0 });
  const expressionIdRef = useRef(0); // int — switches immediately, not lerped

  // Transition state machine
  const transitionRef = useRef({ state: "idle", pending: null }); // 'idle'|'rising'
  const resetTimerRef = useRef(null); // setTimeout ID for hold duration
  const pendingHoldRef = useRef(null); // ms to hold after transition completes
  const scheduleHoldRef = useRef(null); // bridge: expression useEffect → render loop
  const sequenceRef = useRef([]); // [{expr, duration}, ...] queue
  const sequenceIndexRef = useRef(0); // next step index

  // Pop state machine refs
  const popStateRef = useRef("idle"); // 'idle' | 'popping' | 'gone' | 'reforming'
  const popWallStartRef = useRef(0); // wall-clock seconds at current phase start
  const reanimIdxRef = useRef(0); // cycles 0→1→2→0 after each completed pop
  const postReanimFiredRef = useRef(false); // one-shot: random emote after reforming
  const isTalkingRef       = useRef(false); // talking animation active
  const cdModeRef          = useRef(null);  // null | 'stationary' | 'spinning'
  const cdBlendRef         = useRef(0);     // 0 = orb, 1 = CD (lerped)
  const cdTargetBlendRef   = useRef(0);     // target blend
  const cdSpinRef          = useRef(false); // true = spinning CD
  const cdSpinAngleRef     = useRef(0);     // accumulated spin angle (rad) — preserved when spin stops
  const popCanvasRef = useRef(null); // 2D canvas for particle overlay
  const spawnParticlesRef = useRef(null); // bridge: expression useEffect → GL useEffect
  const particlesRef = useRef([]); // live particle list

  // Interpolated params + shape-blend state
  const introStartRef = useRef(null); // RAF timestamp of first render frame
  const revealRef = useRef(0); // 0 = all white, 1 = fully revealed (one-shot)
  const revealHidingRef        = useRef(false);
  const revealHideStartRef     = useRef(null);
  const revealHideCallbackRef  = useRef(null);

  const paramsRef = useRef({
    speed: PRESETS[0].speed,
    contrast: PRESETS[0].contrast,
    warp: PRESETS[0].warp,
    rainbowSpeed: PRESETS[0].rainbowSpeed,
    shapeA: PRESETS[0].shape, // active pattern
    shapeB: PRESETS[0].shape, // incoming pattern (same initially)
    shapeMix: 0, // 0 = pure shapeA, 1 = pure shapeB
  });

  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);

  useEffect(() => {
    targetIdxRef.current = Math.min(activeSection, PRESETS.length - 1);
    // Fade face out whenever leaving the Orb section
    if (activeSection !== 4) {
      faceTargetRef.current.blend = 0.0;
    }
  }, [activeSection]);

  // Expose orb expression API for chatbot / console use
  useEffect(() => {
    const clearTimers = () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };

    // Internal: show an expression.
    // If face is already visible → morph directly (no orb peek between expressions).
    // If face is hidden → rise in from orb.
    // holdMs = null → hold indefinitely; holdMs = number → start hold timer after fully visible.
    const triggerExpression = (expr, holdMs) => {
      clearTimers();
      const fa = faceRef.current;
      if (fa.blend > 0.5) {
        // Face already showing — switch and morph, blend stays at 1 throughout
        expressionIdRef.current = expr.id;
        faceTargetRef.current = { ...expr, blend: 1.0 };
        transitionRef.current = { state: "idle", pending: null };
        scheduleHold(holdMs);
      } else {
        // Face hidden — rise in from orb state
        expressionIdRef.current = expr.id;
        faceTargetRef.current = { ...expr, blend: 1.0 };
        transitionRef.current = { state: "rising", pending: null };
        pendingHoldRef.current = holdMs; // render loop starts hold timer when rising completes
      }
    };

    // Internal: advance to the next step in a sequence (or return to neutral).
    const advanceSequence = () => {
      const seq = sequenceRef.current;
      const idx = sequenceIndexRef.current;
      if (idx < seq.length) {
        const step = seq[idx];
        sequenceIndexRef.current = idx + 1;
        triggerExpression(step.expr, step.duration);
      } else {
        // Sequence finished — return to neutral
        sequenceRef.current = [];
        faceTargetRef.current.blend = 0.0;
        transitionRef.current = { state: "idle", pending: null };
      }
    };

    // Schedule next action after hold expires (advance sequence or go neutral).
    const scheduleHold = (holdMs) => {
      if (holdMs === null) return; // hold indefinitely
      resetTimerRef.current = setTimeout(() => {
        resetTimerRef.current = null;
        if (
          sequenceRef.current.length > 0 &&
          sequenceIndexRef.current < sequenceRef.current.length
        ) {
          advanceSequence();
        } else {
          sequenceRef.current = [];
          faceTargetRef.current.blend = 0.0;
          transitionRef.current = { state: "idle", pending: null };
        }
      }, holdMs);
    };

    // Bridge scheduleHold into the render-loop useEffect via a stable ref.
    scheduleHoldRef.current = scheduleHold;

    // ── Public API ────────────────────────────────────────────────────────────

    // Show an expression. holdMs = null → hold indefinitely.
    window.__orbExpress = (name, holdMs = null) => {
      const expr = EXPRESSIONS[name?.toLowerCase?.() ?? name];
      if (!expr) return;
      sequenceRef.current = []; // cancel any running sequence
      sequenceIndexRef.current = 0;
      triggerExpression(expr, holdMs);
    };

    // Play a sequence of expressions.
    // steps = [{ name: 'happy', duration: 1500 }, { name: 'excited', duration: 2000 }, ...]
    window.__orbPlaySequence = (steps) => {
      clearTimers();
      sequenceRef.current = steps
        .map((s) => ({
          expr: EXPRESSIONS[s.name?.toLowerCase?.() ?? s.name],
          duration: s.duration,
        }))
        .filter((s) => s.expr);
      sequenceIndexRef.current = 0;
      advanceSequence();
    };

    // Stop everything and return to neutral (smooth fade-out).
    window.__orbStop = () => {
      clearTimers();
      sequenceRef.current = [];
      sequenceIndexRef.current = 0;
      pendingHoldRef.current = null;
      faceTargetRef.current.blend = 0.0;
      transitionRef.current = { state: "idle", pending: null };
    };

    // Legacy reset (kept for backwards compat)
    window.__orbReset = () => {
      clearTimers();
      sequenceRef.current = [];
      faceTargetRef.current.blend = 0.0;
      transitionRef.current = { state: "idle", pending: null };
    };

    // Raise both canvases to fixed/full-screen above all site content so the
    // loading overlay can fade its white div to reveal the dither beneath it.
    window.__ditherRaiseCanvas = () => {
      const apply = (c) => {
        if (!c) return;
        c.style.position   = 'fixed';
        c.style.inset      = '0';
        c.style.width      = '100%';
        c.style.height     = '100%';
        c.style.zIndex     = '18999';
        c.style.visibility = 'visible'; // override any inherited visibility:hidden from parent
      };
      apply(canvasRef.current);
      apply(popCanvasRef.current);
    };

    // Restore canvases to their normal absolute positioning.
    window.__ditherLowerCanvas = () => {
      const restore = (c) => {
        if (!c) return;
        c.style.position   = 'absolute';
        c.style.inset      = '';
        c.style.width      = '100%';
        c.style.height     = '100%';
        c.style.zIndex     = '';
        c.style.visibility = '';
      };
      restore(canvasRef.current);
      restore(popCanvasRef.current);
    };

    // Lock shader to hero preset (shape 6 – Ripples), snapping params immediately.
    // Must be called before __ditherRevealIn so the crystallize plays on the right pattern.
    window.__ditherLockToHero = () => {
      lockedPresetIdxRef.current = 0;
      const hero = PRESETS[0];
      const p = paramsRef.current;
      p.speed       = hero.speed;
      p.contrast    = hero.contrast;
      p.warp        = hero.warp;
      p.rainbowSpeed = hero.rainbowSpeed;
      p.shapeA      = hero.shape;
      p.shapeB      = hero.shape;
      p.shapeMix    = 0;
    };

    // Release the lock — shader lerps back to the active section preset naturally.
    window.__ditherUnlock = () => {
      lockedPresetIdxRef.current = null;
    };

    // Replay the intro reveal from scratch (resets shader to white then crystallizes in)
    window.__ditherRevealIn = () => {
      revealHidingRef.current = false;
      revealHideStartRef.current = null;
      revealHideCallbackRef.current = null;
      revealRef.current = 0;
      introStartRef.current = null;
    };

    // Reverse the reveal (crystallize back to white), then call onComplete
    window.__ditherRevealOut = (onComplete) => {
      revealHidingRef.current = true;
      revealHideStartRef.current = null;
      revealHideCallbackRef.current = onComplete || null;
    };

    window.__orbExpressions = Object.keys(EXPRESSIONS).filter(k => k !== 'talking');

    // Start talking animation — transitions to soft smile and animates mouth like speech.
    // Call window.__orbStopTalk() to end it.
    window.__orbTalk = () => {
      isTalkingRef.current = true;
      clearTimers();
      sequenceRef.current = [];
      sequenceIndexRef.current = 0;
      expressionIdRef.current = EXPRESSIONS.talking.id;
      faceTargetRef.current = { ...EXPRESSIONS.talking, blend: 1.0 };
      transitionRef.current = { state: 'rising', pending: null };
      pendingHoldRef.current = null;
    };

    // Stop talking — fade face back out to neutral.
    window.__orbStopTalk = () => {
      isTalkingRef.current = false;
      clearTimers();
      sequenceRef.current = [];
      faceTargetRef.current.blend = 0.0;
      transitionRef.current = { state: 'idle', pending: null };
    };

    // Trigger a pop. No-ops if already popping.
    window.__orbPop = () => {
      if (popStateRef.current !== "idle") return;
      // Block pop in CD mode — orb sphere geometry is suppressed, so the
      // expanding ring / bubble-reform would have no valid disc geometry to play on.
      if (cdBlendRef.current > 0.5) return;
      popStateRef.current = "popping";
      popWallStartRef.current = performance.now() / 1000;
      postReanimFiredRef.current = false;
      faceTargetRef.current.blend = 0.0;
      transitionRef.current = { state: "idle", pending: null };
      spawnParticlesRef.current?.(); // spawn debris immediately on pop trigger
    };

    // Morph the orb into a CD disc.
    // spinning=true → disc spins at 4 rad/s; false → stationary.
    window.__ditherSetCD = (spinning) => {
      cdSpinRef.current = spinning;
      cdTargetBlendRef.current = 1;
    };

    // Morph the CD back into the orb.
    window.__ditherSetOrb = () => {
      cdTargetBlendRef.current = 0;
    };

    return () => {
      clearTimers();
      window.__orbExpress = null;
      window.__orbPlaySequence = null;
      window.__orbStop = null;
      window.__orbReset = null;
      window.__orbExpressions = null;
      window.__orbPop = null;
      window.__orbTalk = null;
      window.__orbStopTalk = null;
      window.__ditherRevealIn = null;
      window.__ditherRevealOut = null;
      window.__ditherLockToHero = null;
      window.__ditherUnlock = null;
      window.__ditherRaiseCanvas = null;
      window.__ditherLowerCanvas = null;
      window.__ditherSetCD = null;
      window.__ditherSetOrb = null;
    };
  }, []);

  // Expose ripple adder for DitherHero
  useEffect(() => {
    window.__addDitherRipple = (clientX, clientY) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      ripplesRef.current.push({
        x: (clientX - rect.left) / rect.width,
        y: 1 - (clientY - rect.top) / rect.height,
        birth: timeRef.current,
      });
      if (ripplesRef.current.length > 12) ripplesRef.current.shift();
    };
    return () => {
      window.__addDitherRipple = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { antialias: false });
    if (!gl) return;

    const mkShader = (src, type) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        return null;
      }
      return s;
    };
    const prog = gl.createProgram();
    const vs = mkShader(VERT, gl.VERTEX_SHADER);
    const fs = mkShader(FRAG, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const ap = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(ap);
    gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    [
      "u_time",
      "u_hueOffset",
      "u_threshold",
      "u_scale",
      "u_contrast",
      "u_warp",
      "u_noiseMix",
      "u_res",
      "u_fg",
      "u_bg",
      "u_shapeA",
      "u_shapeB",
      "u_shapeMix",
      "u_invert",
      "u_scanlines",
      "u_renderMode",
      "u_rippleCount",
      "u_atlas",
      "u_cellSize",
      "u_charCount",
      "u_atlasCols",
      "u_atlasRows",
      "u_atlasCellSize",
      "u_rainbow",
      "u_rainbowSpeed",
      "u_rainbowBg",
      "u_reveal",
      "u_eyeOpen",
      "u_eyeY",
      "u_mouthCurve",
      "u_mouthOpen",
      "u_expressionBlend",
      "u_expressionId",
      "u_popPhase",
      "u_reanimIdx",
      "u_cdBlend",
      "u_cdSpinSpeed",
      "u_cdSpinAngle",
    ].forEach((n) => {
      U[n] = gl.getUniformLocation(prog, n);
    });
    const ripLocs = [];
    for (let i = 0; i < 12; i++)
      ripLocs[i] = gl.getUniformLocation(prog, `u_ripples[${i}]`);

    const { tex: atlasTex, atlasCols, atlasRows } = buildAtlas(gl);
    glDataRef.current = { gl, U, ripLocs, atlasTex, atlasCols, atlasRows };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (popCanvasRef.current) {
        popCanvasRef.current.width = window.innerWidth;
        popCanvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener("resize", resize);
    resize();

    // ── Pop state machine (wall-clock timed, speed-independent) ─────────────
    const POP_DUR = { popping: 0.38, gone: 1.56, reforming: 2.8 };
    const getPopPhase = () => {
      const state = popStateRef.current;
      if (state === "idle") return -1.0;
      const el = performance.now() / 1000 - popWallStartRef.current;
      if (state === "popping") {
        const t = el / POP_DUR.popping;
        if (t >= 1.0) {
          popStateRef.current = "gone";
          popWallStartRef.current = performance.now() / 1000;
          return 1.0;
        }
        return t;
      }
      if (state === "gone") {
        const t = el / POP_DUR.gone;
        if (t >= 1.0) {
          popStateRef.current = "reforming";
          popWallStartRef.current = performance.now() / 1000;
          return 1.6;
        }
        return 1.0 + t * 0.6;
      }
      if (state === "reforming") {
        const t = el / POP_DUR.reforming;
        if (t >= 1.0) {
          popStateRef.current = "idle";
          reanimIdxRef.current = (reanimIdxRef.current + 1) % 3;
          if (!postReanimFiredRef.current) {
            postReanimFiredRef.current = true;
            const emotes = ["sad", "surprised", "thinking", "angry"];
            const pick = emotes[Math.floor(Math.random() * emotes.length)];
            window.__orbExpress?.(pick, 600);
          }
          return -1.0;
        }
        return 1.6 + t * 1.4;
      }
      return -1.0;
    };

    // Click on canvas while on orb section → pop if sphere hit, else ripple
    const handleCanvasClick = (e) => {
      if (targetIdxRef.current !== 4) return;
      const rect = canvas.getBoundingClientRect();
      const uvx = (e.clientX - rect.left) / rect.width;
      const uvy = (e.clientY - rect.top) / rect.height;
      const aspect = rect.width / rect.height;
      const dx = (uvx - 0.5) * aspect;
      const dy = uvy - 0.5;
      if (
        Math.sqrt(dx * dx + dy * dy) < 0.31 &&
        popStateRef.current === "idle"
      ) {
        window.__orbPop?.();
      }
    };
    canvas.addEventListener("click", handleCanvasClick);

    // ── Pop particle system ────────────────────────────────────────────────────
    const popCvs = popCanvasRef.current;
    const px2 = popCvs ? popCvs.getContext("2d") : null;

    const spawnParticles = () => {
      if (!popCvs) return;
      const cw = popCvs.width,
        ch = popCvs.height;
      const cx = cw * 0.5,
        cy = ch * 0.5;
      const sr = ch * 0.3; // sphere visual radius in px
      const now = performance.now() / 1000;
      const parts = [];

      // Streak lines — radial, fast deceleration
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
        const spd = sr * (1.8 + Math.random() * 1.4);
        const life = 0.28 + Math.random() * 0.2;
        const sR = sr * (0.8 + Math.random() * 0.25);
        parts.push({
          type: "streak",
          hue: Math.random() * 360,
          life,
          maxLife: life,
          born: now,
          x: cx + Math.cos(ang) * sR,
          y: cy + Math.sin(ang) * sR,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          len: sr * (0.18 + Math.random() * 0.38),
          angle: ang,
          width: 1.2 + Math.random() * 1.8,
        });
      }
      // Drop particles — gravity + drag, mix of circles and squares
      for (let i = 0; i < 28; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = sr * (1.0 + Math.random() * 2.2);
        const life = 0.55 + Math.random() * 0.65;
        const sR = sr * (0.85 + Math.random() * 0.2);
        parts.push({
          type: "drop",
          hue: Math.random() * 360,
          life,
          maxLife: life,
          born: now,
          x: cx + Math.cos(ang) * sR,
          y: cy + Math.sin(ang) * sR,
          vx: Math.cos(ang) * spd * (0.7 + Math.random() * 0.6),
          vy: Math.sin(ang) * spd * (0.7 + Math.random() * 0.6),
          size: 2 + Math.random() * 4,
          isSquare: Math.random() < 0.35,
          gravity: sr * 1.8 + Math.random() * sr * 1.2,
          drag: 0.92 + Math.random() * 0.05,
          spin: 0,
          spinRate: (Math.random() - 0.5) * 18,
        });
      }
      // Sparkle glints — tiny star-shaped, ultra-bright, fast fade
      for (let i = 0; i < 22; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = sr * (0.7 + Math.random() * 0.55);
        const life = 0.08 + Math.random() * 0.22;
        parts.push({
          type: "sparkle",
          hue: Math.random() * 360,
          life,
          maxLife: life,
          born: now,
          x: cx + Math.cos(ang) * r,
          y: cy + Math.sin(ang) * r,
          vx: (Math.random() - 0.5) * sr * 0.6,
          vy: (Math.random() - 0.5) * sr * 0.6,
          size: 2 + Math.random() * 5,
          arms: 4 + Math.floor(Math.random() * 3),
        });
      }
      // Arc ring fragments — broken shell pieces flying outward
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
        const spanRad = ((18 + Math.random() * 30) * Math.PI) / 180;
        const life = 0.22 + Math.random() * 0.18;
        const spd = sr * (0.5 + Math.random() * 0.8);
        parts.push({
          type: "arc",
          hue: Math.random() * 360,
          life,
          maxLife: life,
          born: now,
          x: cx,
          y: cy,
          r: sr,
          startAngle: ang - spanRad / 2,
          endAngle: ang + spanRad / 2,
          vr: sr * (0.4 + Math.random() * 0.5),
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          width: 1.5 + Math.random() * 2,
        });
      }
      particlesRef.current = parts;
    };
    spawnParticlesRef.current = spawnParticles;

    const drawParticles = (dt) => {
      if (!px2 || !popCvs) return;
      px2.clearRect(0, 0, popCvs.width, popCvs.height);
      const parts = particlesRef.current;
      if (!parts.length) return;
      const now = performance.now() / 1000;
      const hs = (h, s, l, a) => `hsla(${h | 0},${s}%,${l}%,${a.toFixed(3)})`;
      particlesRef.current = parts.filter((p) => {
        const age = now - p.born;
        if (age >= p.maxLife) return false;
        const t = age / p.maxLife,
          alpha = Math.pow(1 - t, 1.6);

        if (p.type === "streak") {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.88;
          p.vy *= 0.88;
          const tx = p.x - Math.cos(p.angle) * p.len * (1 - t * 0.4);
          const ty = p.y - Math.sin(p.angle) * p.len * (1 - t * 0.4);
          const g = px2.createLinearGradient(tx, ty, p.x, p.y);
          g.addColorStop(0, hs(p.hue, 100, 70, 0));
          g.addColorStop(0.4, hs(p.hue, 100, 80, alpha * 0.5));
          g.addColorStop(1, hs(p.hue, 100, 95, alpha));
          px2.beginPath();
          px2.moveTo(tx, ty);
          px2.lineTo(p.x, p.y);
          px2.strokeStyle = g;
          px2.lineWidth = p.width * (1 - t * 0.5);
          px2.lineCap = "round";
          px2.stroke();
          return true;
        }
        if (p.type === "drop") {
          p.vy += p.gravity * dt;
          p.vx *= p.drag;
          p.vy *= p.drag;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.spin += p.spinRate * dt;
          px2.save();
          px2.translate(p.x, p.y);
          px2.rotate(p.spin);
          const glow = px2.createRadialGradient(0, 0, 0, 0, 0, p.size * 2.5);
          glow.addColorStop(0, hs(p.hue, 100, 85, alpha * 0.4));
          glow.addColorStop(1, hs(p.hue, 100, 70, 0));
          px2.fillStyle = glow;
          px2.beginPath();
          px2.arc(0, 0, p.size * 2.5, 0, Math.PI * 2);
          px2.fill();
          px2.fillStyle = hs(p.hue, 100, 75, alpha);
          if (p.isSquare) {
            px2.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          } else {
            px2.beginPath();
            px2.arc(0, 0, p.size, 0, Math.PI * 2);
            px2.fill();
          }
          px2.restore();
          return true;
        }
        if (p.type === "sparkle") {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.85;
          p.vy *= 0.85;
          const pa = Math.min(alpha * 1.2, 1);
          px2.save();
          px2.translate(p.x, p.y);
          const oR = p.size * (1 - t * 0.5),
            iR = oR * 0.35;
          px2.fillStyle = hs(p.hue, 80, 97, pa);
          px2.beginPath();
          for (let j = 0; j < p.arms * 2; j++) {
            const r = j % 2 === 0 ? oR : iR,
              a = (j * Math.PI) / p.arms;
            j === 0
              ? px2.moveTo(r * Math.cos(a), r * Math.sin(a))
              : px2.lineTo(r * Math.cos(a), r * Math.sin(a));
          }
          px2.closePath();
          px2.fill();
          px2.strokeStyle = hs(p.hue, 60, 100, Math.min(pa * 0.8, 1));
          px2.lineWidth = 0.8;
          const g2 = oR * 1.8;
          px2.beginPath();
          px2.moveTo(-g2, 0);
          px2.lineTo(g2, 0);
          px2.stroke();
          px2.beginPath();
          px2.moveTo(0, -g2);
          px2.lineTo(0, g2);
          px2.stroke();
          px2.restore();
          return true;
        }
        if (p.type === "arc") {
          p.r += p.vr * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vr *= 0.82;
          p.vx *= 0.88;
          p.vy *= 0.88;
          px2.beginPath();
          px2.arc(p.x, p.y, p.r, p.startAngle, p.endAngle);
          px2.strokeStyle = hs(p.hue, 100, 90, alpha * 0.9);
          px2.lineWidth = p.width * (1 - t * 0.6);
          px2.lineCap = "round";
          px2.stroke();
          return true;
        }
        return false;
      });
    };

    const LERP = 0.025; // param lerp factor — ~2s settle
    const BLEND_STEP = 0.011; // shape blend step per frame — ~90 frames = ~1.5s
    const render = (ts) => {
      animFrameRef.current = requestAnimationFrame(render);
      const dt =
        lastTRef.current === 0
          ? 0
          : Math.min((ts - lastTRef.current) / 1000, 1 / 15);
      lastTRef.current = ts;

      const rawTarget = PRESETS[lockedPresetIdxRef.current ?? targetIdxRef.current] || PRESETS[0];
      // On mobile: zero warp, lower speed/rainbowSpeed — cuts shader cost significantly
      const target = isMobileTier ? {
        ...rawTarget,
        warp:         0,
        speed:        Math.min(rawTarget.speed,        MOBILE_DITHER_OVERRIDES.speed),
        rainbowSpeed: Math.min(rawTarget.rainbowSpeed, MOBILE_DITHER_OVERRIDES.rainbowSpeed),
      } : rawTarget;
      const p = paramsRef.current;

      // Lerp continuous params toward target
      p.speed += (target.speed - p.speed) * LERP;
      p.contrast += (target.contrast - p.contrast) * LERP;
      p.warp += (target.warp - p.warp) * LERP;
      p.rainbowSpeed += (target.rainbowSpeed - p.rainbowSpeed) * LERP;

      // Shape pattern blend
      if (p.shapeB !== target.shape) {
        p.shapeA = p.shapeMix > 0.5 ? p.shapeB : p.shapeA;
        p.shapeB = target.shape;
        p.shapeMix = 0;
      }
      if (p.shapeA !== p.shapeB) {
        p.shapeMix = Math.min(p.shapeMix + BLEND_STEP, 1);
        if (p.shapeMix >= 1) {
          p.shapeA = p.shapeB;
          p.shapeMix = 0;
        }
      }

      timeRef.current += dt * p.speed;
      // Hue offset accumulated at hue scale, wrapped at 1.0 — always a tiny float,
      // no large shader products, no modulo-wrap jumps regardless of session length.
      hueOffsetRef.current =
        (hueOffsetRef.current + dt * p.speed * p.rainbowSpeed * 0.15) % 1.0;
      const t = timeRef.current;
      ripplesRef.current = ripplesRef.current.filter((r) => t - r.birth < 10);

      const d = glDataRef.current;
      if (!d) return;

      // ── Lerp CD blend toward target ────────────────────────────────────────
      const CD_LERP = 1 - Math.pow(0.008, dt); // ~0.6s settle
      cdBlendRef.current += (cdTargetBlendRef.current - cdBlendRef.current) * CD_LERP;

      // ── Intro reveal: crystallize from white on first load (re-triggerable) ──
      const INTRO_DUR = 2500; // ms — ease-in-out over this window
      const easeInOutCubic = (x) => x < 0.5 ? 4*x*x*x : 1 - Math.pow(-2*x+2, 3)/2;
      if (revealHidingRef.current) {
        // Reverse reveal: crystallize back to white
        if (revealHideStartRef.current === null) revealHideStartRef.current = ts;
        const t = Math.min((ts - revealHideStartRef.current) / INTRO_DUR, 1);
        revealRef.current = 1 - easeInOutCubic(t);
        if (t >= 1) {
          revealRef.current = 0;
          revealHidingRef.current = false;
          revealHideStartRef.current = null;
          const cb = revealHideCallbackRef.current;
          revealHideCallbackRef.current = null;
          cb?.();
        }
      } else {
        if (introStartRef.current === null) introStartRef.current = ts;
        if (revealRef.current < 1) {
          const t = Math.min((ts - introStartRef.current) / INTRO_DUR, 1);
          // easeInOutCubic: slow start builds anticipation, fast middle materialises,
          // slow end settles the last few pixels cleanly
          revealRef.current = easeInOutCubic(t);
          if (t >= 1) revealRef.current = 1;
        }
      }

      const fg = hsb2rgb(...FIXED.fgHSB);
      const bg = isDarkRef.current ? hsb2rgb(0, 0, 0) : hsb2rgb(...FIXED.bgHSB);

      gl.uniform1f(d.U.u_time, t % 1000.0);
      gl.uniform1f(d.U.u_hueOffset, hueOffsetRef.current);
      gl.uniform1f(d.U.u_threshold, FIXED.threshold);
      gl.uniform1f(d.U.u_scale, FIXED.scale);
      gl.uniform1f(d.U.u_contrast, p.contrast);
      gl.uniform1f(d.U.u_warp, p.warp);
      gl.uniform1f(d.U.u_noiseMix, FIXED.noiseMix);
      gl.uniform2f(d.U.u_res, canvas.width, canvas.height);
      gl.uniform1i(d.U.u_shapeA, p.shapeA);
      gl.uniform1i(d.U.u_shapeB, p.shapeB);
      gl.uniform1f(d.U.u_shapeMix, p.shapeMix);
      gl.uniform1i(d.U.u_invert, FIXED.invert ? 1 : 0);
      gl.uniform1i(d.U.u_scanlines, FIXED.scanlines ? 1 : 0);
      gl.uniform3fv(d.U.u_fg, fg);
      gl.uniform3fv(d.U.u_bg, bg);
      gl.uniform1i(d.U.u_renderMode, FIXED.renderMode);
      gl.uniform1i(d.U.u_rainbow, FIXED.rainbow);
      gl.uniform1f(d.U.u_rainbowSpeed, p.rainbowSpeed);
      gl.uniform1i(d.U.u_rainbowBg, FIXED.rainbowBg ? 1 : 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, d.atlasTex);
      gl.uniform1i(d.U.u_atlas, 0);
      gl.uniform1f(d.U.u_cellSize, isMobileTier ? MOBILE_DITHER_OVERRIDES.cellSize : FIXED.cellSize);
      gl.uniform1i(d.U.u_charCount, CHARSET.length);
      gl.uniform1i(d.U.u_atlasCols, d.atlasCols);
      gl.uniform1i(d.U.u_atlasRows, d.atlasRows);
      gl.uniform1f(d.U.u_reveal, revealRef.current);

      // Face expression — lerp current toward target each frame
      const FACE_LERP = 0.045;
      const fa = faceRef.current,
        ft = faceTargetRef.current;
      fa.eyeOpen    += (ft.eyeOpen    - fa.eyeOpen)    * FACE_LERP;
      fa.eyeY       += (ft.eyeY       - fa.eyeY)       * FACE_LERP;
      fa.mouthCurve += (ft.mouthCurve - fa.mouthCurve) * FACE_LERP;

      // Speech wave — multi-frequency oscillation that mimics natural mouth movement
      if (isTalkingRef.current) {
        const tc = timeRef.current;
        const wave = 0.5
          + 0.30 * Math.sin(tc * 9.1)
          + 0.18 * Math.sin(tc * 14.7 + 0.83)
          + 0.13 * Math.sin(tc *  6.3 + 1.92)
          + 0.07 * Math.cos(tc * 21.4 + 3.10);
        ft.mouthOpen = Math.max(0, Math.min(1, wave));
        fa.mouthOpen += (ft.mouthOpen - fa.mouthOpen) * 0.28; // faster lerp for crisp speech
      } else {
        fa.mouthOpen += (ft.mouthOpen - fa.mouthOpen) * FACE_LERP;
      }

      // Blend managed by transition state machine
      const tr = transitionRef.current;
      if (tr.state === "rising") {
        fa.blend += (ft.blend - fa.blend) * FACE_LERP;
        if (fa.blend > 0.95) {
          tr.state = "idle";
          // Face is now fully visible — start hold timer
          const hold = pendingHoldRef.current;
          pendingHoldRef.current = null;
          if (scheduleHoldRef.current) scheduleHoldRef.current(hold);
        }
      } else {
        // idle — normal lerp (handles both fade-in from 0 and fade-out to neutral)
        fa.blend += (ft.blend - fa.blend) * FACE_LERP;
      }
      gl.uniform1f(d.U.u_eyeOpen, fa.eyeOpen);
      gl.uniform1f(d.U.u_eyeY, fa.eyeY);
      gl.uniform1f(d.U.u_mouthCurve, fa.mouthCurve);
      gl.uniform1f(d.U.u_mouthOpen, fa.mouthOpen);
      gl.uniform1f(d.U.u_expressionBlend, fa.blend);
      gl.uniform1i(d.U.u_expressionId, expressionIdRef.current);
      gl.uniform1f(d.U.u_popPhase, getPopPhase());
      gl.uniform1i(d.U.u_reanimIdx, reanimIdxRef.current);
      // Accumulate spin angle — only advances when spinning, freezes in place when stopped
      if (cdSpinRef.current) cdSpinAngleRef.current += 4.0 * dt;
      gl.uniform1f(d.U.u_cdBlend, cdBlendRef.current);
      gl.uniform1f(d.U.u_cdSpinSpeed, cdSpinRef.current ? 4.0 : 0.0);
      gl.uniform1f(d.U.u_cdSpinAngle, cdSpinAngleRef.current);

      gl.uniform1i(d.U.u_rippleCount, ripplesRef.current.length);
      ripplesRef.current.forEach((r, i) => {
        if (i < 12) gl.uniform3f(d.ripLocs[i], r.x, r.y, r.birth);
      });

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      drawParticles(dt);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      canvas.removeEventListener("click", handleCanvasClick);
      window.removeEventListener("resize", resize);
      gl.deleteTexture(atlasTex);
      gl.deleteBuffer(vb);
      gl.deleteProgram(prog);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />
      <canvas
        ref={popCanvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
      />
    </>
  );
};

export default DitherBackground;
