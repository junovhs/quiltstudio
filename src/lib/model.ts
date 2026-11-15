/* QuiltStudio data model.
 *
 * A design is a set of BLOCKS. Each block is a grid: column widths and row
 * heights in inches, and cells that sit on that grid (cells can span).
 * A cell holds one PRIMITIVE (solid, HST, QST, one-piece goose) or an
 * INSTANCE of another block (rotated / flipped). The quilt is just the root
 * block. Edit a block once and every instance of it changes.
 */

export type Corner = 'tl' | 'tr' | 'br' | 'bl';
export type Dir = 'up' | 'right' | 'down' | 'left';
export type Rot = 0 | 1 | 2 | 3;

export type Content =
  | { k: 'empty' }
  | { k: 'solid'; f: string }
  /** half-square triangle: fabric `a` fills the triangle at `corner`, `b` the rest */
  | { k: 'hst'; a: string; b: string; corner: Corner }
  /** quarter-square triangle: top, right, bottom, left */
  | { k: 'qst'; f: [string, string, string, string] }
  /** one-piece flying goose: goose triangle `g` points `dir`, sky `s` */
  | { k: 'goose'; g: string; s: string; dir: Dir }
  | { k: 'inst'; ref: string; rot: Rot; flip: boolean };

export type Kind = Content['k'];

export interface Cell { x: number; y: number; cs: number; rs: number; c: Content }
export interface Block { id: string; name: string; cols: number[]; rows: number[]; cells: Cell[]; /** keep this block's size when tidying */ locked?: boolean }
export interface Fabric { id: string; name: string; color: string; tile: number; image?: boolean }
/** the piece everything is sized from: e.g. "this checker square is my 1½″ template" */
export interface Anchor { def: string; i: number; size: number }
export interface Settings {
  seam: number; wof: number; binding: string | null; bindingWidth: number; seams: boolean;
  anchor: Anchor | null;
  /** HSTs: cut big and trim down (default), or cut exact (+⅞″) */
  hst: 'trim' | 'exact';
  /** square templates the quilter owns: CUT sizes (seam allowance included) */
  templates: number[];
  /** templates that are FINISHED size (no seam allowance), e.g. a hard plastic 1″ */
  finishedTemplates: number[];
}
export const DEFAULT_SETTINGS: Settings = {
  seam: 0.25, wof: 42, binding: 'binding', bindingWidth: 0.375, seams: true,
  anchor: null, hst: 'trim', templates: [1, 2, 3, 4, 6, 9], finishedTemplates: [1],
};
export interface Doc {
  v: 3; root: string; fabrics: Fabric[]; blocks: Record<string, Block>; settings: Settings;
  name?: string;
  /** Make-sheet check marks: cut/unit/block key -> done */
  progress?: Record<string, boolean>;
}

export const uid = (p = 'b') => p + Math.random().toString(36).slice(2, 8);
export const sum = (a: number[], from = 0, n = a.length) => a.slice(from, from + n).reduce((s, v) => s + v, 0);

/* ---------------- transforms (for rotate / flip / symmetry) ---------------- */
export type Xf = 'h' | 'v' | 'r'; // mirror left-right, mirror top-bottom, rotate 90° clockwise

const CORNER: Record<Xf, Record<Corner, Corner>> = {
  h: { tl: 'tr', tr: 'tl', bl: 'br', br: 'bl' },
  v: { tl: 'bl', bl: 'tl', tr: 'br', br: 'tr' },
  r: { tl: 'tr', tr: 'br', br: 'bl', bl: 'tl' },
};
const DIR: Record<Xf, Record<Dir, Dir>> = {
  h: { up: 'up', down: 'down', left: 'right', right: 'left' },
  v: { up: 'down', down: 'up', left: 'left', right: 'right' },
  r: { up: 'right', right: 'down', down: 'left', left: 'up' },
};

