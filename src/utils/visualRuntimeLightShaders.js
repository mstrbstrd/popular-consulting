export const VISUAL_RUNTIME_LIGHT_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv=a_pos*0.5+0.5;
  gl_Position=vec4(a_pos,0.0,1.0);
}`;

export const VISUAL_RUNTIME_LIGHT_FIELD_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform float u_time;
uniform float u_warp;
uniform vec2 u_res;
uniform ivec2 u_fieldSize;
uniform int u_shapeA;
uniform int u_shapeB;
uniform float u_shapeMix;
uniform int u_rippleCount;
uniform vec3 u_ripples[12];

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.-2.*f);
  return mix(
    mix(hash(i),hash(i+vec2(1,0)),f.x),
    mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),
    f.y
  );
}
float fbm(vec2 p){
  float v=0.,a=.5;
  for(int i=0;i<5;i++){
    v+=a*noise(p);
    p*=2.1;
    a*=.5;
  }
  return v;
}

float scenePlasma(vec2 uv,float t){
  return .5+.5*sin(uv.x*3.+t)*sin(uv.y*3.-t*.7)
    +.25*sin(length(uv-.5)*8.-t*2.)
    +.25*fbm(uv*3.+t*.3);
}
float sceneWaves(vec2 uv,float t){
  float v=0.;
  for(int i=0;i<5;i++){
    float fi=float(i);
    v+=sin(uv.x*6.+fi*1.5+t*(1.+fi*.3))*(.3-fi*.04);
    v+=cos(uv.y*4.+fi*2.-t*.7)*(.2-fi*.03);
  }
  return clamp(.5+v*.3,0.,1.);
}
float sceneMandala(vec2 uv,float t){
  vec2 p=uv-.5;
  float a=atan(p.y,p.x),r=length(p);
  float v=.5+.25*sin(a*6.+t)+.25*cos(r*20.-t*3.);
  v+=.15*sin(a*12.-t*2.)*cos(r*10.+t);
  v*=smoothstep(.5,.1,r);
  return clamp(v,0.,1.);
}
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
    vec2 center=u_ripples[i].xy;
    float birth=u_ripples[i].z;
    float age=t-birth;
    if(age<0.||age>10.)continue;
    vec2 ac_=vec2((center.x-.5)*aspect,center.y-.5);
    float dist=length(auv-ac_);
    float wf=.4*age;
    float wave=sin(dist*40.-.4*age*40.);
    float amp=.35*wave/(1.+dist*8.)
      *smoothstep(wf+.02,wf-.04,dist)
      *smoothstep(0.,wf*.3,dist)
      *exp(-.6*age)
      *smoothstep(0.,.03,dist);
    v+=amp;
  }
  return clamp(v+.5,0.,1.);
}

float sceneByShape(vec2 uv,float t,int shape){
  if(shape==0)return scenePlasma(uv,t);
  if(shape==3)return sceneWaves(uv,t);
  if(shape==4)return sceneMandala(uv,t);
  return sceneRipples(uv,t);
}
float getScene(vec2 uv,float t){
  float a=sceneByShape(uv,t,u_shapeA);
  if(u_shapeMix<.001)return a;
  float b=sceneByShape(uv,t,u_shapeB);
  return mix(a,b,clamp(u_shapeMix,0.,1.));
}
vec2 warpUv(vec2 uv){
  if(u_warp<=.001)return uv;
  vec2 p=uv-.5;
  float a=atan(p.y,p.x)+u_warp*sin(u_time+length(p)*6.);
  return vec2(.5)+length(p)*vec2(cos(a),sin(a));
}

void main(){
  vec2 fieldSize=vec2(u_fieldSize);
  vec2 cellID=floor(gl_FragCoord.xy);
  vec2 cellCenter=(cellID+.5)/fieldSize;
  vec2 cellWarped=warpUv(cellCenter);
  vec2 eps=1./fieldSize;
  float current=getScene(cellWarped,u_time);
  float right=getScene(cellWarped+vec2(eps.x,0.),u_time);
  float up=getScene(cellWarped+vec2(0.,eps.y),u_time);
  float previous=getScene(cellWarped,u_time-.04);
  fragColor=vec4(current,right,up,previous);
}`;

export const VISUAL_RUNTIME_LIGHT_COMPOSITE_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_field;
uniform sampler2D u_atlas;
uniform vec2 u_res;
uniform ivec2 u_fieldSize;
uniform float u_time;
uniform float u_hueOffset;
uniform float u_contrast;
uniform float u_shapeMix;
uniform float u_rainbowSpeed;
uniform float u_reveal;
uniform int u_charCount;
uniform int u_atlasCols;
uniform int u_atlasRows;

