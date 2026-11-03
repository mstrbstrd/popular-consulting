import { evaluateMetabloomVisualFormula } from './metabloomVisualProtocol';
import { MAX_METABLOOM_ARTIFACT_REFERENCE_LABEL, MAX_METABLOOM_ARTIFACT_SUMMARY } from './metabloomArtifactReference';

const numberText = value => new Intl.NumberFormat(undefined, { maximumSignificantDigits: 21 }).format(value);
const amount = (value, unit) => `${numberText(value)}${unit ? ` ${unit}` : ''}`;

// Presentation only. The request still sends a locator and selection, and the
// server independently resolves the owned record and recomputes its result.
export function describeMetabloomVisualSelection(spec, reference) {
  const { selector } = reference;
  let detail, summary;
  if (selector.type === 'calculator') {
    if (spec.kind !== 'calculator' || !reference.inputs
      || Object.keys(reference.inputs).length !== spec.controls.length
      || !spec.controls.every(control => Object.prototype.hasOwnProperty.call(reference.inputs, control.id)
        && Number.isFinite(reference.inputs[control.id]) && reference.inputs[control.id] >= control.min
        && reference.inputs[control.id] <= control.max)) return null;
    const result = evaluateMetabloomVisualFormula(spec.formula, spec.controls, reference.inputs);
    if (result === null) return null;
    detail = 'Scenario';
    summary = [...spec.controls.map(control => `${control.label}: ${amount(reference.inputs[control.id], control.unit)}`),
      `Result: ${amount(result, spec.unit)}`].join(' · ');
  } else if (selector.type === 'table-row') {
    const row = spec.kind === 'table' && spec.rows[selector.index];
    if (!row) return null;
    const text = row.find(cell => cell.trim());
    detail = `Row ${selector.index + 1}${text ? `: ${text}` : ''}`;
    summary = spec.columns.map((column, index) => `${column}: ${row[index] || '(empty)'}`).join(' · ');
  } else if (selector.type === 'observation') {
    if (spec.kind !== 'line-chart') return null;
    detail = spec.labels?.[selector.index] ?? spec.points?.[selector.index]?.label;
    if (detail === undefined) return null;
    summary = spec.series
      ? spec.series.map(series => `${series.label}: ${amount(series.values[selector.index], spec.unit)}`).join(' · ')
      : amount(spec.points[selector.index].value, spec.unit);
  } else if (selector.type === 'pie-category') {
    const point = spec.kind === 'pie-chart' && spec.points[selector.index];
    if (!point) return null;
    detail = point.label;
    summary = amount(point.value, spec.unit);
  } else if (selector.type === 'flow-node') {
    const node = spec.kind === 'flowchart' && spec.nodes.find(item => item.id === selector.id);
    if (!node) return null;
    detail = node.label;
    summary = `Step ${spec.nodes.indexOf(node) + 1}: ${node.label}`;
  } else return null;
  const text = `${spec.title} · ${detail}`.replace(/\s+/g, ' ').trim();
  const label = text.length <= MAX_METABLOOM_ARTIFACT_REFERENCE_LABEL ? text
    : `${text.slice(0, MAX_METABLOOM_ARTIFACT_REFERENCE_LABEL - 1).replace(/[\uD800-\uDBFF]$/, '')}…`;
  // Valid schema maxima fit completely. Never display a partial numeric value.
  return summary.length <= MAX_METABLOOM_ARTIFACT_SUMMARY ? { label, summary } : null;
}

export function currentMetabloomVisualSelection(record, fallback) {
  const { spec, viewState } = record;
  if (spec.kind === 'calculator') return { selector: { type: 'calculator' },
    inputs: Object.fromEntries(spec.controls.map(control => {
      const draft = viewState?.inputs?.[control.id];
      return [control.id, draft === undefined ? control.initial : draft.trim() ? Number(draft) : NaN];
    })) };
  if (spec.kind === 'line-chart') return { selector: { type: 'observation', index: viewState?.active ?? null } };
  if (spec.kind === 'pie-chart') return { selector: { type: 'pie-category',
    index: viewState?.selectedIndex ?? spec.points.findIndex(point => point.value > 0) } };
  if (spec.kind === 'flowchart') return { selector: { type: 'flow-node', id: viewState?.selectedId ?? null } };
  return fallback ? { selector: { ...fallback.selector } } : null;
}
