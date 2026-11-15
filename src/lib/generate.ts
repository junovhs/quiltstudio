/* Quilt ideas. An idea is a small recipe — which block, which fabric plays which part, how
 * the blocks are laid out, borders — and `buildIdea` turns it into a full design. Because
 * it's a recipe, "more like this one" is just changing one or two things about it.
 *
 * Blocks are either one of the classics (presets.ts) or invented on the spot: a random
 * quarter (or corner + side + centre) made of units, turned or mirrored to fill the block,
 * which is how most traditional blocks are made anyway. */
import { xform, type Block, type Cell, type Content, type Corner, type Doc } from './model';
import { PRESETS, type Roles } from './presets';

type Role = 'L' | 'M' | 'D';
type Shape = Pick<Block, 'cols' | 'rows' | 'cells'>;
/** an invented block: one quarter (or corner + side + centre) and how it's repeated */
export interface Invented { name: string; n: 3 | 4; sym: 'turn' | 'mirror'; quarter: Cell[]; centre?: Content; used: Role[] }
export interface Idea {
  /** a classic's id, or an invented block's recipe */
  block: { preset: string } | Invented;
  roles: Roles;                                   // fabric id for L, M, D
  layout: 'grid' | 'alternate' | 'sashing';
  across: number; down: number;                    // blocks
  unit: number;                                    // inches per grid square of the block
  turn: boolean;                                   // every other block a quarter turn
  plain: Role;                                     // alternate squares / sashing fabric
  stones: Role;                                    // sashing cornerstones
  borders: Role[];                                 // inside to outside
}

const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const chance = (p: number) => Math.random() < p;
const ROLES: Role[] = ['L', 'M', 'D'];
const TAG = (r: Role) => '@' + r;                   // placeholder fabric id, swapped for a real one on build

/* ---------- inventing a block ---------- */
const CORNERS: Corner[] = ['tl', 'tr', 'br', 'bl'];
function randomUnit(two: () => [string, string], three: () => string[]): Content {
  const [a, b] = two();
  // weights: plain squares and triangles most, the fancier units now and then
  const k = pick(['solid', 'solid', 'solid', 'hst', 'hst', 'hst', 'hst', 'qst', 'qst', 'cnr', 'cnr', 'sis', 'snow', 'tri3', 'strips'] as const);
  switch (k) {
    case 'solid': return { k, f: a };
    case 'hst': return { k, a, b, corner: pick(CORNERS) };
    case 'qst': { const f = three(); return { k, f: [f[0], f[1], f[0], f[1]] }; }
    case 'cnr': return { k, a, b, corner: pick(CORNERS) };
    case 'sis': return { k, c: a, o: b };
    case 'snow': return { k, c: a, o: b };
    case 'tri3': { const f = three(); return { k, a: f[0], b: f[1], d: f[2], corner: pick(CORNERS) }; }
    case 'strips': return { k, f: three(), dir: pick(['h', 'v'] as const) };
  }
}
const turnN = (c: Content, n: number) => { for (let i = 0; i < n; i++) c = xform(c, 'r'); return c; };
/** a quarter turn of a cell about the middle of an n×n grid */
const spin = (n: number) => (c: Cell): Cell => ({ x: n - (c.y + c.rs), y: c.x, cs: c.rs, rs: c.cs, c: turnN(c.c, 1) });
const mirrorX = (n: number) => (c: Cell): Cell => ({ ...c, x: n - (c.x + c.cs), c: xform(c.c, 'h') });
const mirrorY = (n: number) => (c: Cell): Cell => ({ ...c, y: n - (c.y + c.rs), c: xform(c.c, 'v') });

const NAMES = ['Star', 'Cross', 'Lantern', 'Compass', 'Garden', 'Window', 'Crown', 'Path', 'Puzzle', 'Kite', 'Mill', 'Basket', 'Gate', 'Rose'];
const FIRST = ['Prairie', 'Harbor', 'Orchard', 'Meadow', 'Cabin', 'River', 'Kitchen', 'Hearth', 'Church', 'Country', 'Morning', 'Autumn'];

