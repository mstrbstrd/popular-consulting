import { layoutFlowchart, wrapFlowLabel, truncateFlowEdgeLabel, describeFlowStep, FLOW_METRICS } from './metabloomFlowLayout';

const nodes = (...ids) => ids.map(id => ({ id, label: `Step ${id}` }));
const link = (from, to, label = '') => ({ from, to, label });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const byId = (layout, id) => layout.nodes.find(node => node.id === id);
const expectClean = layout => {
  for (let i = 0; i < layout.nodes.length; i += 1) {
    const a = layout.nodes[i];
    for (const value of [a.x, a.y, a.w, a.h]) expect(Number.isFinite(value)).toBe(true);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x + a.w).toBeLessThanOrEqual(layout.width);
    expect(a.y + a.h).toBeLessThanOrEqual(layout.height);
    for (let j = i + 1; j < layout.nodes.length; j += 1) expect(overlap(a, layout.nodes[j])).toBe(false);
  }
  layout.edges.forEach(edge => expect(edge.d).toMatch(/^M [-\d. ]+( C [-\d., ]+)*$/));
};

describe('flowchart layout', () => {
  test('places a linear process top to bottom in specification order', () => {
    const layout = layoutFlowchart(nodes('a', 'b', 'c'), [link('a', 'b'), link('b', 'c')]);
    expect(byId(layout, 'a').y).toBeLessThan(byId(layout, 'b').y);
    expect(byId(layout, 'b').y).toBeLessThan(byId(layout, 'c').y);
    expect(layout.layerCount).toBe(3);
    expect(layout.edges).toHaveLength(2);
    expectClean(layout);
  });

  test('splits a decision into sibling branches that rejoin below both', () => {
    const layout = layoutFlowchart(nodes('a', 'b', 'c', 'd'),
      [link('a', 'b', 'Yes'), link('a', 'c', 'No'), link('b', 'd'), link('c', 'd')]);
    expect(byId(layout, 'b').y).toBe(byId(layout, 'c').y);
    expect(byId(layout, 'd').y).toBeGreaterThan(byId(layout, 'b').y);
    expect(layout.maxLayerSize).toBe(2);
    expect(layout.edges.map(edge => edge.label)).toEqual(['Yes', 'No', '', '']);
    expectClean(layout);
  });

  test('draws a return edge as a back edge without reordering the forward flow', () => {
    const layout = layoutFlowchart(nodes('a', 'b', 'c'), [link('a', 'b'), link('b', 'c'), link('c', 'a', 'Retry')]);
    expect(layout.edges.filter(edge => edge.back)).toHaveLength(1);
    expect(layout.edges.find(edge => edge.back)).toMatchObject({ from: 2, to: 0, label: 'Retry' });
    expect(byId(layout, 'a').y).toBeLessThan(byId(layout, 'b').y);
    expect(byId(layout, 'b').y).toBeLessThan(byId(layout, 'c').y);
    expectClean(layout);
  });

  test('lays out a pure cycle and a two-node cycle starting from the first node', () => {
    for (const edges of [[link('a', 'b'), link('b', 'c'), link('c', 'a')], [link('a', 'b'), link('b', 'a')]]) {
      const layout = layoutFlowchart(nodes('a', 'b', 'c').slice(0, edges.length === 3 ? 3 : 2), edges);
      expect(byId(layout, 'a').y).toBeLessThan(byId(layout, 'b').y);
      expect(layout.edges.filter(edge => edge.back)).toHaveLength(1);
      expectClean(layout);
    }
  });

  test('keeps a self loop beside its node and reserves space for it', () => {
    const layout = layoutFlowchart(nodes('a', 'b'), [link('a', 'a', 'Again'), link('a', 'b')]);
    const loop = layout.edges.find(edge => edge.self);
    expect(loop).toMatchObject({ from: 0, to: 0, label: 'Again' });
    expect(layout.width).toBeGreaterThanOrEqual(byId(layout, 'a').x + FLOW_METRICS.nodeWidth + FLOW_METRICS.loopWidth);
    expectClean(layout);
  });

  test('routes an edge that skips a layer through its own lane instead of through a node', () => {
    const layout = layoutFlowchart(nodes('a', 'b', 'c'), [link('a', 'b'), link('b', 'c'), link('a', 'c', 'Skip')]);
    const skip = layout.edges.find(edge => edge.label === 'Skip');
    expect(skip.d.split(' C ').length).toBeGreaterThan(2);
    expect(layout.width).toBeGreaterThan(FLOW_METRICS.nodeWidth + FLOW_METRICS.margin * 2);
    expectClean(layout);
  });

  test('places disconnected steps on the first layer side by side', () => {
    const layout = layoutFlowchart(nodes('a', 'b', 'c'), [link('a', 'b')]);
    expect(byId(layout, 'c').y).toBe(byId(layout, 'a').y);
    expect(byId(layout, 'c').x).not.toBe(byId(layout, 'a').x);
    expectClean(layout);
    expect(layoutFlowchart(nodes('only'), []).nodes).toHaveLength(1);
  });

  test('is deterministic and stays collision free at the specification limits', () => {
    const ids = Array.from({ length: 16 }, (_, i) => `n${i}`);
    const edges = [];
    for (let i = 0; i < 16 && edges.length < 32; i += 1) {
      edges.push(link(ids[i], ids[(i + 1) % 16], i % 3 === 0 ? 'Go' : ''));
      if (edges.length < 32) edges.push(link(ids[i], ids[(i * 5 + 3) % 16], 'Alt'));
    }
    const first = layoutFlowchart(nodes(...ids), edges.filter(edge => edge.from !== edge.to));
    expect(layoutFlowchart(nodes(...ids), edges.filter(edge => edge.from !== edge.to))).toEqual(first);
    expect(first.nodes).toHaveLength(16);
    expectClean(first);
  });

  test('rejects an edge to an unknown step instead of guessing', () => {
    expect(() => layoutFlowchart(nodes('a'), [link('a', 'missing')])).toThrow();
  });
});

