/* Drag & drop: pick up a block (or a shape) and carry it onto the quilt.
 * It floats with a red tint until it's over a slot it fits, then snaps there green.
 * Turn it while carrying: R, scroll wheel, right-click, or the turn button (second finger). */
import { app, edit, scope, scopeId, ui } from './store.svelte';
import { snap, sum, symTargets, uses, xform, xformN, type Content } from './model';
import { aspectOf, fitIn, frameOf, placeFitted, type Fit } from './fit';

export interface Drag {
  c: Content;                        // what's being carried (orientation included)
  from: number | null;               // cell index in the current scope it was lifted from (moving), or null (new)
  x: number; y: number;              // pointer
  over: number;                      // slot under the pointer, -1 if none
  rect: DOMRect | null;              // that slot on screen
  fits: boolean;
  manual: boolean;
  fit: Fit | null;                   // the part of the slot it will take (it keeps its own shape)                   // user turned it: don't auto-turn
}

export const drag = $state<{ d: Drag | null; bounce: number }>({ d: null, bounce: 0 });

/** proportions of what's carried, as it currently faces (width / height) */
const aspect = (c: Content) => aspectOf(app.doc, c);
function slotAspect(i: number) {
  const b = scope(), c = b.cells[i];
  return sum(b.cols, c.x, c.cs) / sum(b.rows, c.y, c.rs);
}
const close = (a: number, b: number) => Math.abs(Math.log(a / b)) < 0.03;

function slotAt(x: number, y: number) {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(`.cell[data-def="${CSS.escape(scopeId())}"]`);
  const grid = el?.closest<HTMLElement>('.grid');
  return el && grid ? { i: +el.dataset.i!, rect: el.getBoundingClientRect(), grid } : null;
}

function update(x: number, y: number) {
  const d = drag.d!;
  d.x = x; d.y = y;
  const hit = slotAt(x, y);
  if (!hit || hit.i === d.from) { d.over = -1; d.rect = null; d.fits = false; d.fit = null; return; }
  const sa = slotAspect(hit.i);
  let a = aspect(d.c);
  // turn it for them when the other way round would fit (unless they've turned it themselves)
  if (a != null && !d.manual && !close(a, sa) && close(1 / a, sa)) { d.c = xform(snap(d.c), 'r'); a = 1 / a; }
  const cyclic = d.c.k === 'inst' && uses(app.doc, d.c.ref, scopeId());
  // it keeps its own shape: work out which part of the slot it takes, nearest the pointer
  const b = scope(), f = frameOf(hit.grid, sum(b.cols), sum(b.rows));
  d.fit = fitIn(b, hit.i, a, f.toLocal(x, y));
  d.over = hit.i; d.rect = d.fit.whole ? hit.rect : f.rectOf(d.fit.x0, d.fit.y0, d.fit.x1, d.fit.y1);
  d.fits = !cyclic;
}

export function turn() {
  const d = drag.d;
  if (!d) return;
  d.c = xform(snap(d.c), 'r'); d.manual = true;
  update(d.x, d.y);
}

function drop() {
  const d = drag.d;
  drag.d = null;
  if (!d || d.over < 0 || !d.fits) { drag.bounce++; return; }
  const b = scope(), to = d.over, from = d.from;
  edit(() => {
    const fit = d.fit;
    if (fit && !fit.whole) {
      // a different shape: it takes its own part of the slot, the rest stays as a gutter
      if (from != null) b.cells[from].c = { k: 'empty' };
      app.sel = [placeFitted(b, to, d.c, fit, snap)];
      return;
    }
    if (from != null) {
      // moving within the quilt: swap with whatever was there
      const there = snap(b.cells[to].c);
      b.cells[to].c = d.c;
      b.cells[from].c = there;
    } else {
      for (const t of symTargets(b, to, app.sym)) b.cells[t.i].c = xformN(snap(d.c), t.ts);
    }
    app.sel = [to];
  });
}

/**
 * Call from a pointerdown. Nothing happens until the pointer moves a little,
 * so a plain tap/click still does its normal thing (onTap).
 */
