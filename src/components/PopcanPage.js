import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ThemeProvider, useThemeMode } from '../contexts/ThemeContext';
import { useAppNavigation } from '../contexts/AppNavigationContext';
import routeMetadata from '../content/routeMetadata.json';
import NavMenu from './NavMenu';
import Icon from './popcan/PopcanIcon';
import { PopcanEngine, DEFAULT_INK, FORMATS, PAPERS, clamp } from './popcan/popcanEngine';
import { readDraft, writeDraft, loadImage, exportName } from './popcan/popcanStorage';
import { MIN_ZOOM, MAX_ZOOM, screenPoint, zoomView, panView, TEXT_FONTS, rasterFrame } from './popcan/popcanView';
import popcanLogo from '../assets/img/popcan-logo.png';
import './PopcanPage.css';

const TOOLS = [
  ['select', 'Select & move', 'V'],
  ['brush', 'Brush', 'B'], ['eraser', 'Eraser', 'E'], ['line', 'Line', 'L'],
  ['rectangle', 'Rectangle', 'R'], ['ellipse', 'Ellipse', 'O'], ['fill', 'Fill', 'G'],
  ['text', 'Text', 'T'], ['pick', 'Colour picker', 'I'], ['hand', 'Hand', 'H'],
];
const PALETTES = [
  ['Aurora', '#24ccff', '#ff56d6'], ['Tide', '#04d5b4', '#3075ff'],
  ['Ember', '#ff7348', '#ff42a1'], ['Iris', '#a794ff', '#4bcfe2'],
  ['Dune', '#f4c89b', '#cc768d'], ['Graphite', '#eeeeef', '#76768e'],
];
const PAPER_LABELS = { theme: 'Match theme', midnight: 'Midnight', warm: 'Warm paper', white: 'White', transparent: 'Transparent' };
const SHORTCUTS = [['V', 'Select and drag an item'], ['Arrow keys', 'Move selection (Shift: 10 px)'], ['Page Up / Down', 'Select previous / next item'], ['Delete', 'Remove selected item'], ['B / E', 'Brush / eraser'], ['L / R / O', 'Line / rectangle / ellipse'], ['G / I / H', 'Fill / colour picker / hand'], ['T', 'Place text'], ['Scroll / pinch', 'Zoom at the pointer'], ['Space + drag', 'Move the canvas'], ['+ / − / 0', 'Zoom in / out / fit all'], ['[ / ]', 'Smaller / larger brush'], ['X', 'Swap colours'], ['Shift + drag', 'Square, circle or 45° line'], ['⌘ or Ctrl + Z', 'Undo'], ['⌘ or Ctrl + Shift + Z', 'Redo'], ['⌘ or Ctrl + S', 'Export PNG'], ['Escape', 'Cancel current stroke']];
const INITIAL_DOCUMENT = { originX: 0, originY: 0, width: 1200, height: 800, paper: PAPERS.theme, hasInk: false, canUndo: false, canRedo: false };

function ToolButton({ icon, label, children, className = '', ...props }) {
  return <button type="button" className={`pc-button ${className}`} title={label} aria-label={label} {...props}><Icon name={icon} />{children}</button>;
}

