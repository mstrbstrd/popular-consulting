import {
  CREATOROS_FIELD_FRAGMENT_SHADER as BASE_CREATOROS_FIELD_FRAGMENT_SHADER,
  CREATOROS_FIELD_VERTEX_SHADER,
  CREATOROS_REACTION_FRAGMENT_SHADER,
} from "./CreatorOSFieldShaderBase";

const FORWARD_PASS_START = "vec4 sceneForwardPass(vec2 uv, float time) {";
const FORWARD_PASS_END = "\nvec4 sampleScene";

const forwardPassStart = BASE_CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
  FORWARD_PASS_START,
);
const forwardPassEnd = BASE_CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
  FORWARD_PASS_END,
  forwardPassStart,
);
const forwardPassCount = BASE_CREATOROS_FIELD_FRAGMENT_SHADER
  .split(FORWARD_PASS_START)
  .length - 1;

if (
  forwardPassCount !== 1
  || forwardPassStart < 0
  || forwardPassEnd <= forwardPassStart
) {
  throw new Error(
    "Forward Pass refinement no longer matches exactly one shader scene.",
  );
}

const REFINED_FORWARD_PASS = `vec4 sceneForwardPass(vec2 uv, float time) {
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 scale = aspectScale();
  vec2 responsiveUv = pointerFlow(uv, 0.038);
  vec2 warpedPosition = viscousWarp(
    centeredUv(responsiveUv),
    time,
    0.085
  );
  vec2 fieldUv = warpedPosition / scale * 0.5 + 0.5;
  float intro = smoothstep(0.0, 0.88, u_intro);
  float pulse = pulseField(uv);
  float gateBias = (u_pointer.y - 0.5) * 1.8
    + (u_pointer.x - 0.5) * 0.6;
  float passPhase = fract(time * 0.048 + u_seed * 0.19);
  float passX = mix(-0.10, 1.10, passPhase);
  float passFront = exp(
    -abs(fieldUv.x - passX) * aspect * 38.0
  );
  float passWake = smoothstep(
    passX - 0.18,
    passX - 0.035,
    fieldUv.x
  ) * (1.0 - smoothstep(
    passX + 0.015,
    passX + 0.105,
    fieldUv.x
  ));
  float field = 0.0;
  float tintWeight = 0.0;
  float activationEcho = 0.0;
  vec3 tintAccumulator = vec3(0.0);

  // Subtle rails establish four repeated transformer chambers while
  // preserving the site's fluid, non-diagrammatic material language.
  float architectureField = 0.0;
  float architectureWeight = 0.0;
  vec3 architectureTint = vec3(0.0);
  float architectureWindow = smoothstep(0.09, 0.15, fieldUv.y)
    * (1.0 - smoothstep(0.84, 0.91, fieldUv.y));
  float laneComb = pow(
    0.5 + 0.5 * cos((fieldUv.y - 0.18) / 0.16 * TAU),
    18.0
  );

  for (int layer = 0; layer < 4; layer++) {
    float layerIndex = float(layer);
    float blockStart = 0.055 + layerIndex * 0.235;
    float blockWidth = 0.205;
    float layerReveal = smoothstep(
      layerIndex * 0.16,
      layerIndex * 0.16 + 0.36,
      u_intro
    );
    float inputRail = exp(
      -abs(fieldUv.x - blockStart) * aspect * 190.0
    );
    float attentionRail = exp(
      -abs(fieldUv.x - (blockStart + blockWidth * 0.30))
        * aspect
        * 170.0
    );
    float gateRail = exp(
      -abs(fieldUv.x - (blockStart + blockWidth * 0.60))
        * aspect
        * 180.0
    );
    float mergeRail = exp(
      -abs(fieldUv.x - (blockStart + blockWidth * 0.92))
        * aspect
        * 200.0
    );
    float stageRails = (
      inputRail * 0.10
        + attentionRail * 0.16
        + gateRail * 0.20
        + mergeRail * 0.26
    ) * architectureWindow
      * (0.22 + laneComb * 0.78)
      * (0.60 + passFront * 0.72 + passWake * 0.20)
      * layerReveal;
    vec3 railTint = spectral(0.78 + layerIndex * 0.055);
    railTint = mix(
      railTint,
      spectral(0.23 + layerIndex * 0.028),
      attentionRail * 0.48
    );
    railTint = mix(
      railTint,
      spectral(0.43 + layerIndex * 0.018),
      gateRail * 0.54
    );
    railTint = mix(railTint, vec3(1.0), mergeRail * 0.24);
    architectureField += stageRails;
    architectureTint += railTint * stageRails;
    architectureWeight += stageRails;
  }

  field += architectureField;
  tintAccumulator += architectureTint;
  tintWeight += architectureWeight;

  for (int token = 0; token < 5; token++) {
    float tokenIndex = float(token);
    float laneY = 0.18 + tokenIndex * 0.16;
    laneY += sin(
      fieldUv.x * TAU * 0.72
        + time * 0.11
        + tokenIndex * 1.33
    ) * 0.006;
    float tokenHue = 0.69 + tokenIndex * 0.074 + time * 0.008;
    float carrierX = passX - tokenIndex * 0.010;
    float carrierDelta = (fieldUv.x - carrierX) * aspect;
    float tokenCarrier = exp(
      -carrierDelta * carrierDelta * 980.0
    );
    float packetTrain = pow(
      0.5 + 0.5 * cos(
        (fieldUv.x * 5.8 - time * 0.16 - tokenIndex * 0.17) * TAU
      ),
      16.0
    );
    float packet = sat(packetTrain * 0.55 + tokenCarrier * 1.35);
    float streamDistance = abs(fieldUv.y - laneY);
    float streamCore = exp(-streamDistance * 145.0);
    float streamGlow = exp(-streamDistance * 30.0) * 0.095;
    float carrierHalo = exp(-streamDistance * 44.0)
      * tokenCarrier
      * 0.30;
    float residualStream = streamCore * (0.16 + packet * 0.84)
      + streamGlow
      + carrierHalo;
    vec3 streamTint = spectral(tokenHue);
    field += residualStream;
    tintAccumulator += streamTint * residualStream;
    tintWeight += residualStream;

    for (int layer = 0; layer < 4; layer++) {
      float layerIndex = float(layer);
      float blockStart = 0.055 + layerIndex * 0.235;
      float blockWidth = 0.205;
      float local = (fieldUv.x - blockStart) / blockWidth;
      float blockMask = smoothstep(0.0, 0.045, local)
        * (1.0 - smoothstep(0.955, 1.0, local));
      float layerReveal = smoothstep(
        layerIndex * 0.16,
        layerIndex * 0.16 + 0.36,
        u_intro
      );
      float direction = mod(tokenIndex + layerIndex, 2.0) < 1.0
        ? 1.0
        : -1.0;
      float stageFront = exp(
        -abs(fieldUv.x - passX) * aspect * 22.0
      ) * blockMask;
      float stageWake = passWake * blockMask;
      float stageActivation = sat(
        stageFront * 0.92 + stageWake * 0.34
      );

      float residualCurve = laneY
        + direction
          * sin(PI * sat(local))
          * (0.030 + 0.008 * sin(time * 0.11 + tokenIndex))
        + sin(
          local * TAU * 1.35
            + time * 0.15
            + tokenIndex * 0.9
        ) * 0.004;
      float residualDistance = abs(fieldUv.y - residualCurve);
      float residualCore = exp(-residualDistance * 180.0);
      float residualGlow = exp(-residualDistance * 36.0) * 0.12;
      float residualBypass = (
        residualCore * (0.26 + packet * 0.38)
          + residualGlow
      ) * blockMask * layerReveal;
      vec3 residualTint = spectral(
        tokenHue + layerIndex * 0.045 + 0.10
      );
      field += residualBypass;
      tintAccumulator += residualTint * residualBypass;
      tintWeight += residualBypass;

      float causalLookback = 1.0 + mod(layerIndex, 2.0);
      float sourceIndex = max(tokenIndex - causalLookback, 0.0);
      float sourceY = 0.18 + sourceIndex * 0.16;
      sourceY += sin(
        fieldUv.x * TAU * 0.72
          + time * 0.11
          + sourceIndex * 1.33
      ) * 0.006;
      float attentionProgress = sat((local - 0.045) / 0.26);
      float attentionWindow = smoothstep(0.02, 0.075, local)
        * (1.0 - smoothstep(0.285, 0.34, local))
        * layerReveal;
      float attentionY = mix(sourceY, laneY, attentionProgress)
        + direction * sin(attentionProgress * PI) * 0.022;
      float contextWave = pow(
        0.5 + 0.5 * cos(
          (local * 2.4
            - time * 0.20
            - tokenIndex * 0.17
            - layerIndex * 0.09) * TAU
        ),
        10.0
      );
      float contextPulse = sat(
        contextWave * 0.56 + stageActivation * 0.92
      );
      float attentionDistance = abs(fieldUv.y - attentionY);
      float attentionCore = exp(-attentionDistance * 150.0);
      float attentionGlow = exp(-attentionDistance * 34.0) * 0.11;
      float attentionMix = (
        attentionCore * (0.12 + contextPulse * 1.02)
          + attentionGlow * (0.64 + stageActivation * 0.78)
      ) * attentionWindow;
      vec3 attentionTint = mix(
        spectral(
          tokenHue + sourceIndex * 0.035 + layerIndex * 0.03 + 0.05
        ),
        spectral(
          0.23 + layerIndex * 0.028 + sourceIndex * 0.012
        ),
        0.54
      );
      field += attentionMix;
      tintAccumulator += attentionTint * attentionMix;
      tintWeight += attentionMix;

      float ffnProgress = sat((local - 0.34) / 0.52);
      float ffnWindow = smoothstep(0.31, 0.37, local)
        * (1.0 - smoothstep(0.86, 0.92, local))
        * layerReveal;
      float hiddenExpansion = sin(ffnProgress * PI)
        * (0.070
          + 0.010 * sin(
            time * 0.13 + tokenIndex * 1.7 + layerIndex
          ));
      float projectionFunnel = smoothstep(0.62, 1.0, ffnProgress);
      float laneBias = exp(-abs(u_pointer.y - laneY) * 8.0)
        * u_energy;

      for (int hidden = 0; hidden < 4; hidden++) {
        float hiddenIndex = float(hidden);
        float hiddenOffset = (hiddenIndex - 1.5) / 1.5;
        float hiddenY = laneY + hiddenOffset * hiddenExpansion;
        hiddenY += sin(
          local * TAU
            + time * 0.17
            + hiddenIndex * 1.6
            + tokenIndex
        ) * 0.003;
        float valueProjection = 0.5 + 0.5 * sin(
          time * 0.33
            + tokenIndex * 1.31
            + layerIndex * 0.77
            + hiddenIndex * 1.91
            + local * 8.0
        );
        float gateProjection = sat(
          (0.5 + 0.5 * cos(
            time * 0.29
              - tokenIndex * 0.83
              + layerIndex * 1.17
              + hiddenIndex * 2.23
              + gateBias
          )) * 0.84
            + laneBias * 0.52
        );
        float swigluGate = gateProjection
          / (1.0 + exp(-(gateProjection * 7.0 - 3.5)));
        float gatedActivation = sat(
          valueProjection * swigluGate * 2.0
            + stageActivation * 0.18
        );
        float gateSeparation = (
          1.0 - smoothstep(0.18, 0.58, ffnProgress)
        ) * (0.0065 + abs(hiddenOffset) * 0.0020);
        float valueY = hiddenY - gateSeparation;
        float gateY = hiddenY + gateSeparation;
        float splitEnvelope = smoothstep(0.02, 0.10, ffnProgress)
          * (1.0 - smoothstep(0.48, 0.68, ffnProgress))
          * ffnWindow;
        float valueBranch = exp(
          -abs(fieldUv.y - valueY) * 205.0
        ) * splitEnvelope * (0.05 + valueProjection * 0.28);
        float gateBranch = exp(
          -abs(fieldUv.y - gateY) * 205.0
        ) * splitEnvelope * (0.05 + gateProjection * 0.34);
        float gateSplit = valueBranch + gateBranch;
        float hiddenDistance = abs(fieldUv.y - hiddenY);
        float hiddenCore = exp(-hiddenDistance * 165.0);
        float hiddenGlow = exp(-hiddenDistance * 34.0) * 0.085;
        float hiddenLine = (
          hiddenCore * (0.14 + gatedActivation * 1.10)
            + hiddenGlow
        ) * ffnWindow * (0.78 + projectionFunnel * 0.28);

        float activationX = blockStart
          + blockWidth * (0.59 + hiddenOffset * 0.012);
        vec2 activationDelta = vec2(
          (fieldUv.x - activationX) * aspect,
          fieldUv.y - hiddenY
        );
        float activationBloom = exp(
          -dot(activationDelta, activationDelta)
            * (650.0 + hiddenIndex * 72.0)
        ) * ffnWindow
          * (0.12 + gatedActivation * 1.34)
          * (0.84 + stageActivation * 0.32);
        float hiddenMaterial = hiddenLine
          + gateSplit
          + activationBloom;
        vec3 hiddenTint = spectral(
          tokenHue
            + 0.10
            + layerIndex * 0.035
            + hiddenIndex * 0.045
            + gatedActivation * 0.07
        );
        vec3 gateTint = spectral(
          0.43 + layerIndex * 0.018 + hiddenIndex * 0.010
        );
        vec3 activationTint = mix(
          gateTint,
          vec3(1.0),
          0.10 + gatedActivation * 0.18
        );
        field += hiddenMaterial;
        tintAccumulator += hiddenTint * (hiddenLine + valueBranch)
          + gateTint * gateBranch
          + activationTint * activationBloom;
        tintWeight += hiddenMaterial;
        activationEcho += activationBloom * gatedActivation
          + gateSplit * stageActivation * 0.24;
      }

      float chamberRadius = hiddenExpansion * 0.88 + 0.015;
      float chamberMembrane = exp(
        -abs(abs(fieldUv.y - laneY) - chamberRadius) * 95.0
      ) * ffnWindow * 0.10;
      vec3 chamberTint = spectral(
        tokenHue + layerIndex * 0.04 + 0.17
      );
      field += chamberMembrane;
      tintAccumulator += chamberTint * chamberMembrane;
      tintWeight += chamberMembrane;

      vec2 entryDelta = vec2(
        (fieldUv.x - blockStart) * aspect,
        fieldUv.y - laneY
      );
      vec2 ffnDelta = vec2(
        (fieldUv.x - (blockStart + blockWidth * 0.33)) * aspect,
        fieldUv.y - laneY
      );
      float mergeX = blockStart + blockWidth * 0.92;
      vec2 mergeDelta = vec2(
        (fieldUv.x - mergeX) * aspect,
        fieldUv.y - laneY
      );
      float entryNode = exp(-dot(entryDelta, entryDelta) * 1450.0)
        + exp(-dot(entryDelta, entryDelta) * 180.0) * 0.12;
      float ffnNode = exp(-dot(ffnDelta, ffnDelta) * 1550.0)
        + exp(-dot(ffnDelta, ffnDelta) * 190.0) * 0.13;
      float mergeNode = exp(-dot(mergeDelta, mergeDelta) * 1350.0)
        + exp(-dot(mergeDelta, mergeDelta) * 165.0) * 0.16;
      float mergeFlash = exp(
        -abs(passX - mergeX) * aspect * 34.0
      );
      float structure = (
        entryNode * 0.30
          + ffnNode * 0.36
          + mergeNode * (
            0.42
              + projectionFunnel * 0.38
              + mergeFlash * 0.98
          )
      ) * layerReveal;
      vec3 structureTint = spectral(
        tokenHue + layerIndex * 0.06 + 0.18
      );
      structureTint = mix(
        structureTint,
        vec3(1.0),
        sat(mergeFlash * 0.42)
      );
      field += structure;
      tintAccumulator += structureTint * structure;
      tintWeight += structure;
      activationEcho += mergeNode * mergeFlash * 0.18;
    }
  }

  float promptEnvelope = 1.0 - smoothstep(2.8, 5.6, u_pulseAge);
  float promptX = u_pulseOrigin.x + u_pulseAge * 0.13;
  float promptFront = exp(
    -abs(fieldUv.x - promptX) * aspect * 76.0
  ) * exp(
    -abs(fieldUv.y - u_pulseOrigin.y) * 9.0
  ) * promptEnvelope;
  float promptHalo = exp(
    -abs(fieldUv.x - promptX) * aspect * 22.0
  ) * exp(
    -abs(fieldUv.y - u_pulseOrigin.y) * 4.0
  ) * promptEnvelope * 0.16;
  float promptSignal = promptFront * 1.36
    + promptHalo
    + pulse * 0.28;
  vec3 promptTint = spectral(
    0.30 + u_pulseOrigin.y * 0.20 + time * 0.015
  );
  field += promptSignal;
  tintAccumulator += promptTint * promptSignal;
  tintWeight += promptSignal;

  field *= intro;
  activationEcho *= intro;
  vec3 tint = tintAccumulator / max(tintWeight, 0.0001);
  tint = mix(
    tint,
    promptTint,
    sat(promptFront * 0.72 + pulse * 0.20)
  );
  vec4 material = fluidMaterial(field, tint, 0.30, 0.24, 0.88);
  material.rgb += spectral(0.34 + time * 0.012)
    * sat(activationEcho)
    * 0.09;
  material.a = max(material.a, sat((field - 0.10) * 0.24));
  return material;
}`;

export {
  CREATOROS_FIELD_VERTEX_SHADER,
  CREATOROS_REACTION_FRAGMENT_SHADER,
};

export const CREATOROS_FIELD_FRAGMENT_SHADER =
  BASE_CREATOROS_FIELD_FRAGMENT_SHADER.slice(0, forwardPassStart)
  + REFINED_FORWARD_PASS
  + BASE_CREATOROS_FIELD_FRAGMENT_SHADER.slice(forwardPassEnd);