const pickers = (used: Role[]) => ({
  two: (): [string, string] => { const a = pick(used); let b = pick(used); while (b === a) b = pick(used); return [TAG(a), TAG(b)]; },
  three: () => [...used].sort(() => Math.random() - 0.5).concat(used).slice(0, 3).map(TAG),
});
export function inventBlock(): Invented {
  // two or three fabrics per block, always including a light so it reads
  const used: Role[] = chance(0.65) ? ['L', 'M', 'D'] : chance(0.5) ? ['L', 'D'] : ['L', 'M'];
  const { two, three } = pickers(used);
  const unit = () => randomUnit(two, three);
  const n = pick([3, 4, 4] as const);
  const name = `${pick(FIRST)} ${pick(NAMES)}`;
  if (n === 3) {
    const corner = chance(0.4) ? { k: 'solid', f: TAG('L') } as Content : unit();
    const centre = chance(0.5) ? { k: 'solid', f: TAG(pick(used.filter(r => r !== 'L')) ?? 'D') } as Content : unit();
    return { name, n, sym: 'turn', used, quarter: [{ x: 0, y: 0, cs: 1, rs: 1, c: corner }, { x: 1, y: 0, cs: 1, rs: 1, c: unit() }], centre };
  }
  // a 2×2 quarter; sometimes one big unit fills it
  const quarter: Cell[] = chance(0.15)
    ? [{ x: 0, y: 0, cs: 2, rs: 2, c: unit() }]
    : [0, 1, 2, 3].map(i => ({ x: i % 2, y: Math.floor(i / 2), cs: 1, rs: 1, c: unit() }));
  return { name, n, sym: chance(0.5) ? 'turn' : 'mirror', used, quarter };
}
/** the same invented block with one of its units swapped */
function tweak(b: Invented): Invented {
  const { two, three } = pickers(b.used), q = structuredClone(b.quarter);
  const k = Math.floor(Math.random() * (q.length + (b.centre ? 1 : 0)));
  if (k < q.length) q[k].c = randomUnit(two, three);
  return { ...b, quarter: q, centre: k >= q.length ? randomUnit(two, three) : b.centre };
}
function expand(b: Invented): Shape {
  const n = b.n;
  let cells: Cell[] = [];
  if (b.sym === 'turn') { let cur = b.quarter; for (let i = 0; i < 4; i++) { cells.push(...cur); cur = cur.map(spin(n)); } }
  else { const r = b.quarter.map(mirrorX(n)); cells = [...b.quarter, ...r, ...b.quarter.map(mirrorY(n)), ...r.map(mirrorY(n))]; }
  if (b.centre) cells.push({ x: 1, y: 1, cs: 1, rs: 1, c: b.centre });
  return { cols: Array(n).fill(1), rows: Array(n).fill(1), cells: structuredClone(cells) };
}

/* ---------- colours ---------- */
interface Fab { id: string; l: number; sat: number }
let probe: CanvasRenderingContext2D | null = null;
function look(css: string) {
  probe ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  if (!probe) return { l: 0.5, sat: 0 };
  probe.clearRect(0, 0, 1, 1); probe.fillStyle = '#808080'; probe.fillStyle = css; probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return { l: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, sat: (Math.max(r, g, b) - Math.min(r, g, b)) / 255 };
}
const fabricsOfDoc = (doc: Doc): Fab[] => {
  const fs = doc.fabrics.filter(f => f.id !== doc.settings.binding);
  return (fs.length ? fs : doc.fabrics).map(f => ({ id: f.id, ...look(f.color) })).sort((a, b) => b.l - a.l);
};
/** a light, a dark and a medium from the quilt's fabrics; light is always lighter than dark */
export function randomRoles(doc: Doc): Roles {
  const fs = fabricsOfDoc(doc);
  if (fs.length < 2) { const id = fs[0]?.id ?? doc.fabrics[0].id; return { L: id, M: id, D: id }; }
  const half = Math.max(1, Math.floor(fs.length / 2));
  const L = pick(fs.slice(0, half)), D = pick(fs.slice(half));
  const rest = fs.filter(f => f !== L && f !== D);
  const M = rest.length ? pick(rest) : pick([L, D]);
  return { L: L.id, M: M.id, D: D.id };
}

