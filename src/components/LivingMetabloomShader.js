export const LIVING_METABLOOM_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform vec2 u_res;
uniform float u_time;
uniform float u_light;
uniform float u_intro;
uniform float u_energy;
uniform float u_seed;
uniform vec2 u_pointer;
uniform vec2 u_pulseOrigin;
uniform float u_pulseAge;
uniform float u_emotionAge;
uniform int u_expressionA;
uniform int u_expressionB;
uniform float u_expressionMix;
uniform int u_formA;
uniform int u_formB;
uniform float u_formMix;
uniform float u_talking;

#define PI 3.14159265359
#define TAU 6.28318530718

float sat(float v){return clamp(v,0.0,1.0);}
float bayer2(vec2 a){a=floor(a);return fract(a.x*.5+a.y*a.y*.75);}
#define bayer4(a) (bayer2(.5*(a))*.25+bayer2(a))
#define bayer8(a) (bayer4(.5*(a))*.25+bayer2(a))
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
}
float fbm(vec2 p){
  float v=0.0,a=.5;
  for(int i=0;i<3;i++){v+=a*noise(p);p=p*2.03+vec2(11.3,7.7);a*=.5;}
  return v;
}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec3 spectral(float h){
 vec3 c=vec3(0.0,.933,1.0),m=vec3(1,0,1),y=vec3(1,.933,0),v=vec3(.616,0,1); h=fract(h);
 if(h<.25)return mix(c,m,h*4.0);
 if(h<.5)return mix(m,y,(h-.25)*4.0);
 if(h<.75)return mix(y,v,(h-.5)*4.0);
 return mix(v,c,(h-.75)*4.0);
}
float stateWeight(int idx,int a,int b,float t){return (a==idx?1.0-t:0.0)+(b==idx?t:0.0);}
float ellipseSdf(vec2 p,vec2 r){return length(p/max(r,vec2(.001)))-1.0;}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.0,1.0);return mix(b,a,h)-k*h*(1.0-h);}
float gauss(vec2 p,vec2 c,vec2 r){vec2 d=(p-c)/max(r,vec2(.001));return exp2(-dot(d,d)*1.45);}
float pulseField(vec2 uv){
 vec2 scale=vec2(u_res.x/max(u_res.y,1.0),1.0);
 vec2 d=(uv-u_pulseOrigin)*scale; float rr=length(d); float ring=u_pulseAge*.22;
 return exp(-abs(rr-ring)*42.0)*(1.0-smoothstep(2.6,5.8,u_pulseAge));
}
float eyeDistance(vec2 p,vec2 c,float width,float aperture,float curve,float slant){
 vec2 q=rot(slant)*(p-c); q.y+=curve*q.x*q.x/max(width*width,.0001);
 return ellipseSdf(q,vec2(width,max(aperture,.006)));
}
float band(float d,float width){return exp(-abs(d)/max(width,.0001));}
float starGlint(vec2 p,vec2 center,float scale){
 vec2 q=(p-center)/max(scale,.0001);
 float core=exp(-dot(q,q)*2.8);
 float cross=exp(-abs(q.x)*7.0-abs(q.y)*1.2)
  +exp(-abs(q.y)*7.0-abs(q.x)*1.2);
 return sat(core+cross*.38);
}