describe('edge label placement', () => {
  const scenes = {
    decision: [nodes('a', 'b', 'c', 'd'), [link('a', 'b', 'Yes'), link('a', 'c', 'No'), link('b', 'd'), link('c', 'a', 'Resubmit')]],
    checkout: [nodes('cart', 'pay', 'failed', 'notify', 'stock', 'ship'),
      [link('cart', 'pay'), link('pay', 'failed'), link('failed', 'notify', 'Yes'), link('failed', 'stock', 'No'),
        link('notify', 'cart', 'Retry'), link('stock', 'ship', 'In stock'), link('cart', 'stock', 'Skip checks')]],
    loop: [nodes('poll', 'work', 'idle'), [link('poll', 'work', 'Message'), link('work', 'work', 'Retry'), link('poll', 'idle', 'Empty')]],
  };
  const labelBox = (edge, text) => {
    const w = text.length * FLOW_METRICS.labelChar + 4;
    const { x, y, anchor } = edge.labelPoint;
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
    return { x, y, x0, x1: x0 + w, y0: y - FLOW_METRICS.labelHeight + 5, y1: y + 5 };
  };

  test.each(Object.keys(scenes))('%s: labels never cover a step or each other and stay on the canvas', name => {
    const [list, edges] = scenes[name];
    const layout = layoutFlowchart(list, edges);
    const boxes = layout.edges.filter(edge => edge.label).map(edge => labelBox(edge, truncateFlowEdgeLabel(edge.label)));
    expect(boxes).toHaveLength(edges.filter(edge => edge.label).length);
    boxes.forEach((box, i) => {
      expect(box.x0).toBeGreaterThanOrEqual(0);
      expect(box.x1).toBeLessThanOrEqual(layout.width);
      expect(box.y0).toBeGreaterThanOrEqual(0);
      expect(box.y1).toBeLessThanOrEqual(layout.height);
      layout.nodes.forEach(node => expect(box.x0 < node.x + node.w && node.x < box.x1 && box.y0 < node.y + node.h && node.y < box.y1).toBe(false));
      boxes.slice(i + 1).forEach(other => expect(box.x0 < other.x1 && other.x0 < box.x1 && box.y0 < other.y1 && other.y0 < box.y1).toBe(false));
    });
  });

  test('a loop label has room beside its step instead of running under a neighbour', () => {
    const layout = layoutFlowchart(...scenes.loop);
    const loop = layout.edges.find(edge => edge.self);
    const neighbour = layout.nodes.filter(node => node.y === byId(layout, 'work').y && node.id !== 'work');
    const box = labelBox(loop, 'Retry');
    neighbour.forEach(node => expect(box.x1 <= node.x || node.x + node.w <= box.x0).toBe(true));
  });
});

describe('flowchart labels', () => {
  test('wraps on words and splits overlong words', () => {
    expect(wrapFlowLabel('Review the submitted request', 19)).toEqual(['Review the', 'submitted request']);
    expect(wrapFlowLabel('Supercalifragilisticexpialidocious', 20)).toEqual(['Supercalifragilistic', 'expialidocious']);
  });

  test('bounds a maximum length label to four short lines ending in an ellipsis', () => {
    const lines = wrapFlowLabel('word '.repeat(32).trim());
    expect(lines).toHaveLength(FLOW_METRICS.maxLines);
    expect(lines.every(line => line.length <= FLOW_METRICS.wrap)).toBe(true);
    expect(lines[lines.length - 1].endsWith('…')).toBe(true);
    expect(wrapFlowLabel('   ')).toEqual(['']);
  });

  test('shortens edge labels without losing short ones', () => {
    expect(truncateFlowEdgeLabel('Yes')).toBe('Yes');
    expect(truncateFlowEdgeLabel('x'.repeat(60))).toHaveLength(FLOW_METRICS.labelWrap);
    expect(truncateFlowEdgeLabel(undefined)).toBe('');
  });

  test('describes where a step comes from and leads, excluding self loops', () => {
    const list = nodes('a', 'b', 'c');
    const edges = [link('a', 'b', 'Yes'), link('c', 'b'), link('b', 'b', 'Retry'), link('b', 'c', 'No')];
    expect(describeFlowStep(list, edges, 'b')).toEqual({
      from: [{ label: 'Step a', via: 'Yes' }, { label: 'Step c', via: '' }],
      to: [{ label: 'Step c', via: 'No' }],
      loops: ['Retry'],
    });
  });
});