/* ---------- a fresh idea, and variations ---------- */
const sizeFor = (s: Shape) => Math.max(s.cols.reduce((a, b) => a + b, 0), s.rows.reduce((a, b) => a + b, 0));
/** inches per grid square so the block comes out about 8–14″ */
function unitFor(s: Shape) {
  const n = sizeFor(s), ok = [1, 1.5, 2, 2.5, 3, 4].filter(u => n * u >= 8 && n * u <= 14);
  return ok.length ? pick(ok) : Math.max(1, Math.round(12 / n * 2) / 2);
}
export const shapeOf = (i: Idea): Shape => 'preset' in i.block ? PRESETS.find(p => p.id === (i.block as { preset: string }).preset)!.build({ L: TAG('L'), M: TAG('M'), D: TAG('D') }) : expand(i.block);
export const nameOf = (i: Idea) => 'preset' in i.block ? PRESETS.find(p => p.id === (i.block as { preset: string }).preset)!.name : i.block.name;

/** sashing about a fifth of the block, 1½–3″ */
const sashW = (bw: number) => Math.min(3, Math.max(1.5, Math.round(bw / 5 * 2) / 2));
/** odd counts so the corners match; round down rather than up */
const odd = (n: number) => (n % 2 ? n : Math.max(3, n - 1));
const borderW = (bw: number, bh: number) => Math.max(2, Math.round(Math.min(bw, bh) / 3 * 2) / 2);
/** how many blocks make a quilt of about 44–62″ including sashing and borders */
function counts(i: Idea) {
  const s = shapeOf(i), bw = s.cols.reduce((a, b) => a + b, 0) * i.unit, bh = s.rows.reduce((a, b) => a + b, 0) * i.unit;
  const sw = i.layout === 'sashing' ? sashW(bw) : 0;
  const extra = i.borders.length * 2 * borderW(bw, bh) + sw, pw = bw + sw, ph = bh + sw;
  const target = pick([44, 50, 56, 62]), tall = pick([1, 1, 1.15]);
  i.across = Math.max(2, Math.round((target - extra) / pw)); i.down = Math.max(2, Math.round(((target - extra) * tall) / ph));
  if (i.layout === 'alternate') { i.across = odd(i.across); i.down = odd(i.down); }
}
/** finished quilt size, without building it */
function sizeOf(i: Idea) {
  const s = shapeOf(i), bw = s.cols.reduce((a, b) => a + b, 0) * i.unit, bh = s.rows.reduce((a, b) => a + b, 0) * i.unit;
  const sw = i.layout === 'sashing' ? sashW(bw) : 0, extra = i.borders.length * 2 * borderW(bw, bh) + sw;
  return { w: i.across * (bw + sw) + extra, h: i.down * (bh + sw) + extra };
}

export function freshIdea(doc: Doc): Idea {
  const block = chance(0.55) ? { preset: pick(PRESETS).id } : inventBlock();
  const i: Idea = {
    block, roles: randomRoles(doc), layout: pick(['grid', 'grid', 'alternate', 'sashing'] as const),
    across: 4, down: 4, unit: 2, turn: chance(0.2), plain: pick(['L', 'L', 'M'] as Role[]), stones: pick(ROLES),
    borders: pick([[], ['M'], ['D'], ['L', 'D'], ['D', 'M']] as Role[][]),
  };
  i.unit = unitFor(shapeOf(i));
  counts(i);
  return i;
}

