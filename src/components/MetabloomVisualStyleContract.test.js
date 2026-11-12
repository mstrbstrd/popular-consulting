import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, within } from '@testing-library/react';
import MetabloomVisualFrame from './MetabloomVisualFrame';
import { layoutFlowchart } from './metabloomFlowLayout';

const css = fs.readFileSync(path.join(__dirname, 'MetabloomVisual.css'), 'utf8');
const provenance = { type: 'illustrative', label: 'Illustrative values.', sourceIds: [] };
const ready = (id, spec) => ({ id, status: 'ready', artifactVersion: 'b'.repeat(32), spec });

test('pie legend and selection do not repeat a value already present in the label', () => {
  render(<MetabloomVisualFrame artifact={ready('pie', {
    kind: 'pie-chart', title: 'Budget', summary: 'Monthly budget.', unit: '%', provenance,
    points: [{ label: 'Rent — 40%', value: 40 }, { label: 'Food (60)', value: 60 }],
  })} />);
  const legend = screen.getByRole('list', { name: 'Pie chart categories' });
  expect(within(legend).getByRole('button', { name: /Rent/ })).toHaveTextContent(/^Rent40%$/);
  expect(within(legend).getByRole('button', { name: /Food/ })).toHaveTextContent(/^Food60%$/);
  expect(screen.getByRole('status')).toHaveTextContent(/^Rent: 40 %/);
});

test('pie labels keep numbers that are not the slice value', () => {
  render(<MetabloomVisualFrame artifact={ready('pie-2', {
    kind: 'pie-chart', title: 'Fleet', summary: 'Vehicles.', unit: 'vehicles', provenance,
    points: [{ label: 'Route 99', value: 30 }, { label: 'Route 7', value: 70 }],
  })} />);
  const legend = screen.getByRole('list', { name: 'Pie chart categories' });
  expect(within(legend).getByRole('button', { name: /Route 99/ })).toHaveTextContent('Route 99');
});

test('table figures use the number face; text cells do not', () => {
  const { container } = render(<MetabloomVisualFrame artifact={ready('table', {
    kind: 'table', title: 'Planets', summary: 'Planets.', provenance,
    columns: ['Name', 'Diameter (km)'], rows: [['Earth', '12,742'], ['Mars', '6779']],
  })} />);
  const cells = [...container.querySelectorAll('tbody td')];
  expect(cells.filter(cell => cell.classList.contains('metabloom-visual__number')).map(cell => cell.textContent)).toEqual(['12,742', '6779']);
  expect(css).toMatch(/td\.metabloom-visual__number \{[^}]*var\(--aetheris-font-mono\)/);
});

test('flowchart marks entry and exit steps and keeps a 44px step target', () => {
  const spec = {
    kind: 'flowchart', title: 'Refund', summary: 'Refund flow.', provenance: { ...provenance, type: 'conceptual' },
    nodes: [{ id: 'start', label: 'Start' }, { id: 'check', label: 'Check receipt' }, { id: 'done', label: 'Notify' }],
    edges: [{ from: 'start', to: 'check', label: '' }, { from: 'check', to: 'done', label: '' }],
  };
  const { container } = render(<MetabloomVisualFrame artifact={ready('flow', spec)} />);
  const terminals = Object.fromEntries([...container.querySelectorAll('.metabloom-visual__flow-node')]
    .map(node => [node.getAttribute('aria-label').split(/[.:]/)[0], node.dataset.terminal]));
  expect(Object.values(terminals)).toEqual(['start', undefined, 'end']);
  expect(Math.min(...layoutFlowchart(spec.nodes, spec.edges).nodes.map(node => node.h))).toBeGreaterThanOrEqual(44);
});

test('visual styles follow the Aetheris colour and type contract', () => {
  expect(css).toMatch(/\.metabloom-visual__flow-node rect \{[^}]*fill: var\(--aetheris-glass-surface\);[^}]*stroke: var\(--metabloom-flow-spectrum\)/);
  expect(css).toMatch(/\.metabloom-visual__bar-label > span \{[^}]*var\(--aetheris-font-sans\)/);
  expect(css).not.toMatch(/font: 10px/);
  // Only mask alpha uses #000; every painted colour comes from an Aetheris token.
  expect(css.replace(/linear-gradient\(#000 0 0\)/g, '')).not.toMatch(/#[0-9a-f]{3,8}\b/i);
});
