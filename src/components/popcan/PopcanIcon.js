import React from 'react';
const paths = {
  brush: 'M14 4l6 6M13 5l3-3 6 6-3 3-6 6-6-6zM7 13c-5 0-1 6-5 7 6 2 9-1 7-5',
  eraser: 'M3 14l9-11a2 2 0 013 0l6 6a2 2 0 010 3l-8 9H9zM7 10l10 9M13 21h9',
  line: 'M4 20L20 4M3 18v3h3M18 3h3v3',
  rectangle: 'M4 5h16v14H4z',
  ellipse: 'M21 12a9 7 0 11-18 0 9 7 0 1118 0',
  fill: 'M7 3l10 10-7 7-9-9 7-7M3 13h14M20 13s-3 4-3 6a3 3 0 006 0c0-2-3-6-3-6',
  pick: 'M14 4l6 6M16 2l6 6-3 3-6-6zM14 6L4 16v4h4L18 10M4 20l-2 2',
  hand: 'M8 12V5a2 2 0 014 0v6-8a2 2 0 014 0v8-6a2 2 0 014 0v8c0 6-3 9-7 9-4 0-6-3-8-7l-2-4a2 2 0 013-2l2 3',
  undo: 'M9 5L4 10l5 5M4 10h10a6 6 0 010 12',
  redo: 'M15 5l5 5-5 5M20 10H10a6 6 0 000 12',
  download: 'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v5h16v-5',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  fit: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',
  swap: 'M4 7h16l-4-4M20 17H4l4 4',
  sliders: 'M4 7h7M15 7h5M4 17h2M10 17h10M11 4v6M6 14v6',
  close: 'M6 6l12 12M18 6L6 18',
  help: 'M12 17h.01M9.2 8a3 3 0 115.6 1.5c-1.3 1-2.8 1.5-2.8 3.5M22 12a10 10 0 11-20 0 10 10 0 1120 0',
  mark: 'M3 17c2-10 5-13 8-10s-3 10 0 11 8-10 10-9M3 22h18',
};
export default function PopcanIcon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.mark} /></svg>;
}
