export const DITHER_WORLD_VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){v_uv=a_pos*.5+.5;gl_Position=vec4(a_pos,0.,1.);}`;

export const DITHER_WORLD_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform vec2 u_res;
uniform float u_time;
uniform int u_sceneA,u_sceneB;
uniform float u_sceneMix,u_intro;
uniform vec2 u_pointer;
uniform vec4 u_impulse;
uniform sampler2D u_atlas;
uniform float u_cellSize;
uniform int u_charCount,u_atlasCols,u_atlasRows;

float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise2(p);p=p*2.03+vec2(17.1,9.2);a*=.5;}return v;}
float sdRoundBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return min(max(q.x,q.y),0.)+length(max(q,0.))-r;}
float segmentDistance(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h);}
float softBelow(float y,float ridge){return 1.-smoothstep(ridge-.008,ridge+.008,y);}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 grade(vec3 c,float s){float l=dot(c,vec3(.299,.587,.114));return mix(vec3(l),c,s);}
float ring(vec2 p,float r,float w){return 1.-smoothstep(w,w*1.8,abs(length(p)-r));}
float lineMask(float value,float width){return 1.-smoothstep(width,width*1.8,abs(value));}

vec4 alpineDawn(vec2 uv,float t){
 float a=u_res.x/u_res.y,px=(u_pointer.x-.5)*.045;vec3 c=mix(vec3(.80,.61,.43),vec3(.018,.045,.09),smoothstep(.35,1.,uv.y));
 float cloud=fbm(vec2(uv.x*3.+t*.012,uv.y*8.));float bands=exp(-pow((uv.y-.67)/.16,2.))*smoothstep(.48,.72,cloud);c=mix(c,vec3(.86,.79,.67),bands*.24);
 vec2 sunC=vec2(.73+px,.72);float sd=length((uv-sunC)*vec2(a,1.));c+=vec3(1.,.56,.20)*exp(-sd*8.)*.38;c=mix(c,vec3(1.,.94,.72),1.-smoothstep(.054,.066,sd));
 float x=uv.x+px;float far=.41+.035*sin(x*6.2)+.07*(fbm(vec2(x*4.,2.))- .5);float fm=softBelow(uv.y,far);c=mix(c,vec3(.27,.34,.39),fm*.9);
 float snow=lineMask(uv.y-(far-.012-.018*sin(x*21.)),.007)*fm;c=mix(c,vec3(.78,.82,.80),snow*.45);
 float mid=.32+.06*sin(x*5.-1.)+.11*(fbm(vec2(x*3.2,8.))- .48);float mm=softBelow(uv.y,mid);c=mix(c,vec3(.09,.15,.19),mm*.97);
 float near=.20+.055*sin(x*7.4+.8)+.085*(fbm(vec2(x*5.2,15.))- .43);float nm=softBelow(uv.y,near);c=mix(c,vec3(.018,.045,.055),nm);
 float trees=step(.78,hash21(vec2(floor(uv.x*180.),floor((uv.y-near)*220.))))*nm*smoothstep(near+.045,near,uv.y);c+=vec3(.02,.035,.025)*trees;
 float mist=exp(-pow((uv.y-.36)/.06,2.))*(.35+.65*fbm(vec2(uv.x*4.-t*.018,uv.y*13.)));c=mix(c,vec3(.64,.68,.66),mist*.3*(1.-nm));
 for(int i=0;i<3;i++){float fi=float(i);vec2 bp=(uv-vec2(.22+fi*.085,.77+sin(t*.3+fi)*.012))*vec2(a,1.);float bird=min(segmentDistance(bp,vec2(-.014,0),vec2(0,.007)),segmentDistance(bp,vec2(0,.007),vec2(.014,0)));c=mix(c,vec3(.02),1.-smoothstep(.002,.005,bird));}
 if(u_impulse.z>=0.&&u_impulse.z<4.){vec2 p=(uv-u_impulse.xy)*vec2(a,1.);c+=vec3(.98,.63,.28)*exp(-length(p)*16.)*exp(-u_impulse.z*1.2)*.5;}
 return vec4(clamp(c,0.,1.),1.);
}

vec4 moonWater(vec2 uv,float t){
 float a=u_res.x/u_res.y,px=(u_pointer.x-.5)*.03;vec3 c=mix(vec3(.10,.19,.28),vec3(.008,.015,.045),smoothstep(.43,1.,uv.y));
 float starHash=hash21(floor(uv*vec2(170.,100.)));float stars=step(.984,starHash)*smoothstep(.47,1.,uv.y);c+=vec3(.7,.83,.92)*stars*(.45+.55*sin(t*1.7+starHash*20.));
 vec2 mc=vec2(.70+px,.74);float md=length((uv-mc)*vec2(a,1.));c+=vec3(.35,.56,.72)*exp(-md*10.)*.32;c=mix(c,vec3(.91,.95,.92),1.-smoothstep(.062,.073,md));
 float cloud=fbm(vec2(uv.x*4.-t*.01,uv.y*11.));float cloudMask=exp(-pow((uv.y-.66)/.1,2.))*smoothstep(.5,.7,cloud);c=mix(c,vec3(.25,.35,.43),cloudMask*.2);
 float horizon=.43;if(uv.y<horizon){float d=clamp((horizon-uv.y)/horizon,0.,1.);float w=sin(uv.x*60.+t*.75+sin(uv.y*37.-t*.28)*2.)+.55*sin(uv.x*105.-t*.43+uv.y*72.);vec3 water=mix(vec3(.012,.045,.075),vec3(.045,.15,.21),1.-d);water+=vec3(.02,.09,.13)*w*.14;float ref=exp(-abs(uv.x-mc.x)*(17.+d*17.))*(.42+.58*step(.08,fract(uv.y*90.+w*.12)))*smoothstep(.02,.41,uv.y);water=mix(water,vec3(.66,.80,.78),ref*.75);if(u_impulse.z>=0.&&u_impulse.z<5.){vec2 p=(uv-u_impulse.xy)*vec2(a,1.);float rr=sin(length(p)*100.-u_impulse.z*8.)*exp(-u_impulse.z*.7)*exp(-length(p)*5.);water+=vec3(.25,.6,.7)*max(rr,0.)*.55;}c=water;}
 float shore=.14+.025*sin(uv.x*9.)+.04*fbm(vec2(uv.x*7.,2.));float sm=softBelow(uv.y,shore)*smoothstep(.38,.02,uv.x);c=mix(c,vec3(.004,.012,.016),sm);
 float fog=exp(-pow((uv.y-horizon)/.028,2.))*(.3+.7*noise2(vec2(uv.x*7.-t*.015,0.)));c=mix(c,vec3(.28,.39,.43),fog*.17);return vec4(clamp(c,0.,1.),1.);
}

vec4 desertWind(vec2 uv,float t){
 float a=u_res.x/u_res.y,px=(u_pointer.x-.5)*.055;vec3 c=mix(vec3(.91,.67,.43),vec3(.13,.20,.24),smoothstep(.46,1.,uv.y));vec2 sc=vec2(.24+px*.25,.67);float sd=length((uv-sc)*vec2(a,1.));c+=vec3(.85,.32,.12)*exp(-sd*10.)*.22;c=mix(c,vec3(.99,.84,.6),1.-smoothstep(.059,.071,sd));
 float x=uv.x+px;float b=.37+.055*sin(x*4.2+1.7)+.05*fbm(vec2(x*3.4,4.));float bm=softBelow(uv.y,b);c=mix(c,vec3(.57,.32,.23),bm*.83);float m=.27+.07*sin(x*5.1-.7)+.07*fbm(vec2(x*4.2,9.));float mm=softBelow(uv.y,m);c=mix(c,vec3(.32,.17,.15),mm*.94);float n=.14+.06*sin(x*6.5+2.)+.06*fbm(vec2(x*6.,14.));float nm=softBelow(uv.y,n);c=mix(c,vec3(.06,.045,.045),nm);
 float ridges=lineMask(uv.y-(m-.012*sin(x*23.)),.006)*mm;c=mix(c,vec3(.82,.48,.30),ridges*.28);float windBand=exp(-pow((uv.y-.54)/.15,2.));float wind=smoothstep(.82,1.,sin(uv.x*35.+uv.y*9.+t*.65+fbm(uv*6.)*3.))*windBand;c=mix(c,vec3(.97,.84,.66),wind*.2);float heat=sin(uv.y*140.+t*1.2+uv.x*6.)*exp(-pow((uv.y-.43)/.12,2.));c+=vec3(.12,.05,.02)*heat*.04;
 if(u_impulse.z>=0.&&u_impulse.z<4.){vec2 p=(uv-u_impulse.xy)*vec2(a,1.);float sweep=exp(-abs(p.y)*18.)*exp(-abs(p.x-u_impulse.z*.12)*5.)*exp(-u_impulse.z*.5);c+=vec3(.95,.59,.31)*sweep*.34;}return vec4(clamp(c,0.,1.),1.);
}

vec4 luminousGate(vec2 uv,float t){
 float a=u_res.x/u_res.y;vec3 c=mix(vec3(.055,.10,.13),vec3(.003,.008,.018),smoothstep(.25,1.,uv.y));float stars=step(.991,hash21(floor(uv*vec2(140.,90.))))*smoothstep(.45,1.,uv.y);c+=vec3(.52,.72,.72)*stars*.45;
 vec2 center=vec2(.62+(u_pointer.x-.5)*.035,.49+(u_pointer.y-.5)*.02);vec2 p=(uv-center)*vec2(a,1.);float outer=sdRoundBox(p,vec2(.18,.31),.025);float inner=sdRoundBox(p,vec2(.105,.235),.018);float shell=(1.-smoothstep(.006,.014,outer))*(smoothstep(-.005,.01,inner));vec3 stone=mix(vec3(.08,.12,.14),vec3(.28,.38,.39),smoothstep(-.18,.25,p.y));c=mix(c,stone,shell);
 float seam=lineMask(abs(p.x)-.15,.006)*shell+lineMask(p.y+.12,.006)*shell;c+=vec3(.4,.6,.58)*seam*.2;float opening=1.-smoothstep(.0,.018,inner);c=mix(c,vec3(.002,.004,.009),opening);float beam=exp(-abs(p.x)*34.)*smoothstep(-.24,.2,p.y)*opening;c+=vec3(.42,.88,.77)*beam*.55;float pulse=.45+.55*sin(t*1.4-length(p)*18.);c+=vec3(.18,.65,.58)*exp(-abs(inner)*42.)*pulse*.32;
 float floorGlow=exp(-abs(p.x)*8.)*exp(-abs(p.y+.33)*22.);c+=vec3(.23,.57,.53)*floorGlow*.32;float fog=fbm(vec2(uv.x*4.-t*.012,uv.y*8.))*exp(-pow((uv.y-.22)/.13,2.));c=mix(c,vec3(.22,.36,.36),fog*.16);
 for(int i=0;i<8;i++){float fi=float(i);float ang=fi*.785+t*.12;vec2 q=p-vec2(cos(ang),sin(ang))*(.26+.015*sin(t+fi));float mote=exp(-length(q)*90.);c+=vec3(.48,.88,.76)*mote*.5;}
 if(u_impulse.z>=0.&&u_impulse.z<4.){c+=vec3(.42,.95,.78)*ring(p,.08+u_impulse.z*.10,.012)*exp(-u_impulse.z*.8)*.55;}return vec4(clamp(c,0.,1.),1.);
}

vec4 nightBloom(vec2 uv,float t){
 float a=u_res.x/u_res.y;vec3 c=mix(vec3(.065,.11,.12),vec3(.002,.008,.014),smoothstep(.15,1.,uv.y));float motes=step(.986,hash21(floor((uv+vec2(t*.006,-t*.009))*vec2(115.,78.))));c+=vec3(.55,.76,.60)*motes*.32;vec2 center=vec2(.59+(u_pointer.x-.5)*.035,.53+(u_pointer.y-.5)*.025);vec2 p=(uv-center)*vec2(a,1.);float r=length(p),ang=atan(p.y,p.x);float open=(u_impulse.z>=0.&&u_impulse.z<4.)?exp(-u_impulse.z*.8)*.05:0.;float petal=.16+open+.085*pow(.5+.5*cos(ang*7.+sin(t*.22)*.7),1.65);float flower=1.-smoothstep(petal-.012,petal+.014,r);float inner=.105+.052*pow(.5+.5*cos(ang*7.+.45-t*.08),1.7);float innerF=1.-smoothstep(inner-.01,inner+.012,r);float veins=(.5+.5*cos(ang*14.+r*42.-t*.12))*flower*smoothstep(.04,.2,r);vec3 pet=mix(vec3(.34,.56,.47),vec3(.89,.91,.71),smoothstep(.03,.21,r));pet=mix(pet,vec3(.72,.34,.38),innerF*.42);c=mix(c,pet,flower*.94);c+=vec3(.86,.9,.66)*veins*.13;float edge=exp(-abs(r-petal)*85.)*flower;c+=vec3(.32,.85,.62)*edge*.28;float core=1.-smoothstep(.032,.06,r);c=mix(c,vec3(.98,.69,.28),core);float stem=(1.-smoothstep(.004,.009,abs(p.x+.035*sin((p.y+.2)*8.))))*smoothstep(-.3,-.02,p.y)*(1.-smoothstep(-.02,.06,p.y));c=mix(c,vec3(.16,.4,.27),stem*.7);return vec4(clamp(c,0.,1.),1.);
}

vec4 livingTopography(vec2 uv,float t){
 float a=u_res.x/u_res.y;vec3 c=mix(vec3(.035,.075,.07),vec3(.006,.015,.018),uv.y);vec2 p=(uv-.5)*vec2(a,1.);vec2 attract=(u_pointer-.5)*vec2(a,1.);float h=fbm(p*3.2+vec2(t*.02,-t*.015));h+=.35*exp(-length(p-attract)*4.);float contours=1.-smoothstep(.035,.09,abs(fract(h*11.)-.5));c=mix(c,vec3(.22,.48,.38),contours*.58);float major=1.-smoothstep(.035,.07,abs(fract(h*3.)-.5));c+=vec3(.55,.72,.49)*major*.22;float route=lineMask(p.y-.16*sin(p.x*4.+t*.22)-.06*sin(p.x*11.),.012);route*=smoothstep(-.42,.45,p.x);c+=vec3(.96,.63,.27)*route*.7;float grid=(lineMask(fract(uv.x*10.)-.5,.018)+lineMask(fract(uv.y*7.)-.5,.018))*.12;c+=vec3(.18,.35,.30)*grid;
 if(u_impulse.z>=0.&&u_impulse.z<5.){vec2 q=(uv-u_impulse.xy)*vec2(a,1.);c+=vec3(.94,.68,.3)*ring(q,.04+u_impulse.z*.09,.01)*exp(-u_impulse.z*.55)*.7;}return vec4(clamp(c,0.,1.),1.);
}

vec4 glassCathedral(vec2 uv,float t){
 float a=u_res.x/u_res.y;vec3 c=mix(vec3(.10,.075,.11),vec3(.01,.018,.035),smoothstep(.1,1.,uv.y));vec2 p=(uv-.5)*vec2(a,1.);float floorY=-.34;float floorMask=smoothstep(floorY+.02,floorY-.02,p.y);c=mix(c,vec3(.025,.025,.035),floorMask);for(int i=-3;i<=3;i++){float fi=float(i);float x=fi*.16;float col=lineMask(p.x-x,.012)*smoothstep(-.34,.32,p.y);c+=vec3(.23,.27,.36)*col*.55;float arch=abs(length(vec2((p.x-x)/.16,(p.y-.18)/.42))-1.);c+=vec3(.32,.36,.48)*(1.-smoothstep(.012,.025,arch))*smoothstep(-.2,.5,p.y)*.45;}
 float roseR=length(p-vec2(0,.26));float rose=ring(p-vec2(0,.26),.13,.01);float spokes=(1.-smoothstep(.02,.05,abs(sin(atan(p.y-.26,p.x)*12.))))*smoothstep(.04,.15,roseR);c+=vec3(.73,.47,.58)*(rose+spokes*.35)*.5;float beam=exp(-abs(p.x-(u_pointer.x-.5)*.25)*5.)*smoothstep(-.35,.55,p.y);c+=mix(vec3(.29,.52,.65),vec3(.84,.47,.56),uv.x)*beam*.18;float dust=step(.989,hash21(floor((uv+vec2(t*.003,-t*.006))*vec2(130.,90.))));c+=vec3(.85,.78,.66)*dust*.38;
 if(u_impulse.z>=0.&&u_impulse.z<4.)c+=vec3(.85,.63,.75)*ring(p,.05+u_impulse.z*.12,.012)*exp(-u_impulse.z*.7)*.45;return vec4(clamp(c,0.,1.),1.);
}

vec4 signalGarden(vec2 uv,float t){
 float a=u_res.x/u_res.y;vec3 c=mix(vec3(.025,.075,.055),vec3(.002,.01,.016),uv.y);vec2 p=(uv-.5)*vec2(a,1.);for(int i=0;i<9;i++){float fi=float(i);float x=-.65+fi*.16+.025*sin(t*.2+fi);float stem=lineMask(p.x-x-.035*sin((p.y+.4)*5.+fi),.006)*smoothstep(-.4,.32,p.y);c+=vec3(.12,.42,.28)*stem*.5;for(int j=0;j<3;j++){float fj=float(j);vec2 node=vec2(x+.08*sin(fi*1.7+fj*2.),-.22+fj*.22+.03*sin(t*.4+fi));float pulse=.5+.5*sin(t*2.2-fi-fj);float glow=exp(-length(p-node)*(55.-pulse*20.));c+=mix(vec3(.18,.65,.42),vec3(.88,.75,.34),pulse)*glow*.72;}}
 float attract=exp(-length(p-(u_pointer-.5)*vec2(a,1.))*4.);c+=vec3(.16,.55,.38)*attract*.12;if(u_impulse.z>=0.&&u_impulse.z<5.){float wave=ring(p-(u_impulse.xy-.5)*vec2(a,1.),.03+u_impulse.z*.15,.012)*exp(-u_impulse.z*.55);c+=vec3(.95,.74,.3)*wave*.75;}return vec4(clamp(c,0.,1.),1.);
}

vec4 eventHorizon(vec2 uv,float t){
 float a=u_res.x/u_res.y;vec2 center=vec2(.56+(u_pointer.x-.5)*.05,.53+(u_pointer.y-.5)*.035);vec2 p=(uv-center)*vec2(a,1.);float r=length(p),ang=atan(p.y,p.x);vec2 warped=uv+normalize(p+.0001)*(.035/max(r,.06));float stars=step(.986,hash21(floor(warped*vec2(180.,110.))));vec3 c=vec3(.004,.006,.014)+vec3(.63,.72,.88)*stars;float disc=exp(-pow((abs(p.y+.12*sin(ang+t*.2))-r*.18)/.025,2.))*smoothstep(.13,.36,r);vec3 discColor=mix(vec3(.98,.32,.12),vec3(.45,.72,1.),smoothstep(-.2,.2,p.x));c+=discColor*disc*.85;float lens=ring(p,.20,.012)+ring(p,.24,.018)*.4;c+=vec3(.35,.55,.88)*lens*.28;float hole=1.-smoothstep(.105,.13,r);c=mix(c,vec3(0.),hole);float photon=ring(p,.132,.008);c+=vec3(.95,.72,.45)*photon*.75;if(u_impulse.z>=0.&&u_impulse.z<4.){c+=vec3(.5,.72,1.)*ring(p,.15+u_impulse.z*.12,.01)*exp(-u_impulse.z*.8)*.55;}return vec4(clamp(c,0.,1.),1.);
}

vec4 rainCity(vec2 uv,float t){
 float a=u_res.x/u_res.y;vec3 c=mix(vec3(.045,.075,.11),vec3(.004,.008,.018),smoothstep(.25,1.,uv.y));float horizon=.28;for(int i=0;i<18;i++){float fi=float(i);float x=fi/18.;float w=.035+.035*hash21(vec2(fi,1.));float h=.18+.42*hash21(vec2(fi,2.));float building=step(abs(uv.x-x),w)*smoothstep(horizon,horizon+h,uv.y);vec3 bc=mix(vec3(.018,.025,.035),vec3(.05,.065,.08),hash21(vec2(fi,3.)));c=mix(c,bc,building);float windows=step(.72,hash21(floor(vec2((uv.x-x+w)/(w*2.)*5.,(uv.y-horizon)/max(h,.01)*14.))+fi))*building;c+=mix(vec3(.92,.65,.27),vec3(.25,.65,.88),step(.5,hash21(vec2(fi,5.))))*windows*.55;}
 float street=smoothstep(horizon+.01,horizon-.01,uv.y);vec3 road=mix(vec3(.018,.022,.028),vec3(.045,.055,.065),uv.y/horizon);float lane=lineMask(abs(uv.x-.5)-uv.y*.7,.012)*street;road+=vec3(.45,.36,.24)*lane*.3;float refl=step(.74,hash21(floor(vec2(uv.x*65.,uv.y*90.-t*3.))))*street;road+=vec3(.18,.42,.55)*refl*.22;c=mix(c,road,street);float rain=step(.965,hash21(floor((uv+vec2(t*.02,-t*.15))*vec2(150.,95.))));c+=vec3(.5,.65,.76)*rain*.28;float steam=fbm(vec2(uv.x*5.-t*.02,uv.y*9.+t*.015))*exp(-pow((uv.y-.31)/.08,2.));c=mix(c,vec3(.22,.28,.33),steam*.14);
 if(u_impulse.z>=0.&&u_impulse.z<4.){float light=exp(-abs(uv.x-(u_impulse.x+u_impulse.z*.16)) *18.)*exp(-abs(uv.y-.19)*25.);c+=vec3(.95,.43,.22)*light*exp(-u_impulse.z*.5)*.65;}return vec4(clamp(c,0.,1.),1.);
}

vec4 world(int s,vec2 uv,float t){if(s==0)return alpineDawn(uv,t);if(s==1)return moonWater(uv,t);if(s==2)return desertWind(uv,t);if(s==3)return luminousGate(uv,t);if(s==4)return nightBloom(uv,t);if(s==5)return livingTopography(uv,t);if(s==6)return glassCathedral(uv,t);if(s==7)return signalGarden(uv,t);if(s==8)return eventHorizon(uv,t);return rainCity(uv,t);}

vec4 sampleCharacter(int idx,vec2 cellUv){idx=clamp(idx,0,u_charCount-1);int col=idx%u_atlasCols,row=idx/u_atlasCols;return texture(u_atlas,vec2((float(col)+cellUv.x)/float(u_atlasCols),(float(row)+cellUv.y)/float(u_atlasRows)));}

void main(){
 float cw=u_cellSize,ch=u_cellSize*1.48;vec2 count=max(floor(u_res/vec2(cw,ch)),vec2(1));vec2 id=floor(v_uv*count),cellUv=fract(v_uv*count),center=(id+.5)/count;vec4 a=world(u_sceneA,center,u_time),b=world(u_sceneB,center,u_time);float dn=hash21(id*.731+vec2(float(u_sceneA),float(u_sceneB))*19.7);float dissolve=smoothstep(dn-.16,dn+.16,u_sceneMix);vec4 scene=mix(a,b,dissolve);float light=clamp(lum(scene.rgb),0.,1.);float grain=(hash21(id+float(u_sceneA)*31.)-.5)*.32;float cf=clamp(pow(light,.82)*float(u_charCount-1)+grain,0.,float(u_charCount-1));int ca=int(floor(cf)),cb=min(ca+1,u_charCount-1);float alpha=mix(sampleCharacter(ca,cellUv).r,sampleCharacter(cb,cellUv).r,fract(cf));ivec2 bc=ivec2(mod(floor(gl_FragCoord.xy/2.),4.));const int bayer4[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);float d=float(bayer4[bc.y*4+bc.x])/16.;alpha*=step(d*.35+.12,alpha);vec3 paper=mix(vec3(.003,.005,.008),scene.rgb*.18,.72);vec3 ink=grade(scene.rgb,1.08)*(1.04+.2*light);vec3 color=mix(paper,ink,alpha);color*=1.-.16*pow(length(v_uv-.5),2.);color+=((hash21(gl_FragCoord.xy)-.5)/255.)*3.;float introNoise=hash21(floor(gl_FragCoord.xy/18.));color*=smoothstep(introNoise-.2,introNoise+.06,u_intro);fragColor=vec4(clamp(color,0.,1.),1.);
}`;
