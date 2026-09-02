from pathlib import Path


def replace_once(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one source match, found {count}")
    return content.replace(old, new, 1)


shader_path = Path("src/components/LivingMetabloomShader.js")
shader = shader_path.read_text()

shader = replace_once(
    shader,
    """float band(float d,float width){return exp(-abs(d)/max(width,.0001));}\n\nvoid main(){""",
    """float band(float d,float width){return exp(-abs(d)/max(width,.0001));}\nfloat starGlint(vec2 p,vec2 center,float scale){\n vec2 q=(p-center)/max(scale,.0001);\n float core=exp(-dot(q,q)*2.8);\n float cross=exp(-abs(q.x)*7.0-abs(q.y)*1.2)\n  +exp(-abs(q.y)*7.0-abs(q.x)*1.2);\n return sat(core+cross*.38);\n}\n\nvoid main(){""",
    "star glint anatomy",
)

shader = replace_once(
    shader,
    """ vec2 coreR=vec2(.43,.47);\n coreR+=vec2(surprised*.025+breath*.008, surprised*.03+breath*.010);\n coreR+=vec2(excited*.010,excited*.014);\n coreR-=vec2(focus*.025,0.0);\n vec2 coreC=vec2(0.0,-.015+breath2*.007-sad*.025-sleepy*.014);""",
    """ vec2 coreR=vec2(.455,.445);\n coreR+=vec2(surprised*.030+breath*.010, surprised*.026+breath*.010);\n coreR+=vec2(excited*.016,excited*.012);\n coreR-=vec2(focus*.030,0.0);\n vec2 coreC=vec2(0.0,-.020+breath2*.007-sad*.025-sleepy*.014);""",
    "friendlier core proportions",
)

shader = replace_once(
    shader,
    """ float spread=.282+bloom*.155+drift*.036-focus*.052+surprised*.018+pulse*.012;\n float unionK=.245+companion*.075+focus*.045-bloom*.095;""",
    """ float spread=.270+bloom*.155+drift*.036-focus*.052+surprised*.018+pulse*.012;\n float unionK=.255+companion*.085+focus*.045-bloom*.095;""",
    "cohesive organism silhouette",
)

shader = replace_once(
    shader,
    """ }\n\n // expression-specific buds remain part of the same field""",
    """ }\n\n // A soft two-lobed crown gives Companion a readable, huggable silhouette.\n // These masses are fused into the same signed field, never drawn above it.\n float crownPresence=sat(companion*(.86+happy*.12+excited*.18));\n if(crownPresence>.001){\n   vec2 leftC=vec2(-.158,.348+breath*.006);\n   vec2 rightC=vec2(.152,.344-breath*.005);\n   vec2 crownR=vec2(.252,.205)*(1.0+excited*.025);\n   float leftCrown=ellipseSdf(rot(-.12)*(q-leftC),crownR);\n   float rightCrown=ellipseSdf(rot(.10)*(q-rightC),crownR);\n   shape=smin(shape,leftCrown,.105+.040*crownPresence);\n   shape=smin(shape,rightCrown,.105+.040*crownPresence);\n   float leftCrownWeight=gauss(q,leftC,crownR)*crownPresence;\n   float rightCrownWeight=gauss(q,rightC,crownR)*crownPresence;\n   potential+=(leftCrownWeight+rightCrownWeight)*.28;\n   tintAcc+=spectral(.61+t*.010)*leftCrownWeight;\n   tintAcc+=spectral(.83-t*.008)*rightCrownWeight;\n   tintWeight+=leftCrownWeight+rightCrownWeight;\n }\n\n // expression-specific buds remain part of the same field""",
    "companion crown lobes",
)

shader = replace_once(
    shader,
    """ float baseHue=.69+q.x*.085+q.y*.14+(flowA-.5)*.24+(flowB-.5)*.11+potential*.032+t*.013+u_seed*.12;\n vec3 lobeTint=tintAcc/max(tintWeight,.001);\n vec3 baseTint=mix(lobeTint,spectral(baseHue),.76+membrane*.10);""",
    """ float baseHue=.64+q.x*.15+q.y*.18+(flowA-.5)*.28+(flowB-.5)*.15+potential*.028+t*.012+u_seed*.12;\n vec3 lobeTint=tintAcc/max(tintWeight,.001);\n float spectrumBlend=sat(.5+q.x*.72+(flowA-.5)*.62);\n vec3 nativeSpectrum=mix(\n   spectral(baseHue-.10),\n   spectral(baseHue+.20),\n   spectrumBlend\n );\n nativeSpectrum=mix(\n   nativeSpectrum,\n   spectral(baseHue+.42),\n   sat(.28-q.y*.46+flowB*.18)*.34\n );\n vec3 baseTint=mix(lobeTint,nativeSpectrum,.80+membrane*.08);""",
    "richer native spectrum",
)

shader = replace_once(
    shader,
    """ // The face is relief inside the organism, never a composited drawing.\n vec2 face=q-vec2(0.0,.020);\n float leftOpen=.055+excited*.017+surprised*.028-sleepy*.046-angry*.028-happy*.008;\n float rightOpen=leftOpen-thinking*.027;\n leftOpen=max(.008,leftOpen);\n rightOpen=max(.008,rightOpen);\n float blink=pow(max(0.0,sin(t*.56+u_seed*17.0)),48.0);\n leftOpen*=1.0-blink*.94;\n rightOpen*=1.0-blink*.94;\n float eyeWidth=.080+excited*.009+surprised*.012-angry*.006;\n float eyeCurve=.018*sad-.015*happy;\n float leftSlant=angry*.14-sad*.025-thinking*.020;\n float rightSlant=-angry*.14+sad*.025+thinking*.090;\n vec2 le=vec2(-.142,.090)+gaze*vec2(.27,.21);\n vec2 re=vec2(.142,.090)+gaze*vec2(.27,.21);\n float ld=eyeDistance(face,le,eyeWidth,leftOpen,eyeCurve,leftSlant);\n float rd=eyeDistance(face,re,eyeWidth,rightOpen,eyeCurve,rightSlant);\n float leftGate=smoothstep(.013,.034,leftOpen);\n float rightGate=smoothstep(.013,.034,rightOpen);\n float linside=(1.0-smoothstep(-.035,.045,ld))*leftGate;\n float rinside=(1.0-smoothstep(-.035,.045,rd))*rightGate;\n float lcrease=band(ld,.013)*(1.0-leftGate*.72);\n float rcrease=band(rd,.013)*(1.0-rightGate*.72);\n float eyeSocket=max(max(linside,rinside),max(lcrease,rcrease)*.70);\n float eyeRim=sat(band(ld,.010)*leftGate+band(rd,.010)*rightGate);\n\n vec2 irisOffset=gaze*.42;\n float liris=gauss(face,le+irisOffset,vec2(.030,.034))*leftGate;\n float riris=gauss(face,re+irisOffset,vec2(.030,.034))*rightGate*(1.0-thinking*.48);\n float iris=sat(liris+riris);\n float pupil=sat(\n   gauss(face,le+irisOffset,vec2(.013,.017))*leftGate\n  +gauss(face,re+irisOffset,vec2(.013,.017))*rightGate*(1.0-thinking*.48)\n );\n float eyeSpark=sat(\n   gauss(face,le+irisOffset+vec2(-.010,.012),vec2(.006))\n  +gauss(face,re+irisOffset+vec2(-.010,.012),vec2(.006))\n )*sat(leftGate+rightGate);""",
    """ // The face is relief inside the organism, never a composited drawing.\n // Large sensory organs grow from the same height field as the body.\n vec2 face=q-vec2(0.0,.012);\n float leftOpen=.076+happy*.010+excited*.021+surprised*.042-thinking*.004-sleepy*.060-angry*.020;\n float rightOpen=leftOpen-thinking*.032;\n leftOpen=max(.010,leftOpen);\n rightOpen=max(.010,rightOpen);\n float blink=pow(max(0.0,sin(t*.56+u_seed*17.0)),48.0);\n float blinkDepth=.96-excited*.08;\n leftOpen*=1.0-blink*blinkDepth;\n rightOpen*=1.0-blink*blinkDepth;\n float eyeWidth=.104+happy*.006+excited*.012+surprised*.018-angry*.005;\n float eyeCurve=.010*sad-.006*happy;\n float leftSlant=angry*.18-sad*.050-thinking*.020;\n float rightSlant=-angry*.18+sad*.050+thinking*.085;\n vec2 le=vec2(-.154,.094)+gaze*vec2(.29,.23);\n vec2 re=vec2(.154,.094)+gaze*vec2(.29,.23);\n float ld=eyeDistance(face,le,eyeWidth,leftOpen,eyeCurve,leftSlant);\n float rd=eyeDistance(face,re,eyeWidth,rightOpen,eyeCurve,rightSlant);\n float leftGate=smoothstep(.014,.032,leftOpen);\n float rightGate=smoothstep(.014,.032,rightOpen);\n float linside=(1.0-smoothstep(-.040,.045,ld))*leftGate;\n float rinside=(1.0-smoothstep(-.040,.045,rd))*rightGate;\n float lcrease=band(ld,.012)*(1.0-leftGate*.76);\n float rcrease=band(rd,.012)*(1.0-rightGate*.76);\n float eyeSocket=max(max(linside,rinside),max(lcrease,rcrease)*.72);\n float eyeRim=sat(band(ld,.010)*leftGate+band(rd,.010)*rightGate);\n\n vec2 irisOffset=gaze*.48;\n float liris=gauss(face,le+irisOffset,vec2(.061,.066))*leftGate;\n float riris=gauss(face,re+irisOffset,vec2(.061,.066))*rightGate*(1.0-thinking*.36);\n float iris=sat(liris+riris);\n float pupil=sat(\n   gauss(face,le+irisOffset,vec2(.034,.041))*leftGate\n  +gauss(face,re+irisOffset,vec2(.034,.041))*rightGate*(1.0-thinking*.36)\n );\n float primaryEyeSpark=sat(\n   starGlint(face,le+irisOffset+vec2(-.024,.027),.019)\n  +starGlint(face,re+irisOffset+vec2(-.024,.027),.019)\n );\n float secondaryEyeSpark=sat(\n   gauss(face,le+irisOffset+vec2(.022,-.014),vec2(.009))\n  +gauss(face,re+irisOffset+vec2(.022,-.014),vec2(.009))\n );\n float eyeSpark=sat(primaryEyeSpark+secondaryEyeSpark*.72)\n  *sat(leftGate+rightGate);\n float ocularDome=sat(iris*.82+eyeRim*.28);""",
    "cute integrated sensory anatomy",
)

shader = replace_once(
    shader,
    """ float mx=face.x;\n float neutralY=-.118+mx*.025;\n float smileY=-.106+mx*mx*1.08;\n float sadY=-.078-mx*mx*.86;\n float mouthY=neutralY\n  +(smileY-neutralY)*(happy+excited*.76)\n  +(sadY-neutralY)*sad\n  +angry*(-.006-mx*.16)\n  +thinking*(.008+mx*.13);\n float mouthWidth=.108+happy*.020+excited*.026-sleepy*.042-angry*.012;\n float mouthGate=1.0-smoothstep(mouthWidth*.76,mouthWidth,abs(mx));\n float mouthCrease=exp(-abs(face.y-mouthY)*102.0)*mouthGate;\n float talkCycle=.5+.5*sin(u_time*11.2+u_seed*4.4);\n float mouthOpenAmount=u_talking*(.019+talkCycle*.033)+surprised*.064+excited*.034;\n float mouthD=ellipseSdf(\n   face-vec2(0.0,-.120),\n   vec2(.057+surprised*.012,max(.010,mouthOpenAmount))\n );\n float mouthOpenGate=sat(u_talking+surprised+excited*.62);\n float mouthInside=(1.0-smoothstep(-.05,.05,mouthD))*mouthOpenGate;\n float mouthRim=band(mouthD,.013)*mouthOpenGate;\n float mouthCavity=max(mouthCrease*.62,mouthInside);""",
    """ float mx=face.x;\n float neutralY=-.124+mx*.018;\n float smileY=-.112+mx*mx*1.22;\n float sadY=-.076-mx*mx*.92;\n float mouthY=neutralY\n  +(smileY-neutralY)*(happy+excited*.80)\n  +(sadY-neutralY)*sad\n  +angry*(-.006-mx*.17)\n  +thinking*(.008+mx*.12);\n float mouthWidth=.132+happy*.030+excited*.034-sleepy*.046-angry*.010;\n float mouthGate=1.0-smoothstep(mouthWidth*.78,mouthWidth,abs(mx));\n float mouthCrease=exp(-abs(face.y-mouthY)*90.0)*mouthGate;\n float cornerX=mouthWidth*.76;\n float cornerY=-.112+cornerX*cornerX*1.22;\n float smileCorner=(\n   gauss(face,vec2(-cornerX,cornerY),vec2(.024,.020))\n  +gauss(face,vec2(cornerX,cornerY),vec2(.024,.020))\n )*sat(happy+excited*.78);\n float talkCycle=.5+.5*sin(u_time*11.2+u_seed*4.4);\n float mouthOpenAmount=u_talking*(.020+talkCycle*.034)+surprised*.068+excited*.036;\n float mouthD=ellipseSdf(\n   face-vec2(0.0,-.124),\n   vec2(.064+surprised*.014,max(.010,mouthOpenAmount))\n );\n float mouthOpenGate=sat(u_talking+surprised+excited*.62);\n float mouthInside=(1.0-smoothstep(-.05,.05,mouthD))*mouthOpenGate;\n float mouthRim=band(mouthD,.013)*mouthOpenGate;\n float mouthCavity=max(mouthCrease*.66,mouthInside);\n float lipRidge=sat(mouthRim*.70+smileCorner*.55+mouthCrease*.18);""",
    "friendlier mouth anatomy",
)

shader = replace_once(
    shader,
    """ float cheek=(\n   gauss(face,vec2(-.230,-.002),vec2(.078,.044))\n  +gauss(face,vec2(.230,-.002),vec2(.078,.044))\n )*(happy+excited*.72);""",
    """ float cheek=(\n   gauss(face,vec2(-.238,-.010),vec2(.094,.058))\n  +gauss(face,vec2(.238,-.010),vec2(.094,.058))\n )*(.22+happy*.78+excited*.82+surprised*.15);""",
    "softer cheek anatomy",
)

shader = replace_once(
    shader,
    """ eyeSpark*=faceGate;\n cheek*=faceGate;\n\n float surfaceHeight=innerDepth\n  -eyeSocket*.095\n  -mouthCavity*.105\n  +browRidge*.032\n  +rim*.018\n  +(membrane-.5)*.011*bodyAlpha;""",
    """ eyeSpark*=faceGate;\n ocularDome*=faceGate;\n lipRidge*=faceGate;\n smileCorner*=faceGate;\n cheek*=faceGate;\n\n float surfaceHeight=innerDepth\n  -eyeSocket*.078\n  -mouthCavity*.100\n  +ocularDome*.052\n  +lipRidge*.022\n  +cheek*.014\n  +browRidge*.028\n  +rim*.018\n  +(membrane-.5)*.011*bodyAlpha;""",
    "facial relief integration",
)

shader = replace_once(
    shader,
    """ gel+=moodTint*heartbeat*.055*innerDepth;\n gel+=moodSecondary*cheek*emotionEnvelope*.11;\n gel*=mix(1.0,.90,u_light);\n\n float cavity=sat(eyeSocket*.74+mouthCavity*.90);\n vec3 cavityTint=gel*.18+materialTint*.10+moodSecondary*.10*emotionEnvelope;\n gel=mix(gel,cavityTint,cavity*.75);\n gel+=materialTint*eyeRim*.18;\n gel+=materialTint*mouthRim*.15;\n gel=mix(gel,moodSecondary*.28+materialTint*.24,iris*.47);\n gel=mix(gel,materialTint*.035+vec3(.010,.014,.028),pupil*.71);\n gel+=vec3(1.0,.96,.88)*eyeSpark*.58;\n gel+=moodSecondary*iris*(.09+.16*emotionEnvelope);""",
    """ gel+=moodTint*heartbeat*.060*innerDepth;\n gel+=moodSecondary*cheek*emotionEnvelope*.10;\n gel*=mix(1.0,.90,u_light);\n\n float cavity=sat(eyeSocket*.58+mouthCavity*.86);\n vec3 cavityTint=gel*.14+materialTint*.08+moodSecondary*.08*emotionEnvelope;\n gel=mix(gel,cavityTint,cavity*.56);\n gel+=materialTint*eyeRim*.21;\n gel+=materialTint*mouthRim*.18;\n vec3 ocularColor=mix(\n   vec3(.050,.016,.135),\n   moodSecondary*.40+materialTint*.18,\n   .34\n );\n vec3 ocularRimColor=mix(materialTint,moodSecondary,.48);\n gel=mix(gel,ocularColor,iris*.78);\n gel+=ocularRimColor*eyeRim*.22;\n gel=mix(gel,vec3(.004,.006,.020),pupil*.90);\n gel+=vec3(1.24,1.16,1.30)*eyeSpark*.82;\n gel+=moodSecondary*iris*(.08+.18*emotionEnvelope);\n float permanentBlush=cheek*(.07+happy*.18+excited*.24);\n gel+=mix(vec3(1.00,.19,.46),moodPrimary,.22)*permanentBlush;\n gel+=materialTint*lipRidge*.11;""",
    "cute eye and blush material",
)

shader = replace_once(
    shader,
    """ metal=mix(metal,metal*.22+materialTint*.08,cavity*.67);\n metal+=materialTint*(eyeRim+mouthRim)*.13;\n metal=mix(metal,moodSecondary*.27+metal*.24,iris*.43);\n metal=mix(metal,vec3(.010,.014,.024),pupil*.72);\n vec3 color=mix(gel,metal,focus);""",
    """ metal=mix(metal,metal*.22+materialTint*.08,cavity*.56);\n metal+=materialTint*(eyeRim+mouthRim)*.15;\n metal=mix(\n   metal,\n   mix(vec3(.035,.012,.090),moodSecondary*.34,.38),\n   iris*.70\n );\n metal=mix(metal,vec3(.006,.008,.020),pupil*.88);\n metal+=vec3(1.20,1.14,1.28)*eyeSpark*.70;\n vec3 color=mix(gel,metal,focus);""",
    "cute Metalbloom eyes",
)

shader = replace_once(
    shader,
    """ float d=bayer8(gl_FragCoord.xy)-.5;\n float edgeDither=(1.0-innerDepth)*.55+.18;\n alpha=sat(floor(alpha*48.0+d*edgeDither)/47.0);\n color=max(vec3(0),floor(color*64.0+d*.35)/63.0);\n fragColor=vec4(color*alpha,alpha);""",
    """ // Ordered dither is a persistent material property, not a temporary overlay.\n vec2 ditherCoord=floor(gl_FragCoord.xy);\n float orderedDither=bayer8(ditherCoord)-.5;\n float coarseDither=bayer8(floor(gl_FragCoord.xy*.5)+vec2(3.0,5.0))-.5;\n float edgeDither=(1.0-innerDepth)*.95+.24;\n float alphaLevels=22.0;\n alpha=sat(\n   floor(alpha*(alphaLevels-1.0)+orderedDither*edgeDither+.5)\n   /(alphaLevels-1.0)\n );\n float colorLevels=18.0;\n vec3 ditheredColor=floor(\n   max(color,vec3(0.0))*(colorLevels-1.0)\n    +orderedDither*.95\n    +.5\n )/(colorLevels-1.0);\n float ditherInk=coarseDither*(.046+rim*.030+membrane*.014)*bodyAlpha;\n color=max(\n   vec3(0.0),\n   mix(color,ditheredColor,.90)+materialTint*ditherInk\n );\n fragColor=vec4(color*alpha,alpha);""",
    "persistent ordered dither",
)

shader_path.write_text(shader)


polish_path = Path("src/components/LivingMetabloomPolish.css")
polish = polish_path.read_text()
polish = replace_once(
    polish,
    """/*\n * The organism owns the visual. These rules remove the old pixel-art reading\n * without adding a shell, frame, or presentation layer around the field.\n */""",
    """/*\n * The organism owns the visual. Ordered dither remains visible across its\n * membrane without adding a shell, frame, or presentation layer around it.\n */""",
    "dither polish comment",
)
polish = replace_once(
    polish,
    """  opacity: 1;\n  image-rendering: auto;\n  transform: translateZ(0);\n  filter:\n    drop-shadow(0 2.8rem 4.6rem rgba(29, 18, 74, 0.24))""",
    """  opacity: 1;\n  image-rendering: crisp-edges;\n  image-rendering: pixelated;\n  transform: translateZ(0);\n  filter:\n    contrast(1.04)\n    saturate(1.06)\n    drop-shadow(0 2.8rem 4.6rem rgba(29, 18, 74, 0.24))""",
    "crisp shader surface",
)
polish = replace_once(
    polish,
    """.living-metabloom-canvas.is-fallback .living-metabloom-canvas__surface {\n  opacity: 0;\n}\n""",
    """.living-metabloom-canvas.is-fallback .living-metabloom-canvas__surface {\n  opacity: 0;\n}\n\n.living-metabloom-canvas__fallback::after {\n  content: \"\";\n  position: absolute;\n  inset: 2%;\n  z-index: 8;\n  pointer-events: none;\n  background-image: radial-gradient(\n    circle at 1px 1px,\n    rgba(255, 255, 255, 0.56) 0 0.7px,\n    rgba(33, 18, 72, 0.18) 0.9px,\n    transparent 1.15px\n  );\n  background-size: 4px 4px;\n  mix-blend-mode: soft-light;\n  opacity: 0.66;\n  -webkit-mask-image: radial-gradient(ellipse, #000 0 58%, transparent 78%);\n  mask-image: radial-gradient(ellipse, #000 0 58%, transparent 78%);\n}\n\n.living-metabloom-canvas__fallback-eye {\n  top: 39.5%;\n  width: 9.4%;\n  height: 11.4%;\n}\n\n.living-metabloom-canvas__fallback-eye--left {\n  left: 35.3%;\n}\n\n.living-metabloom-canvas__fallback-eye--right {\n  right: 35.3%;\n}\n\n.living-metabloom-canvas__fallback-mouth {\n  top: 58%;\n  width: 20%;\n  height: 9%;\n}\n""",
    "fallback dither and cuteness",
)
polish_path.write_text(polish)


canvas_test_path = Path("src/components/LivingMetabloomCanvas.test.js")
canvas_test = canvas_test_path.read_text()
canvas_test = canvas_test.replace(
    'expect(polish).toContain("image-rendering: auto");',
    'expect(polish).toContain("image-rendering: pixelated");',
)
canvas_test = canvas_test.replace(
    'expect(shader).toContain("-eyeSocket*.095");',
    'expect(shader).toContain("-eyeSocket*.078");\n    expect(shader).toContain("+ocularDome*.052");',
)
canvas_test = canvas_test.replace(
    'expect(shader).toContain("-mouthCavity*.105");',
    'expect(shader).toContain("-mouthCavity*.100");\n    expect(shader).toContain("+lipRidge*.022");',
)
canvas_test = replace_once(
    canvas_test,
    """    expect(shader).toContain(\"float broadHighlight\");\n    expect(shader).toContain(\"float mirror=sat(\");""",
    """    expect(shader).toContain(\"float broadHighlight\");\n    expect(shader).toContain(\"float ocularDome\");\n    expect(shader).toContain(\"float secondaryEyeSpark\");\n    expect(shader).toContain(\"float permanentBlush\");\n    expect(shader).toContain(\"float orderedDither=bayer8\");\n    expect(shader).toContain(\"float colorLevels=18.0\");\n    expect(shader).toContain(\"mix(color,ditheredColor,.90)\");\n    expect(shader).toContain(\"float mirror=sat(\");""",
    "canvas shader polish assertions",
)
canvas_test_path.write_text(canvas_test)


contract_path = Path("src/components/OrbAvatarRuntimeContract.test.js")
contract = contract_path.read_text()
contract = contract.replace(
    'expect(livingPolish).toContain("image-rendering: auto");',
    'expect(livingPolish).toContain("image-rendering: pixelated");',
)
contract = contract.replace(
    'expect(livingShader).toContain("-eyeSocket*.095");',
    'expect(livingShader).toContain("-eyeSocket*.078");\n    expect(livingShader).toContain("+ocularDome*.052");',
)
contract = contract.replace(
    'expect(livingShader).toContain("-mouthCavity*.105");',
    'expect(livingShader).toContain("-mouthCavity*.100");\n    expect(livingShader).toContain("+lipRidge*.022");',
)
contract = replace_once(
    contract,
    """    expect(livingShader).toContain(\"fragColor=vec4(color*alpha,alpha)\");\n    expect(livingShader).not.toContain(\"sampler2D\");""",
    """    expect(livingShader).toContain(\"fragColor=vec4(color*alpha,alpha)\");\n    expect(livingShader).toContain(\"float orderedDither=bayer8\");\n    expect(livingShader).toContain(\"float colorLevels=18.0\");\n    expect(livingShader).not.toContain(\"sampler2D\");""",
    "runtime dither assertions",
)
contract_path.write_text(contract)
