import React from 'react';
import { TextEncoder } from 'util';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import MetabloomVisuals from './MetabloomVisuals';
import { postMetabloomTool } from './metabloomToolClient';
import { requestMetabloomVisual } from './metabloomVisualApiClient';
import * as flowLayout from './metabloomFlowLayout';
import { METABLOOM_ARTIFACT_REFERENCE_EVENT, MAX_METABLOOM_ARTIFACT_REFERENCE_LABEL } from './metabloomArtifactReference';

const originalTextEncoder = global.TextEncoder;
beforeAll(() => { global.TextEncoder = TextEncoder; });
afterAll(() => { global.TextEncoder = originalTextEncoder; });

jest.mock('./metabloomVisualApiClient', () => ({
  METABLOOM_VISUAL_OFFER_EVENT: 'metabloom:visual-offer', requestMetabloomVisual: jest.fn(),
}));
jest.mock('./metabloomToolClient', () => ({ postMetabloomTool: jest.fn() }));

const id = 'a'.repeat(48), version = 'b'.repeat(32);
const base = { version: '1', designVersion: 'aetheris-1',
  provenance: { type: 'user', label: 'Supplied fixture data.', sourceIds: [] } };
const table = { ...base, kind: 'table', title: 'Project estimates', summary: 'Supplied estimates.',
  columns: ['Project', 'Hours'], rows: [['Beta', '10'], ['Alpha', '2'], ['Gamma', '100']] };
const line = { ...base, kind: 'line-chart', title: 'Business revenue', summary: 'Three observations.', unit: 'CAD',
  labels: ['M1', 'M2', 'M3'], series: [
    { id: 'a', label: 'Business A', values: [20, 24, 28] },
    { id: 'b', label: 'Business B', values: [30, 29, 33] },
  ] };
const pie = { ...base, kind: 'pie-chart', title: 'Recipe breakdown', summary: 'Supplied amounts.', unit: 'g',
  points: [{ label: 'Flour', value: 75 }, { label: 'Butter', value: 25 }, { label: 'Empty', value: 0 }] };
const flow = { ...base, kind: 'flowchart', title: 'Approval process', summary: 'A simple process.',
  nodes: [{ id: 'draft', label: 'Draft request' }, { id: 'review', label: 'Review request' }],
  edges: [{ from: 'draft', to: 'review', label: 'Submit' }] };
const calculator = { ...base, kind: 'calculator', title: 'Project price', summary: 'Hours multiplied by rate.', unit: 'CAD',
  controls: [
    { id: 'hours', label: 'Hours', unit: '', min: 1, max: 80, step: 1, initial: 10 },
    { id: 'rate', label: 'Hourly rate', unit: 'CAD', min: 10, max: 200, step: 5, initial: 65 },
  ], formula: ['hours', 'rate', 'multiply'], formulaDescription: 'Hours multiplied by hourly rate.' };

let staged, originalFetch;
const onReference = event => staged.push(event.detail);
beforeEach(() => {
  staged = [];
  originalFetch = global.fetch;
  global.fetch = jest.fn(() => Promise.reject(new Error('Selection must not fetch')));
  postMetabloomTool.mockReset();
  requestMetabloomVisual.mockReset();
  window.addEventListener(METABLOOM_ARTIFACT_REFERENCE_EVENT, onReference);
});
afterEach(() => {
  cleanup();
  window.removeEventListener(METABLOOM_ARTIFACT_REFERENCE_EVENT, onReference);
  delete window.__orbMessages;
  expect(postMetabloomTool).not.toHaveBeenCalled();
  expect(requestMetabloomVisual).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
  if (originalFetch === undefined) delete global.fetch; else global.fetch = originalFetch;
  jest.restoreAllMocks();
});

