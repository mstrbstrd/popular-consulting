const defineAction = ({
  id,
  label,
  intent,
  motion,
  colorway,
  colors,
  intensity,
  duration,
}) => Object.freeze({
  id,
  label,
  intent,
  motion,
  colorway,
  colors: Object.freeze(colors),
  intensity,
  duration,
});

export const METABLOOM_ACTIONS = Object.freeze([
  defineAction({
    id: "reform",
    label: "Reform",
    intent: "Return to a calm, singular presence",
    motion: "Gathers and breathes as one blob",
    colorway: "Native Metabloom",
    colors: ["#00eeff", "#ff00ff", "#9d00ff"],
    intensity: 0,
    duration: 980,
  }),
  defineAction({
    id: "agree",
    label: "Agree",
    intent: "Yes, affirmation, or recognition",
    motion: "Nods down and up twice",
    colorway: "Verdant signal",
    colors: ["#26f7a0", "#00d9ff", "#ffe96a"],
    intensity: 0.46,
    duration: 920,
  }),
  defineAction({
    id: "disagree",
    label: "Disagree",
    intent: "No, resistance, or correction",
    motion: "Shakes side to side",
    colorway: "Magenta warning",
    colors: ["#ff315f", "#ff36d1", "#7138ff"],
    intensity: 0.54,
    duration: 820,
  }),
  defineAction({
    id: "happy",
    label: "Happy",
    intent: "Warmth, approval, or welcome",
    motion: "Lifts, swells, and settles",
    colorway: "Sunlit spectrum",
    colors: ["#ffe36e", "#ff4ecb", "#25ddff"],
    intensity: 0.44,
    duration: 1050,
  }),
  defineAction({
    id: "excited",
    label: "Excited",
    intent: "High energy or celebration",
    motion: "Compresses, explodes, and reforms",
    colorway: "Electric bloom",
    colors: ["#19f5ff", "#ff2cc3", "#8e3dff"],
    intensity: 0.58,
    duration: 1320,
  }),
  defineAction({
    id: "sad",
    label: "Sad",
    intent: "Disappointment, care, or empathy",
    motion: "Droops and settles low",
    colorway: "Blue hush",
    colors: ["#2456ff", "#7a5cff", "#6edcf5"],
    intensity: 0.48,
    duration: 1180,
  }),
  defineAction({
    id: "surprised",
    label: "Surprised",
    intent: "Sudden discovery or alert",
    motion: "Snaps inward, then pops round",
    colorway: "Solar flash",
    colors: ["#fff45a", "#ff7b54", "#23cfff"],
    intensity: 0.52,
    duration: 900,
  }),
  defineAction({
    id: "thinking",
    label: "Thinking",
    intent: "Curiosity or consideration",
    motion: "Tilts and makes a slow orbit",
    colorway: "Violet inquiry",
    colors: ["#7758ff", "#13d8d1", "#c2ff68"],
    intensity: 0.46,
    duration: 1460,
  }),
  defineAction({
    id: "sleepy",
    label: "Sleepy",
    intent: "Low energy, rest, or calm",
    motion: "Exhales and slowly flattens",
    colorway: "Moonlit drift",
    colors: ["#3449a8", "#8e87db", "#bdd9ff"],
    intensity: 0.42,
    duration: 1720,
  }),
  defineAction({
    id: "angry",
    label: "Angry",
    intent: "Urgency, frustration, or pressure",
    motion: "Compresses and trembles",
    colorway: "Ember pressure",
    colors: ["#ff3b30", "#ff8a24", "#5f1d76"],
    intensity: 0.56,
    duration: 780,
  }),
]);

const ACTION_BY_ID = new Map(
  METABLOOM_ACTIONS.map((action) => [action.id, action]),
);

const ACTION_ALIASES = Object.freeze({
  bloom: "surprised",
  companion: "reform",
  curious: "thinking",
  drift: "sleepy",
  focus: "thinking",
  grumpy: "angry",
  idle: "reform",
  neutral: "reform",
});

export const METABLOOM_ACTION_IDS = Object.freeze(
  METABLOOM_ACTIONS.map(({ id }) => id),
);

export const resolveMetabloomAction = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  const actionId = ACTION_ALIASES[normalized] || normalized;
  return ACTION_BY_ID.get(actionId) || null;
};

export const getDefaultMetabloomAction = () => ACTION_BY_ID.get("reform");
