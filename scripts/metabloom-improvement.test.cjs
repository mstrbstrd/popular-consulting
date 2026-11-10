const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const improvement = require('./lib/metabloomImprovement.cjs');
const { ROOT, WORK_PATH, GUIDANCE_PATH, digest, baselineGuidance, runtimeHash, loadCases,
  validateCase, candidate, grade, runVisualAttempt, evaluate, inspectReport, assess, proposalPayload, promotionPatch } = improvement;
const { propose, main } = require('./metabloom-improvement.cjs');
const { generateMetabloomVisual } = require('../server/metabloomVisualGenerator');
const { parseMetabloomVisual } = require('../src/components/metabloomVisualProtocol');
const { classifyMetabloomVisualIntent } = require('../src/components/metabloomVisualIntent');
const clone = value => JSON.parse(JSON.stringify(value));
const dev = loadCases('development'), held = loadCases('holdout');
const originalKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = 'fixture-only-never-a-real-credential';
test.after(() => { if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey; });
function proposal() {
  return { version: 1, baseGuidanceHash: digest(baselineGuidance()), runtimeHash: runtimeHash(),
    developmentSuiteHash: digest(dev), holdoutSuiteHash: digest(held),
    instructions: baselineGuidance().instructions + '\nCheck that each supplied table cell is preserved before returning the result.',
    hypothesis: 'A final comparison with supplied cells prevents accidental changes to quantities.', evidenceCaseIds: ['table-exact-values'] };
}
// Synthetic provider outputs exercise plumbing only, never evidence of model quality.
function fixtureSpec(item) {
  const expected = item.expected;
  if (expected.result === 'unavailable') return { kind: 'unavailable', reason: 'The units cannot be combined without unsupported assumptions.' };
  const common = { version: '1', designVersion: 'aetheris-1', kind: expected.kind, title: 'Synthetic fixture',
    summary: 'Synthetic data for a plumbing test.', provenance: { type: expected.provenance, label: 'Synthetic evaluation fixture.', sourceIds: [] } };
  if (expected.kind === 'flowchart') {
    const ids = Object.fromEntries(expected.data.nodes.map((label, index) => [label, 'n' + index]));
    return { ...common, nodes: expected.data.nodes.map(label => ({ id: ids[label], label })),
      edges: expected.data.edges.map(edge => ({ from: ids[edge.from], to: ids[edge.to], label: edge.label })) };
  }
  if (expected.kind === 'calculator') {
    const inputs = Object.entries(expected.data.probes[0].inputs);
    const controls = inputs.map(([label, initial], index) => ({ id: 'control_' + index, label, initial, min: 0, max: 1000, step: 0.5, unit: '' }));
    return { ...common, unit: expected.data.unit, controls,
      formula: [controls[0].id, controls[1].id, item.id.includes('division') ? 'divide' : 'multiply'],
      formulaDescription: 'Calculate using the requested inputs.' };
  }
  return { ...common, ...clone(expected.data) };
}
function fixtureAttempt(item) {
  if (item.expected.mode !== 'requested') return { status: 'skipped', durationMs: 0, inputTokens: 0, outputTokens: 0 };
  return { status: item.expected.result === 'unavailable' ? 'unavailable' : 'generated',
    ...(item.expected.result === 'generated' ? { spec: fixtureSpec(item) } : { observed: fixtureSpec(item) }),
    providerModel: 'fixture-snapshot', durationMs: 100, inputTokens: 100, outputTokens: 100 };
}
function envelope(result) {
  return { status: 'completed', model: 'fixture-snapshot', output: [{ type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }], usage: { input_tokens: 100, output_tokens: 200 } };
}
async function reports(mode = 'live') {
  const value = proposal();
  const attempt = async (item, config) => {
    const row = fixtureAttempt(item);
    if (item.id === 'table-exact-values' && config.instructions === baselineGuidance().instructions) row.spec.rows[1][1] = '11';
    return row;
  };
  const development = await evaluate({ split: 'development', cases: dev, proposal: value, mode, attempt });
  const holdout = await evaluate({ split: 'holdout', cases: held, proposal: value, mode, attempt });
  return { value, development, holdout };
}