function mountArtifact(spec, overrides = {}) {
  const ref = React.createRef();
  window.__orbMessages = () => [{ id: 'assistant-2', role: 'assistant', content: 'Ready.', status: 'complete' }];
  const view = render(<div className="orb-page">
    <article data-message-id="assistant-2" data-stream-status="complete"><div className="metabloom-chat__bubble">Ready.</div></article>
    <MetabloomVisuals ref={ref} />
  </div>);
  const root = view.container.querySelector('.orb-page');
  const article = root.querySelector('article');
  const slot = document.createElement('div');
  slot.className = 'metabloom-visual-slot';
  slot.dataset.visualId = id;
  const record = { id, kind: spec.kind, spec, sources: [], artifactVersion: version, status: 'ready', mode: 'optional',
    replyId: 'assistant-2', userId: null, expiresAt: Date.now() + 600000, slot, article,
    controller: new AbortController(), ...overrides };
  act(() => {
    article.appendChild(slot);
    ref.current.records.set(id, record);
    ref.current.refresh();
  });
  return { ...view, ref, record, root, frame: screen.getByRole('region', { name: spec.title }) };
}

test('a sorted row asks about its original position, and a later sort cannot retarget the captured reference', () => {
  const { root } = mountArtifact(table);
  fireEvent.click(screen.getByRole('button', { name: /Hours/ }));
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
  expect(rows[0]).toHaveTextContent('Alpha');
  expect(staged).toHaveLength(0);
  fireEvent.click(within(rows[0]).getByRole('button', { name: 'Ask about this row 2 in Project estimates' }));
  expect(staged).toEqual([{ reference: { id, version, selector: { type: 'table-row', index: 1 } },
    label: 'Project estimates · Row 2: Alpha', summary: 'Project: Alpha · Hours: 2', root }]);
  fireEvent.click(screen.getByRole('button', { name: /Hours/ }));
  expect(within(screen.getByRole('table')).getAllByRole('row')[1]).toHaveTextContent('Gamma');
  expect(staged[0].reference.selector.index).toBe(1);
  expect(staged).toHaveLength(1);
});

test('filtering a large table retains original row identity without sending its cell values', () => {
  const rows = Array.from({ length: 10 }, (_, index) => [`Task ${index + 1}`, String(10 - index)]);
  mountArtifact({ ...table, rows });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Filter rows' }), { target: { value: 'Task 10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this row 10 in Project estimates' }));
  expect(staged[0].reference).toEqual({ id, version, selector: { type: 'table-row', index: 9 } });
  expect(staged[0].label).toBe('Project estimates · Row 10: Task 10');
});

test('the multi-series line readout chooses one observation while preserving every series label', () => {
  mountArtifact(line);
  expect(screen.getByRole('button', { name: 'Ask about this observation' })).toBeDisabled();
  const chart = screen.getByRole('group', { name: line.title });
  fireEvent.keyDown(chart, { key: 'ArrowRight' });
  fireEvent.keyDown(chart, { key: 'ArrowRight' });
  expect(screen.getByRole('status')).toHaveTextContent('M2: Business A 24, Business B 29 CAD.');
  expect(staged).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this observation: M2' }));
  expect(staged[0].reference).toEqual({ id, version, selector: { type: 'observation', index: 1 } });
  expect(staged[0].label).toBe('Business revenue · M2');
  fireEvent.keyDown(chart, { key: 'End' });
  expect(staged).toHaveLength(1);
  expect(staged[0].reference.selector.index).toBe(1);
  fireEvent.keyDown(chart, { key: 'Escape' });
  expect(screen.getByRole('button', { name: 'Ask about this observation' })).toBeDisabled();
});

test('single-series line observations use the same bounded selector', () => {
  const spec = { ...base, kind: 'line-chart', title: 'Monthly totals', summary: 'Supplied totals.', unit: 'CAD',
    points: [{ label: 'January', value: 20 }, { label: 'February', value: 24 }] };
  mountArtifact(spec);
  fireEvent.keyDown(screen.getByRole('group', { name: spec.title }), { key: 'End' });
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this observation: February' }));
  expect(staged[0].reference.selector).toEqual({ type: 'observation', index: 1 });
});

