// Deterministic layered layout for the native flowchart renderer. It is a pure
// function of the validated nodes/edges: no DOM, no measurement, no randomness.
// Spec limits (16 nodes, 32 edges) keep every step trivially bounded.
export const FLOW_METRICS = Object.freeze({
  nodeWidth: 184, lineHeight: 16, padY: 12, textX: 40, textRight: 12,
  gapX: 28, gapY: 60, margin: 24, dummyWidth: 20, loopWidth: 26,
  wrap: 20, maxLines: 4, labelWrap: 18, portStep: 22, labelChar: 6.6, labelHeight: 14,
});

const round = value => Math.round(value * 100) / 100;

// Wrap by words, hard-split overlong words, and end with an ellipsis rather than
// growing without bound. The complete label stays available in the details list.
export function wrapFlowLabel(label, limit = FLOW_METRICS.wrap, maxLines = FLOW_METRICS.maxLines) {
  const words = String(label).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  const push = () => { if (line) lines.push(line); line = ''; };
  for (let word of words) {
    while (word.length > limit) {
      if (line) push();
      lines.push(word.slice(0, limit));
      word = word.slice(limit);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= limit) line += ` ${word}`;
    else { push(); line = word; }
  }
  push();
  if (!lines.length) lines.push('');
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = `${last.length >= limit ? last.slice(0, limit - 1) : last}…`;
  return kept;
}

