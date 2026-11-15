/* Odd-size finder: every distinct piece in the quilt (all identical copies grouped),
 * checked against the quilter's own square templates (cut sizes, seam included). */
import { sum, frozenTracks, uses, type Block, type Cell, type Content, type Doc } from './model';
import { scaleOf, cellSize } from './calc';

export type Status = 'template' | 'ruler' | 'odd' | 'near';
export interface Piece {
  key: string; c: Content; w: number; h: number; qty: number;
  at: { def: string; i: number };       // one place it appears (to pin it)
  cut: number | null;                    // square size you'd cut / trim to with a template
  status: Status;
  template: number | null;               // the template that does it
  kind: 'square' | 'rect' | 'hst' | 'qst' | 'goose';
}

const near = (a: number, b: number) => Math.abs(a - b) < 1 / 32;
const onQuarter = (v: number) => near(v * 4, Math.round(v * 4));

export function pieces(doc: Doc): Piece[] {
  const s = doc.settings.seam, T = doc.settings.templates;
  const out = new Map<string, Piece>();
  // a template fits when the finished square it makes (its size minus its own seam allowance) is this piece
  const tpl = (_cut: number, fin: number) => T.find(t => near(templateFinished(doc, t), fin)) ?? null;

  function add(c: Content, w: number, h: number, def: string, i: number) {
    let kind: Piece['kind'], cut: number | null = null;
    const sq = near(w, h);
    if (c.k === 'solid') { kind = sq ? 'square' : 'rect'; if (sq) cut = w + 2 * s; }
    else if (c.k === 'hst') { kind = 'hst'; if (sq) cut = w + 2 * s; }          // trim-to size: what you square it up with
    else if (c.k === 'qst') { kind = 'qst'; if (sq) cut = w + 5 * s; }          // cut size, then cut twice on the diagonal
    else { kind = 'goose'; }
    const [L, S] = w >= h ? [w, h] : [h, w];
    const norm: Content = c.k === 'hst' ? { ...c, corner: 'tl' } : c.k === 'goose' ? { ...c, dir: 'up' } : c;
    const fabrics = c.k === 'solid' ? [c.f] : c.k === 'hst' ? [c.a, c.b].sort() : c.k === 'qst' ? [...c.f].sort() : c.k === 'goose' ? [c.g, c.s] : [];
    const key = keyOf(c, w, h); void L; void S; void fabrics;
    const e = out.get(key);
    if (e) { e.qty++; return; }
    const fin = w;
    const t = cut != null ? tpl(cut, fin) : null;
    // looks square but isn't: the easiest mistake to miss
    const nearSquare = !sq && L / S < 1.25 && kind !== 'goose';
    const status: Status = t != null ? 'template' : nearSquare ? 'near' : (kind === 'rect' || kind === 'goose') && onQuarter(L + 2 * s) && onQuarter(S + 2 * s) ? 'ruler' : 'odd';
    out.set(key, { key, c: norm, w: L, h: S, qty: 1, at: { def, i }, cut, status, template: t, kind });
  }

  function walk(id: string, w: number, h: number, depth: number) {
    const b = doc.blocks[id];
    if (!b || depth > 12) return;
    const sx = w / sum(b.cols), sy = h / sum(b.rows);
    b.cells.forEach((cell, i) => {
      const cw = sum(b.cols, cell.x, cell.cs) * sx, ch = sum(b.rows, cell.y, cell.rs) * sy, c = cell.c;
      if (c.k === 'inst') { const [iw, ih] = c.rot % 2 ? [ch, cw] : [cw, ch]; walk(c.ref, iw, ih, depth + 1); }
      else if (c.k !== 'empty') add(c, cw, ch, id, i);
    });
  }
  const r = doc.blocks[doc.root];
  walk(doc.root, sum(r.cols), sum(r.rows), 0);
  const rank = { near: 0, odd: 1, ruler: 2, template: 3 };
  return [...out.values()].sort((a, b) => rank[a.status] - rank[b.status] || b.qty - a.qty);
}

