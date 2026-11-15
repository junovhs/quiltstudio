/* Odd-size finder: every distinct piece in the quilt (all identical copies grouped),
 * checked against the quilter's own square templates (cut sizes, seam included). */
import { sum, frozenTracks, uses, type Block, type Cell, type Content, type Doc } from './model';
import { scaleOf, cellSize, analyse } from './calc';

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
  return resizeCells(doc, whereIs(doc, p), (cw, ch) => (cw >= ch - 1e-6 ? [size, shortTo] : [shortTo, size]));
}

/**
 * Resize specific cells (block id → cell indexes) to `target(currentW, currentH)` (finished inches).
 * Same rules as above: locks win, the quilt keeps its size when that's locked (the outer border
 * gives), blocks soak up changes they can't pass on.
 */
export function resizeCells(doc: Doc, where: Map<string, number[]>, target: (cw: number, ch: number) => [number, number]): boolean {
  const scales = new Map(Object.keys(doc.blocks).map(id => [id, id === doc.root ? { sx: 1, sy: 1 } : (scaleOf(doc, id) ?? { sx: 1, sy: 1 })]));
  const squaresBefore = squareSet(doc);
  const k = (id: string, axis: 'col' | 'row') => (axis === 'col' ? scales.get(id)!.sx : scales.get(id)!.sy);
  const tr = (id: string, axis: 'col' | 'row') => (axis === 'col' ? doc.blocks[id].cols : doc.blocks[id].rows);

  // soak a change up inside block `id` using its free tracks (not `keep`, not frozen)
  function absorb(id: string, axis: 'col' | 'row', delta: number, keep: Set<number>): boolean {
    const t = tr(id, axis), f = frozenTracks(doc, doc.blocks[id], axis), kk = k(id, axis);
    let free = t.map((_, i) => i).filter(i => !keep.has(i) && !f[i]);
    // the quilt itself: let the outer border give first
    if (id === doc.root) { const outer = free.filter(i => i === 0 || i === t.length - 1); if (outer.length) free = outer; }
    const room = free.reduce((s, i) => s + t[i] * kk, 0);
    // the other tracks give back what the resized ones took (block keeps its size)
    if (!free.length || room - delta < free.length * 0.25 - 1e-9) return false;
    for (const i of free) t[i] = (t[i] * kk - delta * (t[i] * kk) / room) / kk;
    return true;
  }

  // every block's real size before we started (locked ones must end up the same)
  const orig = new Map(Object.keys(doc.blocks).map(id => [id, { w: sum(doc.blocks[id].cols) * k(id, 'col'), h: sum(doc.blocks[id].rows) * k(id, 'row') }]));
  const realW = (id: string) => sum(doc.blocks[id].cols) * k(id, 'col');
  const realH = (id: string) => sum(doc.blocks[id].rows) * k(id, 'row');

  /**
   * Block `id` may have changed size: make every slot that holds it match (setting each slot to
   * the block's size, so twins sharing a row/column never double up), then do the same one level
   * up. Locked blocks / a locked quilt keep their size by making room inside instead.
   */
  function fitUp(id: string, keep: { col: Set<number>; row: Set<number> }, depth = 0): boolean {
    if (depth > 14) return false;
    const o = orig.get(id)!;
    const dw = realW(id) - o.w, dh = realH(id) - o.h;
    if (id === doc.root) {
      if (!doc.settings.lockQuilt) return true;
      return (Math.abs(dw) < 1e-9 || absorb(id, 'col', dw, keep.col)) && (Math.abs(dh) < 1e-9 || absorb(id, 'row', dh, keep.row));
    }
    if (doc.blocks[id].locked) {
      return (Math.abs(dw) < 1e-9 || absorb(id, 'col', dw, keep.col)) && (Math.abs(dh) < 1e-9 || absorb(id, 'row', dh, keep.row));
    }
    const W = realW(id), H = realH(id);
    const changed = new Map<string, { col: Set<number>; row: Set<number> }>();
    for (const pb of Object.values(doc.blocks)) {
      pb.cells.forEach(cell => {
        if (cell.c.k !== 'inst' || cell.c.ref !== id) return;
        const odd = cell.c.rot % 2 === 1;
        const [needW, needH] = odd ? [H, W] : [W, H];
        for (const paxis of ['col', 'row'] as const) {
          const need = paxis === 'col' ? needW : needH;
          const [from, span] = paxis === 'col' ? [cell.x, cell.cs] : [cell.y, cell.rs];
          const t = tr(pb.id, paxis), kk = k(pb.id, paxis);
          const have = sum(t, from, span) * kk;
          if (Math.abs(need - have) < 1e-9) continue;          // already fits (e.g. its twin fixed it)
          const f = frozenTracks(doc, pb, paxis);
          let pick = -1;
          for (let i = from + span - 1; i >= from; i--) if (!f[i]) { pick = i; break; }
          if (pick < 0) {
            // the slot can't change: the block makes room inside itself instead
            const caxis = (odd ? (paxis === 'col' ? 'row' : 'col') : paxis) as 'col' | 'row';
            if (!absorb(id, caxis, need - have, keep[caxis])) return void (fail = true);
            return void (retry = true);
          }
          t[pick] += (need - have) / kk;
          const e = changed.get(pb.id) ?? { col: new Set<number>(), row: new Set<number>() };
          e[paxis].add(pick); changed.set(pb.id, e);
        }
      });
      if (fail) return false;
      if (retry) { retry = false; return fitUp(id, keep, depth + 1); }
    }
    for (const [pid, kp] of changed) if (!fitUp(pid, kp, depth + 1)) return false;
    return true;
  }
  let fail = false, retry = false;

  for (const [id, idxs] of where) {
    const b = doc.blocks[id], sc = scales.get(id)!;
    const setC = new Map<number, number>(), setR = new Map<number, number>();
    for (const i of idxs) {
      const c = b.cells[i];
      const cw = sum(b.cols, c.x, c.cs) * sc.sx, ch = sum(b.rows, c.y, c.rs) * sc.sy;
      const [tw, th] = target(cw, ch);
      if (Math.abs(cw - tw) > 1e-6) for (let x = c.x; x < c.x + c.cs; x++) setC.set(x, b.cols[x] * sc.sx * tw / cw);
      if (Math.abs(ch - th) > 1e-6) for (let y = c.y; y < c.y + c.rs; y++) setR.set(y, b.rows[y] * sc.sy * th / ch);
    }
    const fc = frozenTracks(doc, b, 'col'), fr = frozenTracks(doc, b, 'row');
    if ([...setC.keys()].some(x => fc[x]) || [...setR.keys()].some(y => fr[y])) return false;
    for (const [x, v] of setC) b.cols[x] = v / sc.sx;
    for (const [y, v] of setR) b.rows[y] = v / sc.sy;
    if (!fitUp(id, { col: new Set(setC.keys()), row: new Set(setR.keys()) })) return false;
  }
  keepSquaresInside(doc, scales, squaresBefore);
  // a pinned piece keeps whatever size it has now (so the pin doesn't rescale it all back)
  const a = doc.settings.anchor;
  if (a && doc.blocks[a.def]?.cells[a.i]) {
    const cs = cellSize(doc, a.def, a.i);
    if (cs) a.size = Math.min(cs.w, cs.h);
  }
  return true;
}