void main(){
 vec2 aspect=vec2(u_res.x/max(u_res.y,1.0),1.0);
 vec2 p=(v_uv*2.0-1.0)*aspect;

 float happy=stateWeight(0,u_expressionA,u_expressionB,u_expressionMix);
 float excited=stateWeight(1,u_expressionA,u_expressionB,u_expressionMix);
 float sad=stateWeight(2,u_expressionA,u_expressionB,u_expressionMix);
 float surprised=stateWeight(3,u_expressionA,u_expressionB,u_expressionMix);
 float thinking=stateWeight(4,u_expressionA,u_expressionB,u_expressionMix);
 float sleepy=stateWeight(5,u_expressionA,u_expressionB,u_expressionMix);
 float angry=stateWeight(6,u_expressionA,u_expressionB,u_expressionMix);

 float companion=stateWeight(0,u_formA,u_formB,u_formMix);
 float bloom=stateWeight(1,u_formA,u_formB,u_formMix);
 float focus=stateWeight(2,u_formA,u_formB,u_formMix);
 float drift=stateWeight(3,u_formA,u_formB,u_formMix);

 float lifeSpeed=.72+excited*.62+surprised*.18-sleepy*.36-sad*.10+angry*.12;
 float t=u_time*lifeSpeed;
 float breath=sin(t*1.14+u_seed*TAU);
 float breath2=sin(t*.63-u_seed*4.8);
 float heartbeat=pow(max(0.0,sin(t*1.82+u_seed*3.9)),10.0);
 float pulse=pulseField(v_uv);
 float intro=smoothstep(0.0,1.0,u_intro);
 p/=mix(.76,1.0,intro);

 vec2 formScale=companion*vec2(1.16,1.14)
  +bloom*vec2(1.13,1.11)
  +focus*vec2(.80,1.30)
  +drift*vec2(1.47,.82);
 float angle=drift*(-.10)+thinking*.045+angry*.025+breath*.008;
 p=rot(angle)*p;
 vec2 q=p/max(formScale,vec2(.25));

 vec2 pointer=(u_pointer*2.0-1.0)*aspect;
 pointer=rot(angle)*pointer/max(formScale,vec2(.25));
 vec2 idleGaze=vec2(
   sin(t*.17+u_seed*11.0),
   sin(t*.13-u_seed*7.0)
 )*.012*(1.0-sat(u_energy*2.0));
 vec2 gaze=clamp(pointer*.18+idleGaze,vec2(-.085),vec2(.085));
 vec2 lean=gaze*(.12+u_energy*.11);
 q-=lean*exp(-dot(q,q)*2.3);
 q.y-=happy*.014+excited*.03-sad*.065-sleepy*.04;
 q.x+=thinking*.022;

 vec2 warp=vec2(
  noise(q*1.58+vec2(t*.038,-t*.025)),
  noise(q*1.58+vec2(-t*.031,t*.036)+17.7)
 )-.5;
 float viscosity=.035+bloom*.026+drift*.042+sleepy*.015-focus*.018;
 q+=warp*viscosity;

 vec2 coreR=vec2(.455,.445);
 coreR+=vec2(surprised*.030+breath*.010, surprised*.026+breath*.010);
 coreR+=vec2(excited*.016,excited*.012);
 coreR-=vec2(focus*.030,0.0);
 vec2 coreC=vec2(0.0,-.020+breath2*.007-sad*.025-sleepy*.014);
 float shape=ellipseSdf(q-coreC,coreR);
 float coreW=gauss(q,coreC,coreR);
 float potential=coreW*1.16;
 vec3 tintAcc=spectral(.69+t*.012+u_seed*.11)*coreW;
 float tintWeight=coreW;

 float spread=.270+bloom*.155+drift*.036-focus*.052+surprised*.018+pulse*.012;
 float unionK=.255+companion*.085+focus*.045-bloom*.095;
 for(int i=0;i<7;i++){
   float fi=float(i);
   float a=fi/7.0*TAU+PI*.5+t*(.013+excited*.019)+u_seed*.22;
   vec2 dir=vec2(cos(a),sin(a));
   float sizeJitter=.94+.06*sin(fi*2.41+u_seed*4.2);
   float petalBias=sizeJitter*(.95+.05*sin(fi*1.73+t*.07));
   petalBias=mix(petalBias,sizeJitter*(.82+.18*sin(fi*2.17-t*.10)),bloom);
   vec2 c=dir*vec2(spread*petalBias,spread*.91*petalBias);
   c.x*=1.0+drift*(.30+.12*dir.x);
   c.y*=1.0-drift*.16;
   c.y-=sad*.058*max(0.0,dir.y)+sleepy*.028*max(0.0,dir.y);
   c.y+=happy*.012*max(0.0,dir.y);
   c.x*=1.0-focus*.14-angry*.08;
   c.y*=1.0+focus*.12;
   float wobble=.012+excited*.018+drift*.010-focus*.007-sleepy*.006;
   c+=vec2(sin(t*(.48+fi*.021)+fi*1.71),cos(t*(.41+fi*.017)-fi*1.29))*wobble;
   c+=gaze*(.045+.02*sin(fi*2.0));
   if(i==1){c+=vec2(.035,.035)*thinking;}
   float crown=smoothstep(.48,.88,dir.y);
   float side=smoothstep(.58,.96,abs(dir.x));
   float lower=smoothstep(.18,.90,-dir.y);
   vec2 radii=vec2(.239,.226)*sizeJitter;
   radii+=vec2(crown*.016+side*.008,lower*.014);
   radii+=vec2(bloom*.022,surprised*.012+excited*.010);
   radii-=vec2(focus*.018,focus*.008);
   radii*=1.0+breath*(.018+bloom*.018);
   if(i==1){radii*=1.0+thinking*.18;}
   if(i==5||i==6){radii*=1.0+sad*.08;}
   vec2 local=rot(-a*.32)*(q-c);
   float lobe=ellipseSdf(local,radii);
   shape=smin(shape,lobe,unionK);
   float w=gauss(local,vec2(0),radii);
   potential+=w*.74;
   tintAcc+=spectral(.56+fi*.11+t*.011+u_seed*.13)*w;
   tintWeight+=w;
 }

 // A soft two-lobed crown gives Companion a readable, huggable silhouette.
 // These masses are fused into the same signed field, never drawn above it.
 float crownPresence=sat(companion*(.86+happy*.12+excited*.18));
 float crownGrowth=smoothstep(0.0,1.0,crownPresence);
 if(crownPresence>.001){
   vec2 leftC=mix(
     vec2(-.105,.205),
     vec2(-.158,.348+breath*.006),
     crownGrowth
   );
   vec2 rightC=mix(
     vec2(.105,.205),
     vec2(.152,.344-breath*.005),
     crownGrowth
   );
   vec2 crownR=vec2(.252,.205)*(1.0+excited*.025);
   crownR*=mix(.04,1.0,crownGrowth);
   float crownUnion=max(
     .004,
     (.105+.040*crownPresence)*crownGrowth
   );
   float leftCrown=ellipseSdf(rot(-.12)*(q-leftC),crownR);
   float rightCrown=ellipseSdf(rot(.10)*(q-rightC),crownR);
   shape=smin(shape,leftCrown,crownUnion);
   shape=smin(shape,rightCrown,crownUnion);
   float leftCrownWeight=gauss(q,leftC,crownR)*crownPresence;
   float rightCrownWeight=gauss(q,rightC,crownR)*crownPresence;
   potential+=(leftCrownWeight+rightCrownWeight)*.28;
   tintAcc+=spectral(.61+t*.010)*leftCrownWeight;
   tintAcc+=spectral(.83-t*.008)*rightCrownWeight;
   tintWeight+=leftCrownWeight+rightCrownWeight;
 }

 // expression-specific buds remain part of the same field
 if(excited>.001){
   vec2 c=vec2(cos(t*.78),sin(t*.78))*.53;
   float bud=ellipseSdf(q-c,vec2(.055));
   shape=smin(shape,bud,.08*excited+.001);
   float w=gauss(q,c,vec2(.055))*excited;
   potential+=w*.42;tintAcc+=spectral(.08+t*.02)*w;tintWeight+=w;
 }
 if(thinking>.001){
   float rise=fract(t*.07+u_seed);
   vec2 c=vec2(.34,.26+rise*.18);
   float bud=ellipseSdf(q-c,vec2(mix(.052,.022,rise)));
   shape=smin(shape,bud,.055*thinking+.001);
   float w=gauss(q,c,vec2(.05))*thinking*(1.0-rise);
   potential+=w*.35;tintAcc+=spectral(.46+rise*.18)*w;tintWeight+=w;
 }

 // A nearby pointer pulls a temporary pseudopod from the same organism.
 float pointerPresence=smoothstep(.10,.42,length(pointer));
 float attention=sat(u_energy*pointerPresence);
 if(attention>.001){
   vec2 direction=normalize(pointer+vec2(.0001));
   float directionAngle=atan(direction.y,direction.x);
   vec2 center=direction*(.43+.035*attention);
   vec2 local=rot(-directionAngle)*(q-center);
   vec2 radii=vec2(.135+.035*attention,.095+.012*attention);
   float reach=ellipseSdf(local,radii);
   shape=smin(shape,reach,.07+.08*attention);
   float reachWeight=gauss(local,vec2(0.0),radii)*attention;
   potential+=reachWeight*.46;
   tintAcc+=spectral(.50+t*.018)*reachWeight;
   tintWeight+=reachWeight;
 }

 if(shape>.14){
   fragColor=vec4(0.0);
   return;
 }

 float aa=max(fwidth(shape),.002);
 float bodyAlpha=1.0-smoothstep(-aa,aa*1.5,shape);
 float rim=exp(-abs(shape)*36.0);
 float innerDepth=sat(-shape*2.25);
 float aura=exp(-max(shape,0.0)*30.0)*(1.0-bodyAlpha)*.18;

 float flowA=fbm(rot(.52)*q*1.48+vec2(t*.024,-t*.018)+u_seed*3.2);
 float flowB=fbm(rot(-.73)*q*2.15+vec2(-t*.016,t*.021)+vec2(9.7,13.1));
 float membrane=.5+.5*sin(potential*3.95+flowA*5.1+flowB*3.0+t*.19+breath*.22);
 float caustic=pow(.5+.5*sin((q.x*.68+q.y*.91)*13.0+flowB*5.4-flowA*2.1-t*.15),5.0);
 float cellular=pow(sat(1.0-abs(flowA-flowB)*2.15),3.0);

 float baseHue=.64+q.x*.15+q.y*.18+(flowA-.5)*.28+(flowB-.5)*.15+potential*.028+t*.012+u_seed*.12;
 vec3 lobeTint=tintAcc/max(tintWeight,.001);
 float spectrumBlend=sat(.5+q.x*.72+(flowA-.5)*.62);
 vec3 nativeSpectrum=mix(
   spectral(baseHue-.10),
   spectral(baseHue+.20),
   spectrumBlend
 );
 nativeSpectrum=mix(
   nativeSpectrum,
   spectral(baseHue+.42),
   sat(.28-q.y*.46+flowB*.18)*.34
 );
 vec3 baseTint=mix(lobeTint,nativeSpectrum,.80+membrane*.08);

 vec3 moodPrimary=
   happy*vec3(1.00,.62,.22)
  +excited*vec3(1.00,.05,.72)
  +sad*vec3(.16,.48,1.00)
  +surprised*vec3(.42,.94,1.00)
  +thinking*vec3(.10,.90,.72)
  +sleepy*vec3(.30,.20,.92)
  +angry*vec3(1.00,.16,.16);
 vec3 moodSecondary=
   happy*vec3(.10,.96,.80)
  +excited*vec3(1.00,.91,.12)
  +sad*vec3(.32,.10,.88)
  +surprised*vec3(.92,.55,1.00)
  +thinking*vec3(.56,.16,1.00)
  +sleepy*vec3(.08,.52,1.00)
  +angry*vec3(1.00,.58,.08);
 float emotionEnvelope=smoothstep(0.0,.20,u_emotionAge)
  *(1.0-smoothstep(2.1,6.4,u_emotionAge));
 vec3 moodTint=mix(moodPrimary,moodSecondary,sat(flowA*.72+membrane*.28));
 vec3 materialTint=mix(baseTint,moodTint,emotionEnvelope*.78);
 materialTint=mix(materialTint,spectral(baseHue+.18),pulse*(.26+u_energy*.34));

 // The face is relief inside the organism, never a composited drawing.
 // Large sensory organs grow from the same height field as the body.
 vec2 face=q-vec2(0.0,.012);
 float leftOpen=.076+happy*.010+excited*.021+surprised*.042-thinking*.004-sleepy*.060-angry*.020;
 float rightOpen=leftOpen-thinking*.032;
 leftOpen=max(.010,leftOpen);
 rightOpen=max(.010,rightOpen);
 float blink=pow(max(0.0,sin(t*.56+u_seed*17.0)),48.0);
 float blinkDepth=.96-excited*.08;
 leftOpen*=1.0-blink*blinkDepth;
 rightOpen*=1.0-blink*blinkDepth;
 float eyeWidth=.104+happy*.006+excited*.012+surprised*.018-angry*.005;
 float eyeCurve=.010*sad-.006*happy;
 float leftSlant=angry*.18-sad*.050-thinking*.020;
 float rightSlant=-angry*.18+sad*.050+thinking*.085;
 vec2 le=vec2(-.154,.094)+gaze*vec2(.29,.23);
 vec2 re=vec2(.154,.094)+gaze*vec2(.29,.23);
 float ld=eyeDistance(face,le,eyeWidth,leftOpen,eyeCurve,leftSlant);
 float rd=eyeDistance(face,re,eyeWidth,rightOpen,eyeCurve,rightSlant);
 float leftGate=smoothstep(.014,.032,leftOpen);
 float rightGate=smoothstep(.014,.032,rightOpen);
 float linside=(1.0-smoothstep(-.040,.045,ld))*leftGate;
 float rinside=(1.0-smoothstep(-.040,.045,rd))*rightGate;
 float lcrease=band(ld,.012)*(1.0-leftGate*.76);
 float rcrease=band(rd,.012)*(1.0-rightGate*.76);
 float eyeSocket=max(max(linside,rinside),max(lcrease,rcrease)*.72);
 float eyeRim=sat(band(ld,.010)*leftGate+band(rd,.010)*rightGate);

 vec2 irisOffset=gaze*.48;
 float liris=gauss(face,le+irisOffset,vec2(.061,.066))*leftGate;
 float riris=gauss(face,re+irisOffset,vec2(.061,.066))*rightGate*(1.0-thinking*.36);
 float iris=sat(liris+riris);
 float pupil=sat(
   gauss(face,le+irisOffset,vec2(.034,.041))*leftGate
  +gauss(face,re+irisOffset,vec2(.034,.041))*rightGate*(1.0-thinking*.36)
 );
 float primaryEyeSpark=sat(
   starGlint(face,le+irisOffset+vec2(-.024,.027),.019)
  +starGlint(face,re+irisOffset+vec2(-.024,.027),.019)
 );
 float secondaryEyeSpark=sat(
   gauss(face,le+irisOffset+vec2(.022,-.014),vec2(.009))
  +gauss(face,re+irisOffset+vec2(.022,-.014),vec2(.009))
 );
 float eyeSpark=sat(primaryEyeSpark+secondaryEyeSpark*.72)
  *sat(leftGate+rightGate);
 float ocularDome=sat(iris*.82+eyeRim*.28);

 float mx=face.x;
 float neutralY=-.124+mx*.018;
 float smileY=-.112+mx*mx*1.22;
 float sadY=-.076-mx*mx*.92;
 float mouthY=neutralY
  +(smileY-neutralY)*(happy+excited*.80)
  +(sadY-neutralY)*sad
  +angry*(-.006-mx*.17)
  +thinking*(.008+mx*.12);
 float mouthWidth=.132+happy*.030+excited*.034-sleepy*.046-angry*.010;
 float mouthGate=1.0-smoothstep(mouthWidth*.78,mouthWidth,abs(mx));
 float mouthCrease=exp(-abs(face.y-mouthY)*90.0)*mouthGate;
 float cornerX=mouthWidth*.76;
 float cornerY=-.112+cornerX*cornerX*1.22;
 float smileCorner=(
   gauss(face,vec2(-cornerX,cornerY),vec2(.024,.020))
  +gauss(face,vec2(cornerX,cornerY),vec2(.024,.020))
 )*sat(happy+excited*.78);
 float talkCycle=.5+.5*sin(u_time*11.2+u_seed*4.4);
 float mouthOpenAmount=u_talking*(.020+talkCycle*.034)+surprised*.068+excited*.036;
 float mouthD=ellipseSdf(
   face-vec2(0.0,-.124),
   vec2(.064+surprised*.014,max(.010,mouthOpenAmount))
 );
 float mouthOpenGate=sat(u_talking+surprised+excited*.62);
 float mouthInside=(1.0-smoothstep(-.05,.05,mouthD))*mouthOpenGate;
 float mouthRim=band(mouthD,.013)*mouthOpenGate;
 float mouthCavity=max(mouthCrease*.66,mouthInside);
 float lipRidge=sat(mouthRim*.70+smileCorner*.55+mouthCrease*.18);

 float browStrength=sat(angry+sad*.64+thinking*.52);
 float browY=.190;
 float lbrowY=browY+leftSlant*(face.x+.142);
 float rbrowY=browY+rightSlant*(face.x-.142);
 float lbrow=exp(-abs(face.y-lbrowY)*80.0)
  *(1.0-smoothstep(.052,.118,abs(face.x+.142)));
 float rbrow=exp(-abs(face.y-rbrowY)*80.0)
  *(1.0-smoothstep(.052,.118,abs(face.x-.142)));
 float browRidge=(lbrow+rbrow)*browStrength;

 float cheek=(
   gauss(face,vec2(-.238,-.010),vec2(.094,.058))
  +gauss(face,vec2(.238,-.010),vec2(.094,.058))
 )*(.22+happy*.78+excited*.82+surprised*.15);

 float faceGate=smoothstep(.035,.17,innerDepth);
 eyeSocket*=faceGate;
 mouthCavity*=faceGate;
 browRidge*=faceGate;
 eyeRim*=faceGate;
 mouthRim*=faceGate;
 iris*=faceGate;
 pupil*=faceGate;
 eyeSpark*=faceGate;
 ocularDome*=faceGate;
 lipRidge*=faceGate;
 smileCorner*=faceGate;
 cheek*=faceGate;

 float surfaceHeight=innerDepth
  -eyeSocket*.078
  -mouthCavity*.100
  +ocularDome*.052
  +lipRidge*.022
  +cheek*.014
  +browRidge*.028
  +rim*.018
  +(membrane-.5)*.011*bodyAlpha;
 vec2 grad=vec2(dFdx(surfaceHeight),dFdy(surfaceHeight));
 vec3 normal=normalize(vec3(-grad.x*2.75,-grad.y*2.75,.57));
 vec3 keyDir=normalize(vec3(-.48,.55,.68));
 vec3 fillDir=normalize(vec3(.62,-.20,.70));
 vec3 viewDir=vec3(0.0,0.0,1.0);
 float diffuse=.42+.58*sat(dot(normal,keyDir));
 float fill=.22*sat(dot(normal,fillDir));
 float fresnel=pow(1.0-sat(normal.z),2.7);
 float spec=pow(sat(dot(reflect(-keyDir,normal),viewDir)),38.0);
 float softSpec=pow(sat(dot(reflect(-fillDir,normal),viewDir)),14.0);

 vec3 gel=materialTint*(.40+diffuse*.66+fill);
 gel+=materialTint*(membrane*.13+caustic*.10+cellular*.07)*innerDepth;
 float coreGlow=exp(-dot(q*vec2(.92,1.04),q*vec2(.92,1.04))*3.4);
 float broadHighlight=gauss(q,vec2(-.17,.25),vec2(.28,.19));
 gel+=materialTint*coreGlow*.09;
 gel+=vec3(1.0,.98,.94)*broadHighlight*.10*bodyAlpha;
 gel+=vec3(1.0)*spec*.58+materialTint*softSpec*.22;
 gel+=spectral(baseHue+.12)*rim*(.28+fresnel*.52);
 gel+=moodTint*heartbeat*.060*innerDepth;
 gel+=moodSecondary*cheek*emotionEnvelope*.10;
 gel*=mix(1.0,.90,u_light);

 float cavity=sat(eyeSocket*.58+mouthCavity*.86);
 vec3 cavityTint=gel*.14+materialTint*.08+moodSecondary*.08*emotionEnvelope;
 gel=mix(gel,cavityTint,cavity*.56);
 gel+=materialTint*eyeRim*.21;
 gel+=materialTint*mouthRim*.18;
 vec3 ocularColor=mix(
   vec3(.050,.016,.135),
   moodSecondary*.40+materialTint*.18,
   .34
 );
 vec3 ocularRimColor=mix(materialTint,moodSecondary,.48);
 gel=mix(gel,ocularColor,iris*.78);
 gel+=ocularRimColor*eyeRim*.22;
 gel=mix(gel,vec3(.004,.006,.020),pupil*.90);
 gel+=vec3(1.24,1.16,1.30)*eyeSpark*.82;
 gel+=moodSecondary*iris*(.08+.18*emotionEnvelope);
 float permanentBlush=cheek*(.07+happy*.18+excited*.24);
 gel+=mix(vec3(1.00,.19,.46),moodPrimary,.22)*permanentBlush;
 gel+=materialTint*lipRidge*.11;

 // intrinsic Metalbloom in focus form
 float mirror=sat(.24+diffuse*.16+spec*1.25+softSpec*.44+fresnel*.74+(flowA-.5)*.14);
 vec3 metalShadow=mix(vec3(.045,.055,.080),vec3(.16,.18,.22),u_light);
 vec3 metalMid=mix(vec3(.48,.54,.66),vec3(.68,.72,.79),u_light);
 vec3 metalHi=mix(vec3(1.38,1.48,1.62),vec3(1.28,1.36,1.48),u_light);
 vec3 metal=mix(metalShadow,metalMid,smoothstep(.12,.48,mirror));
 metal=mix(metal,metalHi,smoothstep(.50,.96,mirror));
 metal+=materialTint*(.10+rim*(.22+fresnel*.28));
 metal=mix(metal,metal*.22+materialTint*.08,cavity*.56);
 metal+=materialTint*(eyeRim+mouthRim)*.15;
 metal=mix(
   metal,
   mix(vec3(.035,.012,.090),moodSecondary*.34,.38),
   iris*.70
 );
 metal=mix(metal,vec3(.006,.008,.020),pupil*.88);
 metal+=vec3(1.20,1.14,1.28)*eyeSpark*.70;
 vec3 color=mix(gel,metal,focus);

 float alpha=bodyAlpha*(.90+innerDepth*.085)+aura;
 alpha*=smoothstep(.04,.72,intro);
 alpha*=1.0-cavity*.035;
 alpha=max(alpha,(eyeRim+mouthRim)*.025*bodyAlpha);
 // Ordered dither is a persistent material property, not a temporary overlay.
 vec2 ditherCoord=floor(gl_FragCoord.xy);
 float orderedDither=bayer8(ditherCoord)-.5;
 float coarseDither=bayer8(floor(gl_FragCoord.xy*.5)+vec2(3.0,5.0))-.5;
 float edgeDither=(1.0-innerDepth)*.95+.24;
 float alphaLevels=22.0;
 alpha=sat(
   floor(alpha*(alphaLevels-1.0)+orderedDither*edgeDither+.5)
   /(alphaLevels-1.0)
 );
 float colorLevels=18.0;
 vec3 ditheredColor=floor(
   max(color,vec3(0.0))*(colorLevels-1.0)
    +orderedDither*.95
    +.5
 )/(colorLevels-1.0);
 float ditherInk=coarseDither*(.046+rim*.030+membrane*.014)*bodyAlpha;
 color=max(
   vec3(0.0),
   mix(color,ditheredColor,.90)+materialTint*ditherInk
 );
 fragColor=vec4(color*alpha,alpha);
}`;