export function PopcanContent() {
  const navigation = useAppNavigation();
  const getToolState = navigation?.getToolState;
  const saveToolState = navigation?.saveToolState;
  const { isDark } = useThemeMode();
  const themeRef = useRef(isDark); themeRef.current = isDark;
  const canvasRef = useRef(null), previewRef = useRef(null), stageRef = useRef(null), engineRef = useRef(null);
  const pageRef = useRef(null), topbarRef = useRef(null), viewRef = useRef({ x: 0, y: 0, scale: 1 });
  const touchesRef = useRef(new Map()), pinchRef = useRef(null), spaceRef = useRef(false);
  const pointerRef = useRef(null), cursorRef = useRef(null), inputRef = useRef(null), dialogRef = useRef(null);
  const gestureHandlersRef = useRef(null);
  const aliveRef = useRef(false), readyRef = useRef(false), dirtyRef = useRef(false), titleRef = useRef('Untitled canvas');
  const saveTimer = useRef(0), saveVersion = useRef(0), saveChain = useRef(Promise.resolve());
  const [doc, setDoc] = useState(INITIAL_DOCUMENT), [ink, setInk] = useState(DEFAULT_INK);
  const [title, setTitle] = useState('Untitled canvas'), [ready, setReady] = useState(false), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [saveStatus, setSaveStatus] = useState('Opening local canvas…');
  const [notice, setNotice] = useState(''), [view, setView] = useState(viewRef.current), [spacePan, setSpacePan] = useState(false);
  const [text, setText] = useState(''), [textPoint, setTextPoint] = useState(null), [textError, setTextError] = useState('');
  const [textStyle, setTextStyle] = useState({ font: 'sans', size: 48, bold: false, color: DEFAULT_INK.colorA });
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth > 760), [modal, setModal] = useState(null);
  const [newFormat, setNewFormat] = useState('landscape'), [newPaper, setNewPaper] = useState('theme');
  const lastViewport = useRef(viewport);
  const scale = view.scale;
  const paper = doc.paper === PAPERS.theme ? (isDark ? PAPERS.midnight : PAPERS.warm) : doc.paper;
  const renderFrame = doc.renderFrame || { originX: doc.originX, originY: doc.originY, width: doc.width, height: doc.height };
  useLayoutEffect(() => { engineRef.current?.setTheme(isDark); }, [isDark]);
  useLayoutEffect(() => {
    engineRef.current?.setViewport(view, viewport.width, viewport.height);
  }, [view, viewport, ready]);
  const applyView = useCallback((next) => { viewRef.current = next; setView(next); }, []);
  const cancelGesture = useCallback(() => {
    const pointer = pointerRef.current;
    engineRef.current?.cancel(); pointerRef.current = null; pinchRef.current = null;
    const stage = stageRef.current;
    const ids = new Set(touchesRef.current.keys()); if (pointer) ids.add(pointer.id);
    for (const id of ids) if (stage?.hasPointerCapture?.(id)) stage.releasePointerCapture(id);
    touchesRef.current.clear();
    if (cursorRef.current) cursorRef.current.style.opacity = '0';
  }, []);
  const resetView = useCallback(() => {
    cancelGesture();
    const engine = engineRef.current, stage = stageRef.current;
    if (!engine || !stage) return;
    // Consume a resize that may not have reached ResizeObserver yet. Otherwise
    // its later effect would recenter this freshly fitted view a second time.
    lastViewport.current = { width: stage.clientWidth, height: stage.clientHeight };
    setViewport(lastViewport.current);
    const top = Math.min(stage.clientHeight / 3, topbarRef.current?.getBoundingClientRect().bottom || 0) + 16;
    const height = Math.max(150, stage.clientHeight - top - 100);
    const scale = clamp(Math.min((stage.clientWidth - 64) / engine.width, height / engine.height), MIN_ZOOM, MAX_ZOOM);
    applyView({ scale, x: (stage.clientWidth - engine.width * scale) / 2 - engine.originX * scale,
      y: top + (height - engine.height * scale) / 2 - engine.originY * scale });
  }, [applyView, cancelGesture]);
  const changeZoom = useCallback((factor, anchor) => {
    cancelGesture();
    const stage = stageRef.current;
    applyView(zoomView(viewRef.current, viewRef.current.scale * factor, anchor || { x: stage.clientWidth / 2, y: stage.clientHeight / 2 }));
  }, [applyView, cancelGesture]);
  const setOption = (key, value) => {
    if (key === 'tool') cancelGesture();
    setInk((current) => ({ ...current, [key]: value }));
  };
  const swapColors = () => setInk((current) => ({ ...current, colorA: current.colorB, colorB: current.colorA }));

  const save = useCallback(() => {
    if (!readyRef.current || !engineRef.current) return;
    const version = ++saveVersion.current;
    dirtyRef.current = true; setSaveStatus('Saving on this device…');
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const engine = engineRef.current;
      if (!engine || !aliveRef.current) return;
      const savedTitle = titleRef.current;
      try {
        const data = await engine.draft();
        saveChain.current = saveChain.current.catch(() => {}).then(async () => {
          if (version !== saveVersion.current || !aliveRef.current) return;
          await writeDraft({ ...data, title: savedTitle });
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
      engine = new PopcanEngine(canvasRef.current, previewRef.current, (next, transient = false, engineNotice = '') => {
        setDoc(next); if (engineNotice) setNotice(engineNotice); if (!transient) save();
      });
      engine.setTheme(themeRef.current); engineRef.current = engine;
    } catch (failure) { setError(failure.message); return () => { aliveRef.current = false; }; }
    const open = async () => {
      try {
        const draft = await getToolState?.('popcan') || await readDraft();
        if (draft?.blob) {
          const image = await loadImage(draft.blob);
          if (!active) return;
          const restoredNotice = await engine.restore(image, draft);
          if (!active) return;
          const restoredTitle = typeof draft.title === 'string' ? draft.title.slice(0, 80) : 'Untitled canvas';
          titleRef.current = restoredTitle; setTitle(restoredTitle); setNotice(restoredNotice || 'Your last canvas is back.');
        }
        if (active) setSaveStatus('Local canvas · no upload');
      } catch { if (active) setSaveStatus('Local saving unavailable · export to keep'); }
      finally { if (active) { readyRef.current = true; setReady(true); resetView(); } }
    };
    open();
    const beforeUnload = (event) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      if (readyRef.current && saveToolState) {
        const title = titleRef.current;
        // draft() captures the committed frame synchronously, then encodes it.
        // Retain that promise before releasing the engine, including a recent
        // stroke whose debounced device save has not completed yet.
        saveToolState('popcan', engine.draft().then(data => ({ ...data, title })).catch(() => null));
      }
      active = false; aliveRef.current = false; readyRef.current = false; ++generation.current;
      clearTimeout(saveTimer.current); window.removeEventListener('beforeunload', beforeUnload);
      engine.destroy(); engineRef.current = null;
    };
  }, [save, resetView, getToolState, saveToolState]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('popcan-route');
    const previousTitle = document.title;
    document.title = routeMetadata.popcan.title;
    return () => { html.classList.remove('popcan-route'); document.title = previousTitle; };
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current, page = pageRef.current;
    const nav = page.querySelector('.nav-header'), topbar = topbarRef.current;
    const measure = () => {
      // The navigation and floating controls never subtract from drawing space.
      page.style.setProperty('--pc-nav-height', `${nav?.getBoundingClientRect().height || 0}px`);
      page.style.setProperty('--pc-chrome-bottom', `${topbar.getBoundingClientRect().bottom + 12}px`);
      const width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight);
      setViewport((current) => current.width === width && current.height === height ? current : { width, height });
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    [stage, nav, topbar].forEach((element) => { if (element) observer?.observe(element); });
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  useLayoutEffect(() => {
    const previous = lastViewport.current;
    if (previous.width !== viewport.width || previous.height !== viewport.height) {
      cancelGesture();
      applyView(panView(viewRef.current, (viewport.width - previous.width) / 2, (viewport.height - previous.height) / 2));
    }
    lastViewport.current = viewport;
  }, [viewport, cancelGesture, applyView]);

  useEffect(() => {
    const stage = stageRef.current;
    const onWheel = (event) => {
      if (!ready || busy || modal || stage.closest('[inert]')) return;
      event.preventDefault();
      // A pointer gesture owns the canvas until it ends. Trackpads can keep
      // emitting wheel/momentum events during a press, including zero deltas.
      // Consume those events without cancelling the mark or moving its camera.
      if (pointerRef.current || touchesRef.current.size || pinchRef.current) return;
      if (!event.deltaX && !event.deltaY) return;
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1;
      if (event.shiftKey && !event.ctrlKey) {
        cancelGesture(); applyView(panView(viewRef.current, -(event.deltaX || event.deltaY) * units, 0));
      } else {
        if (!event.deltaY) return;
        const rect = stage.getBoundingClientRect();
        changeZoom(Math.exp(-clamp(event.deltaY * units, -1000, 1000) * 0.002), { x: event.clientX - rect.left, y: event.clientY - rect.top });
      }
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [ready, busy, modal, cancelGesture, changeZoom, applyView]);

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
      const state = engineRef.current.state(true);
      const frame = rasterFrame({ left: state.originX, top: state.originY, right: state.originX + state.width, bottom: state.originY + state.height });
      setNotice(frame.pixelSize === 1 ? 'PNG exported at full canvas resolution.' : `PNG exported at ${frame.pixelWidth} × ${frame.pixelHeight}. Individual items retain their stored detail.`);
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
      if (tool) { event.preventDefault(); cancelGesture(); setInk((current) => ({ ...current, tool: tool[0] })); }
      if (key === 'x') { event.preventDefault(); setInk((current) => ({ ...current, colorA: current.colorB, colorB: current.colorA })); }
      if (key === '[' || key === ']') { event.preventDefault(); setInk((current) => ({ ...current, size: clamp(current.size + (key === ']' ? 4 : -4), 2, 160) })); }
      if (key === 'escape') { cancelGesture(); engineRef.current.select(null); setInspectorOpen(false); }
      if (ink.tool === 'select' && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'delete', 'backspace', 'pageup', 'pagedown'].includes(key)) {
        event.preventDefault(); cancelGesture();
        try {
          const engine = engineRef.current, step = event.shiftKey ? 10 : 1;
          if (key === 'delete' || key === 'backspace') engine.deleteSelection();
          else if (key === 'pageup' || key === 'pagedown') engine.cycleSelection(key === 'pagedown' ? 1 : -1);
          else engine.nudge(key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0);
        } catch (failure) { setNotice(failure.message); }
      }
      if (event.code === 'Space' && !event.target.closest?.('button, a')) { event.preventDefault(); spaceRef.current = true; setSpacePan(true); }
      if (key === '+' || key === '=') { event.preventDefault(); changeZoom(1.25); }
      if (key === '-') { event.preventDefault(); changeZoom(0.8); }
      if (key === '0') { event.preventDefault(); resetView(); }
    };
    const releaseSpace = (event) => { if (!event || event.code === 'Space') { spaceRef.current = false; setSpacePan(false); } };
    const onBlur = () => { releaseSpace(); cancelGesture(); };
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', releaseSpace); window.addEventListener('blur', onBlur);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', releaseSpace); window.removeEventListener('blur', onBlur); };
  }, [ready, busy, modal, ink.tool, exportPng, cancelGesture, changeZoom, resetView]);

  const updateCursor = (event) => {
    const cursor = cursorRef.current;
    if (!cursor) return;
    const rect = stageRef.current.getBoundingClientRect();
    cursor.style.left = `${event.clientX - rect.left}px`; cursor.style.top = `${event.clientY - rect.top}px`;
    cursor.style.opacity = event.pointerType === 'touch' || pinchRef.current ? '0' : '1';
  };
  const point = (event) => {
    const rect = stageRef.current.getBoundingClientRect();
    return { ...screenPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top }, viewRef.current),
      pressure: event.pointerType === 'pen' && event.pressure > 0 ? clamp(event.pressure, 0.1, 1) : 1 };
  };
  const safeDraw = (action) => {
    try { action(); } catch (failure) { cancelGesture(); setNotice(failure.message || 'That mark could not be added. Your canvas is unchanged.'); }
  };
  const start = (event) => {
    if (!ready || busy || modal || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault();
    // A new mouse press starts a new gesture even if its previous up was lost.
    if (event.pointerType !== 'touch' && pointerRef.current?.id === event.pointerId) cancelGesture();
    if (document.activeElement !== event.currentTarget) event.currentTarget.focus({ preventScroll: true });
    if (event.pointerType === 'touch') {
      if (touchesRef.current.size >= 2) return;
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (touchesRef.current.size === 2) {
      engineRef.current.cancel(); pointerRef.current = null;
      const [a, b] = [...touchesRef.current.values()];
      const rect = stageRef.current.getBoundingClientRect();
      const centre = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
      pinchRef.current = { world: screenPoint(centre, viewRef.current), scale: viewRef.current.scale, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
      if (cursorRef.current) cursorRef.current.style.opacity = '0';
      return;
    }
    if (pointerRef.current || pinchRef.current) return;
    const position = point(event), tool = spaceRef.current || event.button === 1 ? 'hand' : ink.tool;
    pointerRef.current = { id: event.pointerId, startedAt: event.timeStamp, tool, x: event.clientX, y: event.clientY, view: viewRef.current, position };
    if (tool === 'pick') {
      const color = engineRef.current.pick(position);
      if (color) { setInk((current) => ({ ...current, colorA: color, gradient: 'solid', tool: 'brush' })); setNotice(`Picked ${color.toUpperCase()}`); }
      else setNotice('There is no pigment at this point.');
    } else if (tool !== 'hand' && tool !== 'text' && tool !== 'fill') safeDraw(() => engineRef.current.start(position, { ...ink, hitTolerance: 6 / viewRef.current.scale }));
    updateCursor(event);
  };
  const move = (event) => {
    if (touchesRef.current.has(event.pointerId)) touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchRef.current) {
      if (touchesRef.current.size === 2) {
        const [a, b] = [...touchesRef.current.values()], pinch = pinchRef.current;
        const rect = stageRef.current.getBoundingClientRect();
        const scale = clamp(pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance, MIN_ZOOM, MAX_ZOOM);
        applyView({ scale, x: (a.x + b.x) / 2 - rect.left - pinch.world.x * scale, y: (a.y + b.y) / 2 - rect.top - pinch.world.y * scale });
      }
      return;
    }
    updateCursor(event);
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (pointer.tool === 'hand') { applyView(panView(pointer.view, event.clientX - pointer.x, event.clientY - pointer.y)); return; }
    if (pointer.tool === 'text' || pointer.tool === 'pick') return;
    if (pointer.tool === 'select') { safeDraw(() => engineRef.current.move(point(event), event.shiftKey)); return; }
    safeDraw(() => {
      const events = (event.nativeEvent || event).getCoalescedEvents?.() || [];
      if (events.length) events.slice(-64).forEach((sample) => engineRef.current.move(point(sample), event.shiftKey));
      else engineRef.current.move(point(event), event.shiftKey);
    });
  };
  const end = (event, cancelled = false) => {
    const active = pointerRef.current;
    if (active?.id === event.pointerId && event.timeStamp < active.startedAt) return;
    touchesRef.current.delete(event.pointerId);
    if (pinchRef.current) { if (!touchesRef.current.size) pinchRef.current = null; }
    else if (pointerRef.current?.id === event.pointerId) {
      const pointer = pointerRef.current;
      // Retire the gesture before committing or emitting React updates. Capture
      // release is bookkeeping, not a second chance to cancel a completed mark.
      pointerRef.current = null;
      if (cancelled) engineRef.current.cancel();
      else if (pointer.tool === 'text') {
        setTextPoint(pointer.position); setText(''); setTextError(''); setTextStyle((current) => ({ ...current, color: ink.colorA })); setModal('text');
      } else if (pointer.tool === 'fill') safeDraw(() => engineRef.current.fill(pointer.position, ink.colorA));
      else if (pointer.tool !== 'hand' && pointer.tool !== 'pick') safeDraw(() => {
        const finalPoint = point(event);
        if (event.pointerType === 'pen' && !event.pressure && engineRef.current.stroke) finalPoint.pressure = engineRef.current.stroke.last.pressure;
        engineRef.current.move(finalPoint, event.shiftKey); engineRef.current.finish();
      });
      pointerRef.current = null;
    }
    const stage = stageRef.current;
    if (stage?.hasPointerCapture?.(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  };
  gestureHandlersRef.current = { start, move, end };
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const onPointerDown = (event) => gestureHandlersRef.current.start(event);
    const onPointerMove = (event) => {
      const active = pointerRef.current?.id === event.pointerId || touchesRef.current.has(event.pointerId) || pinchRef.current;
      if (active && event.cancelable) event.preventDefault();
      if (active || event.target === stage || stage.contains(event.target)) gestureHandlersRef.current.move(event);
    };
    const onPointerUp = (event) => gestureHandlersRef.current.end(event);
    const onPointerCancel = (event) => gestureHandlersRef.current.end(event, true);
    const onPointerLeave = () => { if (!pointerRef.current && cursorRef.current) cursorRef.current.style.opacity = '0'; };
    // Pointer capture improves delivery but is not authoritative. Browsers and
    // input drivers may release it between press and release; window listeners
    // still own and finish the active gesture instead of discarding the mark.
    stage.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerCancel, true);
    stage.addEventListener('pointerleave', onPointerLeave);
    return () => {
      stage.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerCancel, true);
      stage.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);
  const addText = (event) => {
    event.preventDefault();
    try {
      if (engineRef.current.addText(textPoint, text, textStyle)) { setModal(null); setInk((current) => ({ ...current, tool: 'select' })); setNotice('Text added. Drag it to move it.'); }
    } catch (failure) { setTextError(failure.message); }
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
      engineRef.current.placeImage(image); setInk((current) => ({ ...current, tool: 'select' })); setNotice('Image added. Drag it to move it.');
    } catch (failure) { if (aliveRef.current) setNotice(failure.message || 'This image could not be opened.'); }
    finally { if (aliveRef.current) setBusy(false); }
  };
  const newCanvas = (event) => {
    event.preventDefault(); engineRef.current.newDocument(newFormat, newPaper);
    titleRef.current = 'Untitled canvas'; setTitle('Untitled canvas'); save();
    resetView(); setModal(null); setNotice('Fresh canvas. Undo restores the previous one.');
  };
  const activeTool = TOOLS.find((item) => item[0] === ink.tool);
  const isShape = ['rectangle', 'ellipse'].includes(ink.tool);
  const selection = ink.tool === 'select' ? doc.selection : null;
  const selectionLabel = selection?.kind === 'legacy' ? 'Earlier artwork' : selection ? selection.kind[0].toUpperCase() + selection.kind.slice(1) : '';

  return <div className="popcan-page" ref={pageRef}>
    <a className="pc-skip" href="#popcan-canvas">Skip to canvas</a>
    <NavMenu standalone />
    <main className="pc-studio" aria-label="Popular Canvas editor">
      <header className="pc-topbar" ref={topbarRef}>
        <div className="pc-identity"><span className="pc-logo" aria-hidden="true"><img src={popcanLogo} alt="" /></span><div><h1>popcan<span>.</span></h1><p>POPULAR CANVAS</p></div></div>
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
        <section className={`pc-stage ${doc.paper === 'transparent' ? 'is-transparent' : ''}`} ref={stageRef}
          id="popcan-canvas" role="img" aria-label="Drawing canvas" aria-describedby="pc-canvas-help" tabIndex={0}
          data-tool={spacePan ? 'hand' : ink.tool} data-scale={scale} data-view-x={view.x} data-view-y={view.y}
          data-origin-x={doc.originX} data-origin-y={doc.originY} data-object-count={doc.objectCount || 0}
          data-compaction-count={doc.compactionCount || 0}
          style={{ backgroundColor: paper, '--pc-paper-ink': paper === PAPERS.midnight ? '#eeeaf0' : '#37323e' }}
          onContextMenu={(event) => event.preventDefault()}>
          <div className="pc-artboard" style={{ width: renderFrame.width, height: renderFrame.height,
            transform: `translate(${view.x + renderFrame.originX * scale}px, ${view.y + renderFrame.originY * scale}px) scale(${scale})` }}>
            <canvas ref={canvasRef} className="pc-paint" aria-hidden="true" />
            <canvas ref={previewRef} className="pc-preview" aria-hidden="true" />
          </div>
          {selection && <div className="pc-selection" aria-hidden="true" data-selection-id={selection.id}
            style={{ left: view.x + selection.x * scale - 4, top: view.y + selection.y * scale - 4,
              width: selection.width * scale + 8, height: selection.height * scale + 8 }} />}
          <span ref={cursorRef} className="pc-cursor" aria-hidden="true" style={{ width: Math.max(4, ink.size * scale), height: Math.max(4, ink.size * scale) }} />
          {!doc.hasInk && !busy && ready && <div className="pc-empty" aria-hidden="true"><Icon name="mark" size={40} /><span>The whole page is your canvas.</span><small>Draw. Scroll to zoom. Drag with Hand to explore.</small></div>}
          {(!ready || busy || error) && <div className="pc-canvas-message" role="status">{error || (busy ? 'Preparing your image…' : 'Opening your canvas…')}</div>}
        </section>
        {selection && <div className="pc-selection-actions" role="group" aria-label="Selected item actions">
          <span role="status">{selectionLabel} selected</span>
          <ToolButton icon="trash" label="Delete selected item" disabled={!ready || busy} onClick={() => { cancelGesture(); engineRef.current.deleteSelection(); }} />
          <ToolButton icon="close" label="Deselect item" onClick={() => { cancelGesture(); engineRef.current.select(null); }} />
        </div>}
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
          <fieldset className="pc-group pc-paper-group"><legend>03 / SURFACE</legend><div className="pc-papers">{Object.entries(PAPERS).map(([name, color]) => <button key={name} type="button" aria-label={`${PAPER_LABELS[name]} canvas`} aria-pressed={doc.paper === color} title={PAPER_LABELS[name]} className={name === 'transparent' ? 'is-transparent' : ''} style={{ background: name === 'theme' ? 'linear-gradient(135deg, #fff8f7 50%, #111116 50%)' : color }} disabled={!ready || busy} onClick={() => engineRef.current.setPaper(color)} />)}</div><p className="pc-hint">{Object.entries(PAPERS).find(([, value]) => value === doc.paper)?.[0] === 'transparent' ? 'Transparent PNG. Just your marks.' : doc.paper === PAPERS.theme ? 'Follows light and dark mode. Export includes the current surface.' : 'Your surface is included in the PNG.'}</p></fieldset>
          <a className="pc-origin" href="/dither-canvas">Born in Morphogen Divide <span aria-hidden="true">↗</span></a>
        </aside>
      </div>
      <footer className="pc-statusbar">
        <div className="pc-status"><span className={`pc-status-dot ${dirtyRef.current ? 'is-pending' : ''}`} /><span role="status">{notice || saveStatus}</span></div>
        <span className="pc-tool-status" id="pc-canvas-help">{activeTool[1]}<span> / </span>{ink.tool === 'select' ? 'Click a mark, then drag' : isShape || ink.tool === 'line' ? 'Shift to constrain' : ink.tool === 'text' ? 'Click to place text' : 'Scroll to zoom · Space to pan'}</span>
        <div className="pc-view-controls"><ToolButton className="pc-settings-toggle" icon="sliders" label="Brush settings" aria-expanded={inspectorOpen} aria-controls="pc-inspector" onClick={() => setInspectorOpen((open) => !open)} /><ToolButton icon="hand" label="Move canvas (H)" aria-pressed={ink.tool === 'hand'} onClick={() => setOption('tool', ink.tool === 'hand' ? 'brush' : 'hand')} /><ToolButton icon="minus" label="Zoom out" disabled={scale <= MIN_ZOOM} onClick={() => changeZoom(0.8)} /><button type="button" className="pc-zoom-value" title="Fit all artwork (0)" aria-label="Fit all artwork" onClick={resetView}>{Math.round(scale * 100)}%</button><ToolButton icon="plus" label="Zoom in" disabled={scale >= MAX_ZOOM} onClick={() => changeZoom(1.25)} /><ToolButton className="pc-fit" icon="fit" label="Reset canvas view" onClick={resetView} /></div>
      </footer>
    </main>
    {modal && <dialog ref={dialogRef} className="pc-dialog" aria-labelledby="pc-dialog-title" onCancel={() => setModal(null)} onClick={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
      <div className="pc-dialog-heading"><h2 id="pc-dialog-title">{modal === 'new' ? 'A fresh canvas.' : modal === 'text' ? 'Say something.' : 'Less menu. More making.'}</h2><ToolButton icon="close" label="Close dialog" onClick={() => setModal(null)} /></div>
      {modal === 'text' ? <form onSubmit={addText}>
        <p>Text will be placed where you clicked. It stays independently selectable and movable, with its own undo step.</p>
        <label className="pc-field">Your text<textarea autoFocus aria-label="Text to add" maxLength={1000} rows={4} value={text} onChange={(event) => { setText(event.target.value); setTextError(''); }} placeholder="Make your mark." /></label>
        <div className="pc-text-options">
          <label className="pc-field">Font<select aria-label="Text font" value={textStyle.font} onChange={(event) => setTextStyle((current) => ({ ...current, font: event.target.value }))}><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></label>
          <label className="pc-field">Size<input type="number" aria-label="Text size" min="12" max="240" value={textStyle.size} onChange={(event) => setTextStyle((current) => ({ ...current, size: Number(event.target.value) }))} /></label>
          <label className="pc-field">Colour<input type="color" aria-label="Text colour" value={textStyle.color} onChange={(event) => setTextStyle((current) => ({ ...current, color: event.target.value }))} /></label>
        </div>
        <label className="pc-check"><input type="checkbox" checked={textStyle.bold} onChange={(event) => setTextStyle((current) => ({ ...current, bold: event.target.checked }))} /> Bold text</label>
        <div className="pc-text-preview" aria-label="Text preview" style={{ fontFamily: TEXT_FONTS[textStyle.font], fontWeight: textStyle.bold ? 700 : 400, fontSize: clamp(textStyle.size, 12, 240), color: textStyle.color, background: doc.paper === 'transparent' ? PAPERS.midnight : doc.paper }}>{text || 'Your words, here.'}</div>
        {textError && <p role="alert">{textError}</p>}
        <button className="pc-primary" type="submit" disabled={!text.trim()}>Add text <span aria-hidden="true">↗</span></button>
      </form> : modal === 'new' ? <form onSubmit={newCanvas}><p>Your current canvas stays in undo history. Export a PNG to keep a separate copy.</p><label className="pc-field">Canvas format<select aria-label="Canvas format" value={newFormat} onChange={(event) => setNewFormat(event.target.value)}>{Object.entries(FORMATS).map(([name, dimensions]) => <option key={name} value={name}>{name[0].toUpperCase() + name.slice(1)} · {dimensions.join(' × ')}</option>)}</select></label><label className="pc-field">Canvas surface<select aria-label="Canvas surface" value={newPaper} onChange={(event) => setNewPaper(event.target.value)}>{Object.keys(PAPERS).map((name) => <option key={name} value={name}>{PAPER_LABELS[name]}</option>)}</select></label><button className="pc-primary" type="submit">Create canvas <span aria-hidden="true">↗</span></button></form> : <><p>Morphogen-inspired pigment, without the drift. Draw with a mouse, touch or pressure-sensitive pen. Scroll or pinch to zoom in and out. Use Hand, hold Space, or drag with two fingers to move the page. New marks expand your canvas. Choose Select (V), click any stroke, shape, image or text, then drag to move just that item. Click empty space to deselect. Arrow keys nudge a selection; Page Up/Down cycles items. Choose Text, then click where your words belong. Export includes the whole document.</p><dl>{SHORTCUTS.map(([key, action]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{action}</dd></div>)}</dl><p className="pc-hint">Canvas growth is limited to 4 megapixels to protect device memory. Fill operates inside the current document bounds. Recent items stay independently selectable. When the 20 MiB editable-pixel budget fills, Popcan visibly groups enough of the oldest items into one movable Earlier artwork layer so drawing can continue. Up to 512 live items are retained. One draft is saved in this browser when storage is available. Nothing is uploaded. Export your favourites before starting over.</p></>}
    </dialog>}
  </div>;
}

export default function PopcanPage() {
  return <ThemeProvider enableBackground={false}><PopcanContent /></ThemeProvider>;
}