/** the finished size a piece must be so that a template cuts it */
/** a template's own built-in seam allowance (0 = it's the finished size) */
export const templateSeam = (doc: Doc, t: number) => doc.settings.templateSeams?.[String(t)] ?? 0.25;
/** the finished square a template makes */
export const templateFinished = (doc: Doc, t: number) => t - 2 * templateSeam(doc, t);
/** the finished size a piece becomes when you use this template */
export function finishedFor(doc: Doc, t: number) { return templateFinished(doc, t); }

/** every cell (in any block) that holds this same piece, as [block, cell index] */
export function whereIs(doc: Doc, p: Piece): Map<string, number[]> {
  const out = new Map<string, number[]>();
  function walk(id: string, w: number, h: number, depth: number, seen: Set<string>) {
    const b = doc.blocks[id];
    if (!b || depth > 12) return;
    const sx = w / sum(b.cols), sy = h / sum(b.rows);
    b.cells.forEach((cell, i) => {
      const cw = sum(b.cols, cell.x, cell.cs) * sx, ch = sum(b.rows, cell.y, cell.rs) * sy, c = cell.c;
      if (c.k === 'inst') { const [iw, ih] = c.rot % 2 ? [ch, cw] : [cw, ch]; walk(c.ref, iw, ih, depth + 1, seen); return; }
      if (c.k === 'empty' || keyOf(c, cw, ch) !== p.key) return;
      const list = out.get(id) ?? [];
      if (!list.includes(i)) list.push(i);
      out.set(id, list);
    });
  }
  const r = doc.blocks[doc.root];
  walk(doc.root, sum(r.cols), sum(r.rows), 0, new Set());
  return out;
}

function keyOf(c: Content, w: number, h: number) {
  const sq = Math.abs(w - h) < 1 / 32;
  const kind = c.k === 'solid' ? (sq ? 'square' : 'rect') : c.k === 'hst' ? 'hst' : c.k === 'qst' ? 'qst' : 'goose';
  const [L, S] = w >= h ? [w, h] : [h, w];
  const fabrics = c.k === 'solid' ? [c.f] : c.k === 'hst' ? [c.a, c.b].sort() : c.k === 'qst' ? [...c.f].sort() : c.k === 'goose' ? [c.g, c.s] : [];
  return `${kind}|${fabrics}|${L.toFixed(3)}|${S.toFixed(3)}`;
}

/**
 * Make every copy of a piece `size` (long side) × `shortTo` (short side), finished.
 * Locks always win: nothing locked changes size. If a block can't grow because the
 * row/column it sits in holds a locked block, the change is soaked up by the block's
 * other (unlocked) rows/columns instead. If there's no room, nothing changes (returns false).
 */