export function pickUp(e: PointerEvent, c: Content, from: number | null = null, onTap?: () => void) {
  if (e.button > 0) return;
  track(e.pointerId, e.clientX, e.clientY, c, from, onTap, false, e.pointerType === 'touch');
}
/** start carrying right away (e.g. the canvas decided a press-and-move is a drag) */
export function startDrag(pointerId: number, x: number, y: number, c: Content, from: number | null) {
  track(pointerId, x, y, c, from, undefined, true);
}

function track(id: number, sx: number, sy: number, c: Content, from: number | null, onTap: (() => void) | undefined, now: boolean, hold = false) {
  let started = false, aborted = false;
  const noNative = (n: Event) => n.preventDefault();
  const lost = () => end(new PointerEvent('pointercancel', { pointerId: id }));
  // fingers: press and hold a moment to lift it (a quick swipe still scrolls the palette)
  const holdTimer = hold ? setTimeout(() => { if (!aborted && !started) { navigator.vibrate?.(12); begin(sx, sy); } }, 230) : undefined;
  const noScroll = (t: TouchEvent) => { if (started) t.preventDefault(); };
  const begin = (x: number, y: number) => {
    started = true;
    ui.palette = false;
    drag.d = { c: snap(c), from, x, y, over: -1, rect: null, fits: false, manual: false, fit: null };
    document.body.classList.add('dragging-piece');
    update(x, y);
  };
  const move = (m: PointerEvent) => {
    if (m.pointerId !== id) return;
    if (aborted) return;
    if (!started) {
      if (Math.hypot(m.clientX - sx, m.clientY - sy) < 7) return;
      if (hold) { aborted = true; clearTimeout(holdTimer); return; }   // it was a scroll
      begin(m.clientX, m.clientY);
    }
    m.preventDefault();
    update(m.clientX, m.clientY);
  };
  const end = (u: PointerEvent) => {
    if (u.pointerId !== id) return;
    clearTimeout(holdTimer); removeEventListener('touchmove', noScroll);
    removeEventListener('dragstart', noNative, true); removeEventListener('blur', lost);
    removeEventListener('pointermove', move); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
    removeEventListener('keydown', key, true); removeEventListener('wheel', wheel, true); removeEventListener('contextmenu', ctx, true);
    document.body.classList.remove('dragging-piece');
    if (started) { if (u.type === 'pointercancel') { drag.d = null; drag.bounce++; } else drop(); }
    else if (!aborted && u.type === 'pointerup') onTap?.();
  };
  const key = (k: KeyboardEvent) => {
    if (!drag.d) return;
    if (k.key === 'r' || k.key === 'R' || k.key === ' ') { k.preventDefault(); k.stopPropagation(); turn(); }
    if (k.key === 'Escape') drag.d = null;
  };
  const wheel = (w: WheelEvent) => { if (drag.d) { w.preventDefault(); w.stopPropagation(); turn(); } };
  const ctx = (c: Event) => { if (drag.d) { c.preventDefault(); turn(); } };
  // the browser's own drag-and-drop would swallow the release: never let it start
  addEventListener('dragstart', noNative, true);
  addEventListener('blur', lost);
  addEventListener('pointermove', move, { passive: false });
  addEventListener('touchmove', noScroll, { passive: false });
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
  addEventListener('keydown', key, true); addEventListener('wheel', wheel, { passive: false, capture: true }); addEventListener('contextmenu', ctx, true);
  if (now) begin(sx, sy);
}

/** tap-to-place: put a block into the selected slots, turned to fit if it can */
export function placeInSelection(c: Content) {
  const b = scope();
  if (!app.sel.length) return false;
  if (c.k === 'inst' && uses(app.doc, c.ref, scopeId())) return false;
  edit(() => {
    for (const i of app.sel) {
      let cc = snap(c);
      const a = aspect(cc), sa = slotAspect(i);
      if (a != null && !close(a, sa) && close(1 / a, sa)) cc = xform(cc, 'r');
      placeFitted(b, i, cc, fitIn(b, i, aspect(cc), null), snap);
    }
  });
  return true;
}