export function xform(c: Content, t: Xf): Content {
  switch (c.k) {
    case 'hst': return { ...c, corner: CORNER[t][c.corner] };
    case 'goose': return { ...c, dir: DIR[t][c.dir] };
    case 'qst': {
      const [T, R, B, L] = c.f;
      return { ...c, f: t === 'h' ? [T, L, B, R] : t === 'v' ? [B, R, T, L] : [L, T, R, B] };
    }
    case 'inst': {
      // orientation = rotate^rot ∘ flipX^flip
      if (t === 'r') return { ...c, rot: ((c.rot + 1) % 4) as Rot };
      const base = t === 'h' ? 0 : 2;
      return { ...c, rot: ((base - c.rot + 8) % 4) as Rot, flip: !c.flip };
    }
    default: return c;
  }
}
export const xformN = (c: Content, ts: Xf[]) => ts.reduce(xform, c);

/* ---------------- regions (the clickable / recolourable parts) ---------------- */
export function regionsOf(c: Content): string[] {
  switch (c.k) {
    case 'solid': return ['f'];
    case 'hst': return ['a', 'b'];
    case 'qst': return ['0', '1', '2', '3'];
    case 'goose': return ['g', 's'];
    default: return [];
  }
}
export function getRegion(c: Content, r: string): string | null {
  if (c.k === 'solid') return c.f;
  if (c.k === 'hst') return r === 'a' ? c.a : c.b;
  if (c.k === 'qst') return c.f[+r];
  if (c.k === 'goose') return r === 'g' ? c.g : c.s;
  return null;
}
export function setRegion(c: Content, r: string, f: string): Content {
  if (c.k === 'empty') return { k: 'solid', f };
  if (c.k === 'solid') return { ...c, f };
  if (c.k === 'hst') return r === 'a' ? { ...c, a: f } : { ...c, b: f };
  if (c.k === 'qst') { const q = [...c.f] as [string, string, string, string]; q[+r] = f; return { ...c, f: q }; }
  if (c.k === 'goose') return r === 'g' ? { ...c, g: f } : { ...c, s: f };
  return c;
}
/** region index after transform, so symmetric recolouring hits the matching triangle */
export function xformRegion(c: Content, r: string, ts: Xf[]): string {
  if (c.k !== 'qst') return r;
  let i = +r; // 0 top 1 right 2 bottom 3 left
  for (const t of ts) i = t === 'h' ? [0, 3, 2, 1][i] : t === 'v' ? [2, 1, 0, 3][i] : (i + 1) % 4;
  return String(i);
}

/** list of fabrics in the content, in region order (for switching kinds) */
export function fabricsOf(c: Content): string[] {
  return regionsOf(c).map(r => getRegion(c, r)!);
}
export function makeKind(kind: Kind, fabs: string[], fallback: string, ref?: string): Content {
  const A = fabs[0] ?? fallback, B = fabs[1] ?? fabs[0] ?? fallback;
  switch (kind) {
    case 'solid': return { k: 'solid', f: A };
    case 'hst': return { k: 'hst', a: A, b: B, corner: 'tl' };
    case 'qst': return { k: 'qst', f: [A, B, fabs[2] ?? A, fabs[3] ?? B] };
    case 'goose': return { k: 'goose', g: A, s: B, dir: 'up' };
    case 'inst': return { k: 'inst', ref: ref!, rot: 0, flip: false };
    default: return { k: 'empty' };
  }
}

/* ---------------- grid operations ---------------- */
export function cellIndexAt(b: Block, x: number, y: number) {
  return b.cells.findIndex(c => x >= c.x && x < c.x + c.cs && y >= c.y && y < c.y + c.rs);
}

/** add empty 1×1 cells anywhere the grid is not covered */
export function fillGaps(b: Block) {
  for (let y = 0; y < b.rows.length; y++)
    for (let x = 0; x < b.cols.length; x++)
      if (cellIndexAt(b, x, y) < 0) b.cells.push({ x, y, cs: 1, rs: 1, c: { k: 'empty' } });
}