test('keyboard pie inspection stages only after Ask, including a zero-valued category', () => {
  mountArtifact(pie);
  fireEvent.keyDown(screen.getByRole('button', { name: /^Butter slice:/ }), { key: 'Enter' });
  expect(staged).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this category: Butter' }));
  expect(staged[0].reference.selector).toEqual({ type: 'pie-category', index: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Empty 0%' }));
  expect(staged).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this category: Empty' }));
  expect(staged[1].reference.selector).toEqual({ type: 'pie-category', index: 2 });
});

test('keyboard flow inspection stages the stable node ID only after Ask', () => {
  mountArtifact(flow);
  expect(screen.getByRole('button', { name: 'Ask about this step' })).toBeDisabled();
  const node = screen.getByRole('button', { name: /^Step 2: Review request/ });
  fireEvent.keyDown(node, { key: ' ' });
  expect(staged).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this step: Review request' }));
  expect(staged[0].reference.selector).toEqual({ type: 'flow-node', id: 'review' });
  expect(staged[0].label).toBe('Approval process · Review request');
  fireEvent.keyDown(node, { key: 'Escape' });
  expect(screen.getByRole('button', { name: 'Ask about this step' })).toBeDisabled();
});

test('flowchart layout failure keeps per-step Ask controls in the plain list', () => {
  jest.spyOn(flowLayout, 'layoutFlowchart').mockImplementation(() => { throw new Error('Fixture layout failure'); });
  mountArtifact(flow);
  expect(screen.queryByRole('group', { name: flow.title })).not.toBeInTheDocument();
  expect(screen.getAllByText('Draft request').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this step: Review request' }));
  expect(staged[0].reference.selector).toEqual({ type: 'flow-node', id: 'review' });
});

test('calculator Ask captures numeric input values once and later edits do not change the attachment', () => {
  mountArtifact(calculator);
  expect(staged).toHaveLength(0);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Hours' }), { target: { value: '17' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Hourly rate (CAD)' }), { target: { value: '85' } });
  expect(screen.getByText('1,445 CAD')).toBeInTheDocument();
  expect(staged).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this scenario' }));
  expect(staged[0].reference).toEqual({ id, version, selector: { type: 'calculator' }, inputs: { hours: 17, rate: 85 } });
  expect(staged[0].summary).toBe('Hours: 17 · Hourly rate: 85 CAD · Result: 1,445 CAD');
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Hours' }), { target: { value: '20' } });
  expect(staged).toHaveLength(1);
  expect(staged[0].reference.inputs).toEqual({ hours: 17, rate: 85 });
  expect(staged[0].summary).toBe('Hours: 17 · Hourly rate: 85 CAD · Result: 1,445 CAD');
});

test.each(['', '1000'])('invalid calculator input %j disables Ask without creating a reference', value => {
  mountArtifact(calculator);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Hours' }), { target: { value } });
  const button = screen.getByRole('button', { name: 'Ask about this scenario' });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(staged).toHaveLength(0);
});

