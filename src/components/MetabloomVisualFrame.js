import React from 'react';
import { evaluateMetabloomVisualFormula, METABLOOM_VISUAL_ERRORS } from './metabloomVisualProtocol';

const numberText = value => new Intl.NumberFormat(undefined, { maximumSignificantDigits: 21 }).format(value);
const axisText = value => new Intl.NumberFormat(undefined, { notation: 'compact', maximumSignificantDigits: 3 }).format(value);
const provenanceLabels = { user: 'Your inputs', sources: 'Source-backed', calculated: 'Calculated', illustrative: 'Illustrative', conceptual: 'Conceptual' };
const DataTable = ({ columns, rows, title }) => (
  <div className="metabloom-visual__table-scroll" tabIndex={0} role="region" aria-label={`${title} data`}>
    <table><caption>{title}</caption><thead><tr>{columns.map((column, index) => <th key={index} scope="col">{column}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody>
    </table>
  </div>
);
function VisualChart({ spec, id }) {
  const multiple = Array.isArray(spec.series);
  const labels = multiple ? spec.labels : spec.points.map(point => point.label);
  const series = multiple ? spec.series : [{ id: 'single', label: spec.title, values: spec.points.map(point => point.value) }];
  const values = series.flatMap(item => item.values);
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const span = max - min || 1;
  const zero = (0 - min) / span * 100;
  const y = value => 172 - (value - min) / span * 144;
  const x = index => 80 + index / Math.max(1, labels.length - 1) * 408;
  const dataRows = labels.map((label, index) => [label, ...series.map(item => numberText(item.values[index]))]);
  return <>
    {multiple && <ul className="metabloom-visual__legend" aria-label="Chart series">
      {series.map((item, index) => <li key={item.id} className={`metabloom-visual__series-${index + 1}`}>
        <span className="metabloom-visual__series-dot" aria-hidden="true" />{item.label}
      </li>)}
    </ul>}
    {spec.kind === 'bar-chart' ? (
      <ol className="metabloom-visual__bars" aria-label={spec.title}>
        {labels.map((label, index) => <li key={index}>
          {multiple && <strong className="metabloom-visual__group-label">{label}</strong>}
          <div className="metabloom-visual__group-bars">{series.map((item, seriesIndex) => {
            const value = item.values[index];
            const end = (value - min) / span * 100;
            return <div key={item.id} className={`metabloom-visual__series-${seriesIndex + 1}`}>
              <div className="metabloom-visual__bar-label"><span>{multiple ? item.label : label}</span><strong>{numberText(value)} {spec.unit}</strong></div>
              <div className="metabloom-visual__bar-track" aria-hidden="true">
                <span className="metabloom-visual__bar-zero" style={{ left: `${zero}%` }} />
                <span className="metabloom-visual__bar" style={{ left: `${Math.min(zero, end)}%`, width: `${Math.abs(end - zero)}%` }} />
              </div>
            </div>;
          })}</div>
        </li>)}
      </ol>
    ) : (
      <figure className="metabloom-visual__line-chart">
        <svg viewBox="0 0 520 212" role="img" aria-labelledby={`${id}-chart-title ${id}-chart-desc`}>
          <title id={`${id}-chart-title`}>{spec.title}</title><desc id={`${id}-chart-desc`}>Ordered observations for {series.map(item => item.label).join(', ')}. Exact values are available in the data table below.</desc>
          {[min, (min + max) / 2, max].map((value, index) => <g key={index}>
            <text x="72" y={y(value) + 4} textAnchor="end" className="metabloom-visual__axis-label">{axisText(value)}</text>
            <line x1="80" x2="488" y1={y(value)} y2={y(value)} className="metabloom-visual__gridline" />
          </g>)}
          {series.map((item, seriesIndex) => <g key={item.id} className={`metabloom-visual__series-${seriesIndex + 1}`}>
            <path d={item.values.map((value, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(value)}`).join(' ')} className="metabloom-visual__line" />
            {item.values.map((value, index) => <circle key={index} cx={x(index)} cy={y(value)} r="3" className="metabloom-visual__point">
              <title>{item.label}, {labels[index]}: {numberText(value)} {spec.unit}</title>
            </circle>)}
          </g>)}
          {labels.map((label, index) => (index === labels.length - 1 || index % Math.max(1, Math.ceil(labels.length / 6)) === 0)
            ? <text key={index} x={x(index)} y="197" textAnchor="middle" className="metabloom-visual__axis-label">{label.length > 10 ? `${label.slice(0, 9)}…` : label}</text> : null)}
        </svg>
        <figcaption>Equal spacing represents observation order, not elapsed time. Values in {spec.unit || 'the supplied units'}.</figcaption>
      </figure>
    )}
    <details className="metabloom-visual__details"><summary>View exact values</summary>
      <DataTable title={`${spec.title}: exact values`} columns={['Observation', ...series.map(item => item.label)]} rows={dataRows} />
    </details>
  </>;
}
function VisualFlowchart({ spec }) {
  const label = id => spec.nodes.find(node => node.id === id)?.label || '';
  return <div className="metabloom-visual__flow">
    <ol className="metabloom-visual__nodes">{spec.nodes.map((node, index) => <li key={node.id}><span className="metabloom-visual__node-number">{index + 1}</span><span>{node.label}</span></li>)}</ol>
    {spec.edges.length > 0 && <div className="metabloom-visual__connections"><h4>Connections</h4>
      <ul>{spec.edges.map((edge, index) => <li key={index}><span>{label(edge.from)}</span><span aria-hidden="true"> → </span><span className="metabloom-visual__sr-only"> leads to </span><span>{label(edge.to)}</span>{edge.label && <small>{edge.label}</small>}</li>)}</ul>
    </div>}
  </div>;
}
class VisualCalculator extends React.Component {
  constructor(props) {
    super(props);
    this.state = { inputs: Object.fromEntries(props.spec.controls.map(control => [control.id, String(control.initial)])), copyStatus: '' };
  }
  componentDidMount() {
    this.mounted = true;
    this.publishInputs();
  }
  publishInputs = () => {
    const values = Object.fromEntries(this.props.spec.controls.map(control =>
      [control.id, this.state.inputs[control.id].trim() ? Number(this.state.inputs[control.id]) : NaN]));
    this.props.onInputsChange?.(values);
  };
  componentWillUnmount() { this.mounted = false; }
  reset = () => this.setState({ inputs: Object.fromEntries(this.props.spec.controls.map(control => [control.id, String(control.initial)])), copyStatus: '' }, this.publishInputs);
  change = (id, value) => this.setState(state => ({ inputs: { ...state.inputs, [id]: value }, copyStatus: '' }), this.publishInputs);
  copyScenario = async () => {
    const { spec } = this.props;
    const text = `${spec.title}\n${spec.controls.map(control => `${control.label}: ${this.state.inputs[control.id]} ${control.unit}`).join('\n')}\nFormula: ${spec.formulaDescription}\nQuestion: `;
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(text);
      if (this.mounted) this.setState({ copyStatus: 'Scenario copied. Paste it into your next message.' });
    } catch { if (this.mounted) this.setState({ copyStatus: 'Copy is unavailable. You can include the values in your next message.' }); }
  };
  render() {
    const { spec, id } = this.props;
    const values = Object.fromEntries(spec.controls.map(control => [control.id, this.state.inputs[control.id].trim() ? Number(this.state.inputs[control.id]) : NaN]));
    const result = evaluateMetabloomVisualFormula(spec.formula, spec.controls, values);
    return <div className="metabloom-visual__calculator">
      <div className="metabloom-visual__fields">{spec.controls.map(control => {
        const value = values[control.id];
        const invalid = !Number.isFinite(value) || value < control.min || value > control.max;
        return <div className="metabloom-visual__field" key={control.id}>
          <label htmlFor={`${id}-${control.id}`}>{control.label} {control.unit && <span>({control.unit})</span>}</label>
          <div className="metabloom-visual__input-shell"><input id={`${id}-${control.id}`} type="number" inputMode="decimal" min={control.min} max={control.max} step={control.step}
            value={this.state.inputs[control.id]} aria-invalid={invalid || undefined} aria-describedby={`${id}-formula`}
            onChange={event => this.change(control.id, event.target.value)} /></div>
          <input type="range" aria-label={`${control.label} slider`} min={control.min} max={control.max} step={control.step}
            value={Number.isFinite(value) ? Math.min(control.max, Math.max(control.min, value)) : control.initial}
            onChange={event => this.change(control.id, event.target.value)} />
        </div>;
      })}</div>
      <p id={`${id}-formula`} className="metabloom-visual__formula">{spec.formulaDescription}</p>
      <div className="metabloom-visual__result"><span>Calculated result</span><output aria-live="polite" aria-atomic="true">{result === null ? 'Enter valid inputs to calculate.' : `${numberText(result)} ${spec.unit}`}</output></div>
      <div className="metabloom-visual__actions"><button type="button" onClick={this.reset}>Reset values</button><button type="button" disabled={result === null} onClick={this.copyScenario}>Copy scenario</button></div>
      {this.state.copyStatus && <p role="status">{this.state.copyStatus}</p>}
    </div>;
  }
}
export class MetabloomVisualBoundary extends React.Component {
  state = { failed: false };
  componentDidCatch() { this.setState({ failed: true }); }
  render() { return this.state.failed ? <div className="metabloom-visual" role="status">This visual could not be displayed. Your answer is unchanged.</div> : this.props.children; }
}
export default function MetabloomVisualFrame({ artifact, onStop, onReady, onInputsChange }) {
  React.useEffect(() => { if (artifact.status === 'ready') onReady?.(); }, [artifact.status, onReady]);
  const { id, status, spec, sources = [], code } = artifact;
  return <section className="metabloom-visual" data-visual-state={status} data-visual-kind={spec?.kind || artifact.kind} aria-label={spec?.title || 'Visual answer'} aria-busy={status === 'generating'}>
    <header className="metabloom-visual__header"><div><span className="metabloom-visual__eyebrow">{spec?.kind === 'calculator' ? 'Explore the answer' : 'Another way to see it'}</span><h3>{spec?.title || (status === 'cancelled' ? 'Visual stopped' : status === 'failed' ? 'Visual unavailable' : 'Preparing your visual')}</h3></div>
      {status === 'generating' && <button type="button" onClick={onStop}>Stop visual</button>}
    </header>
    {status === 'generating' && <p className="metabloom-visual__progress" role="status">Preparing a visual from the completed answer.</p>}
    {['failed', 'cancelled'].includes(status) && <p role="status">{METABLOOM_VISUAL_ERRORS[code] || METABLOOM_VISUAL_ERRORS.visual_unavailable}</p>}
    {status === 'ready' && spec && <>
      <p className="metabloom-visual__summary">{spec.summary}</p>
      {spec.kind === 'table' && <DataTable columns={spec.columns} rows={spec.rows} title={spec.title} />}
      {['bar-chart', 'line-chart'].includes(spec.kind) && <VisualChart spec={spec} id={id} />}
      {spec.kind === 'flowchart' && <VisualFlowchart spec={spec} />}
      {spec.kind === 'calculator' && <VisualCalculator spec={spec} id={id} onInputsChange={onInputsChange} />}
      <footer className="metabloom-visual__provenance"><span className="metabloom-visual__badge">{provenanceLabels[spec.provenance.type]}</span><p>{spec.provenance.label}</p>
        {sources.length > 0 && <ul aria-label="Visual sources">{sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul>}
      </footer>
    </>}
  </section>;
}
