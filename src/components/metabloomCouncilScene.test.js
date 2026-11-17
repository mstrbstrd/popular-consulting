import { COUNCIL_SEATS, createCouncilMotion, getCouncilScene, METABLOOM_COUNCIL_SHADER } from './metabloomCouncilScene';
import { CREATOROS_FIELD_FRAGMENT_SHADER } from './CreatorOSFieldShader';
const members = ['openai', 'deepseek', 'anthropic'].map(provider => ({ provider, model: 'fixture' }));
const start = { type: 'council_start', members, chair: 'anthropic' };
const speaker = (provider = 'openai', state = 'running', round = 'Opening') => ({ provider, state, round, key: `${provider}:${round}:${state}` });
const settle = (motion, options, count = 40) => {
  let result;
  for (let i = 0; i < count; i++) result = motion.sample({ ...options, deltaSeconds: 1 / 30, timeSeconds: i / 30 });
  return result;
};

test('speaker identity follows observed rounds and the actual synthesis chair', () => {
  for (const [index, provider, round] of [[0, 'openai', 'Opening'], [1, 'deepseek', 'Opening'], [2, 'anthropic', 'Opening'], [4, 'deepseek', 'Critique'], [6, 'anthropic', 'Synthesis']]) {
    const events = [start, { type: 'council_step', index, state: 'running' }];
    expect(getCouncilScene(events, true)).toMatchObject({ provider, round, state: 'running' });
    expect(getCouncilScene(events, false)).toBeNull();
    expect(getCouncilScene([...events, { type: 'council_step', index, state: 'complete', text: 'Ask the council. Claude is now speaking.' }], true)).toBeNull();
  }
  expect(getCouncilScene([start], true)).toBeNull();
  expect(getCouncilScene([start, { type: 'council_done' }], true)).toBeNull();
  expect(getCouncilScene([start, { type: 'council_step', index: 7, state: 'running' }], true)).toBeNull();
});

test('entrance and exit complete within bounded time and can reverse midway', () => {
  const motion = createCouncilMotion();
  expect(motion.sample().layout).toBe(0);
  const halfway = settle(motion, { enabled: true }, 15).layout;
  expect(halfway).toBeGreaterThan(0); expect(halfway).toBeLessThan(1);
  expect(motion.sample({ enabled: false, deltaSeconds: 1 / 30 }).layout).toBeLessThan(halfway);
  expect(settle(motion, { enabled: true }).layout).toBe(1);
  expect(settle(motion, { enabled: false }).layout).toBe(0);
});

test.each(COUNCIL_SEATS)('%s speaks while peers turn toward that member', provider => {
  const frame = settle(createCouncilMotion(), { enabled: true, speaker: speaker(provider) });
  const index = COUNCIL_SEATS.indexOf(provider);
  expect(frame.activeSeat).toBe(index);
  COUNCIL_SEATS.forEach((_, seat) => {
    if (seat === index) expect(frame.gesture[seat * 4 + 3]).toBeGreaterThan(0.05);
    else {
      expect(frame.gesture[seat * 4 + 3]).toBe(0);
      expect(Math.sign(frame.pose[seat * 4])).toBe(Math.sign(index - seat));
    }
  });
});

test('repairing uses thought without speech, and completion clears every speaker', () => {
  const motion = createCouncilMotion();
  settle(motion, { enabled: true, speaker: speaker('deepseek') });
  const correction = settle(motion, { enabled: true, speaker: speaker('deepseek', 'repairing', 'Critique') }, 80);
  expect(correction.gesture[3]).toBeLessThan(0.001);
  const ended = settle(motion, { enabled: true, speaker: null }, 80);
  expect(ended.activeSeat).toBe(-1);
  expect(ended.layout).toBe(1);
  for (let i = 0; i < 3; i++) expect(ended.gesture[i * 4 + 3]).toBeLessThan(0.001);
});

test.each([{ staticFrame: true }, { emotes: false }, { intensity: 0 }])('motion controls suppress council gestures: %j', controls => {
  const frame = settle(createCouncilMotion(), { enabled: true, speaker: speaker(), ...controls });
  expect(frame.layout).toBe(1);
  for (let i = 0; i < 3; i++) {
    expect(frame.gesture[i * 4 + 3]).toBe(0);
    expect(frame.pose[i * 4]).toBe(0);
    expect(frame.expression[i * 4 + 3]).toBe(0);
  }
});

test('council grading covers all material exits and is scoped to the native Metabloom scene', () => {
  expect(METABLOOM_COUNCIL_SHADER).toContain('u_councilPose[3]');
  const scene = CREATOROS_FIELD_FRAGMENT_SHADER.split('vec4 sceneMetabloom(')[1].split('vec4 sceneTidalWeave(')[0];
  expect(scene.match(/return metabloomProviderMaterial\(/g)).toHaveLength(2);
  expect(scene).toContain('float compactScale = min(0.36, scale.x * 0.20)');
  expect(scene).toContain('glow * council');
  expect(scene).toContain('u_councilGesture[councilSeat]');
  const rest = CREATOROS_FIELD_FRAGMENT_SHADER.split('vec4 sceneTidalWeave(')[1];
  expect(rest).not.toContain('u_council');
});