test('Ask validates every calculator control even when the formula does not use it', () => {
  const { ref, record } = mountArtifact({ ...calculator, formula: ['hours'], formulaDescription: 'Use the supplied hours.' });
  const rate = screen.getByRole('spinbutton', { name: 'Hourly rate (CAD)' });
  for (const value of ['', '1000']) {
    fireEvent.change(rate, { target: { value } });
    expect(rate).toHaveAttribute('aria-invalid', 'true');
    const button = screen.getByRole('button', { name: 'Ask about this scenario' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(ref.current.askAbout(record, { selector: { type: 'calculator' },
      inputs: { hours: 10, rate: value ? Number(value) : NaN } })).toBe(false);
  }
  expect(staged).toHaveLength(0);
  fireEvent.change(rate, { target: { value: '65' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this scenario' }));
  expect(staged[0].reference.inputs).toEqual({ hours: 10, rate: 65 });
  expect(staged[0].label).toBe('Project price · Scenario');
});

test.each([table, line, pie, flow, calculator])('legacy $kind visuals remain readable without Ask controls', spec => {
  mountArtifact(spec, { artifactVersion: undefined });
  expect(screen.getByRole('heading', { name: spec.title })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Ask about this/ })).not.toBeInTheDocument();
});

test('a restored versioned artifact can stage a reference without generation or continuation', () => {
  mountArtifact(calculator, { restored: true, viewState: { inputs: { hours: '12', rate: '90' } } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this scenario' }));
  expect(staged[0].reference.inputs).toEqual({ hours: 12, rate: 90 });
});

test('composer labels are bounded and do not truncate a surrogate pair', () => {
  mountArtifact({ ...table, title: 'T'.repeat(100), rows: [['😀'.repeat(100), '10']] });
  fireEvent.click(screen.getByRole('button', { name: /^Ask about this row 1/ }));
  expect(staged[0].label.length).toBeLessThanOrEqual(MAX_METABLOOM_ARTIFACT_REFERENCE_LABEL);
  expect(staged[0].label).toMatch(/…$/);
  expect(staged[0].label).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
});

test.each([
  ['failed record', record => { record.status = 'failed'; }],
  ['missing version', record => { delete record.artifactVersion; }],
  ['malformed version', record => { record.artifactVersion = 'untrusted'; }],
  ['detached slot', record => record.slot.remove()],
  ['removed record', (record, owner) => owner.records.delete(record.id)],
  ['replaced record', (record, owner) => owner.records.set(record.id, { ...record })],
])('%s cannot stage through a stale callback', async (_name, invalidate) => {
  const { record, ref } = mountArtifact(table);
  await act(async () => { invalidate(record, ref.current); });
  expect(ref.current.askAbout(record, { selector: { type: 'table-row', index: 0 } })).toBe(false);
  expect(staged).toHaveLength(0);
});

test('an unmounted owner cannot stage through a retained callback', () => {
  const { record, ref, unmount } = mountArtifact(table);
  const owner = ref.current;
  unmount();
  expect(owner.askAbout(record, { selector: { type: 'table-row', index: 0 } })).toBe(false);
  expect(staged).toHaveLength(0);
});

test('ambiguous Orb ownership cannot stage a reference', () => {
  const { record, ref } = mountArtifact(table);
  const secondRoot = document.createElement('div');
  secondRoot.className = 'orb-page'; document.body.appendChild(secondRoot);
  try {
    expect(ref.current.askAbout(record, { selector: { type: 'table-row', index: 0 } })).toBe(false);
    expect(staged).toHaveLength(0);
  } finally { secondRoot.remove(); }
});

test('wrong-kind, out-of-range and poisoned selectors are rejected before staging', () => {
  const { record, ref } = mountArtifact(table);
  for (const selector of [{ type: 'observation', index: 0 }, { type: 'table-row', index: 3 },
    { type: 'table-row', index: -1 }, { type: 'table-row', index: 0, cell: 'untrusted' }, { type: 'flow-node', id: 'review' }]) {
    expect(ref.current.askAbout(record, { selector })).toBe(false);
  }
  expect(staged).toHaveLength(0);
});

test('calculator callbacks validate the exact input set and formula bounds before staging', () => {
  const { record, ref } = mountArtifact(calculator);
  for (const inputs of [{ hours: 10 }, { hours: 1000, rate: 65 }, { hours: 10, rate: 65, total: 650 },
    { hours: '10', rate: 65 }, { hours: 10, rate: Infinity }]) {
    expect(ref.current.askAbout(record, { selector: { type: 'calculator' }, inputs })).toBe(false);
  }
  expect(staged).toHaveLength(0);
});
