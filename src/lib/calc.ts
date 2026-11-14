import { sum, type Doc } from './model';

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
export interface Unit { key: string; label: string; w: number; h: number; fabrics: string[]; qty: number }
export interface Cut { f: string; w: number; h: number; qty: number; how: string }
export interface Use { id: string; w: number; h: number; qty: number }

export function analyse(doc: Doc) {
  const units = new Map<string, Unit>();
  const cuts = new Map<string, Cut>();
  const uses = new Map<string, Use>();
  const order: string[] = [];          // blocks in sewing order (children first)
  const warnings = new Set<string>();
  const s = doc.settings.seam;

  const addUnit = (label: string, w: number, h: number, fabrics: string[]) => {
    const [L, S] = w >= h ? [w, h] : [h, w];
    const key = `${label}|${fabrics.join(',')}|${k(L)}|${k(S)}`;
    const u = units.get(key) ?? { key, label, w: L, h: S, fabrics, qty: 0 };
    u.qty++; units.set(key, u);
  };
  const addCut = (f: string, w: number, h: number, qty: number, how: string) => {
    const [L, S] = w >= h ? [w, h] : [h, w];
    const key = `${f}|${k(L)}|${k(S)}|${how}`;
    const c = cuts.get(key) ?? { f, w: L, h: S, qty: 0, how };
    c.qty += qty; cuts.set(key, c);
  };
  // triangles are pooled, then turned into squares at the end (2 per square for HST, 4 per square for QST)
  const tri = new Map<string, { f: string; size: number; per: number; n: number; how: string }>();
  const addTri = (f: string, size: number, per: 2 | 4) => {
    const key = `${f}|${k(size)}|${per}`;
    const t = tri.get(key) ?? { f, size, per, n: 0, how: per === 2 ? 'cut once on the diagonal → HST triangles' : 'cut twice on the diagonal → QST triangles' };
    t.n++; tri.set(key, t);
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
          addUnit('HST', cw, ch, [c.a, c.b]);
          if (square) { addTri(c.a, cw, 2); addTri(c.b, cw, 2); }
          else {
            warnings.add(`${dim(cw, ch)} triangle units aren't square (half-rectangle triangles): use an HRT ruler or paper-piece. Fabric is budgeted generously.`);
            addCut(c.a, cw + 1, ch + 1, 1, 'HRT, oversized, trim after sewing');
            addCut(c.b, cw + 1, ch + 1, 1, 'HRT, oversized, trim after sewing');
          }
          break;
        case 'qst':
          addUnit('QST', cw, ch, [...c.f]);
          if (!square) warnings.add(`${dim(cw, ch)} quarter-square triangles aren't square; sizes are approximate.`);
          for (const f of c.f) addTri(f, Math.max(cw, ch), 4);
          break;
        case 'goose': {
          const [L, S] = cw >= ch ? [cw, ch] : [ch, cw];
          addUnit('One-piece goose', cw, ch, [c.g, c.s]);
          addCut(c.g, L + 2 * s, S + 2 * s, 1, 'goose rectangle (stitch-and-flip)');
          addCut(c.s, S + 2 * s, S + 2 * s, 2, 'sky squares (stitch-and-flip)');
          if (Math.abs(L - 2 * S) > 1e-3) warnings.add(`One-piece geese ${dim(L, S)} aren't 2:1, so stitch-and-flip points won't be sharp.`);
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

  // the 7/8 and 1¼ rules, generalised to any seam allowance (they assume ¼″)
  for (const t of tri.values()) {
    const extra = t.per === 2 ? 3.5 * s : 5 * s;
    addCut(t.f, t.size + extra, t.size + extra, Math.ceil(t.n / t.per), t.how);
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