export function truncateFlowEdgeLabel(label, limit = FLOW_METRICS.labelWrap) {
  const text = String(label || '').trim().replace(/\s+/g, ' ');
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function findBackEdges(count, edges) {
  // Depth-first search in spec order, entering from natural entry points first so
  // a loop is drawn as a return to its entry rather than as a forward edge.
  const outgoing = Array.from({ length: count }, () => []);
  const indegree = new Array(count).fill(0);
  edges.forEach((edge, index) => {
    if (edge.from === edge.to) return;
    outgoing[edge.from].push({ to: edge.to, index });
    indegree[edge.to] += 1;
  });
  const state = new Array(count).fill(0);
  const back = new Set();
  const visit = node => {
    state[node] = 1;
    for (const { to, index } of outgoing[node]) {
      if (state[to] === 1) back.add(index);
      else if (state[to] === 0) visit(to);
    }
    state[node] = 2;
  };
  const roots = [...Array(count).keys()].filter(node => indegree[node] === 0);
  [...roots, ...Array(count).keys()].forEach(node => { if (state[node] === 0) visit(node); });
  return back;
}

function assignLayers(count, dagEdges) {
  const predecessors = Array.from({ length: count }, () => []);
  const successors = Array.from({ length: count }, () => []);
  dagEdges.forEach(({ from, to }) => { predecessors[to].push(from); successors[from].push(to); });
  const layer = new Array(count).fill(null);
  const resolve = node => {
    if (layer[node] !== null) return layer[node];
    layer[node] = predecessors[node].length ? Math.max(...predecessors[node].map(resolve)) + 1 : 0;
    return layer[node];
  };
  for (let node = 0; node < count; node += 1) resolve(node);
  // Pull entry nodes down beside their first consumer so they do not float on top.
  for (let node = 0; node < count; node += 1) {
    if (!predecessors[node].length && successors[node].length) layer[node] = Math.min(...successors[node].map(next => layer[next])) - 1;
  }
  return layer;
}

function countCrossings(layers, positionOf, links) {
  let crossings = 0;
  for (let i = 0; i < layers.length - 1; i += 1) {
    const segments = links.filter(link => link.layer === i).map(link => [positionOf.get(link.upper), positionOf.get(link.lower)]);
    for (let a = 0; a < segments.length; a += 1) for (let b = a + 1; b < segments.length; b += 1) {
      if ((segments[a][0] - segments[b][0]) * (segments[a][1] - segments[b][1]) < 0) crossings += 1;
    }
  }
  return crossings;
}

const labelWidth = text => text.length * FLOW_METRICS.labelChar + 4;
const bezierPoint = (s, t) => {
  const u = 1 - t;
  const mix = key => u * u * u * s[0][key] + 3 * u * u * t * s[1][key] + 3 * u * t * t * s[2][key] + t * t * t * s[3][key];
  return { x: mix('x'), y: mix('y') };
};

// Labels are placed greedily along their own curve: the first spot (beside the line,
// either side) that clears every placed label, every step and the canvas wins.
function placeEdgeLabels(shapes, boxes, width, height) {
  const M = FLOW_METRICS;
  const placed = [];
  const hit = (a, b, pad) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
  const boxFor = (x, y, anchor, w) => {
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
    return { x0, x1: x0 + w, y0: y - M.labelHeight + 5, y1: y + 5 };
  };
  shapes.forEach(shape => {
    const text = truncateFlowEdgeLabel(shape.label);
    if (!text) return;
    const w = labelWidth(text);
    const candidates = shape.self ? [shape.labelPoint] : [];
    (shape.segments || []).filter(segment => Math.abs(segment[3].y - segment[0].y) > 12).forEach(segment => {
      const preferred = segment[3].x - segment[0].x >= 0 ? ['start', 'end'] : ['end', 'start'];
      [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8].forEach(t => {
        const point = bezierPoint(segment, t);
        preferred.forEach(anchor => candidates.push({ x: round(point.x + (anchor === 'start' ? 7 : -7)), y: round(point.y + 4), anchor }));
      });
    });
    let best = null;
    for (const candidate of candidates) {
      const box = boxFor(candidate.x, candidate.y, candidate.anchor, w);
      let cost = placed.filter(other => hit(box, other, 2)).length + boxes.filter(other => hit(box, other, 3)).length;
      if (box.x0 < 2 || box.x1 > width - 2 || box.y0 < 2 || box.y1 > height - 2) cost += 10;
      if (!best || cost < best.cost) best = { cost, candidate, box };
      if (cost === 0) break;
    }
    if (!best) return;
    shape.labelPoint = best.candidate;
    placed.push(best.box);
  });
}

export function layoutFlowchart(nodes, edges) {
  const M = FLOW_METRICS;
  const indexOf = new Map(nodes.map((node, index) => [node.id, index]));
  const normal = edges.map((edge, index) => ({ index, from: indexOf.get(edge.from), to: indexOf.get(edge.to), label: edge.label || '' }));
  if (normal.some(edge => edge.from === undefined || edge.to === undefined)) throw new Error('Unknown flowchart node');
  const loops = normal.filter(edge => edge.from === edge.to);
  const routed = normal.filter(edge => edge.from !== edge.to);
  const back = findBackEdges(nodes.length, normal);
  // DAG orientation: a loop-back edge is laid out reversed and drawn with its original arrow.
  const dag = routed.map(edge => back.has(edge.index)
    ? { ...edge, upper: edge.to, lower: edge.from, back: true }
    : { ...edge, upper: edge.from, lower: edge.to, back: false });
  const layerOf = assignLayers(nodes.length, dag.map(edge => ({ from: edge.upper, to: edge.lower })));
  const minLayer = Math.min(0, ...layerOf);
  const layerIndex = layerOf.map(value => value - minLayer);

  // Long edges pass through one virtual lane per skipped layer so they route around nodes.
  const items = nodes.map((node, index) => ({ key: `n${index}`, node: index, layer: layerIndex[index], sort: index }));
  const links = [];
  const chains = dag.map(edge => {
    const keys = [`n${edge.upper}`];
    for (let layer = layerIndex[edge.upper] + 1; layer < layerIndex[edge.lower]; layer += 1) {
      const key = `d${edge.index}-${layer}`;
      items.push({ key, dummy: true, layer, sort: edge.upper + 0.5, edge: edge.index });
      keys.push(key);
    }
    keys.push(`n${edge.lower}`);
    for (let i = 0; i < keys.length - 1; i += 1) links.push({ upper: keys[i], lower: keys[i + 1], layer: layerIndex[edge.upper] + i });
    return { edge, keys };
  });
  const layerCount = Math.max(0, ...items.map(item => item.layer)) + 1;
  let layers = Array.from({ length: layerCount }, (_, layer) => items.filter(item => item.layer === layer)
    .sort((a, b) => a.sort - b.sort).map(item => item.key));
  const positions = () => new Map(layers.flatMap(layer => layer.map((key, position) => [key, position])));

  // Barycentre sweeps; keep the ordering with the fewest crossings seen.
  let best = layers.map(layer => [...layer]);
  let bestCrossings = countCrossings(layers, positions(), links);
  for (let pass = 0; pass < 8 && bestCrossings > 0; pass += 1) {
    const down = pass % 2 === 0;
    const order = down ? [...Array(layerCount).keys()].slice(1) : [...Array(layerCount).keys()].slice(0, -1).reverse();
    for (const layer of order) {
      const position = positions();
      const neighbours = key => links.filter(link => (down ? link.lower === key : link.upper === key))
        .map(link => position.get(down ? link.upper : link.lower));
      const weight = new Map(layers[layer].map(key => {
        const around = neighbours(key);
        return [key, around.length ? around.reduce((sum, value) => sum + value, 0) / around.length : position.get(key)];
      }));
      layers[layer] = [...layers[layer]].sort((a, b) => weight.get(a) - weight.get(b) || position.get(a) - position.get(b));
    }
    const crossings = countCrossings(layers, positions(), links);
    if (crossings < bestCrossings) { bestCrossings = crossings; best = layers.map(layer => [...layer]); }
  }
  layers = best;

  // Geometry.
  const itemByKey = new Map(items.map(item => [item.key, item]));
  // A loop beside a node needs room for its curve and its label.
  const loopRoom = new Map();
  loops.forEach(edge => loopRoom.set(edge.from, Math.max(loopRoom.get(edge.from) || 0,
    M.loopWidth + (edge.label ? labelWidth(truncateFlowEdgeLabel(edge.label)) + 8 : 0))));
  const geometry = new Map();
  for (const item of items) {
    if (item.dummy) { geometry.set(item.key, { w: M.dummyWidth, h: 0, extra: 0 }); continue; }
    const lines = wrapFlowLabel(nodes[item.node].label);
    geometry.set(item.key, { w: M.nodeWidth, h: lines.length * M.lineHeight + M.padY * 2, lines, extra: loopRoom.get(item.node) || 0 });
  }
  const layerHeight = layers.map(layer => Math.max(0, ...layer.map(key => geometry.get(key).h)));
  const layerTop = [];
  layerHeight.reduce((top, height, layer) => { layerTop[layer] = top; return top + height + M.gapY; }, M.margin);
  layers.forEach((layer, index) => layer.forEach(key => { geometry.get(key).y = layerTop[index] + (layerHeight[index] - geometry.get(key).h) / 2; }));

  const centre = new Map();
  const separation = (a, b) => (geometry.get(a).w + geometry.get(b).w) / 2 + geometry.get(a).extra + M.gapX;
  layers.forEach(layer => {
    let cursor = 0;
    layer.forEach((key, position) => {
      if (position) cursor += separation(layer[position - 1], key);
      centre.set(key, cursor);
    });
  });
  const neighbourKeys = (key, up) => links.filter(link => (up ? link.lower === key : link.upper === key)).map(link => (up ? link.upper : link.lower));
  const settle = (layerList, up) => layerList.forEach(layer => {
    let previous = null;
    layer.forEach(key => {
      const around = neighbourKeys(key, up).map(other => centre.get(other));
      const desired = around.length ? around.reduce((sum, value) => sum + value, 0) / around.length : centre.get(key);
      const minimum = previous ? centre.get(previous) + separation(previous, key) : -Infinity;
      centre.set(key, Math.max(desired, minimum));
      previous = key;
    });
  });
  for (let pass = 0; pass < 4; pass += 1) {
    settle(layers.slice(1), true);
    settle([...layers].slice(0, -1).reverse(), false);
  }
  let left = Infinity;
  let right = -Infinity;
  centre.forEach((x, key) => {
    const { w, extra } = geometry.get(key);
    left = Math.min(left, x - w / 2);
    right = Math.max(right, x + w / 2 + extra);
  });
  if (!Number.isFinite(left)) { left = 0; right = M.nodeWidth; }
  const shift = M.margin - left;
  centre.forEach((x, key) => centre.set(key, x + shift));
  const width = right - left + M.margin * 2;
  const height = (layers.length ? layerTop[layers.length - 1] + layerHeight[layers.length - 1] : M.margin) + M.margin;

  // Distribute ports along node edges so fan-in and fan-out stay distinguishable.
  const portOffset = new Map();
  const sides = new Map();
  chains.forEach(({ edge, keys }) => {
    const bottom = `${keys[0]}:bottom`;
    const top = `${keys[keys.length - 1]}:top`;
    if (!sides.has(bottom)) sides.set(bottom, []);
    if (!sides.has(top)) sides.set(top, []);
    sides.get(bottom).push({ edge: edge.index, toward: centre.get(keys[1]) });
    sides.get(top).push({ edge: edge.index, toward: centre.get(keys[keys.length - 2]) });
  });
  sides.forEach((entries, side) => {
    entries.sort((a, b) => a.toward - b.toward || a.edge - b.edge);
    const step = Math.min(M.portStep, (M.nodeWidth - 56) / Math.max(1, entries.length - 1));
    entries.forEach((entry, i) => portOffset.set(`${side}:${entry.edge}`, (i - (entries.length - 1) / 2) * step));
  });

  const nodeBox = key => ({ x: centre.get(key), ...geometry.get(key) });
  const edgeShapes = chains.map(({ edge, keys }) => {
    const upper = nodeBox(keys[0]);
    const lower = nodeBox(keys[keys.length - 1]);
    const points = [{ x: upper.x + (portOffset.get(`${keys[0]}:bottom:${edge.index}`) || 0), y: upper.y + upper.h }];
    keys.slice(1, -1).forEach(key => {
      const lane = nodeBox(key);
      const top = layerTop[itemByKey.get(key).layer];
      points.push({ x: lane.x, y: top }, { x: lane.x, y: top + layerHeight[itemByKey.get(key).layer] });
    });
    points.push({ x: lower.x + (portOffset.get(`${keys[keys.length - 1]}:top:${edge.index}`) || 0), y: lower.y });
    // A loop-back edge keeps its original direction: arrow into the upper node.
    const path = edge.back ? [...points].reverse() : points;
    let d = `M ${round(path[0].x)} ${round(path[0].y)}`;
    const segments = [];
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1];
      const b = path[i];
      const bend = (b.y - a.y) / 2;
      segments.push([a, { x: a.x, y: a.y + bend }, { x: b.x, y: b.y - bend }, b]);
      d += ` C ${round(a.x)} ${round(a.y + bend)}, ${round(b.x)} ${round(b.y - bend)}, ${round(b.x)} ${round(b.y)}`;
    }
    return { index: edge.index, from: edge.from, to: edge.to, label: edge.label, back: edge.back, self: false, d, segments,
      labelPoint: { x: round(path[0].x + 7), y: round(path[0].y + 4), anchor: 'start' } };
  });
  const loopShapes = loops.map((edge, order) => {
    const box = nodeBox(`n${edge.from}`);
    const x = box.x + box.w / 2;
    const y1 = box.y + box.h / 2 - 8 + order * 2;
    const y2 = y1 + 16;
    return { index: edge.index, from: edge.from, to: edge.to, label: edge.label, back: false, self: true,
      d: `M ${round(x)} ${round(y1)} C ${round(x + M.loopWidth)} ${round(y1 - 14)}, ${round(x + M.loopWidth)} ${round(y2 + 14)}, ${round(x)} ${round(y2)}`,
      labelPoint: { x: round(x + M.loopWidth + 4), y: round((y1 + y2) / 2 + 4), anchor: 'start' } };
  });

  const allEdges = [...edgeShapes, ...loopShapes].sort((a, b) => a.index - b.index);
  const stepBoxes = nodes.map((_, index) => {
    const box = nodeBox(`n${index}`);
    return { x0: box.x - box.w / 2, x1: box.x + box.w / 2, y0: box.y, y1: box.y + box.h };
  });
  placeEdgeLabels(allEdges, stepBoxes, width, height);
  // Geometry for placement only; the renderer needs the finished path and label.
  allEdges.forEach(edge => { delete edge.segments; });

  return {
    width: round(width), height: round(height), layerCount, maxLayerSize: Math.max(1, ...layers.map(layer => layer.filter(key => !itemByKey.get(key).dummy).length)),
    nodes: nodes.map((node, index) => {
      const box = nodeBox(`n${index}`);
      return { id: node.id, index, label: node.label, lines: box.lines, x: round(box.x - box.w / 2), y: round(box.y), w: box.w, h: box.h };
    }),
    edges: allEdges,
  };
}

// Selection support: neighbours of a step, in specification order.
export function describeFlowStep(nodes, edges, id) {
  const label = key => nodes.find(node => node.id === key)?.label || '';
  const entry = edge => ({ label: label(edge.from === id ? edge.to : edge.from), via: edge.label || '' });
  return {
    from: edges.filter(edge => edge.to === id && edge.from !== id).map(entry),
    to: edges.filter(edge => edge.from === id && edge.to !== id).map(entry),
    loops: edges.filter(edge => edge.from === id && edge.to === id).map(edge => edge.label || ''),
  };
}
