import { sum, upright, type Content, type Doc } from './model';
import { SNOW } from './shapes';

/* ---------- numbers ---------- */
const EIGHTHS = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];
export function fmt(x: number, unit = '″') {
  const e = Math.round(x * 8);
  if (Math.abs(e / 8 - x) > 1e-3) return +x.toFixed(2) + unit;
  const w = Math.floor(e / 8), f = e % 8;
  return (w ? String(w) : f ? '' : '0') + EIGHTHS[f] + unit;
}
export const dim = (w: number, h: number) => `${fmt(w, '')} × ${fmt(h, '')}″`;
export function yd(y: number) { return fmt(y, ' yd'); }
const k = (x: number) => x.toFixed(3);

/* ---------- walk the design ---------- */
export interface Unit { key: string; label: string; w: number; h: number; fabrics: string[]; qty: number; c: Content }
export type CutShape = 'rect' | 'hst' | 'qst';
export interface Cut { key: string; f: string; w: number; h: number; qty: number; how: string; shape: CutShape; trimTo?: number }
export interface Use { id: string; w: number; h: number; qty: number }

export function analyse(doc: Doc) {
  const units = new Map<string, Unit>();
  const cuts = new Map<string, Cut>();
  const uses = new Map<string, Use>();
  const order: string[] = [];          // blocks in sewing order (children first)
  const warnings = new Set<string>();
  const s = doc.settings.seam;

  const addUnit = (label: string, w: number, h: number, fabrics: string[], c: Content) => {
    const [L, S] = w >= h ? [w, h] : [h, w];
    const key = `unit|${label}|${fabrics.join(',')}|${k(L)}|${k(S)}`;
    const u = units.get(key) ?? { key, label, w: L, h: S, fabrics, qty: 0, c };
    u.qty++; units.set(key, u);
  };
  const addCut = (f: string, w: number, h: number, qty: number, how: string, shape: CutShape = 'rect', trimTo?: number) => {
    const [L, S] = w >= h ? [w, h] : [h, w];
    const key = `${f}|${k(L)}|${k(S)}|${how}`;
    const c = cuts.get(key) ?? { key: 'cut|' + key, f, w: L, h: S, qty: 0, how, shape, trimTo };
    c.qty += qty; cuts.set(key, c);
  };
  // triangles are pooled, then turned into squares at the end (2 per square for HST, 4 per square for QST)
  const tri = new Map<string, { f: string; size: number; per: number; n: number; how: string }>();
  const addTri = (f: string, size: number, per: 2 | 4) => {
    const key = `${f}|${k(size)}|${per}`;
    const t = tri.get(key) ?? { f, size, per, n: 0, how: per === 2 ? 'cut once on the diagonal → HST triangles' : 'cut twice on the diagonal → QST triangles' };
    t.n++; tri.set(key, t);
  };
  // cut big, sew, trim down: one oversized square of each fabric makes 2 HSTs
  const trim = new Map<string, { a: string; b: string; size: number; n: number }>();
  const addTrim = (a: string, b: string, size: number) => {
    const key = `${[a, b].sort()}|${k(size)}`;
    const t = trim.get(key) ?? { a, b, size, n: 0 };
    t.n++; trim.set(key, t);
  };
  const seen = new Set<string>();

  function walk(id: string, w: number, h: number, depth: number) {
    const b = doc.blocks[id];
    if (!b || depth > 12) return;
    const W = sum(b.cols), H = sum(b.rows), sx = w / W, sy = h / H;
    if (Math.abs(sx - sy) > 1e-3) warnings.add(`“${b.name}” is stretched to fit ${dim(w, h)}; its pieces are calculated at the stretched size.`);
    for (const cell of b.cells) {
      const cw = sum(b.cols, cell.x, cell.cs) * sx, ch = sum(b.rows, cell.y, cell.rs) * sy, c = cell.c;
      const square = Math.abs(cw - ch) < 1e-3;
      switch (c.k) {
        case 'solid':
          addCut(c.f, cw + 2 * s, ch + 2 * s, 1, 'square / rectangle');
          break;
        case 'hst':
          addUnit('HST', cw, ch, [c.a, c.b], { k: 'hst', a: c.a, b: c.b, corner: 'tl' });
          if (square && doc.settings.hst === 'exact') { addTri(c.a, cw, 2); addTri(c.b, cw, 2); }
          else if (square) { addTrim(c.a, c.b, cw); }
          else {
            warnings.add(`${dim(cw, ch)} triangle units aren't square (half-rectangle triangles): use an HRT ruler or paper-piece. Fabric is budgeted generously.`);
            addCut(c.a, cw + 1, ch + 1, 1, 'HRT, oversized, trim after sewing', 'hst');
            addCut(c.b, cw + 1, ch + 1, 1, 'HRT, oversized, trim after sewing', 'hst');
          }
          break;
        case 'qst':
          addUnit('QST', cw, ch, [...c.f], c);
          if (!square) warnings.add(`${dim(cw, ch)} quarter-square triangles aren't square; sizes are approximate.`);
          for (const f of c.f) addTri(f, Math.max(cw, ch), 4);
          break;
        case 'goose': {
          const [L, S] = cw >= ch ? [cw, ch] : [ch, cw];
          addUnit('One-piece goose', cw, ch, [c.g, c.s], { ...c, dir: 'up' });
          addCut(c.g, L + 2 * s, S + 2 * s, 1, 'goose rectangle (stitch-and-flip)');
          addCut(c.s, S + 2 * s, S + 2 * s, 2, 'sky squares (stitch-and-flip)');
          if (Math.abs(L - 2 * S) > 1e-3) warnings.add(`One-piece geese ${dim(L, S)} aren't 2:1, so stitch-and-flip points won't be sharp.`);
          break;
        }
        // stitch-and-flip units: a base piece, with squares sewn on the corners and trimmed
        case 'sis': case 'snow': {
          const share = c.k === 'sis' ? 1 / 2 : SNOW, m = Math.min(cw, ch);
          const name = c.k === 'sis' ? 'Square-in-a-square' : 'Snowball';
          addUnit(name, cw, ch, [c.c, c.o], c);
          addCut(c.c, cw + 2 * s, ch + 2 * s, 1, `${name.toLowerCase()} base (stitch-and-flip)`);
          addCut(c.o, m * share + 2 * s, m * share + 2 * s, 4, `${name.toLowerCase()} corners (stitch-and-flip)`);
          if (!square) warnings.add(`${dim(cw, ch)} ${name.toLowerCase()} units aren't square, so their corners won't be even.`);
          break;
        }
        case 'cnr': {
          const m = Math.min(cw, ch) / 2;
          addUnit('Corner triangle', cw, ch, [c.a, c.b], upright(c));
          addCut(c.b, cw + 2 * s, ch + 2 * s, 1, 'corner-triangle base (stitch-and-flip)');
          addCut(c.a, m + 2 * s, m + 2 * s, 1, 'corner square (stitch-and-flip)');
          break;
        }
        case 'tri3':
          addUnit('Three-triangle square', cw, ch, [c.a, c.b, c.d], upright(c));
          if (!square) warnings.add(`${dim(cw, ch)} three-triangle squares aren't square; sizes are approximate.`);
          addTri(c.a, Math.max(cw, ch), 2); addTri(c.b, Math.max(cw, ch), 4); addTri(c.d, Math.max(cw, ch), 4);
          break;
        case 'strips': {
          const n = c.f.length;
          const [sw, sh] = c.dir === 'h' ? [cw, ch / n] : [cw / n, ch];
          const u = upright(c) as typeof c;
          addUnit(`${n}-strip unit`, cw, ch, [...u.f], u);
          for (const f of c.f) addCut(f, sw + 2 * s, sh + 2 * s, 1, 'strip');
          break;
        }
        case 'inst': {
          const odd = c.rot % 2 === 1;
          const [iw, ih] = odd ? [ch, cw] : [cw, ch];
          const key = `${c.ref}|${k(Math.max(iw, ih))}|${k(Math.min(iw, ih))}`;
          const u = uses.get(key) ?? { id: c.ref, w: iw, h: ih, qty: 0 };
          u.qty++; uses.set(key, u);
          walk(c.ref, iw, ih, depth + 1);
          if (!seen.has(c.ref)) { seen.add(c.ref); order.push(c.ref); }
          break;
        }
      }
    }
  }

  const root = doc.blocks[doc.root];
  const QW = sum(root.cols), QH = sum(root.rows);
  walk(doc.root, QW, QH, 0);

  for (const t of trim.values()) {
    const n = Math.ceil(t.n / 2), z = t.size + 4 * s; // +1″ for ¼″ seams
    const how = `cut big, sew 2 HSTs, trim to ${fmt(t.size + 2 * s)}`;
    addCut(t.a, z, z, n, how, 'hst', t.size + 2 * s); addCut(t.b, z, z, n, how, 'hst', t.size + 2 * s);
  }
  // the 7/8 and 1¼ rules, generalised to any seam allowance (they assume ¼″)
  for (const t of tri.values()) {
    const extra = t.per === 2 ? 3.5 * s : 5 * s;
    addCut(t.f, t.size + extra, t.size + extra, Math.ceil(t.n / t.per), t.how, t.per === 2 ? 'hst' : 'qst');
  }

  // yardage: cut strips across the width of fabric, pick the orientation that uses the least length
  const wof = doc.settings.wof;
  const byFabric = new Map<string, { cuts: Cut[]; inches: number }>();
  for (const c of cuts.values()) {
    const opt = (w: number, h: number) => { const per = Math.floor(wof / w); return per > 0 ? Math.ceil(c.qty / per) * h : Infinity; };
    let inches = Math.min(opt(c.w, c.h), opt(c.h, c.w));
    if (!isFinite(inches)) { const per = Math.max(1, Math.floor(wof / c.h)); inches = Math.ceil(c.qty / per) * c.w; }
    const e = byFabric.get(c.f) ?? { cuts: [], inches: 0 };
    e.cuts.push(c); e.inches += inches; byFabric.set(c.f, e);
  }
  const yardage = [...byFabric.entries()].map(([f, e]) => ({
    f, inches: e.inches,
    yards: Math.max(0.25, Math.ceil((e.inches * 1.1) / 36 * 8) / 8),
    cuts: e.cuts.sort((a, b) => b.w * b.h - a.w * a.h),
  }));

  const bindLen = 2 * (QW + QH) + 12;
  const backW = QW + 8, backH = QH + 8;
  const panels = Math.ceil(Math.min(backW, backH) / (wof - 2));
  const finishing = {
    bindingInches: bindLen,
    bindingYards: Math.ceil(bindLen / 36 * 8) / 8,
    backing: { w: backW, h: backH, panels, yards: Math.ceil(panels * Math.max(backW, backH) / 36 * 8) / 8 },
  };

  return { size: { w: QW, h: QH }, units: [...units.values()], uses: [...uses.values()], order, yardage, finishing, warnings: [...warnings] };
}
export type Analysis = ReturnType<typeof analyse>;

