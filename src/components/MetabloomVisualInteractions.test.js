import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import MetabloomVisualFrame from './MetabloomVisualFrame';

const base = { version: '1', designVersion: 'aetheris-1', provenance: { type: 'conceptual', label: 'Illustrative process.', sourceIds: [] } };
const show = (spec, id = 'visual') => render(<div className="orb-page"><MetabloomVisualFrame artifact={{ id, status: 'ready', spec }} /></div>);
afterEach(cleanup);

const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell').map(cell => cell.textContent));

describe('sortable and filterable table', () => {
  const table = { ...base, kind: 'table', title: 'Project estimates', summary: 'Your supplied estimates.',
    columns: ['Project', 'Hours'], rows: [['Beta', '10'], ['Alpha', '2'], ['Gamma', '1,000'], ['Delta', '']] };

  test('sorts numerically, then descending, then restores the original order', () => {
    show(table);
    const hours = screen.getByRole('button', { name: /Hours/ });
    expect(screen.getByRole('columnheader', { name: /Hours/ })).toHaveAttribute('aria-sort', 'none');
    expect(bodyRows().map(row => row[0])).toEqual(['Beta', 'Alpha', 'Gamma', 'Delta']);
    fireEvent.click(hours);
    expect(bodyRows().map(row => row[0])).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
    expect(screen.getByRole('columnheader', { name: /Hours/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('status')).toHaveTextContent('Showing 4 of 4 rows, sorted by Hours (ascending).');
    fireEvent.click(hours);
    expect(bodyRows().map(row => row[0])).toEqual(['Gamma', 'Beta', 'Alpha', 'Delta']);
    expect(screen.getByRole('columnheader', { name: /Hours/ })).toHaveAttribute('aria-sort', 'descending');
    fireEvent.click(hours);
    expect(bodyRows().map(row => row[0])).toEqual(['Beta', 'Alpha', 'Gamma', 'Delta']);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('sorts text columns naturally and moves to a different column cleanly', () => {
    show({ ...table, rows: [['Item 10', '1'], ['Item 2', '3'], ['item 1', '2']] });
    fireEvent.click(screen.getByRole('button', { name: /Project/ }));
    expect(bodyRows().map(row => row[0])).toEqual(['item 1', 'Item 2', 'Item 10']);
    fireEvent.click(screen.getByRole('button', { name: /Hours/ }));
    expect(screen.getByRole('columnheader', { name: /Project/ })).toHaveAttribute('aria-sort', 'none');
    expect(bodyRows().map(row => row[1])).toEqual(['1', '2', '3']);
  });

  test('does not offer sorting for a single row or a filter for a small table', () => {
    show({ ...table, rows: [['Only', '1']] });
    expect(screen.queryByRole('button', { name: /Project/ })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Project' })).not.toHaveAttribute('aria-sort');
    cleanup();
    show(table);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  test('filters large tables across every column and reports an empty result', () => {
    const rows = Array.from({ length: 10 }, (_, i) => [`Task ${i + 1}`, i % 2 ? 'Done' : 'Open']);
    show({ ...table, rows });
    const filter = screen.getByRole('searchbox', { name: 'Filter rows' });
    fireEvent.change(filter, { target: { value: 'done' } });
    expect(bodyRows()).toHaveLength(5);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 5 of 10 rows.');
    fireEvent.change(filter, { target: { value: 'task 10' } });
    expect(bodyRows()).toEqual([['Task 10', 'Done']]);
    fireEvent.change(filter, { target: { value: 'nothing matches' } });
    expect(screen.getByRole('table')).toHaveTextContent('No rows match this filter.');
    fireEvent.change(filter, { target: { value: '' } });
    expect(bodyRows()).toHaveLength(10);
  });
});

describe('flowchart diagram', () => {
  const flow = { ...base, kind: 'flowchart', title: 'Approval process', summary: 'How a request is approved.',
    nodes: [{ id: 'draft', label: 'Draft request' }, { id: 'review', label: 'Review request' },
      { id: 'approve', label: 'Approve' }, { id: 'revise', label: 'Revise' }],
    edges: [{ from: 'draft', to: 'review', label: '' }, { from: 'review', to: 'approve', label: 'Yes' },
      { from: 'review', to: 'revise', label: 'No' }, { from: 'revise', to: 'review', label: 'Resubmit' }] };

  test('renders a diagram with one focusable control per step and keeps the plain list available', () => {
    const { container } = show(flow);
    expect(screen.getByRole('group', { name: 'Approval process' })).toBeInTheDocument();
    expect(container.querySelectorAll('.metabloom-visual__flow-node')).toHaveLength(4);
    expect(container.querySelectorAll('.metabloom-visual__flow-edge')).toHaveLength(4);
    expect(container.querySelectorAll('.metabloom-visual__flow-edge[data-back="true"]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Step 1: Draft request. This is an entry point. Leads to Review request.' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('View steps and connections'));
    expect(screen.getByRole('heading', { name: 'Connections' })).toBeInTheDocument();
    expect(container.querySelectorAll('.metabloom-visual__nodes li')).toHaveLength(4);
  });

  test('selecting a step traces its connections and dims the rest; Escape clears it', () => {
    const { container } = show(flow);
    const review = screen.getByRole('button', { name: /^Step 2: Review request/ });
    fireEvent.click(review);
    expect(review).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Step 2: Review request. Comes from Draft request; Revise (Resubmit). Leads to Approve (Yes); Revise (No).');
    expect(container.querySelectorAll('.metabloom-visual__flow-edge[data-active="true"]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-dim="true"]')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /^Step 1: Draft request/ }));
    expect(container.querySelectorAll('.metabloom-visual__flow-edge[data-active="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('.metabloom-visual__flow-node[data-dim="true"]')).toHaveLength(2);
    fireEvent.keyDown(screen.getByRole('button', { name: /^Step 1: Draft request/ }), { key: 'Escape' });
    expect(screen.getByRole('status')).toHaveTextContent('Select a step to trace');
    expect(container.querySelectorAll('[data-dim="true"]')).toHaveLength(0);
  });

  test('Enter and Space toggle a step the same way a click does', () => {
    show(flow);
    const approve = screen.getByRole('button', { name: /^Step 3: Approve/ });
    fireEvent.keyDown(approve, { key: 'Enter' });
    expect(approve).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(approve, { key: ' ' });
    expect(approve).toHaveAttribute('aria-pressed', 'false');
  });

  test('draws a self loop and announces that the step can repeat', () => {
    const { container } = show({ ...flow, nodes: flow.nodes.slice(0, 2), edges: [{ from: 'draft', to: 'review', label: '' }, { from: 'review', to: 'review', label: 'Retry' }] });
    expect(container.querySelectorAll('.metabloom-visual__flow-edge')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /^Step 2: Review request/ }));
    expect(screen.getByRole('status')).toHaveTextContent('It can repeat itself.');
  });

  test('exposes the complete label when the diagram has to shorten it', () => {
    const long = 'Collect every supporting document from the applicant and verify each signature carefully before filing';
    const { container } = show({ ...flow, nodes: [{ id: 'a', label: long }, { id: 'b', label: 'Done' }], edges: [{ from: 'a', to: 'b', label: 'x'.repeat(50) }] });
    expect(container.querySelector('.metabloom-visual__flow-label title')).toHaveTextContent(long);
    expect(container.querySelector('.metabloom-visual__flow-edge-label title')).toHaveTextContent('x'.repeat(50));
  });
});

describe('line chart inspection', () => {
  const line = { ...base, kind: 'line-chart', title: 'Business revenue', summary: 'Three months of data.', unit: 'k dollars',
    labels: ['M1', 'M2', 'M3'],
    series: [{ id: 'a', label: 'Business A', values: [20, 24, 28] }, { id: 'b', label: 'Business B', values: [30, 29, 33] }] };

  test('uses round axis values that include zero', () => {
    const { container } = show(line);
    const ticks = [...container.querySelectorAll('.metabloom-visual__axis-label')].map(node => node.textContent).filter(text => /^\d+$/.test(text));
    expect(ticks).toEqual(['0', '10', '20', '30', '40']);
  });

  test('keeps constant, all-zero and negative series on a valid scale', () => {
    for (const values of [[5, 5, 5], [0, 0, 0], [-8, -2, 4]]) {
      const { container, unmount } = show({ ...line, series: [{ id: 'a', label: 'A', values }, { id: 'b', label: 'B', values }] });
      const paths = container.querySelectorAll('path.metabloom-visual__line');
      expect(paths).toHaveLength(2);
      paths.forEach(path => expect(path.getAttribute('d')).not.toMatch(/NaN|Infinity/));
      unmount();
    }
  });

  test('arrow keys, Home, End and Escape move through observations and announce them', () => {
    const { container } = show(line);
    const chart = screen.getByRole('group', { name: 'Business revenue' });
    expect(chart).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('status')).toHaveTextContent('use the arrow keys');
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(screen.getByRole('status')).toHaveTextContent('M1: Business A 20, Business B 30 k dollars.');
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(screen.getByRole('status')).toHaveTextContent('M3: Business A 28, Business B 33 k dollars.');
    expect(container.querySelectorAll('.metabloom-visual__crosshair circle')).toHaveLength(2);
    fireEvent.keyDown(chart, { key: 'Home' });
    expect(screen.getByRole('status')).toHaveTextContent('M1:');
    fireEvent.keyDown(chart, { key: 'End' });
    expect(screen.getByRole('status')).toHaveTextContent('M3:');
    fireEvent.keyDown(chart, { key: 'Escape' });
    expect(container.querySelector('.metabloom-visual__crosshair')).toBeNull();
  });

  test('pointer position selects the nearest observation; touch hover is ignored', () => {
    // This jsdom has no PointerEvent, which would drop pointerType and clientX.
    const original = window.PointerEvent;
    window.PointerEvent = class extends MouseEvent {
      constructor(type, init = {}) { super(type, init); this.pointerType = init.pointerType; }
    };
    try {
      show(line);
      const chart = screen.getByRole('group', { name: 'Business revenue' });
      chart.getBoundingClientRect = () => ({ left: 0, top: 0, right: 520, bottom: 212, width: 520, height: 212 });
      fireEvent.pointerMove(chart, { pointerType: 'mouse', clientX: 290 });
      expect(screen.getByRole('status')).toHaveTextContent('M2:');
      fireEvent.click(chart, { clientX: 486 });
      expect(screen.getByRole('status')).toHaveTextContent('M3:');
      fireEvent.pointerMove(chart, { pointerType: 'touch', clientX: 80 });
      expect(screen.getByRole('status')).toHaveTextContent('M3:');
    } finally {
      if (original) window.PointerEvent = original; else delete window.PointerEvent;
    }
  });

  test('bar charts keep their existing behavior without inspection controls', () => {
    const { container } = show({ ...line, kind: 'bar-chart' });
    expect(container.querySelector('.metabloom-visual__line-svg')).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