/**
 * A block whose slot got longer/shorter in one direction would be stretched evenly, which spoils
 * its perfect squares. Instead: rows/columns that hold squares keep their size, the others
 * (triangles, bands…) take up the change. Outside-in, so each block sees its final slot.
 */
function keepSquaresInside(doc: Doc, old: Map<string, { sx: number; sy: number }>, squares: Set<string>) {
  const order = [...analyse(doc).order].reverse();
  for (const id of order) {
    const b = doc.blocks[id], o = old.get(id), n = scaleOf(doc, id);
    if (!b || !o || !n) continue;
    for (const axis of ['col', 'row'] as const) {
      const t = axis === 'col' ? b.cols : b.rows, os = axis === 'col' ? o.sx : o.sy, ns = axis === 'col' ? n.sx : n.sy;
      if (Math.abs(ns / os - 1) < 1e-6) continue;
      const oldReal = t.map(v => v * os), total = sum(t) * ns;
      const p = axis === 'col' ? 'x' : 'y', sp = axis === 'col' ? 'cs' : 'rs';
      const keep = new Set<number>();
      b.cells.forEach((c, i) => { if (squares.has(`${id}:${i}`)) for (let k = c[p]; k < c[p] + c[sp]; k++) keep.add(k); });
      const free = t.map((_, i) => i).filter(i => !keep.has(i));
      const kept = [...keep].reduce((s2, i) => s2 + oldReal[i], 0), room = free.reduce((s2, i) => s2 + oldReal[i], 0);
      const left = total - kept;
      if (!free.length || room <= 0 || left < free.length * 0.25) continue;     // can't: leave it stretched
      t.forEach((_, i) => { t[i] = (keep.has(i) ? oldReal[i] : oldReal[i] * left / room) / ns; });
    }
  }
}

/* ---------------- keep perfect squares perfect ---------------- */
/** every piece / block slot that is a perfect square right now, keyed "block:cell" */
export function squareSet(doc: Doc): Set<string> {
  const out = new Set<string>();
  function walk(id: string, w: number, h: number, depth: number) {
    const b = doc.blocks[id];
    if (!b || depth > 12) return;
    const sx = w / sum(b.cols), sy = h / sum(b.rows);
    b.cells.forEach((cell, i) => {
      const cw = sum(b.cols, cell.x, cell.cs) * sx, ch = sum(b.rows, cell.y, cell.rs) * sy;
      if (cell.c.k !== 'empty' && Math.abs(cw - ch) < 1 / 64) out.add(`${id}:${i}`);
      if (cell.c.k === 'inst') { const [iw, ih] = cell.c.rot % 2 ? [ch, cw] : [cw, ch]; walk(cell.c.ref, iw, ih, depth + 1); }
    });
  }
  const r = doc.blocks[doc.root];
  walk(doc.root, sum(r.cols), sum(r.rows), 0);
  return out;
}
/** squares that stopped being square (as {def, i} so they can be lit up) */
export function brokenSquares(before: Set<string>, doc: Doc) {
  const now = squareSet(doc);
  return [...before].filter(k => !now.has(k)).map(k => { const j = k.lastIndexOf(':'); return { def: k.slice(0, j), i: +k.slice(j + 1) }; });
}

/** "9", "9x9", "9 x 8", "4½", "4 1/2", "4.5" → [w, h] (one number = square) */
export function parseSize(text: string): [number, number] | null {
  const num = (t: string) => {
    t = t.trim().replace(',', '.').replace(/[″"]/g, '');
    const fr: Record<string, number> = { '¼': .25, '½': .5, '¾': .75, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875 };
    let v = 0;
    for (const [c, f] of Object.entries(fr)) if (t.includes(c)) { v += f; t = t.replace(c, ''); }
    const m = t.match(/^(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?$/);
    if (!m) return NaN;
    if (m[1]) v += parseFloat(m[1]);
    if (m[2]) v += +m[2] / +m[3];
    return v || NaN;
  };
  const parts = text.toLowerCase().split(/x|×|by|\*/);
  const a = num(parts[0]), b = parts.length > 1 ? num(parts[1]) : a;
  return a > 0 && b > 0 ? [a, b] : null;
}
