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
    """ float crownPresence=sat(companion*(.86+happy*.12+excited*.18));
 if(crownPresence>.001){
   vec2 leftC=vec2(-.158,.348+breath*.006);
   vec2 rightC=vec2(.152,.344-breath*.005);
   vec2 crownR=vec2(.252,.205)*(1.0+excited*.025);
   float leftCrown=ellipseSdf(rot(-.12)*(q-leftC),crownR);
   float rightCrown=ellipseSdf(rot(.10)*(q-rightC),crownR);
   shape=smin(shape,leftCrown,.105+.040*crownPresence);
   shape=smin(shape,rightCrown,.105+.040*crownPresence);
""",
    """ float crownPresence=sat(companion*(.86+happy*.12+excited*.18));
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
""",
    "crown geometry transition",
)
shader_path.write_text(shader)


canvas_test_path = Path("src/components/LivingMetabloomCanvas.test.js")
canvas_test = canvas_test_path.read_text()
canvas_test = replace_once(
    canvas_test,
    """    expect(shader).toContain(\"shape=smin(shape,lobe,unionK)\");
    expect(shader).toContain(\"if(shape>.14)\");""",
    """    expect(shader).toContain(\"shape=smin(shape,lobe,unionK)\");
    expect(shader).toContain(
      \"float crownGrowth=smoothstep(0.0,1.0,crownPresence)\",
    );
    expect(shader).toContain(\"crownR*=mix(.04,1.0,crownGrowth)\");
    expect(shader).toContain(
      \"(.105+.040*crownPresence)*crownGrowth\",
    );
    expect(shader).toContain(\"shape=smin(shape,leftCrown,crownUnion)\");
    expect(shader).toContain(\"if(shape>.14)\");""",
    "canvas crown transition contract",
)
canvas_test_path.write_text(canvas_test)


runtime_test_path = Path("src/components/OrbAvatarRuntimeContract.test.js")
runtime_test = runtime_test_path.read_text()
runtime_test = replace_once(
    runtime_test,
    """    expect(livingShader).toContain(\"for(int i=0;i<7;i++)\");
    expect(livingShader).toContain(\"if(shape>.14)\");""",
    """    expect(livingShader).toContain(\"for(int i=0;i<7;i++)\");
    expect(livingShader).toContain(
      \"float crownGrowth=smoothstep(0.0,1.0,crownPresence)\",
    );
    expect(livingShader).toContain(
      \"crownR*=mix(.04,1.0,crownGrowth)\",
    );
    expect(livingShader).toContain(\"shape=smin(shape,leftCrown,crownUnion)\");
    expect(livingShader).toContain(\"if(shape>.14)\");""",
    "runtime crown transition contract",
)
runtime_test_path.write_text(runtime_test)
