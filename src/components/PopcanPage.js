import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ThemeProvider } from '../contexts/ThemeContext';
import routeMetadata from '../content/routeMetadata.json';
import NavMenu from './NavMenu';
import Icon from './popcan/PopcanIcon';
import { PopcanEngine, DEFAULT_INK, FORMATS, PAPERS, canvasPoint, clamp } from './popcan/popcanEngine';
import { readDraft, writeDraft, loadImage, exportName } from './popcan/popcanStorage';
import './PopcanPage.css';

const TOOLS = [
  ['brush', 'Brush', 'B'], ['eraser', 'Eraser', 'E'], ['line', 'Line', 'L'],
  ['rectangle', 'Rectangle', 'R'], ['ellipse', 'Ellipse', 'O'], ['fill', 'Fill', 'G'],
  ['pick', 'Colour picker', 'I'], ['hand', 'Hand', 'H'],
];
const PALETTES = [
  ['Aurora', '#24ccff', '#ff56d6'], ['Tide', '#04d5b4', '#3075ff'],
  ['Ember', '#ff7348', '#ff42a1'], ['Iris', '#a794ff', '#4bcfe2'],
  ['Dune', '#f4c89b', '#cc768d'], ['Graphite', '#eeeeef', '#76768e'],
];
const PAPER_LABELS = { midnight: 'Midnight', warm: 'Warm paper', white: 'White', transparent: 'Transparent' };
const SHORTCUTS = [['B / E', 'Brush / eraser'], ['L / R / O', 'Line / rectangle / ellipse'], ['G / I / H', 'Fill / colour picker / hand'], ['[ / ]', 'Smaller / larger brush'], ['X', 'Swap colours'], ['Shift + drag', 'Square, circle or 45° line'], ['⌘ or Ctrl + Z', 'Undo'], ['⌘ or Ctrl + Shift + Z', 'Redo'], ['⌘ or Ctrl + S', 'Export PNG'], ['Escape', 'Cancel current stroke']];
const INITIAL_DOCUMENT = { width: 1200, height: 800, paper: PAPERS.midnight, hasInk: false, canUndo: false, canRedo: false };

function ToolButton({ icon, label, children, className = '', ...props }) {
  return <button type="button" className={`pc-button ${className}`} title={label} aria-label={label} {...props}><Icon name={icon} />{children}</button>;
}

