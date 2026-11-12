const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { classifyMetabloomVisualIntent } = require('../../src/components/metabloomVisualIntent');
const { parseMetabloomVisual, evaluateMetabloomVisualFormula, METABLOOM_VISUAL_KINDS,
  visualObject, visualKeys, visualText } = require('../../src/components/metabloomVisualProtocol');
const { generateMetabloomVisual } = require('../../server/metabloomVisualGenerator');
const { readVisualJson } = require('../../server/metabloomVisualStore');

const ROOT = path.resolve(__dirname, '../..');
const GUIDANCE_PATH = 'server/metabloomVisualGuidance.json';
const WORK_PATH = path.join(ROOT, '.metabloom-improvement');
const POLICY = Object.freeze({ minimumTrials: 3, minimumGain: 0.05, maximumTokenRatio: 1.25, maximumLatencyRatio: 1.5 });
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const HASH = /^[a-f0-9]{64}$/;
const MODES = ['requested', 'optional', 'text_only', 'unsupported', 'capabilities', 'clarification', 'visual_status'];
function requireValid(condition, message) { if (!condition) throw new Error(message); }
const canonical = value => Array.isArray(value) ? value.map(canonical) : visualObject(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function readJson(filename, maximumBytes = 32 * 1024 * 1024) {
  requireValid(fs.statSync(filename).size <= maximumBytes, 'JSON file exceeds the size limit.');
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}
function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
function guidance(value) {
  requireValid(visualKeys(value, ['version', 'instructions']) && value.version === 1
    && visualText(value.instructions, 4000, true), 'Invalid visual guidance.');
  return value;
}
const baselineGuidance = () => guidance(readJson(path.join(ROOT, GUIDANCE_PATH), 20000));
function runtimeHash() {
  // Bind experiments to the implementation, grader and workflow, including new files.
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--',
    'api', 'server', 'src', 'scripts', 'package.json', 'package-lock.json', '.github/workflows'], { cwd: ROOT })
    .toString().split('\0').filter(file => file && file !== GUIDANCE_PATH);
  return digest([...new Set(files)].sort().map(file => [file, crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, file))).digest('hex')]));
}
function validateCase(item) {
  requireValid(visualObject(item) && Object.keys(item).every(key => ['id', 'message', 'history', 'expected', 'feedback'].includes(key))
    && typeof item.id === 'string' && ID.test(item.id) && visualText(item.message, 1600), 'Invalid evaluation case.');
  const history = item.history || [];
  requireValid(Array.isArray(history) && history.length <= 12 && history.every(turn => visualKeys(turn, ['role', 'content'])
    && ['user', 'assistant'].includes(turn.role) && visualText(turn.content, 1600))
    && history.reduce((sum, turn) => sum + turn.content.length, 0) <= 16000, 'Invalid case history.');
  const expected = item.expected;
  requireValid(visualObject(expected) && MODES.includes(expected.mode), 'Invalid expected route.');
  if (expected.mode !== 'requested') {
    requireValid(visualKeys(expected, ['mode']), 'Nonvisual cases may only specify a route.');
  } else if (expected.result === 'unavailable') {
    requireValid(visualKeys(expected, ['mode', 'kind', 'result']) && METABLOOM_VISUAL_KINDS.includes(expected.kind), 'Invalid unavailable case.');
  } else {
    requireValid(visualKeys(expected, ['mode', 'kind', 'result', 'provenance', 'data']) && expected.result === 'generated'
      && METABLOOM_VISUAL_KINDS.includes(expected.kind) && ['user', 'calculated', 'illustrative', 'conceptual'].includes(expected.provenance), 'Invalid generated case.');
    const data = expected.data;
    if (expected.kind === 'calculator') {
      requireValid(visualKeys(data, ['unit', 'probes']) && visualText(data.unit, 60, true)
        && Array.isArray(data.probes) && data.probes.length >= 2 && data.probes.length <= 12
        && data.probes.every(probe => visualKeys(probe, ['inputs', 'value']) && visualObject(probe.inputs)
          && Object.keys(probe.inputs).length > 0 && Object.keys(probe.inputs).length <= 6
          && Object.entries(probe.inputs).every(([label, value]) => visualText(label, 80) && Number.isFinite(value))
          && (probe.value === null || Number.isFinite(probe.value))), 'Calculator cases need independent arithmetic probes.');
    } else if (expected.kind === 'flowchart') {
      requireValid(visualKeys(data, ['nodes', 'edges']) && Array.isArray(data.nodes) && data.nodes.length > 0 && data.nodes.length <= 16
        && data.nodes.every(label => visualText(label, 160)) && new Set(data.nodes).size === data.nodes.length
        && Array.isArray(data.edges) && data.edges.length <= 32
        && data.edges.every(edge => visualKeys(edge, ['from', 'to', 'label']) && data.nodes.includes(edge.from)
          && data.nodes.includes(edge.to) && visualText(edge.label, 100, true)), 'Invalid flowchart expectations.');
    } else {
      const sample = { version: '1', designVersion: 'aetheris-1', kind: expected.kind, title: 'Evaluation example',
        summary: 'Synthetic evaluation data.', provenance: { type: expected.provenance, label: 'Evaluation data.', sourceIds: [] }, ...data };
      requireValid(visualObject(data) && Object.keys(data).every(key => ['columns', 'rows', 'unit', 'points', 'labels', 'series'].includes(key))
        && parseMetabloomVisual(sample, { kind: expected.kind, sources: [] }), 'Invalid data expectations.');
    }
  }
  if (item.feedback !== undefined) requireValid(visualKeys(item.feedback, ['correction', 'observed'])
    && visualText(item.feedback.correction, 2000) && JSON.stringify(item.feedback.observed).length <= 12000, 'Invalid correction evidence.');
  requireValid(Buffer.byteLength(JSON.stringify(item)) <= 20000, 'Case exceeds the size limit.');
  return item;
}
function loadCases(split) {
  requireValid(['development', 'holdout'].includes(split), 'Use development or holdout.');
  const suite = readJson(path.join(ROOT, 'evals/metabloom/visuals', split + '.json'));
  requireValid(visualKeys(suite, ['version', 'cases']) && suite.version === 1 && Array.isArray(suite.cases), 'Invalid evaluation suite.');
  const cases = [...suite.cases];
  const local = path.join(WORK_PATH, 'cases');
  if (split === 'development' && fs.existsSync(local)) for (const file of fs.readdirSync(local).sort()) {
    if (file.endsWith('.json')) cases.push(readJson(path.join(local, file), 20000));
  }
  requireValid(cases.length > 0 && cases.length <= 100 && new Set(cases.map(item => item.id)).size === cases.length, 'Empty, oversized or duplicate suite.');
  return cases.map(validateCase).sort((a, b) => a.id.localeCompare(b.id));
}
function candidate(value, developmentCases = loadCases('development')) {
  requireValid(visualKeys(value, ['version', 'baseGuidanceHash', 'runtimeHash', 'developmentSuiteHash', 'holdoutSuiteHash', 'instructions', 'hypothesis', 'evidenceCaseIds'])
    && value.version === 1 && [value.baseGuidanceHash, value.runtimeHash, value.developmentSuiteHash, value.holdoutSuiteHash].every(hash => HASH.test(hash))
    && visualText(value.instructions, 4000) && visualText(value.hypothesis, 1000)
    && Array.isArray(value.evidenceCaseIds) && value.evidenceCaseIds.length > 0 && value.evidenceCaseIds.length <= 20
    && new Set(value.evidenceCaseIds).size === value.evidenceCaseIds.length
    && value.evidenceCaseIds.every(id => developmentCases.some(item => item.id === id)), 'Invalid candidate manifest.');
  requireValid(value.baseGuidanceHash === digest(baselineGuidance()) && value.runtimeHash === runtimeHash()
    && value.developmentSuiteHash === digest(developmentCases) && value.holdoutSuiteHash === digest(loadCases('holdout')),
  'Candidate is stale. Re-evaluate the current code and cases.');
  requireValid(value.instructions !== baselineGuidance().instructions, 'Candidate is identical to the baseline.');
  return value;
}
function grade(item, attempt) {
  const failed = [];
  const expect = item.expected;
  const route = classifyMetabloomVisualIntent(item.message, item.history);
  if (route.mode !== expect.mode || (expect.kind && route.preferredKinds[0] !== expect.kind)) failed.push('route');
  if (expect.mode !== 'requested') {
    if (attempt.status !== 'skipped') failed.push('unexpected_generation');
  } else if (expect.result === 'unavailable') {
    // Provider outages and parsing failures must never count as a correct refusal.
    if (attempt.status !== 'unavailable' || !visualKeys(attempt.observed, ['kind', 'reason'])
      || attempt.observed.kind !== 'unavailable' || !visualText(attempt.observed.reason, 200)) failed.push('expected_unavailable');
  } else {
    const spec = attempt.status === 'generated' && parseMetabloomVisual(attempt.spec, { kind: expect.kind, sources: [] });
    if (!spec) failed.push('valid_native_spec');
    else {
      if (spec.provenance.type !== expect.provenance) failed.push('provenance');
      if (expect.kind === 'calculator') {
        if (spec.unit !== expect.data.unit) failed.push('unit');
        for (const [index, probe] of expect.data.probes.entries()) {
          const values = {};
          let found = true;
          for (const [label, value] of Object.entries(probe.inputs)) {
            const controls = spec.controls.filter(control => control.label === label);
            if (controls.length !== 1) { found = false; break; }
            values[controls[0].id] = value;
          }
          const answer = found ? evaluateMetabloomVisualFormula(spec.formula, spec.controls, values) : undefined;
          if (probe.value === null ? answer !== null : !Number.isFinite(answer) || Math.abs(answer - probe.value) > 1e-8 * Math.max(1, Math.abs(probe.value))) failed.push('arithmetic_' + index);
        }
      } else if (expect.kind === 'flowchart') {
        const labels = Object.fromEntries(spec.nodes.map(node => [node.id, node.label]));
        const edges = spec.edges.map(edge => ({ from: labels[edge.from], to: labels[edge.to], label: edge.label }));
        if (!isDeepStrictEqual(spec.nodes.map(node => node.label).sort(), [...expect.data.nodes].sort())) failed.push('nodes');
        if (!isDeepStrictEqual(edges.map(digest).sort(), expect.data.edges.map(digest).sort())) failed.push('edges');
      } else for (const [key, value] of Object.entries(expect.data)) {
        // Series IDs are implementation details; labels, order and values are not.
        const normalize = data => key === 'series' ? data?.map(({ label, values }) => ({ label, values })) : data;
        if (!isDeepStrictEqual(normalize(spec[key]), normalize(value))) failed.push('data_' + key);
      }
    }
  }
  if (attempt.infrastructureError) failed.push('infrastructure');
  return { passed: failed.length === 0, failed };
}
async function runVisualAttempt(item, config, { signal, fetchImpl = globalThis.fetch } = {}) {
  const route = classifyMetabloomVisualIntent(item.message, item.history);
  if (route.mode !== 'requested') return { status: 'skipped', durationMs: 0, inputTokens: 0, outputTokens: 0 };
  const started = performance.now();
  let returnedUnavailable = false, observed = null, usage = null, providerCompleted = false, providerModel = null;
  const observeFetch = async (url, options) => {
    const response = await fetchImpl(url, options);
    if (response.ok) {
      const body = await readVisualJson(response.clone(), 180000, { signal });
      usage = body.usage;
      if (typeof body.model === 'string' && /^[a-zA-Z0-9._:-]{1,100}$/.test(body.model)) providerModel = body.model;
      providerCompleted = body.status === 'completed';
      const messages = body.output?.filter(value => value.type === 'message');
      const text = messages?.[0]?.content?.find(value => value.type === 'output_text')?.text;
      try {
        const parsed = JSON.parse(text);
        observed = parsed.result;
        returnedUnavailable = providerCompleted && messages.length === 1 && messages[0].role === 'assistant'
          && messages[0].status === 'completed' && messages[0].content.length === 1
          && visualKeys(parsed, ['result']) && visualKeys(observed, ['kind', 'reason'])
          && observed.kind === 'unavailable' && visualText(observed.reason, 200);
      } catch { /* Graded by the real validator. */ }
    }
    return response;
  };
  let result;
  try {
    const spec = await generateMetabloomVisual({ offer: { kind: route.preferredKinds[0] }, context: {
      message: route.resolvedMessage || item.message, answer: '', evidence: '', sources: [],
      recentConversation: item.history || [], dataHints: route.dataHints,
    } }, { guidance: config, signal, fetchImpl: observeFetch });
    result = { status: 'generated', spec };
  } catch (error) {
    result = { status: returnedUnavailable ? 'unavailable' : 'failed', code: signal?.aborted ? 'timeout' : error.code || 'provider_failure',
      infrastructureError: !providerCompleted || Boolean(signal?.aborted), ...(observed ? { observed } : {}) };
  }
  return { ...result, providerModel, durationMs: Math.round(performance.now() - started),
    inputTokens: Number.isSafeInteger(usage?.input_tokens) && usage.input_tokens >= 0 ? usage.input_tokens : null,
    outputTokens: Number.isSafeInteger(usage?.output_tokens) && usage.output_tokens >= 0 ? usage.output_tokens : null };
}
async function evaluate({ split, cases, proposal = null, trials = 3, maximumCalls = 100, timeoutMs = 75000,
  mode = 'live', attempt = runVisualAttempt, onAttempt = () => {}, signal = AbortSignal.timeout(900000) }) {
  requireValid(['development', 'holdout'].includes(split) && Number.isInteger(trials) && trials >= 1 && trials <= 10, 'Invalid trial configuration.');
  requireValid(['live', 'fixture'].includes(mode), 'Invalid evaluation mode.');
  requireValid(Number.isInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 75000, 'Invalid request timeout.');
  cases.forEach(validateCase);
  if (proposal) candidate(proposal);
  const configs = { baseline: baselineGuidance(), ...(proposal ? { candidate: guidance({ version: 1, instructions: proposal.instructions }) } : {}) };
  const plannedCalls = cases.filter(item => classifyMetabloomVisualIntent(item.message, item.history).mode === 'requested').length * trials * Object.keys(configs).length;
  requireValid(Number.isInteger(maximumCalls) && maximumCalls > 0 && maximumCalls <= 200 && plannedCalls <= maximumCalls, `Evaluation needs ${plannedCalls} model calls; budget is ${maximumCalls}.`);
  const report = { version: 1, mode, split, model: process.env.METABLOOM_VISUAL_MODEL || process.env.METABLOOM_OPENAI_MODEL || 'gpt-5-mini',
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim(), timeoutMs,
    runtimeHash: runtimeHash(), baseGuidanceHash: digest(configs.baseline), suiteHash: digest(cases),
    candidateHash: proposal ? digest(proposal) : null, proposal, trials, plannedCalls, startedAt: new Date().toISOString(), attempts: [] };
  for (let trial = 0; trial < trials; trial++) for (const item of cases) {
    if (signal.aborted) { report.incomplete = true; return report; }
    // Matched pairs run together to reduce transient provider-latency confounding.
    const names = Object.keys(configs); if (trial % 2) names.reverse();
    const rows = await Promise.all(names.map(async variant => {
      const result = await attempt(item, configs[variant], { signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) });
      return { caseId: item.id, trial, variant, ...result, ...grade(item, result) };
    }));
    for (const row of rows) { report.attempts.push(row); await onAttempt(row); }
  }
  return report;
}
function inspectReport(report, cases, proposal = null) {
  requireValid(report?.version === 1 && ['live', 'fixture'].includes(report.mode)
    && report.runtimeHash === runtimeHash() && report.baseGuidanceHash === digest(baselineGuidance())
    && report.suiteHash === digest(cases) && report.candidateHash === (proposal ? digest(proposal) : null)
    && Number.isInteger(report.trials) && report.trials >= 1 && report.trials <= 10 && !report.incomplete
    && typeof report.model === 'string' && /^[a-zA-Z0-9._:-]{1,100}$/.test(report.model), 'Report is incomplete, stale or belongs to another experiment.');
  const variants = proposal ? ['baseline', 'candidate'] : ['baseline'];
  requireValid(Array.isArray(report.attempts) && report.attempts.length === cases.length * report.trials * variants.length, 'Missing trial results.');
  const seen = new Set();
  const rows = report.attempts.map(row => {
    const item = cases.find(value => value.id === row.caseId);
    const key = `${row.caseId}/${row.trial}/${row.variant}`;
    requireValid(item && variants.includes(row.variant) && Number.isInteger(row.trial) && row.trial >= 0 && row.trial < report.trials && !seen.has(key), 'Duplicate or unexpected trial.');
    seen.add(key);
    requireValid(Number.isFinite(row.durationMs) && row.durationMs >= 0 && ['generated', 'skipped', 'unavailable', 'failed'].includes(row.status), 'Invalid trial metrics.');
    return { ...row, ...grade(item, row) };
  });
  const summary = {};
  for (const variant of variants) {
    const selected = rows.filter(row => row.variant === variant);
    const paid = selected.filter(row => cases.find(item => item.id === row.caseId).expected.mode === 'requested');
    const durations = paid.map(row => row.durationMs).sort((a, b) => a - b);
    summary[variant] = { passed: selected.filter(row => row.passed).length, total: selected.length,
      rate: selected.filter(row => row.passed).length / selected.length,
      tokens: paid.reduce((sum, row) => sum + (row.inputTokens || 0) + (row.outputTokens || 0), 0),
      p95Ms: durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] || 0 };
  }
  const missingUsage = rows.some(row => cases.find(item => item.id === row.caseId).expected.mode === 'requested'
    && (!Number.isSafeInteger(row.inputTokens) || row.inputTokens < 0 || !Number.isSafeInteger(row.outputTokens) || row.outputTokens < 0
      || row.inputTokens + row.outputTokens === 0));
  const paidRows = rows.filter(row => cases.find(item => item.id === row.caseId).expected.mode === 'requested');
  const missingModel = paidRows.some(row => typeof row.providerModel !== 'string' || !/^[a-zA-Z0-9._:-]{1,100}$/.test(row.providerModel));
  return { rows, summary, missingUsage, missingModel, providerModels: [...new Set(paidRows.map(row => row.providerModel))],
    infrastructureErrors: rows.some(row => row.infrastructureError) };
}
function assess(proposal, development, holdout, developmentCases = loadCases('development'), holdoutCases = loadCases('holdout')) {
  candidate(proposal, developmentCases);
  const dev = inspectReport(development, developmentCases, proposal), held = inspectReport(holdout, holdoutCases, proposal);
  const reasons = [];
  if (development.split !== 'development' || holdout.split !== 'holdout') reasons.push('separate_splits_required');
  if (development.mode !== 'live' || holdout.mode !== 'live') reasons.push('live_evidence_required');
  if (development.model !== holdout.model) reasons.push('model_mismatch');
  if (new Set([...dev.providerModels, ...held.providerModels]).size !== 1) reasons.push('provider_model_mismatch');
  for (const [name, report, result] of [['development', development, dev], ['holdout', holdout, held]]) {
    if (report.trials < POLICY.minimumTrials) reasons.push(name + '_insufficient_trials');
    if (result.infrastructureErrors || result.missingUsage || result.missingModel) reasons.push(name + '_inconclusive_provider_evidence');
    if (result.summary.candidate.passed !== result.summary.candidate.total) reasons.push(name + '_candidate_checks_failed');
    if (result.summary.candidate.tokens > result.summary.baseline.tokens * POLICY.maximumTokenRatio) reasons.push(name + '_token_budget');
    if (result.summary.candidate.p95Ms > result.summary.baseline.p95Ms * POLICY.maximumLatencyRatio) reasons.push(name + '_latency_budget');
  }
  if (dev.summary.candidate.rate - dev.summary.baseline.rate < POLICY.minimumGain) reasons.push('no_measured_development_gain');
  if (held.summary.candidate.rate < held.summary.baseline.rate) reasons.push('holdout_regression');
  return { eligibleForReview: reasons.length === 0, reasons, policy: POLICY, development: dev.summary, holdout: held.summary };
}
function proposalPayload(report, cases) {
  requireValid(report.split === 'development', 'Held-out evidence must never enter the proposer.');
  const checked = inspectReport(report, cases, report.proposal);
  const target = report.proposal ? 'candidate' : 'baseline';
  const failures = checked.rows.filter(row => row.variant === target && !row.passed && !row.infrastructureError);
  requireValid(failures.length > 0, 'No behavioral failures to improve.');
  // Only failure evidence from development goes to the improver. It has no tools.
  const evidence = [];
  for (const item of cases.filter(value => failures.some(row => row.caseId === value.id))) {
    const { variant, status, spec, observed, failed } = failures.find(row => row.caseId === item.id);
    const entry = { ...item, attempts: [{ variant, status, spec, observed, failed }] };
    if (evidence.length < 20 && Buffer.byteLength(JSON.stringify([...evidence, entry])) <= 100000) evidence.push(entry);
  }
  requireValid(evidence.length > 0, 'Failure evidence exceeds the proposal input budget. Curate a smaller reproduction.');
  return { baseline: baselineGuidance(), previousCandidate: report.proposal?.instructions || null, evidence };
}
function promotionPatch(proposal) {
  // Git compares normalized text even when a Windows checkout uses CRLF.
  const oldLines = fs.readFileSync(path.join(ROOT, GUIDANCE_PATH), 'utf8').replace(/\r\n/g, '\n').trimEnd().split('\n');
  const newLines = JSON.stringify({ version: 1, instructions: proposal.instructions }, null, 2).split('\n');
  return `--- a/${GUIDANCE_PATH}\n+++ b/${GUIDANCE_PATH}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n`
    + oldLines.map(line => '-' + line).join('\n') + '\n' + newLines.map(line => '+' + line).join('\n') + '\n';
}
module.exports = { ROOT, WORK_PATH, GUIDANCE_PATH, POLICY, digest, readJson, writeJson, guidance, baselineGuidance, runtimeHash,
  validateCase, loadCases, candidate, grade, runVisualAttempt, evaluate, inspectReport, assess, proposalPayload, promotionPatch, requireValid };