/** the same idea with one or two things changed */
export function vary(parent: Idea, doc: Doc): Idea {
  const i: Idea = structuredClone(parent);
  const moves = [
    () => { i.roles = randomRoles(doc); },
    () => { const r = i.roles; i.roles = chance(0.5) ? { L: r.L, M: r.D, D: r.M } : { ...r, M: randomRoles(doc).M }; },
    () => { i.layout = pick((['grid', 'alternate', 'sashing'] as const).filter(l => l !== i.layout)); counts(i); },
    () => { i.turn = !i.turn; },
    () => { i.borders = pick([[], ['M'], ['D'], ['L'], ['L', 'D'], ['D', 'M'], ['M', 'L', 'D']] as Role[][]); counts(i); },
    () => { i.plain = pick(ROLES.filter(r => r !== i.plain)); i.stones = pick(ROLES); },
    () => { i.across = Math.max(2, i.across + pick([-1, 1])); i.down = Math.max(2, i.down + pick([-1, 1])); if (i.layout === 'alternate') { i.across = odd(i.across); i.down = odd(i.down); } },
    // a related block: change one unit of an invented block (and its turned copies), or try another block
    () => {
      if ('quarter' in i.block && chance(0.7)) i.block = tweak(i.block);
      else if ('quarter' in i.block && chance(0.3)) i.block = { ...i.block, sym: i.block.sym === 'turn' && i.block.n === 4 ? 'mirror' : 'turn' };
      else i.block = chance(0.5) ? { preset: pick(PRESETS).id } : inventBlock();
      i.unit = unitFor(shapeOf(i)); counts(i);
    },
  ];
  const n = chance(0.6) ? 1 : 2;
  for (let k = 0; k < n; k++) pick(moves)();
  const z = sizeOf(i);
  if (z.w > 76 || z.h > 84 || z.w < 36) counts(i);   // drifted too big or small: fit it again
  return i;
}

/* ---------- recipe → design ---------- */
const sumOf = (a: number[]) => a.reduce((s, v) => s + v, 0);
export function buildIdea(i: Idea, from: Doc): Doc {
  const shape = structuredClone(shapeOf(i));
  const blk: Block = { id: 'idea', name: nameOf(i), cols: shape.cols.map(v => v * i.unit), rows: shape.rows.map(v => v * i.unit), cells: shape.cells };
  const bw = sumOf(blk.cols), bh = sumOf(blk.rows);
  const S = (r: Role): Content => ({ k: 'solid', f: TAG(r) });
  const turn = i.turn && Math.abs(bw - bh) < 1e-6;      // a quarter turn only works for square blocks
  const inst = (x: number, y: number): Content => ({ k: 'inst', ref: 'idea', rot: turn && (x + y) % 2 ? 1 : 0, flip: false });

  let cols: number[] = [], rows: number[] = [], cells: Cell[] = [];
  if (i.layout === 'sashing') {
    const sw = sashW(bw);
    for (let x = 0; x < i.across; x++) cols.push(sw, bw); cols.push(sw);
    for (let y = 0; y < i.down; y++) rows.push(sw, bh); rows.push(sw);
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < cols.length; x++) {
      const c = x % 2 && y % 2 ? inst(x >> 1, y >> 1) : x % 2 || y % 2 ? S(i.plain) : S(i.stones);
      cells.push({ x, y, cs: 1, rs: 1, c });
    }
  } else {
    cols = Array(i.across).fill(bw); rows = Array(i.down).fill(bh);
    for (let y = 0; y < i.down; y++) for (let x = 0; x < i.across; x++)
      cells.push({ x, y, cs: 1, rs: 1, c: i.layout === 'alternate' && (x + y) % 2 ? S(i.plain) : inst(x, y) });
  }
  // borders, inside out
  for (const r of i.borders) {
    const w = borderW(bw, bh);
    cells = cells.map(c => ({ ...c, x: c.x + 1, y: c.y + 1 }));
    const W = cols.length, H = rows.length;
    cells.push({ x: 0, y: 0, cs: W + 2, rs: 1, c: S(r) }, { x: 0, y: H + 1, cs: W + 2, rs: 1, c: S(r) },
      { x: 0, y: 1, cs: 1, rs: H, c: S(r) }, { x: W + 1, y: 1, cs: 1, rs: H, c: S(r) });
    cols = [w, ...cols, w]; rows = [w, ...rows, w];
  }

  const doc: Doc = {
    v: 3, root: 'quilt', name: nameOf(i),
    fabrics: structuredClone(from.fabrics),
    settings: { ...structuredClone(from.settings), anchor: null, lockQuilt: false },
    blocks: { idea: blk, quilt: { id: 'quilt', name: 'Quilt', cols, rows, cells } },
    progress: {},
  };
  // placeholder roles → the quilt's fabrics
  let json = JSON.stringify(doc);
  for (const r of ROLES) json = json.replaceAll(`"${TAG(r)}"`, JSON.stringify(i.roles[r]));
  return JSON.parse(json);
}
