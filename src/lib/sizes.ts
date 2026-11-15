/* Odd-size finder: every distinct piece in the quilt (all identical copies grouped),
 * checked against the quilter's own square templates (cut sizes, seam included). */
import { sum, type Content, type Doc } from './model';
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
  const s = doc.settings.seam, T = doc.settings.templates, F = doc.settings.finishedTemplates ?? [];
  const out = new Map<string, Piece>();
  // a template matches if its size is the cut size (seam included) — or, for finished-size templates, the finished size
  const tpl = (cut: number, fin: number) => T.find(t => (F.includes(t) ? near(t, fin) : near(t, cut))) ?? null;

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
    const fin = kind === 'qst' ? (cut ?? 0) - 5 * s : (cut ?? 0) - 2 * s;
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
export function finishedFor(p: Piece, template: number, seam: number, finishedSize = false) {
  if (finishedSize) return template;
  return p.kind === 'qst' ? template - 5 * seam : template - 2 * seam;
}

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
 * Make every copy of a piece `size` × `size` (finished). The rows/columns it sits in
 * change; each block that grows passes the change up to whatever holds it, so
 * everything stays lined up (the quilt may grow or shrink a little).
 */
export function resizePiece(doc: Doc, p: Piece, size: number, shortTo = size) {
  // `size` is for the piece's long side, `shortTo` for its short side (equal = square it)
  const where = whereIs(doc, p);
  // every block keeps its current inches-per-unit while we resize (so sizes add up as real inches)
  const scales = new Map(Object.keys(doc.blocks).map(id => [id, id === doc.root ? { sx: 1, sy: 1 } : scaleOf(doc, id)]));
  const changed = new Set<string>();
  for (const [id, idxs] of where) {
    const b = doc.blocks[id], sc = scales.get(id) ?? { sx: 1, sy: 1 };
    const cols = new Set<number>(), rows = new Set<number>();
    const setC = new Map<number, number>(), setR = new Map<number, number>();
    for (const i of idxs) {
      const c = b.cells[i];
      const cw = sum(b.cols, c.x, c.cs) * sc.sx, ch = sum(b.rows, c.y, c.rs) * sc.sy;
      const wIsLong = cw >= ch - 1e-6;
      const tw = wIsLong ? size : shortTo, th = wIsLong ? shortTo : size;
      // only touch the directions that actually change, so neighbours stay put
      if (c.cs === 1 && Math.abs(cw - tw) > 1e-6) setC.set(c.x, tw);
      if (c.rs === 1 && Math.abs(ch - th) > 1e-6) setR.set(c.y, th);
    }
    void cols; void rows;
    for (const [x, v] of setC) b.cols[x] = v / sc.sx;
    for (const [y, v] of setR) b.rows[y] = v / sc.sy;
    changed.add(id);
  }
  // pass size changes up: a block's slot in its parent becomes the block's new size
  let guard = 0;
  while (changed.size && guard++ < 20) {
    const next = new Set<string>();
    for (const id of changed) {
      const child = doc.blocks[id], cs = scales.get(id);
      if (!cs || id === doc.root) continue;
      const realW = sum(child.cols) * cs.sx, realH = sum(child.rows) * cs.sy;
      for (const pb of Object.values(doc.blocks)) {
        const ps = scales.get(pb.id);
        if (!ps) continue;
        for (const cell of pb.cells) {
          if (cell.c.k !== 'inst' || cell.c.ref !== id) continue;
          const [needW, needH] = cell.c.rot % 2 ? [realH, realW] : [realW, realH];
          const haveW = sum(pb.cols, cell.x, cell.cs) * ps.sx, haveH = sum(pb.rows, cell.y, cell.rs) * ps.sy;
          if (Math.abs(needW - haveW) > 1e-6) { pb.cols[cell.x + cell.cs - 1] += (needW - haveW) / ps.sx; next.add(pb.id); }
          if (Math.abs(needH - haveH) > 1e-6) { pb.rows[cell.y + cell.rs - 1] += (needH - haveH) / ps.sy; next.add(pb.id); }
        }
      }
    }
    changed.clear();
    for (const n of next) changed.add(n);
  }
  // a pinned piece keeps whatever size it has now (so the pin doesn't rescale it all back)
  const a = doc.settings.anchor;
  if (a && doc.blocks[a.def]?.cells[a.i]) {
    const cs = cellSize(doc, a.def, a.i);
    if (cs) a.size = Math.min(cs.w, cs.h);
  }
}
