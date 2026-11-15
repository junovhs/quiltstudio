import { flushSync } from 'svelte';
import { analyse, fitToAnchor } from './calc';
import { DEFAULT_SETTINGS, defaultDoc, setSnapshot, type Content, type Doc, type Sym } from './model';

setSnapshot(v => $state.snapshot(v) as typeof v);

export type Tool = 'select' | 'paint' | 'recolor' | 'measure';
const KEY = 'quiltstudio.v3';

function loadDoc(): Doc {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (d?.v === 3) { d.settings = { ...DEFAULT_SETTINGS, ...d.settings }; return d; }
  } catch {}
  return defaultDoc();
}

export const app = $state({
  doc: loadDoc(),
  path: [] as string[],          // block ids we've drilled into, after the root
  sel: [] as number[],           // selected cell indexes in the current scope
  tool: 'select' as Tool,
  sym: 'none' as Sym,
  fabric: 'floral',              // active fabric (recolour tool, new brushes)
  brush: { k: 'hst', a: 'floral', b: 'cream', corner: 'br' } as Content,
  images: {} as Record<string, string>, // fabric id -> object URL
  canUndo: false,
  canRedo: false,
});

export const scopeId = () => app.path.at(-1) ?? app.doc.root;
export const scope = () => app.doc.blocks[scopeId()];

/* ---------------- history ---------------- */
const past: string[] = [];
const future: string[] = [];
const snapshot = () => JSON.stringify($state.snapshot(app.doc));
const sync = () => { app.canUndo = past.length > 0; app.canRedo = future.length > 0; };

/** record an undo step, then run the change */
export function edit(fn: () => void) {
  begin();
  fn();
  save();
}
export function begin() {
  past.push(snapshot());
  if (past.length > 300) past.shift();
  future.length = 0;
  sync();
}
export function undo() {
  if (!past.length) return;
  future.push(snapshot());
  app.doc = JSON.parse(past.pop()!);
  fixScope(); sync(); save();
}
export function redo() {
  if (!future.length) return;
  past.push(snapshot());
  app.doc = JSON.parse(future.pop()!);
  fixScope(); sync(); save();
}
function fixScope() {
  app.path = app.path.filter(id => app.doc.blocks[id]);
  app.sel = app.sel.filter(i => i < scope().cells.length);
}

/* ---------------- persistence ---------------- */
let t: ReturnType<typeof setTimeout>;
export function save() {
  fitToAnchor(app.doc);
  clearTimeout(t);
  t = setTimeout(() => { try { localStorage.setItem(KEY, snapshot()); } catch {} }, 250);
}
export function replaceDoc(d: Doc) {
  begin();
  app.doc = d; app.path = []; app.sel = [];
  save();
}

/* fabric photos live in IndexedDB (too big for localStorage) */
const dbp = new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open('quiltstudio', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('images');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await dbp;
  return new Promise<T>((res, rej) => {
    const q = fn(db.transaction('images', mode).objectStore('images'));
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
export async function setImage(id: string, blob: Blob | null) {
  if (app.images[id]) URL.revokeObjectURL(app.images[id]);
  if (blob) { await idb('readwrite', s => s.put(blob, id)); app.images[id] = URL.createObjectURL(blob); }
  else { await idb('readwrite', s => s.delete(id)); delete app.images[id]; }
}
export async function getImageBlob(id: string) {
  try { return await idb<Blob | undefined>('readonly', s => s.get(id)); } catch { return undefined; }
}
export async function loadImages() {
  for (const f of app.doc.fabrics) {
    if (!f.image) continue;
    const b = await getImageBlob(f.id);
    if (b) app.images[f.id] = URL.createObjectURL(b);
  }
}

/* ---------------- navigation (with a view transition) ---------------- */
function transition(fn: () => void) {
  document.startViewTransition ? document.startViewTransition(() => flushSync(fn)) : fn();
}
export function enter(id: string) { transition(() => { app.path = [...app.path, id]; app.sel = []; }); }
export function goTo(depth: number) { transition(() => { app.path = app.path.slice(0, depth); app.sel = []; }); }
export function openBlock(id: string) { transition(() => { app.path = id === app.doc.root ? [] : [id]; app.sel = []; }); }

/* ---------------- live numbers (computed once per change, shared) ---------------- */
const analysis = $derived(analyse(app.doc));
export const stats = () => analysis;
/** how many times each block appears in the whole quilt */
export const useCount = (id: string) => analysis.uses.filter(u => u.id === id).reduce((n, u) => n + u.qty, 0);

/* the Make sheet + drawer state */
export const ui = $state({ make: false, measure: null as null | { def: string; i: number; x: number; y: number } });