/* ---------- sizing from one piece ---------- */

/** how much block `id` is scaled where it first appears in the quilt (inches per design-inch) */
export function scaleOf(doc: Doc, id: string): { sx: number; sy: number } | null {
  const seen = new Set<string>();
  function find(bid: string, sx: number, sy: number, depth: number): { sx: number; sy: number } | null {
    if (bid === id) return { sx, sy };
    const b = doc.blocks[bid];
    if (!b || depth > 12 || seen.has(bid + depth)) return null;
    for (const cell of b.cells) {
      if (cell.c.k !== 'inst') continue;
      const r = doc.blocks[cell.c.ref];
      if (!r) continue;
      const cw = sum(b.cols, cell.x, cell.cs) * sx, ch = sum(b.rows, cell.y, cell.rs) * sy;
      const [iw, ih] = cell.c.rot % 2 ? [ch, cw] : [cw, ch];
      const hit = find(cell.c.ref, iw / sum(r.cols), ih / sum(r.rows), depth + 1);
      if (hit) return hit;
    }
    seen.add(bid + depth);
    return null;
  }
  return find(doc.root, 1, 1, 0);
}

/** real finished size of a cell (first place it appears), or its design size if unused */
export function cellSize(doc: Doc, def: string, i: number) {
  const b = doc.blocks[def], c = b?.cells[i];
  if (!c) return null;
  const s = scaleOf(doc, def) ?? { sx: 1, sy: 1 };
  return { w: sum(b.cols, c.x, c.cs) * s.sx, h: sum(b.rows, c.y, c.rs) * s.sy, used: !!scaleOf(doc, def) };
}

/** keep the pinned piece at its size: scale the whole quilt (or the unused block) to match */
export function fitToAnchor(doc: Doc) {
  const a = doc.settings.anchor;
  if (!a) return;
  // a lock beats the pin: never rescale something that's locked
  if (Object.values(doc.blocks).some(b => b.locked)) return;
  const b = doc.blocks[a.def];
  if (!b || !b.cells[a.i]) { doc.settings.anchor = null; return; }
  const cs = cellSize(doc, a.def, a.i)!;
  const cur = Math.min(cs.w, cs.h);
  if (!(cur > 0)) return;
  const f = a.size / cur;
  if (Math.abs(f - 1) < 1e-9) return;
  const target = cs.used ? doc.blocks[doc.root] : b;
  target.cols = target.cols.map(v => v * f);
  target.rows = target.rows.map(v => v * f);
}