const int bayer4[16]=int[16](
  0,8,2,10,
  12,4,14,6,
  3,11,1,9,
  15,7,13,5
);

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 hsb2rgb(float h,float s,float b){
  vec3 c=clamp(abs(mod(h*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);
  return b*mix(vec3(1),c,s);
}
vec3 getRainbow(vec2 uv,vec2 cellID,float bv,float totalFlow,vec2 grad){
  float hue=atan(grad.y,grad.x)/6.2832+bv*.5+u_hueOffset;
  hue=fract(hue);
  vec3 raw=hsb2rgb(hue,1.,1.);
  float lum=dot(raw,vec3(.299,.587,.114));
  float boost=.55/max(lum,.1);
  raw=min(raw*boost,vec3(1.));
  float newLum=dot(raw,vec3(.299,.587,.114));
  raw=mix(vec3(newLum),raw,1.2);
  return clamp(raw,vec3(0),vec3(1));
}
vec4 sampleChar(int charIdx,vec2 cellUV){
  if(charIdx<0)charIdx=0;
  if(charIdx>=u_charCount)charIdx=u_charCount-1;
  int col_=charIdx%u_atlasCols;
  int row_=charIdx/u_atlasCols;
  vec2 atlasUV=vec2(
    (float(col_)+cellUV.x)/float(u_atlasCols),
    (float(row_)+cellUV.y)/float(u_atlasRows)
  );
  return texture(u_atlas,atlasUV);
}

void main(){
  vec2 cellCount=vec2(u_fieldSize);
  vec2 cellID=floor(v_uv*cellCount);
  vec2 cellUV=fract(v_uv*cellCount);
  ivec2 fieldCoord=clamp(
    ivec2(cellID),
    ivec2(0),
    u_fieldSize-ivec2(1)
  );
  vec4 samples=texelFetch(u_field,fieldCoord,0);

  float transBlend=max(
    1.-u_shapeMix*(1.-u_shapeMix)*6.,
    0.
  );
  float effectiveContrast=mix(1.5,u_contrast,transBlend);
  float cellScene=clamp(
    (samples.r-.5)*effectiveContrast+.5,
    0.,
    1.
  );
  float scR=clamp(
    (samples.g-.5)*effectiveContrast+.5,
    0.,
    1.
  );
  float scU=clamp(
    (samples.b-.5)*effectiveContrast+.5,
    0.,
    1.
  );
  vec2 grad=vec2(scR-cellScene,scU-cellScene);
  float flowMag=length(grad)*12.*transBlend;
  float scPast=clamp(
    (samples.a-.5)*effectiveContrast+.5,
    0.,
    1.
  );
  float flowTemporal=abs(cellScene-scPast)*8.;
  float totalFlow=min(flowMag+flowTemporal,2.);
  vec2 uvShift=grad*3.5
    *sin(u_time*1.5+cellID.x*.4+cellID.y*.3)
    *transBlend;
  vec2 distortedCellUV=cellUV+uvShift*.15;
  distortedCellUV=clamp(distortedCellUV,vec2(.02),vec2(.98));

  float bv=cellScene;
  float wave1=sin(cellID.x*.4+cellID.y*.3+u_time*1.2)*.5;
  float wave2=sin(
    cellID.x*.8-cellID.y*.6+u_time*.7+flowMag*2.
  )*.35;
  float wave3=sin(
    (cellID.x+cellID.y)*.2+u_time*1.8
  )*.15;
  float shimmer=(wave1+wave2+wave3)
    *smoothstep(0.,.3,totalFlow);
  float charF=bv*float(u_charCount-1)+shimmer;
  charF=clamp(charF,0.,float(u_charCount-1));
  int charA=int(floor(charF));
  int charB=min(charA+1,u_charCount-1);
  float blend=fract(charF);
  float alphaA=sampleChar(charA,distortedCellUV).r;
  float alphaB=sampleChar(charB,distortedCellUV).r;
  float alpha=mix(alphaA,alphaB,blend);

  vec3 bgc=vec3(1.);
  vec3 charCol=getRainbow(v_uv,cellID,bv,totalFlow,grad);
  ivec2 ic2=ivec2(mod(floor(v_uv*u_res/2.),vec2(4.)));
  float dither=float(bayer4[ic2.y*4+ic2.x])/16.;
  alpha=alpha*step(dither*.4+.2,alpha);
  vec3 col=mix(bgc,charCol,alpha);
  float glow=smoothstep(.1,.5,bv)*alpha*.08;
  vec3 glowCol=getRainbow(v_uv,cellID,1.,totalFlow,grad);
  col+=glowCol*glow;

  col*=1.-.2*pow(length(v_uv-.5),2.);
  if(u_reveal<.9999){
    float c1=hash(floor(gl_FragCoord.xy/128.));
    float c2=hash(floor(gl_FragCoord.xy/28.)+vec2(47.3,19.2));
    float c3=hash(floor(gl_FragCoord.xy/7.)+vec2(83.1,61.4));
    float thresh=(c1*.45+c2*.35+c3*.20)*.85;
    col=mix(
      vec3(1.),
      col,
      smoothstep(thresh-.05,thresh+.05,u_reveal)
    );
  }
  fragColor=vec4(col,1.);
}`;