export function insertTrack(b: Block, axis: 'col' | 'row', at: number, size: number) {
  const tracks = axis === 'col' ? b.cols : b.rows;
  tracks.splice(at, 0, size);
  for (const c of b.cells) {
    const p = axis === 'col' ? 'x' : 'y', s = axis === 'col' ? 'cs' : 'rs';
    if (c[p] >= at) c[p]++;
    else if (c[p] + c[s] > at) c[s]++;
  }
  // a freshly inserted track inside a spanning cell is covered by it; elsewhere fill with copies of the neighbour
  for (let i = 0; i < (axis === 'col' ? b.rows.length : b.cols.length); i++) {
    const [x, y] = axis === 'col' ? [at, i] : [i, at];
    if (cellIndexAt(b, x, y) >= 0) continue;
    const [nx, ny] = axis === 'col' ? [at + 1 < b.cols.length ? at + 1 : at - 1, i] : [i, at + 1 < b.rows.length ? at + 1 : at - 1];
    const n = b.cells[cellIndexAt(b, nx, ny)];
    b.cells.push({ x, y, cs: 1, rs: 1, c: n ? structuredClone($snap(n.c)) : { k: 'empty' } });
  }
}

export function deleteTrack(b: Block, axis: 'col' | 'row', i: number) {
  const tracks = axis === 'col' ? b.cols : b.rows;
  if (tracks.length <= 1) return;
  tracks.splice(i, 1);
  const p = axis === 'col' ? 'x' : 'y', s = axis === 'col' ? 'cs' : 'rs';
  b.cells = b.cells.filter(c => !(c[p] === i && c[s] === 1));
  for (const c of b.cells) {
    if (c[p] > i) c[p]--;
    else if (c[p] + c[s] > i) c[s]--;
  }
}

export function bbox(b: Block, idxs: number[]) {
  const cs = idxs.map(i => b.cells[i]);
  const x0 = Math.min(...cs.map(c => c.x)), y0 = Math.min(...cs.map(c => c.y));
  const x1 = Math.max(...cs.map(c => c.x + c.cs)), y1 = Math.max(...cs.map(c => c.y + c.rs));
  return { x0, y0, x1, y1 };
}
/** cells (indexes) inside the bbox; null if some cell straddles its edge */
export function cellsInBox(b: Block, bx: ReturnType<typeof bbox>) {
  const inside: number[] = [];
  b.cells.forEach((c, i) => {
    const ix = c.x < bx.x1 && c.x + c.cs > bx.x0, iy = c.y < bx.y1 && c.y + c.rs > bx.y0;
    if (!(ix && iy)) return;
    inside.push(i);
  });
  const ok = inside.every(i => { const c = b.cells[i]; return c.x >= bx.x0 && c.y >= bx.y0 && c.x + c.cs <= bx.x1 && c.y + c.rs <= bx.y1; });
  return ok ? inside : null;
}

export function merge(b: Block, idxs: number[]): number | null {
  if (idxs.length < 2) return null;
  const bx = bbox(b, idxs), inside = cellsInBox(b, bx);
  if (!inside) return null;
  const keep = b.cells[idxs[0]];
  const merged: Cell = { x: bx.x0, y: bx.y0, cs: bx.x1 - bx.x0, rs: bx.y1 - bx.y0, c: keep.c };
  b.cells = b.cells.filter((_, i) => !inside.includes(i));
  b.cells.push(merged);
  return b.cells.length - 1;
}

/** turn the selected rectangle of cells into a new block, and put one instance of it in their place */
export function groupToBlock(doc: Doc, b: Block, idxs: number[], name: string): string | null {
  const bx = bbox(b, idxs), inside = cellsInBox(b, bx);
  if (!inside) return null;
  const id = uid();
  doc.blocks[id] = {
    id, name,
    cols: b.cols.slice(bx.x0, bx.x1), rows: b.rows.slice(bx.y0, bx.y1),
    cells: inside.map(i => { const c = b.cells[i]; return { ...c, x: c.x - bx.x0, y: c.y - bx.y0, c: structuredClone($snap(c.c)) }; }),
  };
  b.cells = b.cells.filter((_, i) => !inside.includes(i));
  b.cells.push({ x: bx.x0, y: bx.y0, cs: bx.x1 - bx.x0, rs: bx.y1 - bx.y0, c: { k: 'inst', ref: id, rot: 0, flip: false } });
  return id;
}

