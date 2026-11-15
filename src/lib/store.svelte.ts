import { flushSync } from 'svelte';
import { analyse, fitToAnchor } from './calc';
import { thumbnail } from './render';
import { DEFAULT_SETTINGS, defaultDoc, setSnapshot, uid, type Content, type Doc, type Sym } from './model';

setSnapshot(v => $state.snapshot(v) as typeof v);

export type Tool = 'select' | 'paint' | 'recolor' | 'measure';
/* ---------------- projects, saved in this browser ----------------
 * localStorage: the list of projects + each project's design.
 * IndexedDB:    fabric photos (keyed "<project>:<fabric>").            */
const LIST = 'quiltstudio.projects', CUR = 'quiltstudio.current', OLD = 'quiltstudio.v3';
const docKey = (id: string) => 'quiltstudio.p.' + id;
export interface ProjectMeta { id: string; name: string; updated: number; thumb?: string }

const read = <T>(k: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? fallback; } catch { return fallback; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

function normalise(d: Doc): Doc {
  d.settings = { ...DEFAULT_SETTINGS, ...d.settings };
  d.progress ??= {};
  d.name ??= 'My quilt';
  return d;
}

function boot(): { list: ProjectMeta[]; current: string; doc: Doc } {
  let list = read<ProjectMeta[]>(LIST, []);
  let current = read<string | null>(CUR, null);
  if (!list.length) {
    // first visit, or coming from the single-design version
    const old = read<Doc | null>(OLD, null);
    const doc = normalise(old?.v === 3 ? old : defaultDoc());
    current = uid('p');
    list = [{ id: current, name: doc.name!, updated: Date.now() }];
    write(LIST, list); write(CUR, current); write(docKey(current), doc);
    return { list, current, doc };
  }
  if (!current || !list.some(p => p.id === current)) current = list[0].id;
  const doc = read<Doc | null>(docKey(current), null);
  return { list, current, doc: normalise(doc?.v === 3 ? doc : defaultDoc()) };
}
const booted = boot();
export const projects = $state({ list: booted.list, current: booted.current });

export const app = $state({
  doc: booted.doc,
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
/** throw away the change in progress (e.g. a paint stroke that turned into a pinch) */
export function rollback() {
  if (!past.length) return;
  app.doc = JSON.parse(past.pop()!);
  fixScope(); sync(); save();
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
  t = setTimeout(persist, 300);
}
let thumbTimer: ReturnType<typeof setTimeout>;
function persist() {
  const id = projects.current;
  try { localStorage.setItem(docKey(id), snapshot()); } catch {}
  const meta = projects.list.find(p => p.id === id);
  if (meta) { meta.name = app.doc.name ?? 'My quilt'; meta.updated = Date.now(); }
  write(LIST, $state.snapshot(projects.list));
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(async () => {
    const m = projects.list.find(p => p.id === id);
    if (!m || id !== projects.current) return;
    try { m.thumb = await thumbnail($state.snapshot(app.doc) as Doc, app.images, 120); write(LIST, $state.snapshot(projects.list)); } catch {}
  }, 800);
}

function load(id: string, doc: Doc) {
  clearTimeout(t); persist();                 // finish saving the one we're leaving
  for (const u of Object.values(app.images)) URL.revokeObjectURL(u);
  app.images = {};
  projects.current = id; write(CUR, id);
  app.doc = normalise(doc); app.path = []; app.sel = [];
  past.length = 0; future.length = 0; sync();
  loadImages();
  persist();
}
export function openProject(id: string) {
  if (id === projects.current) return;
  const doc = read<Doc | null>(docKey(id), null);
  load(id, doc?.v === 3 ? doc : defaultDoc());
}
export function newProject(doc: Doc = defaultDoc(), name = 'New quilt') {
  const id = uid('p');
  doc.name = name;
  projects.list.unshift({ id, name, updated: Date.now() });
  load(id, doc);
  return id;
}
export async function deleteProject(id: string) {
  const doc = read<Doc | null>(docKey(id), null);
  for (const f of doc?.fabrics ?? []) await idb('readwrite', s => s.delete(`${id}:${f.id}`)).catch(() => {});
  localStorage.removeItem(docKey(id));
  projects.list = projects.list.filter(p => p.id !== id);
  write(LIST, $state.snapshot(projects.list));
  if (id === projects.current) {
    if (projects.list.length) openProject(projects.list[0].id);
    else newProject();
  }
}
export function replaceDoc(d: Doc) {
  begin();
  app.doc = normalise(d); app.path = []; app.sel = [];
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
const imgKey = (fabric: string, project = projects.current) => `${project}:${fabric}`;
export async function setImage(id: string, blob: Blob | null) {
  if (app.images[id]) URL.revokeObjectURL(app.images[id]);
  if (blob) { await idb('readwrite', s => s.put(blob, imgKey(id))); app.images[id] = URL.createObjectURL(blob); }
  else { await idb('readwrite', s => s.delete(imgKey(id))); delete app.images[id]; }
}
export async function getImageBlob(id: string) {
  try {
    return (await idb<Blob | undefined>('readonly', s => s.get(imgKey(id))))
      ?? (await idb<Blob | undefined>('readonly', s => s.get(id))); // photos saved before projects existed
  } catch { return undefined; }
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
export const ui = $state({ make: false, projects: false, palette: false, print: null as null | string[], measure: null as null | { def: string; i: number; x: number; y: number } });

/** tick a Make-sheet item done / not done */
export function toggleDone(key: string) {
  edit(() => { const p = (app.doc.progress ??= {}); if (p[key]) delete p[key]; else p[key] = true; });
}