export function PopcanContent() {
  const canvasRef = useRef(null), previewRef = useRef(null), stageRef = useRef(null), engineRef = useRef(null);
  const pointerRef = useRef(null), cursorRef = useRef(null), inputRef = useRef(null), dialogRef = useRef(null);
  const aliveRef = useRef(false), readyRef = useRef(false), dirtyRef = useRef(false), titleRef = useRef('Untitled canvas');
  const saveTimer = useRef(0), saveVersion = useRef(0), saveChain = useRef(Promise.resolve());
  const [doc, setDoc] = useState(INITIAL_DOCUMENT), [ink, setInk] = useState(DEFAULT_INK);
  const [title, setTitle] = useState('Untitled canvas'), [ready, setReady] = useState(false), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [saveStatus, setSaveStatus] = useState('Opening local canvas…');
  const [notice, setNotice] = useState(''), [zoom, setZoom] = useState(1), [fit, setFit] = useState(0.5);
  const [inspectorOpen, setInspectorOpen] = useState(false), [modal, setModal] = useState(null);
  const [newFormat, setNewFormat] = useState('landscape'), [newPaper, setNewPaper] = useState('midnight');
  const scale = fit * zoom;
  const setOption = (key, value) => setInk((current) => ({ ...current, [key]: value }));
  const swapColors = () => setInk((current) => ({ ...current, colorA: current.colorB, colorB: current.colorA }));

  const save = useCallback(() => {
    if (!readyRef.current || !engineRef.current) return;
    const version = ++saveVersion.current;
    dirtyRef.current = true; setSaveStatus('Saving on this device…');
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const engine = engineRef.current;
      if (!engine || !aliveRef.current) return;
      const data = { ...engine.state(), title: titleRef.current };
      try {
        const blob = await engine.blob();
        saveChain.current = saveChain.current.catch(() => {}).then(async () => {
          if (version !== saveVersion.current || !aliveRef.current) return;
          await writeDraft({ ...data, blob });
          if (aliveRef.current && version === saveVersion.current) {
            dirtyRef.current = false; setSaveStatus('Saved on this device');
          }
        });
        await saveChain.current;
      } catch {
        if (aliveRef.current && version === saveVersion.current) setSaveStatus('Export to keep your work');
      }
    }, 350);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    let active = true;
    const generation = saveVersion;
    let engine;
    try {
      engine = new PopcanEngine(canvasRef.current, previewRef.current, (next) => { setDoc(next); save(); });
      engineRef.current = engine;
    } catch (failure) { setError(failure.message); return () => { aliveRef.current = false; }; }
    const open = async () => {
      try {
        const draft = await readDraft();
        if (draft?.blob) {
          const image = await loadImage(draft.blob);
          if (!active) return;
          engine.restore(image, draft);
          const restoredTitle = typeof draft.title === 'string' ? draft.title.slice(0, 80) : 'Untitled canvas';
          titleRef.current = restoredTitle; setTitle(restoredTitle); setNotice('Your last canvas is back.');
        }
        if (active) setSaveStatus('Local canvas · no upload');
      } catch { if (active) setSaveStatus('Local saving unavailable · export to keep'); }
      finally { if (active) { readyRef.current = true; setReady(true); } }
    };
    open();
    const beforeUnload = (event) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      active = false; aliveRef.current = false; readyRef.current = false; ++generation.current;
      clearTimeout(saveTimer.current); window.removeEventListener('beforeunload', beforeUnload);
      engine.destroy(); engineRef.current = null;
    };
  }, [save]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('popcan-route');
    const previousTitle = document.title;
    document.title = routeMetadata.popcan.title;
    return () => { html.classList.remove('popcan-route'); document.title = previousTitle; };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const measure = () => {
      if (!stage) return;
      setFit(Math.max(0.08, Math.min((stage.clientWidth - 48) / doc.width, (stage.clientHeight - 48) / doc.height, 1)));
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(stage); window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [doc.width, doc.height]);

  useEffect(() => {
    if (!modal) return;
    const dialog = dialogRef.current;
    dialog?.showModal?.();
    return () => dialog?.close?.();
  }, [modal]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const exportPng = useCallback(async () => {
    if (!engineRef.current || !readyRef.current) return;
    setBusy(true);
    try {
      const blob = await engineRef.current.blob(true);
      if (!aliveRef.current) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = exportName(titleRef.current); document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      setNotice('PNG exported at full canvas resolution.');
    } catch { if (aliveRef.current) setNotice('Export failed. Please try again.'); }
    finally { if (aliveRef.current) setBusy(false); }
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (!ready || busy || modal || event.defaultPrevented || event.altKey || event.target.closest?.('input, select, textarea, [contenteditable="true"]') || document.querySelector('.pc-studio')?.hasAttribute('inert')) return;
      const key = event.key.toLowerCase();
      if (event.metaKey || event.ctrlKey) {
        if (key === 'z' || key === 'y') { event.preventDefault(); engineRef.current.travel(key === 'y' || event.shiftKey ? 1 : -1); }
        if (key === 's') { event.preventDefault(); exportPng(); }
        return;
      }
      const tool = TOOLS.find((item) => item[2].toLowerCase() === key);
      if (tool) { event.preventDefault(); setInk((current) => ({ ...current, tool: tool[0] })); }
      if (key === 'x') { event.preventDefault(); setInk((current) => ({ ...current, colorA: current.colorB, colorB: current.colorA })); }
      if (key === '[' || key === ']') { event.preventDefault(); setInk((current) => ({ ...current, size: clamp(current.size + (key === ']' ? 4 : -4), 2, 160) })); }
      if (key === 'escape') { engineRef.current.cancel(); pointerRef.current = null; setInspectorOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ready, busy, modal, exportPng]);

  const updateCursor = (event) => {
    const cursor = cursorRef.current;
    if (!cursor) return;
    const rect = previewRef.current.getBoundingClientRect();
    cursor.style.left = `${event.clientX - rect.left}px`; cursor.style.top = `${event.clientY - rect.top}px`;
    cursor.style.opacity = event.pointerType === 'touch' ? '0' : '1';
  };
  const point = (event) => canvasPoint(event, previewRef.current.getBoundingClientRect(), doc.width, doc.height);
  const start = (event) => {
    if (!ready || busy || event.button !== 0 || pointerRef.current) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const position = point(event);
    pointerRef.current = { id: event.pointerId, tool: ink.tool, x: event.clientX, y: event.clientY,
      left: stageRef.current.scrollLeft, top: stageRef.current.scrollTop };
    if (ink.tool === 'pick') {
      const color = engineRef.current.pick(position);
      if (color) { setInk((current) => ({ ...current, colorA: color, gradient: 'solid', tool: 'brush' })); setNotice(`Picked ${color.toUpperCase()}`); }
      else setNotice('There is no pigment at this point.');
    } else if (ink.tool !== 'hand') engineRef.current.start(position, ink);
    updateCursor(event);
  };
  const move = (event) => {
    updateCursor(event);
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (pointer.tool === 'hand') {
      stageRef.current.scrollLeft = pointer.left - (event.clientX - pointer.x);
      stageRef.current.scrollTop = pointer.top - (event.clientY - pointer.y); return;
    }
    const events = event.nativeEvent.getCoalescedEvents?.() || [];
    if (events.length) events.slice(-64).forEach((sample) => engineRef.current.move(point(sample), event.shiftKey));
    else engineRef.current.move(point(event), event.shiftKey);
  };
  const end = (event, cancelled = false) => {
    if (pointerRef.current?.id !== event.pointerId) return;
    if (cancelled) engineRef.current.cancel();
    else {
      const finalPoint = point(event);
      if (event.pointerType === 'pen' && !event.pressure && engineRef.current.stroke) finalPoint.pressure = engineRef.current.stroke.last.pressure;
      engineRef.current.move(finalPoint, event.shiftKey); engineRef.current.finish();
    }
    pointerRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const importImage = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
      setNotice('Choose a PNG, JPEG or WebP under 12 MB.'); return;
    }
    setBusy(true);
    try {
      const image = await loadImage(file);
      if (image.naturalWidth * image.naturalHeight > 24000000) throw new Error('Choose an image smaller than 24 megapixels.');
      if (!aliveRef.current) return;
      engineRef.current.placeImage(image); setNotice('Image added. Undo will remove it.');
    } catch (failure) { if (aliveRef.current) setNotice(failure.message || 'This image could not be opened.'); }
    finally { if (aliveRef.current) setBusy(false); }
  };
  const newCanvas = (event) => {
    event.preventDefault(); engineRef.current.newDocument(newFormat, newPaper);
    titleRef.current = 'Untitled canvas'; setTitle('Untitled canvas'); save();
    setZoom(1); setModal(null); setNotice('Fresh canvas. Undo restores the previous one.');
  };
  const activeTool = TOOLS.find((item) => item[0] === ink.tool);
  const isShape = ['rectangle', 'ellipse'].includes(ink.tool);

  return <div className="popcan-page">
    <a className="pc-skip" href="#popcan-canvas">Skip to canvas</a>
    <NavMenu standalone />
    <main className="pc-studio" aria-label="Popular Canvas editor">
      <header className="pc-topbar">
        <div className="pc-identity"><span className="pc-logo"><Icon name="mark" size={27} /></span><div><h1>popcan<span>.</span></h1><p>POPULAR CANVAS</p></div></div>
        <div className="pc-document"><label className="pc-sr" htmlFor="pc-title">Canvas name</label><input id="pc-title" value={title} maxLength={80} onChange={(event) => { setTitle(event.target.value); titleRef.current = event.target.value; save(); }} /><span>{doc.width} × {doc.height} <span className="pc-document-kind">/ MORPHOGEN STUDIO</span></span></div>
        <div className="pc-actions">
          <div className="pc-history"><ToolButton icon="undo" label="Undo (Ctrl or ⌘ Z)" disabled={!doc.canUndo || busy || !ready} onClick={() => engineRef.current.travel(-1)} /><ToolButton icon="redo" label="Redo (Ctrl or ⌘ Shift Z)" disabled={!doc.canRedo || busy || !ready} onClick={() => engineRef.current.travel(1)} /></div>
          <ToolButton icon="plus" label="New canvas" disabled={!ready || busy} onClick={() => setModal('new')} />
          <ToolButton icon="upload" label="Import image" disabled={!ready || busy} onClick={() => inputRef.current.click()} />
          <ToolButton icon="download" label="Export PNG" className="pc-export" disabled={!ready || busy} onClick={exportPng}><span>Export PNG</span></ToolButton>
          <input ref={inputRef} className="pc-sr" tabIndex={-1} type="file" aria-label="Image to import" accept="image/png,image/jpeg,image/webp" onChange={importImage} />
        </div>
      </header>
      <div className="pc-workspace">
        <div className="pc-tools" role="toolbar" aria-label="Drawing tools">
          {TOOLS.map(([tool, label, shortcut]) => <ToolButton key={tool} icon={tool} label={`${label} (${shortcut})`} aria-pressed={ink.tool === tool} className={ink.tool === tool ? 'is-active' : ''} onClick={() => setOption('tool', tool)} />)}
          <div className="pc-tool-spacer" />
          <ToolButton icon="help" label="Keyboard shortcuts and help" onClick={() => setModal('help')} />
        </div>
        <section className="pc-stage" ref={stageRef} aria-label="Canvas workspace">
          <div className="pc-board-space" style={{ minWidth: doc.width * scale + 48, minHeight: doc.height * scale + 48 }}>
            <div className={`pc-artboard ${doc.paper === 'transparent' ? 'is-transparent' : ''}`} data-tool={ink.tool} style={{ width: doc.width * scale, height: doc.height * scale, '--pc-paper': doc.paper, '--pc-paper-ink': doc.paper === PAPERS.midnight ? '#eeeaf0' : '#37323e' }}>
              <canvas ref={canvasRef} className="pc-paint" aria-hidden="true" />
              <canvas ref={previewRef} id="popcan-canvas" className="pc-preview" role="img" aria-label="Drawing canvas" aria-describedby="pc-canvas-help" tabIndex={0}
                onPointerDown={start} onPointerMove={move} onPointerUp={(event) => end(event)} onPointerCancel={(event) => end(event, true)}
                onLostPointerCapture={(event) => end(event, true)} onPointerLeave={() => { if (cursorRef.current) cursorRef.current.style.opacity = '0'; }} onContextMenu={(event) => event.preventDefault()} />
              <span ref={cursorRef} className="pc-cursor" aria-hidden="true" style={{ width: Math.max(4, ink.size * scale), height: Math.max(4, ink.size * scale) }} />
              {!doc.hasInk && !busy && ready && <div className="pc-empty" aria-hidden="true"><Icon name="mark" size={40} /><span>A little space to make something.</span><small>Pick a colour. Leave a mark.</small></div>}
              {(!ready || busy || error) && <div className="pc-canvas-message" role="status">{error || (busy ? 'Preparing your image…' : 'Opening your canvas…')}</div>}
            </div>
          </div>
        </section>
        <aside className={`pc-inspector ${inspectorOpen ? 'is-open' : ''}`} id="pc-inspector" aria-label="Brush and canvas settings">
          <div className="pc-panel-heading"><span>The essentials</span><ToolButton className="pc-panel-close" icon="close" label="Close brush settings" onClick={() => setInspectorOpen(false)} /></div>
          <fieldset className="pc-group"><legend>01 / PIGMENT</legend>
            <div className="pc-pigment-preview" style={{ background: ink.gradient === 'solid' ? ink.colorA : `linear-gradient(115deg, ${ink.colorA}, ${ink.colorB})` }}><span>{ink.material === 'sand' ? 'SAND / ' : 'INK / '}{ink.gradient.toUpperCase()}</span></div>
            <div className="pc-colors"><label><input type="color" aria-label="Primary colour" value={ink.colorA} onChange={(event) => setOption('colorA', event.target.value)} /><span>{ink.colorA.toUpperCase()}</span></label><ToolButton icon="swap" label="Swap colours (X)" onClick={swapColors} /><label><input type="color" aria-label="Secondary colour" value={ink.colorB} onChange={(event) => setOption('colorB', event.target.value)} /><span>{ink.colorB.toUpperCase()}</span></label></div>
            <div className="pc-palettes" aria-label="Colour palettes">{PALETTES.map(([name, a, b]) => <button type="button" key={name} title={name} aria-label={`Use ${name} palette`} aria-pressed={ink.colorA === a && ink.colorB === b} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} onClick={() => setInk((current) => ({ ...current, colorA: a, colorB: b }))} />)}</div>
            <label className="pc-field">Colour flow<select aria-label="Colour flow" value={ink.gradient} onChange={(event) => setOption('gradient', event.target.value)}><option value="flow">Organic flow</option><option value="linear">Linear blend</option><option value="radial">Radial blend</option><option value="solid">Solid colour</option></select></label>
          </fieldset>
          <fieldset className="pc-group"><legend>02 / BRUSH</legend>
            <div className="pc-segment" aria-label="Brush material">{['sand', 'ink'].map((material) => <button type="button" key={material} aria-pressed={ink.material === material} onClick={() => setOption('material', material)}>{material === 'sand' ? 'Sand' : 'Ink'}</button>)}</div>
            <label className="pc-range"><span>Size <output>{ink.size} px</output></span><input type="range" aria-label="Brush size" min="2" max="160" value={ink.size} onChange={(event) => setOption('size', Number(event.target.value))} /></label>
            <label className="pc-range"><span>Opacity <output>{Math.round(ink.opacity * 100)}%</output></span><input type="range" aria-label="Brush opacity" min="5" max="100" value={ink.opacity * 100} onChange={(event) => setOption('opacity', Number(event.target.value) / 100)} /></label>
            {ink.material === 'sand' && <label className="pc-range"><span>Grain <output>{Math.round(ink.grain * 100)}%</output></span><input type="range" aria-label="Sand grain" min="0" max="100" value={ink.grain * 100} onChange={(event) => setOption('grain', Number(event.target.value) / 100)} /></label>}
            {isShape && <label className="pc-check"><input type="checkbox" checked={ink.filled} onChange={(event) => setOption('filled', event.target.checked)} /> Filled shape</label>}
            {ink.tool === 'fill' && <p className="pc-hint">Fill uses your primary colour at full opacity.</p>}
          </fieldset>
          <fieldset className="pc-group pc-paper-group"><legend>03 / SURFACE</legend><div className="pc-papers">{Object.entries(PAPERS).map(([name, color]) => <button key={name} type="button" aria-label={`${PAPER_LABELS[name]} canvas`} aria-pressed={doc.paper === color} title={PAPER_LABELS[name]} className={name === 'transparent' ? 'is-transparent' : ''} style={{ backgroundColor: color }} disabled={!ready || busy} onClick={() => engineRef.current.setPaper(color)} />)}</div><p className="pc-hint">{Object.entries(PAPERS).find(([, value]) => value === doc.paper)?.[0] === 'transparent' ? 'Transparent PNG. Just your marks.' : 'Your surface is included in the PNG.'}</p></fieldset>
          <a className="pc-origin" href="/dither-canvas">Born in Morphogen Divide <span aria-hidden="true">↗</span></a>
        </aside>
      </div>
      <footer className="pc-statusbar">
        <div className="pc-status"><span className={`pc-status-dot ${dirtyRef.current ? 'is-pending' : ''}`} /><span role="status">{notice || saveStatus}</span></div>
        <span className="pc-tool-status" id="pc-canvas-help">{activeTool[1]}<span> / </span>{isShape || ink.tool === 'line' ? 'Shift to constrain' : 'Made of small things'}</span>
        <div className="pc-view-controls"><ToolButton className="pc-settings-toggle" icon="sliders" label="Brush settings" aria-expanded={inspectorOpen} aria-controls="pc-inspector" onClick={() => setInspectorOpen((open) => !open)} /><ToolButton icon="minus" label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} /><button type="button" className="pc-zoom-value" title="Fit canvas to workspace" aria-label="Fit canvas to workspace" onClick={() => setZoom(1)}>{Math.round(scale * 100)}%</button><ToolButton icon="plus" label="Zoom in" disabled={zoom >= 4} onClick={() => setZoom((value) => Math.min(4, value + 0.25))} /><ToolButton className="pc-fit" icon="fit" label="Reset canvas view" onClick={() => { setZoom(1); stageRef.current.scrollTo?.(0, 0); }} /></div>
      </footer>
    </main>
    {modal && <dialog ref={dialogRef} className="pc-dialog" aria-labelledby="pc-dialog-title" onCancel={() => setModal(null)} onClick={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
      <div className="pc-dialog-heading"><h2 id="pc-dialog-title">{modal === 'new' ? 'A fresh canvas.' : 'Less menu. More making.'}</h2><ToolButton icon="close" label="Close dialog" onClick={() => setModal(null)} /></div>
      {modal === 'new' ? <form onSubmit={newCanvas}><p>Your current canvas stays in undo history. Export a PNG to keep a separate copy.</p><label className="pc-field">Canvas format<select aria-label="Canvas format" value={newFormat} onChange={(event) => setNewFormat(event.target.value)}>{Object.entries(FORMATS).map(([name, dimensions]) => <option key={name} value={name}>{name[0].toUpperCase() + name.slice(1)} · {dimensions.join(' × ')}</option>)}</select></label><label className="pc-field">Canvas surface<select aria-label="Canvas surface" value={newPaper} onChange={(event) => setNewPaper(event.target.value)}>{Object.keys(PAPERS).map((name) => <option key={name} value={name}>{PAPER_LABELS[name]}</option>)}</select></label><button className="pc-primary" type="submit">Create canvas <span aria-hidden="true">↗</span></button></form> : <><p>Morphogen-inspired pigment, without the drift. Draw with a mouse, touch or pressure-sensitive pen. Zoom in, then use Hand to move around.</p><dl>{SHORTCUTS.map(([key, action]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{action}</dd></div>)}</dl><p className="pc-hint">One draft is saved in this browser when storage is available. Nothing is uploaded. Export your favourites before starting over.</p></>}
    </dialog>}
  </div>;
}

export default function PopcanPage() {
  return <ThemeProvider enableBackground={false}><PopcanContent /></ThemeProvider>;
}