/** split one cell into an n × m sub-block filled with its current content */
export function splitCell(doc: Doc, b: Block, i: number, n: number, m: number, name: string) {
  const cell = b.cells[i];
  const w = sum(b.cols, cell.x, cell.cs), h = sum(b.rows, cell.y, cell.rs);
  const id = uid();
  const cells: Cell[] = [];
  for (let y = 0; y < m; y++) for (let x = 0; x < n; x++) cells.push({ x, y, cs: 1, rs: 1, c: structuredClone($snap(cell.c)) });
  doc.blocks[id] = { id, name, cols: Array(n).fill(w / n), rows: Array(m).fill(h / m), cells };
  cell.c = { k: 'inst', ref: id, rot: 0, flip: false };
  return id;
}

/** does block `id` (or anything inside it) use block `target`? */
export function uses(doc: Doc, id: string, target: string, seen = new Set<string>()): boolean {
  if (id === target) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  const b = doc.blocks[id];
  return !!b && b.cells.some(c => c.c.k === 'inst' && uses(doc, c.c.ref, target, seen));
}

/* ---------------- symmetry ---------------- */
export type Sym = 'none' | 'h' | 'v' | 'quad' | 'rot';

/** cells that mirror cell i under the symmetry mode, with the transforms that map content onto them */
export function symTargets(b: Block, i: number, sym: Sym): { i: number; ts: Xf[] }[] {
  const c = b.cells[i], W = b.cols.length, H = b.rows.length;
  const out: { i: number; ts: Xf[] }[] = [{ i, ts: [] }];
  const add = (x: number, y: number, cs: number, rs: number, ts: Xf[]) => {
    const j = b.cells.findIndex(d => d.x === x && d.y === y && d.cs === cs && d.rs === rs);
    if (j >= 0 && !out.some(o => o.i === j)) out.push({ i: j, ts });
  };
  const mx = W - c.x - c.cs, my = H - c.y - c.rs;
  if (sym === 'h' || sym === 'quad') add(mx, c.y, c.cs, c.rs, ['h']);
  if (sym === 'v' || sym === 'quad') add(c.x, my, c.cs, c.rs, ['v']);
  if (sym === 'quad') add(mx, my, c.cs, c.rs, ['h', 'v']);
  if (sym === 'rot' && W === H) {
    let x = c.x, y = c.y, cs = c.cs, rs = c.rs; const ts: Xf[] = [];
    for (let k = 1; k < 4; k++) {
      [x, y, cs, rs] = [H - y - rs, x, rs, cs];
      ts.push('r');
      add(x, y, cs, rs, [...ts]);
    }
  }
  return out;
}

// Svelte state proxies can't be structuredClone'd; the store swaps in $state.snapshot here.
let $snap: <T>(v: T) => T = v => v;
export function setSnapshot(fn: <T>(v: T) => T) { $snap = fn; }
export const snap = <T>(v: T) => $snap(v);

