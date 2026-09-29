import { validSize, validWorldSize, rasterFrame, WORLD_LIMIT } from './popcanView';
import { checkObjectPng } from './popcanObjects';

const DB_NAME = 'popcan-local';
const STORE = 'drafts';
const KEY = 'current';
function database() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('Local storage is unavailable.')); return; }
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Local storage is blocked.'));
  });
}
export async function readDraft() {
  const db = await database();
  const draft = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly'), request = tx.objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close(); tx.onabort = () => { db.close(); reject(tx.error); };
  });
  if (draft?.blob) {
    const { width, height, originX = 0, originY = 0 } = draft;
    if (!(draft.version === 3 ? validWorldSize : validSize)(width, height)
      || ![originX, originY].every((n) => Number.isInteger(n) && Math.abs(n) <= WORLD_LIMIT)
      || Math.abs(originX + width) > WORLD_LIMIT || Math.abs(originY + height) > WORLD_LIMIT
      || !(draft.blob instanceof Blob) || draft.blob.size > 40 * 1024 * 1024) throw new Error('Invalid saved canvas.');
    const frame = rasterFrame({ left: originX, top: originY, right: originX + width, bottom: originY + height });
    await checkObjectPng({ blob: draft.blob, width: frame.pixelWidth, height: frame.pixelHeight });
  }
  return draft;
}
export async function writeDraft(draft) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(draft, KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
export function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob), image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be opened.')); };
    image.src = url;
  });
}
export const exportName = (title) => (title.trim().replace(/[^a-z0-9 _-]/gi, '').slice(0, 80) || 'popular-canvas') + '.png';