export function resizePiece(doc: Doc, p: Piece, size: number, shortTo = size): boolean {
  const where = whereIs(doc, p);
  const scales = new Map(Object.keys(doc.blocks).map(id => [id, id === doc.root ? { sx: 1, sy: 1 } : (scaleOf(doc, id) ?? { sx: 1, sy: 1 })]));
  const lockedIds = Object.values(doc.blocks).filter(b => b.locked).map(b => b.id);
  const k = (id: string, axis: 'col' | 'row') => (axis === 'col' ? scales.get(id)!.sx : scales.get(id)!.sy);
  const tr = (id: string, axis: 'col' | 'row') => (axis === 'col' ? doc.blocks[id].cols : doc.blocks[id].rows);

  // soak a change up inside block `id` using its free tracks (not `keep`, not frozen)
  function absorb(id: string, axis: 'col' | 'row', delta: number, keep: Set<number>): boolean {
    const t = tr(id, axis), f = frozenTracks(doc, doc.blocks[id], axis), kk = k(id, axis);
    const free = t.map((_, i) => i).filter(i => !keep.has(i) && !f[i]);
    const room = free.reduce((s, i) => s + t[i] * kk, 0);
    // the other tracks give back what the resized ones took (block keeps its size)
    if (!free.length || room - delta < free.length * 0.25 - 1e-9) return false;
    for (const i of free) t[i] = (t[i] * kk - delta * (t[i] * kk) / room) / kk;
    return true;
  }

  // block `id` changed by `delta` real inches along `axis`: make its slots follow, or soak it up
  function settle(id: string, axis: 'col' | 'row', delta: number, keep: Set<number>, depth = 0): boolean {
    if (Math.abs(delta) < 1e-9 || id === doc.root) return true;
    if (depth > 12) return false;
    const holders: { pb: Block; cell: Cell; paxis: 'col' | 'row' }[] = [];
    for (const pb of Object.values(doc.blocks))
      for (const cell of pb.cells)
        if (cell.c.k === 'inst' && cell.c.ref === id) holders.push({ pb, cell, paxis: (cell.c.rot % 2 ? (axis === 'col' ? 'row' : 'col') : axis) as 'col' | 'row' });
    // can every slot grow/shrink? (not locked, and some spanned track isn't frozen)
    const pick = holders.map(({ pb, cell, paxis }) => {
      if (pb.locked) return -1;
      const f = frozenTracks(doc, pb, paxis);
      const [from, span] = paxis === 'col' ? [cell.x, cell.cs] : [cell.y, cell.rs];
      for (let i = from + span - 1; i >= from; i--) if (!f[i]) return i;
      return -1;
    });
    if (!holders.length || pick.some(i => i < 0)) return absorb(id, axis, delta, keep);
    // grow the slots (each parent track once), then let each parent settle in turn
    const byParent = new Map<string, { axis: 'col' | 'row'; tracks: Set<number> }>();
    holders.forEach(({ pb, paxis }, n) => {
      const e = byParent.get(pb.id + paxis) ?? { axis: paxis, tracks: new Set<number>() };
      e.tracks.add(pick[n]); byParent.set(pb.id + paxis, e);
    });
    for (const [key, e] of byParent) {
      const pid = key.slice(0, -e.axis.length), t = tr(pid, e.axis), kk = k(pid, e.axis);
      for (const i of e.tracks) t[i] += delta / kk;
      if (!settle(pid, e.axis, delta * e.tracks.size, new Set(e.tracks), depth + 1)) return false;
    }
    return true;
  }

  for (const [id, idxs] of where) {
    // pieces inside a locked block can't change
    if (lockedIds.some(l => l === id || uses(doc, l, id))) return false;
    const b = doc.blocks[id], sc = scales.get(id)!;
    const setC = new Map<number, number>(), setR = new Map<number, number>();
    for (const i of idxs) {
      const c = b.cells[i];
      const cw = sum(b.cols, c.x, c.cs) * sc.sx, ch = sum(b.rows, c.y, c.rs) * sc.sy;
      const wIsLong = cw >= ch - 1e-6;
      const tw = wIsLong ? size : shortTo, th = wIsLong ? shortTo : size;
      if (c.cs === 1 && Math.abs(cw - tw) > 1e-6) setC.set(c.x, tw);
      if (c.rs === 1 && Math.abs(ch - th) > 1e-6) setR.set(c.y, th);
    }
    const fc = frozenTracks(doc, b, 'col'), fr = frozenTracks(doc, b, 'row');
    if ([...setC.keys()].some(x => fc[x]) || [...setR.keys()].some(y => fr[y])) return false;
    let dW = 0, dH = 0;
    for (const [x, v] of setC) { dW += v - b.cols[x] * sc.sx; b.cols[x] = v / sc.sx; }
    for (const [y, v] of setR) { dH += v - b.rows[y] * sc.sy; b.rows[y] = v / sc.sy; }
    if (!settle(id, 'col', dW, new Set(setC.keys()))) return false;
    if (!settle(id, 'row', dH, new Set(setR.keys()))) return false;
  }
  // a pinned piece keeps whatever size it has now (so the pin doesn't rescale it all back)
  const a = doc.settings.anchor;
  if (a && doc.blocks[a.def]?.cells[a.i]) {
    const cs = cellSize(doc, a.def, a.i);
    if (cs) a.size = Math.min(cs.w, cs.h);
  }
  return true;
}