/* ---------------- the starting design ---------------- */
export function defaultDoc(): Doc {
  const S = (f: string): Content => ({ k: 'solid', f });
  const I = (ref: string, rot: Rot = 0): Content => ({ k: 'inst', ref, rot, flip: false });
  const C = (x: number, y: number, c: Content, cs = 1, rs = 1): Cell => ({ x, y, cs, rs, c });
  const checker = (n: number, A: string, B: string) => {
    const cells: Cell[] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) cells.push(C(x, y, S((x + y) % 2 ? B : A)));
    return cells;
  };
  // flying goose = 2 HST squares side by side, goose pointing up
  const goose = (g: string, s: string): Cell[] => [
    C(0, 0, { k: 'hst', a: g, b: s, corner: 'br' }),
    C(1, 0, { k: 'hst', a: g, b: s, corner: 'bl' }),
  ];
  const blocks: Block[] = [
    { id: 'gooseCream', name: 'Goose · floral / cream', cols: [2.25, 2.25], rows: [2.25], cells: goose('floral', 'cream') },
    { id: 'gooseBrown', name: 'Goose · floral / brown', cols: [5, 5], rows: [5], cells: goose('floral', 'brown') },
    { id: 'nine', name: 'Nine-patch', cols: [1.5, 1.5, 1.5], rows: [1.5, 1.5, 1.5], cells: checker(3, 'black', 'cream') },
    { id: 'check16', name: 'Checkerboard 4×4', cols: [2.5, 2.5, 2.5, 2.5], rows: [2.5, 2.5, 2.5, 2.5], cells: checker(4, 'black', 'cream') },
    {
      id: 'corner', name: 'Corner block', cols: [2.25, 4.5, 2.25], rows: [2.25, 4.5, 2.25], cells: [
        C(0, 0, S('brown')), C(1, 0, I('gooseCream', 2)), C(2, 0, S('brown')),
        C(0, 1, I('gooseCream', 1)), C(1, 1, I('nine')), C(2, 1, I('gooseCream', 3)),
        C(0, 2, S('brown')), C(1, 2, I('gooseCream', 0)), C(2, 2, S('brown')),
      ],
    },
    {
      id: 'side', name: 'Side block', cols: [3.875, 3.875, 4.5, 3.875, 3.875], rows: [2.25, 4.5, 2.25], cells: [
        C(0, 0, S('floral'), 5, 1),
        C(0, 1, { k: 'hst', a: 'cream', b: 'brown', corner: 'bl' }), C(1, 1, { k: 'hst', a: 'cream', b: 'brown', corner: 'bl' }),
        C(2, 1, I('nine')),
        C(3, 1, { k: 'hst', a: 'cream', b: 'brown', corner: 'br' }), C(4, 1, { k: 'hst', a: 'cream', b: 'brown', corner: 'br' }),
        C(0, 2, S('floral'), 5, 1),
      ],
    },
    {
      id: 'star', name: 'Center star', cols: [5, 10, 5], rows: [5, 10, 5], cells: [
        C(0, 0, S('floral')), C(1, 0, I('gooseBrown', 2)), C(2, 0, S('floral')),
        C(0, 1, I('gooseBrown', 1)), C(1, 1, I('check16')), C(2, 1, I('gooseBrown', 3)),
        C(0, 2, S('floral')), C(1, 2, I('gooseBrown', 0)), C(2, 2, S('floral')),
      ],
    },
    {
      id: 'quilt', name: 'Quilt', cols: [4.5, 9, 20, 9, 4.5], rows: [4.5, 9, 20, 9, 4.5], cells: [
        C(0, 0, S('floral')), C(1, 0, S('floral'), 3, 1), C(4, 0, S('floral')),
        C(0, 1, S('floral'), 1, 3), C(4, 1, S('floral'), 1, 3),
        C(0, 4, S('floral')), C(1, 4, S('floral'), 3, 1), C(4, 4, S('floral')),
        C(1, 1, I('corner', 0)), C(2, 1, I('side', 0)), C(3, 1, I('corner', 1)),
        C(1, 2, I('side', 3)), C(2, 2, I('star')), C(3, 2, I('side', 1)),
        C(1, 3, I('corner', 3)), C(2, 3, I('side', 2)), C(3, 3, I('corner', 2)),
      ],
    },
  ];
  return {
    v: 3, root: 'quilt',
    fabrics: [
      { id: 'floral', name: 'Blue floral', color: '#1f4fbf', tile: 6 },
      { id: 'brown', name: 'Chocolate brown', color: '#5a2d1a', tile: 6 },
      { id: 'cream', name: 'Cream', color: '#f3e8d2', tile: 6 },
      { id: 'black', name: 'Black', color: '#1c1c1c', tile: 6 },
      { id: 'binding', name: 'Checker binding', color: '#3a3a3a', tile: 2 },
    ],
    blocks: Object.fromEntries(blocks.map(b => [b.id, b])),
    settings: { ...DEFAULT_SETTINGS, templates: [...DEFAULT_SETTINGS.templates], finishedTemplates: [...DEFAULT_SETTINGS.finishedTemplates], anchor: { def: 'nine', i: 0, size: 1.5 } },
  };
}

/** a fresh, empty quilt: same starter fabrics, a 3 × 3 grid of empty 12″ squares */
export function blankDoc(): Doc {
  const d = defaultDoc();
  const cells: Cell[] = Array.from({ length: 9 }, (_, i) => ({ x: i % 3, y: Math.floor(i / 3), cs: 1, rs: 1, c: { k: 'empty' } }));
  d.blocks = { quilt: { id: 'quilt', name: 'Quilt', cols: [12, 12, 12], rows: [12, 12, 12], cells } };
  d.settings.anchor = null;
  return d;
}