test('curated cases cover all visual types and fixed negative routing without split overlap', () => {
  assert.equal(dev.length, 12); assert.equal(held.length, 10);
  assert.equal(new Set(dev.filter(item => item.expected.kind).map(item => item.expected.kind)).size, 6);
  for (const item of [...dev, ...held]) {
    validateCase(item);
    const route = classifyMetabloomVisualIntent(item.message, item.history);
    assert.equal(route.mode, item.expected.mode, item.id);
    if (item.expected.kind) assert.equal(route.preferredKinds[0], item.expected.kind, item.id);
    assert.equal(grade(item, fixtureAttempt(item)).passed, true, item.id);
  }
  assert.ok(dev.every(item => held.every(other => other.id !== item.id && other.message !== item.message)));
});
test('cases reject missing IDs, empty quality criteria and unbounded feedback', () => {
  const missingId = clone(dev[0]); delete missingId.id;
  assert.throws(() => validateCase(missingId));
  const table = clone(dev.find(item => item.expected.kind === 'table')); table.expected.data = {};
  assert.throws(() => validateCase(table));
  const calc = clone(dev.find(item => item.expected.kind === 'calculator')); calc.expected.data.probes = [];
  assert.throws(() => validateCase(calc));
  const feedback = { ...dev[0], feedback: { correction: 'x'.repeat(2001), observed: null } };
  assert.throws(() => validateCase(feedback));
});
test('a schema-valid table with wrong quantities fails task quality', () => {
  const item = dev.find(item => item.id === 'table-exact-values'), row = fixtureAttempt(item);
  row.spec.rows[1][1] = '13';
  assert.ok(parseMetabloomVisual(row.spec));
  assert.deepEqual(grade(item, row).failed, ['data_rows']);
});
test('series IDs may vary while supplied values and labels remain exact', () => {
  const item = dev.find(item => item.id === 'line-multiple-series'), row = fixtureAttempt(item);
  row.spec.series[0].id = 'different_id';
  assert.equal(grade(item, row).passed, true);
  row.spec.series[0].values[1]++;
  assert.ok(parseMetabloomVisual(row.spec));
  assert.deepEqual(grade(item, row).failed, ['data_series']);
});
test('independent arithmetic probes catch a valid but incorrect calculator', () => {
  const item = dev.find(item => item.id === 'calculator-division'), row = fixtureAttempt(item);
  row.spec.formula[2] = 'multiply';
  assert.ok(parseMetabloomVisual(row.spec));
  assert.deepEqual(grade(item, row).failed, ['arithmetic_0', 'arithmetic_1', 'arithmetic_2']);
});
test('graph relationships and provenance are checked beyond schema validity', () => {
  const item = dev.find(item => item.id === 'flowchart-retry'), row = fixtureAttempt(item);
  row.spec.edges[2].to = row.spec.edges[2].from;
  row.spec.provenance.type = 'illustrative';
  assert.ok(parseMetabloomVisual(row.spec));
  assert.deepEqual(grade(item, row).failed, ['provenance', 'edges']);
});
test('guidance is bounded server-owned data and explicit empty guidance adds no instructions', async () => {
  assert.ok(improvement.guidance(baselineGuidance()));
  const item = dev.find(item => item.id === 'table-exact-values');
  const record = { offer: { kind: 'table' }, context: { message: item.message, sources: [], guidance: 'UNTRUSTED_OVERRIDE' } };
  const calls = [];
  const fetchImpl = async (_url, options) => { calls.push(JSON.parse(options.body)); return Response.json(envelope(fixtureSpec(item))); };
  await generateMetabloomVisual(record, { fetchImpl });
  assert.ok(!calls[0].instructions.includes('UNTRUSTED_OVERRIDE'));
  assert.equal(calls[0].instructions.includes('Reviewed visual guidance:'), Boolean(baselineGuidance().instructions));
  await generateMetabloomVisual(record, { fetchImpl, guidance: { version: 1, instructions: 'REVIEWED_CANDIDATE' } });
  assert.ok(calls[1].instructions.indexOf('REVIEWED_CANDIDATE') < calls[1].instructions.indexOf('Build exactly the approved'));
  assert.equal(calls[1].tools, undefined);
  assert.equal(calls[1].max_output_tokens, calls[0].max_output_tokens);
  assert.deepEqual(calls[1].text, calls[0].text);
  await generateMetabloomVisual(record, { fetchImpl, guidance: { version: 1, instructions: '' } });
  assert.ok(!calls[2].instructions.includes('Reviewed visual guidance:'));
  for (const value of [{ version: 2, instructions: 'x' }, { version: 1, instructions: 'x'.repeat(4001) }, { version: 1, instructions: 'x', tools: [] }]) {
    await assert.rejects(generateMetabloomVisual(record, { fetchImpl, guidance: value }), { code: 'visual_invalid' });
  }
  assert.equal(calls.length, 3);
});
test('live adapter uses the real generator, captures usage and keeps secrets out of evidence', async () => {
  const item = dev.find(item => item.id === 'table-exact-values');
  const result = await runVisualAttempt(item, baselineGuidance(), { signal: AbortSignal.timeout(1000),
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(options.redirect, 'error');
      return Response.json(envelope(fixtureSpec(item)));
    } });
  assert.equal(grade(item, result).passed, true);
  assert.equal(result.inputTokens, 100); assert.equal(result.outputTokens, 200);
  assert.ok(!JSON.stringify(result).includes(process.env.OPENAI_API_KEY));
  const wrong = fixtureSpec(item); wrong.rows[0][1] = '88';
  const incorrect = await runVisualAttempt(item, baselineGuidance(), { fetchImpl: async () => Response.json(envelope(wrong)) });
  assert.equal(incorrect.status, 'generated');
  assert.equal(grade(item, incorrect).passed, false);
});
test('provider failure and malformed unavailable responses cannot score as correct refusal', async () => {
  const item = dev.find(item => item.id === 'pie-mixed-units');
  const outage = await runVisualAttempt(item, baselineGuidance(), { fetchImpl: async () => { throw new Error('PRIVATE_PROVIDER_BODY'); } });
  assert.equal(outage.infrastructureError, true);
  assert.equal(grade(item, outage).passed, false);
  assert.ok(!JSON.stringify(outage).includes('PRIVATE_PROVIDER_BODY'));
  const good = await runVisualAttempt(item, baselineGuidance(), { fetchImpl: async () => Response.json(envelope(fixtureSpec(item))) });
  assert.equal(grade(item, good).passed, true);
  const malformed = envelope(fixtureSpec(item)); malformed.output.push(clone(malformed.output[0]));
  const bad = await runVisualAttempt(item, baselineGuidance(), { fetchImpl: async () => Response.json(malformed) });
  assert.equal(grade(item, bad).passed, false);
});
test('model-call budget is checked before any paid attempt', async () => {
  let calls = 0;
  await assert.rejects(evaluate({ split: 'development', cases: dev, proposal: proposal(), maximumCalls: 1,
    attempt: async () => { calls++; return {}; } }), /budget/);
  assert.equal(calls, 0);
});
test('candidate manifests cannot change code, graders, budgets or evidence identity', () => {
  const valid = proposal(); assert.equal(candidate(valid), valid);
  for (const update of [{ script: 'run-me' }, { instructions: '' }, { runtimeHash: '0'.repeat(64) },
    { baseGuidanceHash: '0'.repeat(64) }, { holdoutSuiteHash: '0'.repeat(64) }, { evidenceCaseIds: [held[0].id] }]) {
    assert.throws(() => candidate({ ...valid, ...update }));
  }
});
test('matched repeated trials qualify only with complete quality and cost evidence', async () => {
  const { value, development, holdout } = await reports();
  assert.equal(development.attempts.length, dev.length * 3 * 2);
  const result = assess(value, development, holdout);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.eligibleForReview, true);
  const first = development.attempts.slice(0, 2).map(row => row.variant).sort();
  assert.deepEqual(first, ['baseline', 'candidate']);
});
test('fixture trials can never authorize a promotion patch', async () => {
  const { value, development, holdout } = await reports('fixture');
  assert.ok(assess(value, development, holdout).reasons.includes('live_evidence_required'));
});
test('gate recomputes grades and rejects hidden regressions despite forged pass flags', async () => {
  const { value, development, holdout } = await reports();
  const row = holdout.attempts.find(entry => entry.variant === 'candidate' && entry.caseId === 'table-decimals');
  row.spec.rows[0][1] = '999'; row.passed = true; row.failed = [];
  const result = assess(value, development, holdout);
  assert.ok(result.reasons.includes('holdout_candidate_checks_failed'));
  assert.ok(result.reasons.includes('holdout_regression'));
});
test('gate rejects missing trials, duplicates, stale code and changed model', async () => {
  const { value, development, holdout } = await reports();
  const missing = clone(development); missing.attempts.pop();
  assert.throws(() => assess(value, missing, holdout), /Missing/);
  const duplicate = clone(development); duplicate.attempts[1] = duplicate.attempts[0];
  assert.throws(() => assess(value, duplicate, holdout), /Duplicate/);
  assert.throws(() => assess(value, { ...development, runtimeHash: '0'.repeat(64) }, holdout), /stale/);
  assert.ok(assess(value, development, { ...holdout, model: 'different-model' }).reasons.includes('model_mismatch'));
  const changed = clone(holdout); changed.attempts.find(row => row.status === 'generated').providerModel = 'changed-snapshot';
  assert.ok(assess(value, development, changed).reasons.includes('provider_model_mismatch'));
});
test('gate rejects provider outages, missing token usage and excess token/latency cost', async () => {
  for (const [change, reason] of [
    [row => { row.infrastructureError = true; }, 'development_inconclusive_provider_evidence'],
    [row => { row.inputTokens = null; }, 'development_inconclusive_provider_evidence'],
    [row => { row.providerModel = null; }, 'development_inconclusive_provider_evidence'],
    [row => { row.inputTokens = 1000000; }, 'development_token_budget'],
    [row => { row.durationMs = 1000000; }, 'development_latency_budget'],
  ]) {
    const { value, development, holdout } = await reports();
    development.attempts.filter(row => row.variant === 'candidate' && row.status === 'generated').forEach(change);
    assert.ok(assess(value, development, holdout).reasons.includes(reason), reason);
  }
});
test('equal performance and one lucky trial are insufficient for promotion', async () => {
  const value = proposal();
  const development = await evaluate({ split: 'development', cases: dev, proposal: value, trials: 1, attempt: async item => fixtureAttempt(item) });
  const holdout = await evaluate({ split: 'holdout', cases: held, proposal: value, trials: 1, attempt: async item => fixtureAttempt(item) });
  const result = assess(value, development, holdout);
  assert.ok(result.reasons.includes('no_measured_development_gain'));
  assert.ok(result.reasons.includes('development_insufficient_trials'));
});
test('proposer sees development failures only and returns data, not executable edits', async () => {
  const { holdout } = await reports();
  const development = await evaluate({ split: 'development', cases: dev, attempt: async item => {
    const row = fixtureAttempt(item);
    if (item.id === 'table-exact-values') row.spec.rows[1][1] = '11';
    return row;
  } });
  assert.throws(() => proposalPayload(holdout, held), /Held-out/);
  let calls = 0;
  const result = await propose(development, dev, 'gpt-5-mini', async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.tools, undefined);
    const input = JSON.parse(body.input[0].content);
    assert.deepEqual(input.evidence.map(item => item.id), ['table-exact-values']);
    for (const item of held) assert.ok(!body.input[0].content.includes(item.message));
    const value = proposal();
    return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text',
      text: JSON.stringify({ instructions: value.instructions, hypothesis: value.hypothesis, evidenceCaseIds: value.evidenceCaseIds }) }] }] });
  });
  assert.equal(calls, 1); assert.deepEqual(result.evidenceCaseIds, ['table-exact-values']);
  assert.ok(candidate(result));
});
test('review patch only changes the fixed guidance file and applies cleanly', () => {
  const original = clone(baselineGuidance());
  const patch = promotionPatch(proposal());
  assert.equal((patch.match(/^\+\+\+ /gm) || []).length, 1);
  assert.ok(patch.includes('+++ b/' + GUIDANCE_PATH));
  execFileSync('git', ['apply', '--check', '-'], { cwd: ROOT, input: patch });
  assert.deepEqual(baselineGuidance(), original);
});
test('a reviewed correction becomes a development case without touching held-out data', async () => {
  const id = 'test-correction-' + crypto.randomBytes(6).toString('hex');
  const item = { ...clone(dev.find(value => value.id === 'table-exact-values')), id,
    message: 'Create a table with columns Item and Quantity: Pens 7, Pads 12. Keep this order.',
    feedback: { correction: 'Preserve the supplied quantities.', observed: { rows: [['Pens', '9']] } } };
  fs.mkdirSync(WORK_PATH, { recursive: true });
  const input = path.join(WORK_PATH, id + '.json'), saved = path.join(WORK_PATH, 'cases', id + '.json');
  improvement.writeJson(input, item);
  try {
    await assert.rejects(main(['record', '--input', input]), /reviewed/);
    await main(['record', '--input', input, '--reviewed']);
    assert.ok(loadCases('development').some(value => value.id === id));
    assert.equal(digest(loadCases('holdout')), digest(held));
    await assert.rejects(main(['record', '--input', input, '--reviewed']), /duplicates/);
  } finally { fs.rmSync(input, { force: true }); fs.rmSync(saved, { force: true }); }
});
test('prepare CLI retains rejected evidence and emits only an eligible review patch', async () => {
  const directory = path.join(WORK_PATH, 'test-review-' + crypto.randomBytes(6).toString('hex'));
  const original = clone(baselineGuidance()), exitCode = process.exitCode;
  try {
    for (const mode of ['fixture', 'live']) {
      const { value, development, holdout } = await reports(mode);
      const files = Object.fromEntries(['candidate', 'development', 'holdout', 'review'].map(name => [name, path.join(directory, mode + '-' + name + '.json')]));
      improvement.writeJson(files.candidate, value);
      improvement.writeJson(files.development, development);
      improvement.writeJson(files.holdout, holdout);
      await main(['prepare', '--candidate', files.candidate, '--development', files.development, '--holdout', files.holdout, '--out', files.review]);
      const review = improvement.readJson(files.review);
      assert.equal(review.eligibleForReview, mode === 'live');
      assert.equal(fs.existsSync(files.review + '.patch'), mode === 'live');
      if (mode === 'fixture') assert.equal(process.exitCode, 2);
    }
    assert.deepEqual(baselineGuidance(), original);
  } finally { process.exitCode = exitCode; fs.rmSync(directory, { recursive: true, force: true }); }
});
test('live CLI refuses to run without a configured evaluation credential', () => {
  const env = { ...process.env }; delete env.OPENAI_API_KEY;
  assert.throws(() => execFileSync(process.execPath, ['scripts/metabloom-improvement.cjs', 'evaluate', '--split', 'development', '--live'],
    { cwd: ROOT, env, stdio: 'pipe' }), error => error.status === 1 && error.stderr.toString().includes('OPENAI_API_KEY'));
});
