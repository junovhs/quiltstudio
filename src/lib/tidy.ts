/* Tidy sizes: snap every row and column to friendly quilting sizes (multiples of
 * a step, e.g. ½″), keeping the quilt's total size (optional) and anything locked. */
import { sum, type Block, type Doc } from './model';
import { analyse, cellSize, scaleOf } from './calc';

const EPS = 1e-6;

import { frozenTracks } from './model';
/** which tracks of `b` hold a locked block (those keep their size) */
function lockedTracks(doc: Doc, b: Block, axis: 'col' | 'row') {
  return frozenTracks(doc, b, axis);
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function _oldLockedTracks(doc: Doc, b: Block, axis: 'col' | 'row') {
  const n = axis === 'col' ? b.cols.length : b.rows.length;
  const out = Array<boolean>(n).fill(false);
  for (const c of b.cells) {
    if (c.c.k !== 'inst' || !doc.blocks[c.c.ref]?.locked) continue;
    const [from, span] = axis === 'col' ? [c.x, c.cs] : [c.y, c.rs];
    for (let i = from; i < from + span; i++) out[i] = true;
  }
  return out;
}

/**
 * Round tracks (real inches) to multiples of `step`. With `total` set, the sum is kept:
 * whatever is left over goes to the middle track(s) so symmetric blocks stay symmetric.
 */
export function snapTracks(v: number[], step: number, locked: boolean[], total: number | null, absorb: 'middle' | 'outer' = 'middle'): number[] {
  const out = v.map((x, i) => (locked[i] ? x : Math.max(step, Math.round(x / step) * step)));
  if (total == null) return out;
  let diff = total - sum(out);
  if (Math.abs(diff) < EPS) return out;
  const free = out.map((_, i) => i).filter(i => !locked[i]);
  if (!free.length) return v.slice();
  // middle first (blocks) or outside first (the quilt: borders are the easy place to adjust), in mirrored pairs
  const mid = (v.length - 1) / 2;
  const order = [...free].sort((a, b) => (absorb === 'middle' ? 1 : -1) * (Math.abs(a - mid) - Math.abs(b - mid)) || a - b);
  const groups: number[][] = [];
  for (const i of order) {
    const m = v.length - 1 - i;
    if (groups.some(g => g.includes(i))) continue;
    groups.push(m !== i && free.includes(m) ? [i, m] : [i]);
  }
  // hand out whole steps to whole groups while we can, then put any remainder in the middle
  for (const g of groups) {
    const per = Math.trunc(diff / step / g.length) * step;
    if (Math.abs(per) < EPS) continue;
    if (g.every(i => out[i] + per >= step - EPS)) { g.forEach(i => (out[i] += per)); diff -= per * g.length; }
  }
  // what's left (less than a step per track, or a total that isn't a multiple of the step)
  // is shared by the middle group, so mirrored tracks stay equal
  if (Math.abs(diff) > EPS) {
    const g = groups.find(g => g.every(i => out[i] + diff / g.length >= step - EPS)) ?? groups[0];
    g.forEach(i => (out[i] += diff / g.length));
  }
  return out;
}

export interface TidyOpts { step: number; lockTotal: boolean }

/** tidy the whole design in place (call inside edit() so it can be undone) */
export function tidy(doc: Doc, o: TidyOpts) {
  const root = doc.blocks[doc.root];
  // remember the pinned piece's new size afterwards so the pin doesn't rescale everything back
  const a = doc.settings.anchor;

  // 1 · the quilt itself
  root.cols = snapTracks(root.cols, o.step, lockedTracks(doc, root, 'col'), o.lockTotal ? sum(root.cols) : null, 'outer');
  root.rows = snapTracks(root.rows, o.step, lockedTracks(doc, root, 'row'), o.lockTotal ? sum(root.rows) : null, 'outer');

  // 2 · every block, outside-in (a block's size comes from its parent's slot)
  const order = [...analyse(doc).order].reverse();
  for (const id of order) {
    const b = doc.blocks[id];
    if (!b || b.locked) continue;
    const s = scaleOf(doc, id);
    if (!s) continue;
    const realC = b.cols.map(v => v * s.sx), realR = b.rows.map(v => v * s.sy);
    // inside a block the outer size is fixed by the slot it sits in
    const nc = snapTracks(realC, o.step, lockedTracks(doc, b, 'col'), sum(realC));
    const nr = snapTracks(realR, o.step, lockedTracks(doc, b, 'row'), sum(realR));
    b.cols = nc.map(v => v / s.sx);
    b.rows = nr.map(v => v / s.sy);
  }

  if (a && doc.blocks[a.def]?.cells[a.i]) {
    const cs = cellSize(doc, a.def, a.i);
    if (cs) a.size = Math.min(cs.w, cs.h);
  }
}

/** how many rows/columns currently aren't a multiple of the step (to show what tidy would fix) */
export function untidyCount(doc: Doc, step: number) {
  let n = 0;
  const chk = (v: number) => { if (Math.abs(v / step - Math.round(v / step)) > 1e-3) n++; };
  doc.blocks[doc.root].cols.forEach(chk); doc.blocks[doc.root].rows.forEach(chk);
  for (const id of analyse(doc).order) {
    const b = doc.blocks[id], s = scaleOf(doc, id);
    if (!b || !s || b.locked) continue;
    b.cols.forEach(v => chk(v * s.sx)); b.rows.forEach(v => chk(v * s.sy));
  }
  return n;
}
