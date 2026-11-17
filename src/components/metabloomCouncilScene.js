import { councilStep } from './metabloomCouncilProtocol';
import { createMetabloomMotionRuntime, dampMetabloomValue } from './metabloomMotionRuntime';
import { resolveMetabloomAction } from './metabloomActions';

// Seat order is stable across rounds and independent of the temporary chat model.
export const COUNCIL_SEATS = Object.freeze(['deepseek', 'openai', 'anthropic']);
export const METABLOOM_PROVIDER_COLORWAYS = Object.freeze({
  openai: { label: 'OpenAI jade, teal, and mint', colors: ['#16a77a', '#20c9b5', '#98efd0'] },
  deepseek: { label: 'DeepSeek cobalt, indigo, and ice blue', colors: ['#386bff', '#6654df', '#82c9ff'] },
  anthropic: { label: 'Claude burnt orange, amber, and peach', colors: ['#d96638', '#f59c46', '#ffd0a1'] },
});

// Only accepted stream events identify a speaker. Completed, cancelled and
// failed work cannot keep a member talking, and text never controls animation.
export function getCouncilScene(events, pending) {
  const start = events.find(event => event.type === 'council_start');
  const last = events.at(-1);
  if (!pending || !start || last?.type !== 'council_step'
    || !Number.isInteger(last.index) || last.index < 0 || last.index > 6
    || !['running', 'repairing'].includes(last.state)) return null;
  const step = councilStep(last.index, start.members, start.chair);
  if (!COUNCIL_SEATS.includes(step.member?.provider)) return null;
  return { provider: step.member.provider, round: step.round, state: last.state,
    key: `${last.index}:${last.state}` };
}

export function createCouncilMotion() {
  const runtimes = COUNCIL_SEATS.map(() => createMetabloomMotionRuntime());
  let layout = 0, turn = null, elapsed = 0;
  const facing = [0, 0, 0];
  const pose = new Float32Array(12), gesture = new Float32Array(12), expression = new Float32Array(12);
  return {
    sample({ enabled = false, speaker = null, emotes = true, intensity = 0.8,
      deltaSeconds = 0, timeSeconds = 0, seed = 0, staticFrame = false } = {}) {
      const delta = Math.max(0, Math.min(0.1, deltaSeconds));
      // Linear travel followed by smoothstep in GLSL completes, even at low fps.
      layout = staticFrame ? Number(enabled) : Math.max(0, Math.min(1, layout + (enabled ? 1 : -1) * delta / 1.15));
      const key = enabled && emotes ? speaker?.key : null;
      if (turn !== key) { turn = key; elapsed = 0; }
      if (!staticFrame) elapsed += delta;
      const strength = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0.8;
      const activeSeat = enabled && emotes && strength > 0 ? COUNCIL_SEATS.indexOf(speaker?.provider) : -1;
      if (!enabled && layout === 0 && !staticFrame) return { layout, pose, gesture, expression, activeSeat };
      COUNCIL_SEATS.forEach((provider, index) => {
        const speaking = index === activeSeat;
        const action = activeSeat < 0 ? 'reform' : !speaking ? 'listening'
          : speaker.state === 'repairing' || speaker.round === 'Critique' ? 'thinking'
            : speaker.round === 'Synthesis' ? 'resolute' : 'curious';
        const definition = resolveMetabloomAction(action);
        const options = { action, enabled: enabled && emotes && strength > 0, intensity: strength * (speaking ? 0.65 : 0.3),
          phase: staticFrame ? 1 : Math.min(1, elapsed / (definition.duration / 1000)),
          talking: speaking && speaker.state === 'running' && !staticFrame,
          deltaSeconds: delta, timeSeconds, seed: seed + index * 0.29 };
        const frame = staticFrame ? runtimes[index].snap({ ...options, enabled: false, talking: false }) : runtimes[index].step(options);
        const targetFacing = activeSeat < 0 || strength === 0 ? 0 : index === 1 && speaking
          ? Math.sin(elapsed * 0.8) * 0.65 : Math.sign((speaking ? 1 : activeSeat) - index);
        facing[index] = staticFrame ? 0 : dampMetabloomValue(facing[index], targetFacing, delta, 5);
        const p = frame.pose, offset = index * 4;
        pose.set([p.offsetX + facing[index] * 0.065, p.offsetY, p.scaleX, p.scaleY], offset);
        gesture.set([p.rotation + facing[index] * 0.14, p.centerScale, p.radiusScale, p.voice], offset);
        expression.set([p.burst, p.orbit, p.tremble, p.expression], offset);
      });
      return { layout, pose, gesture, expression, activeSeat };
    },
  };
}

const rgb = color => `vec3(${[1, 3, 5].map(offset => (parseInt(color.slice(offset, offset + 2), 16) / 255).toFixed(6)).join(', ')})`;
export const METABLOOM_COUNCIL_SHADER = `
uniform float u_councilLayout;
uniform vec4 u_councilPose[3];
uniform vec4 u_councilGesture[3];
uniform vec4 u_councilExpression[3];
${['A', 'B', 'C'].map((key, index) => `const vec3 councilColor${key}[3] = vec3[3](${COUNCIL_SEATS.map(provider => rgb(METABLOOM_PROVIDER_COLORWAYS[provider].colors[index])).join(', ')});`).join('\n')}
`;
