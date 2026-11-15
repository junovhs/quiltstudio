/* Random quilts, steered.
 *
 * An idea is a small recipe — a block, which fabric plays which part (light, medium, dark,
 * accent), a layout, and borders — and `buildIdea` turns it into a full design. Because it's
 * a recipe, "more like this one" is just changing one or two things about it.
 *
 * Quality comes from three places:
 *   1. structure quilters actually use: medallions, two-block layouts that chain together,
 *      pieced borders (sawtooth, geese, hourglass, checkerboard, piano keys, a ring of blocks)
 *      sized so their units divide the edge exactly;
 *   2. blocks that are either classics or invented the traditional way (a quarter, turned or
 *      mirrored), with contrast built in;
 *   3. a filter: many candidates are drawn tiny and scored for contrast and busyness against
 *      the chosen feel, muddy ones are dropped, and the best varied nine are kept. */
import { fabricsOf, xform, type Block, type Cell, type Content, type Corner, type Doc } from './model';
import { PRESETS } from './presets';
import { drawBlock } from './render';

export type Role = 'L' | 'M' | 'D' | 'A';
type Roles = Record<Role, string>;
type Shape = Pick<Block, 'cols' | 'rows' | 'cells'>;

/* ---------- steering ---------- */
export interface Steer {
  look: 'classic' | 'mixed' | 'new' | 'modern';
  layout: 'any' | 'grid' | 'alternate' | 'sashing' | 'two' | 'medallion' | 'bars';
  feel: 'calm' | 'balanced' | 'bold';
  size: 'baby' | 'throw' | 'bed';
  /** fabric ids to leave out */
  skip: string[];
  /** a colour preset (palettes.ts) instead of the quilt's own fabrics */
  palette: string | null;
}
export const DEFAULT_STEER: Steer = { look: 'mixed', layout: 'any', feel: 'balanced', size: 'throw', skip: [], palette: null };
const TARGET = { baby: { w: 40, tall: 1.1 }, throw: { w: 56, tall: 1.12 }, bed: { w: 70, tall: 1.25 } };

/* ---------- the recipe ---------- */
export interface Invented { name: string; n: 3 | 4; sym: 'turn' | 'mirror'; quarter: Cell[]; centre?: Content; used: Role[] }
/** concentric square rings, `n` cells across. miter: stripes meet on the diagonals (offset 1
 * shifts the side stripes against the top/bottom ones, which makes the op-art X); quarters /
 * halves: each ring changes colour at the middle of its sides */
export interface Rings { name: string; n: number; style: 'miter' | 'quarters' | 'halves'; offset: 0 | 1; a: Role; b: Role }
type BlockRef = { preset: string } | Invented | Rings;
/** modern colour bars: rows of rectangles, each row its own rhythm (fabric ids, not roles) */
export interface Bars { name: string; cols: number; u: number; rows: { h: number; k: number; pat: string[] }[] }
export type BorderKind = 'plain' | 'sawtooth' | 'geese' | 'hourglass' | 'checker' | 'piano' | 'blocks';
export interface Border { kind: BorderKind; a: Role; b: Role; corner: Role; size: number; ring?: string }
export interface Idea {
  block: BlockRef;
  roles: Roles;
  layout: Exclude<Steer['layout'], 'any'>;
  across: number; down: number;     // blocks (1 × 1 for a medallion)
  unit: number;                     // inches per grid square of the main block
  turn: boolean;                    // every other block a quarter turn
  plain: Role;                      // alternate squares, sashing, the light of a chain block
  stones: Role;                     // sashing cornerstones
  second: 'chain' | 'snowball';     // the other block of a two-block quilt
  borders: Border[];
  target: { w: number; h: number };
  bars?: Bars;
}

const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const chance = (p: number) => Math.random() < p;
const TAG = (r: Role) => '@' + r;               // placeholder fabric id, swapped for a real one on build
const ROLES: Role[] = ['L', 'M', 'D', 'A'];
const sumOf = (a: number[]) => a.reduce((s, v) => s + v, 0);
const half = (x: number) => Math.round(x * 2) / 2;
/** what's left over when `len` is cut into `u`-long pieces (rounding noise treated as none) */
const rem = (len: number, u: number) => { const r = len - Math.floor(len / u + 1e-9) * u; return r < 1e-6 || u - r < 1e-6 ? 0 : r; };
const fits = (len: number, u: number) => { const n = len / u; return Math.abs(n - Math.round(n)) < 1e-6 && Math.round(n) >= 1; };

/* ---------- blocks ---------- */
const CORNERS: Corner[] = ['tl', 'tr', 'br', 'bl'];
const UNIT_WEIGHTS: Record<Steer['feel'], string[]> = {
  calm: ['solid', 'solid', 'solid', 'solid', 'hst', 'hst', 'hst', 'sis', 'snow', 'strips'],
  balanced: ['solid', 'solid', 'solid', 'hst', 'hst', 'hst', 'hst', 'qst', 'qst', 'cnr', 'cnr', 'sis', 'snow', 'tri3', 'strips'],
  bold: ['solid', 'solid', 'hst', 'hst', 'hst', 'hst', 'qst', 'qst', 'qst', 'cnr', 'cnr', 'sis', 'tri3', 'tri3', 'strips'],
};
const pickers = (used: Role[]) => ({
  two: (): [string, string] => { const a = pick(used); let b = pick(used); while (b === a) b = pick(used); return [TAG(a), TAG(b)]; },
  three: () => [...used].sort(() => Math.random() - 0.5).concat(used).slice(0, 3).map(TAG),
});
function randomUnit(feel: Steer['feel'], used: Role[]): Content {
  const { two, three } = pickers(used);
  const [a, b] = two();
  switch (pick(UNIT_WEIGHTS[feel])) {
    case 'hst': return { k: 'hst', a, b, corner: pick(CORNERS) };
    case 'qst': { const f = three(); return { k: 'qst', f: [f[0], f[1], f[0], f[1]] }; }
    case 'cnr': return { k: 'cnr', a, b, corner: pick(CORNERS) };
    case 'sis': return { k: 'sis', c: a, o: b };
    case 'snow': return { k: 'snow', c: a, o: b };
    case 'tri3': { const f = three(); return { k: 'tri3', a: f[0], b: f[1], d: f[2], corner: pick(CORNERS) }; }
    case 'strips': return { k: 'strips', f: three(), dir: pick(['h', 'v'] as const) };
    default: return { k: 'solid', f: a };
  }
}
const turnN = (c: Content, n: number) => { for (let i = 0; i < n; i++) c = xform(c, 'r'); return c; };
const spin = (n: number) => (c: Cell): Cell => ({ x: n - (c.y + c.rs), y: c.x, cs: c.rs, rs: c.cs, c: turnN(c.c, 1) });
const mirrorX = (n: number) => (c: Cell): Cell => ({ ...c, x: n - (c.x + c.cs), c: xform(c.c, 'h') });
const mirrorY = (n: number) => (c: Cell): Cell => ({ ...c, y: n - (c.y + c.rs), c: xform(c.c, 'v') });

const NAMES = ['Star', 'Cross', 'Lantern', 'Compass', 'Garden', 'Window', 'Crown', 'Path', 'Puzzle', 'Kite', 'Mill', 'Basket', 'Gate', 'Rose', 'Wheel', 'Ladder'];
const FIRST = ['Prairie', 'Harbor', 'Orchard', 'Meadow', 'Cabin', 'River', 'Kitchen', 'Hearth', 'Church', 'Country', 'Morning', 'Autumn', 'Grandmother’s', 'Farmer’s'];

export function inventBlock(feel: Steer['feel']): Invented {
  // always a light, so the block reads; bold quilts get more fabrics and the accent
  const used: Role[] = feel === 'calm' ? pick([['L', 'D'], ['L', 'M']] as Role[][])
    : feel === 'bold' ? pick([['L', 'M', 'D'], ['L', 'D', 'A'], ['L', 'M', 'D', 'A']] as Role[][])
      : pick([['L', 'M', 'D'], ['L', 'M', 'D'], ['L', 'D'], ['L', 'D', 'A']] as Role[][]);
  const unit = () => randomUnit(feel, used);
  const n = pick([3, 4, 4] as const);
  const name = `${pick(FIRST)} ${pick(NAMES)}`;
  if (n === 3) {
    const corner = chance(0.45) ? { k: 'solid', f: TAG('L') } as Content : unit();
    const centre = chance(0.5) ? { k: 'solid', f: TAG(pick(used.filter(r => r !== 'L'))) } as Content : unit();
    return { name, n, sym: 'turn', used, quarter: [{ x: 0, y: 0, cs: 1, rs: 1, c: corner }, { x: 1, y: 0, cs: 1, rs: 1, c: unit() }], centre };
  }
  const quarter: Cell[] = chance(0.15)
    ? [{ x: 0, y: 0, cs: 2, rs: 2, c: unit() }]
    : [0, 1, 2, 3].map(i => ({ x: i % 2, y: Math.floor(i / 2), cs: 1, rs: 1, c: unit() }));
  return { name, n, sym: chance(0.5) ? 'turn' : 'mirror', used, quarter };
}
function tweak(b: Invented, feel: Steer['feel']): Invented {
  const q = structuredClone(b.quarter);
  const k = Math.floor(Math.random() * (q.length + (b.centre ? 1 : 0)));
  if (k < q.length) q[k].c = randomUnit(feel, b.used);
  return { ...b, quarter: q, centre: k >= q.length ? randomUnit(feel, b.used) : b.centre };
}
function expand(b: Invented): Shape {
  const n = b.n;
  let cells: Cell[] = [];
  if (b.sym === 'turn') { let cur = b.quarter; for (let i = 0; i < 4; i++) { cells.push(...cur); cur = cur.map(spin(n)); } }
  else { const r = b.quarter.map(mirrorX(n)); cells = [...b.quarter, ...r, ...b.quarter.map(mirrorY(n)), ...r.map(mirrorY(n))]; }
  if (b.centre) cells.push({ x: 1, y: 1, cs: 1, rs: 1, c: b.centre });
  return { cols: Array(n).fill(1), rows: Array(n).fill(1), cells: structuredClone(cells) };
}
const presetShape = (id: string) => PRESETS.find(p => p.id === id)!.build({ L: TAG('L'), M: TAG('M'), D: TAG('D'), A: TAG('A') });
export const shapeOf = (b: BlockRef): Shape => 'preset' in b ? presetShape(b.preset) : 'style' in b ? ringShape(b) : expand(b);
export const blockName = (b: BlockRef) => 'preset' in b ? PRESETS.find(p => p.id === b.preset)!.name : b.name;
export function nameOf(i: Idea) {
  if (i.layout === 'bars' && i.bars) return i.bars.name;
  const n = blockName(i.block);
  return i.layout === 'medallion' ? `${n} Medallion` : i.layout === 'two' ? `${n} ${i.second === 'chain' ? 'Chain' : '& Snowball'}` : n;
}
/** square blocks only for these jobs */
const SQUARE = PRESETS.filter(p => { const s = presetShape(p.id); return sumOf(s.cols) === sumOf(s.rows); }).map(p => p.id);
const CENTRES = ['ohio', 'sawtooth', 'friend', 'bearpaw', 'dutchman', 'churn', 'shoofly', 'kaleido', 'logcabin', 'pinwheel', 'courthouse'];
const RINGS = ['nine', 'pinwheel', 'hourglass', 'sis', 'friend', 'shoofly', 'churn', 'ohio', 'kaleido'];

/* ---------- modern: rings, shadows, bars ---------- */
function ringShape(r: Rings): Shape {
  const n = r.n, A = TAG(r.a), B = TAG(r.b), m = n / 2, cells: Cell[] = [];
  const S = (x: number, y: number, cs: number, rs: number, f: string) => { if (cs > 0 && rs > 0) cells.push({ x, y, cs, rs, c: { k: 'solid', f } }); };
  const corner = (x: number, y: number, at: Corner, a: string, b: string) =>
    cells.push({ x, y, cs: 1, rs: 1, c: a === b ? { k: 'solid', f: a } : { k: 'hst', a, b, corner: at } });
  for (let d = 0; d < m; d++) {
    const lo = d, hi = n - 1 - d, len = hi - lo - 1;
    if (r.style === 'miter') {
      // each side is one long strip; the corners are split on the diagonal
      const T = d % 2 ? A : B, Sd = (d + r.offset) % 2 ? A : B;
      S(lo + 1, lo, len, 1, T); S(lo + 1, hi, len, 1, T); S(lo, lo + 1, 1, len, Sd); S(hi, lo + 1, 1, len, Sd);
      corner(lo, lo, 'bl', Sd, T); corner(hi, lo, 'tl', T, Sd); corner(hi, hi, 'tr', Sd, T); corner(lo, hi, 'tl', Sd, T);
    } else {
      // log-cabin rings (top and bottom run the full width), split at the middle of each side
      const q = (k: number) => (r.style === 'quarters' ? k : k < 2 ? 0 : 1);
      const col = (k: number) => ((d + q(k)) % 2 ? A : B);   // k: 0 top-left, 1 top-right, 2 bottom-right, 3 bottom-left
      S(lo, lo, m - lo, 1, col(0)); S(m, lo, hi + 1 - m, 1, col(1));
      S(lo, hi, m - lo, 1, col(3)); S(m, hi, hi + 1 - m, 1, col(2));
      S(lo, lo + 1, 1, m - lo - 1, col(0)); S(lo, m, 1, hi - m, col(3));
      S(hi, lo + 1, 1, m - lo - 1, col(1)); S(hi, m, 1, hi - m, col(2));
    }
  }
  return { cols: Array(n).fill(1), rows: Array(n).fill(1), cells };
}
function randomRings(): Rings {
  const style = pick(['miter', 'miter', 'quarters', 'halves'] as const);
  const offset = style === 'miter' ? pick([1, 1, 0] as const) : 0;
  const [a, b] = pick([['L', 'D'], ['L', 'D'], ['D', 'L'], ['L', 'M'], ['M', 'D'], ['L', 'A']] as [Role, Role][]);
  const name = style === 'miter' ? (offset ? 'Op Art Squares' : 'Concentric Squares') : style === 'quarters' ? 'Twisted Squares' : 'Split Bullseye';
  return { name, n: pick([6, 8, 8, 10, 10, 12]), style, offset, a, b };
}
const MODERN = ['rail', 'courthouse', 'logcabin', 'hourglass', 'sis', 'bowtie', 'dfour', 'pinwheel'];
function modernBlock(): BlockRef {
  const r = Math.random();
  return r < 0.55 ? randomRings() : r < 0.78 ? { preset: pick(['shadow', 'shadow', 'attic']) } : { preset: pick(MODERN) };
}
const BAR_NAMES = ['Colour Bars', 'Stripe Study', 'Bar Code', 'Candy Bars', 'Ribbon Rows', 'Tempo', 'Pantone Rows', 'Brick Lane'];
/** rows of bars: the quilt's width split into `cols` columns; each row splits it into k equal bars in a repeating colour run */
function randomBars(doc: Doc, s: Steer, target: { w: number; h: number }): Bars {
  const fs = usableFabrics(doc, s.skip).map(f => f.id);
  const cols = pick([8, 12, 16]), u = Math.max(1.5, half(target.w / cols));
  const ks = [2, 3, 4, 6, 8, 12, 16].filter(k => cols % k === 0 && cols / k >= 1);
  const rows: Bars['rows'] = [];
  let H = 0, prev = '';
  while (H < target.h - 2) {
    let h = Math.max(2, half(u * pick([1, 1, 1.5, 1.5, 2, 2, 3])));
    if (target.h - H - h < 2) h = half(target.h - H);
    const solid = chance(0.05);
    // mostly a lively rhythm (4+ bars a row), now and then a slow one
    const lively = ks.filter(k => k >= 4 && (s.feel !== 'calm' || k <= 8));
    const k = solid ? 1 : chance(0.8) && lively.length ? pick(lively) : pick(ks);
    const p = solid ? 1 : Math.min(fs.length, pick(s.feel === 'calm' ? [2, 2, 3] : s.feel === 'bold' ? [2, 3, 3, 4] : [2, 2, 3, 4]));
    let pat: string[] = [];
    for (let t = 0; t < 6; t++) { pat = [...fs].sort(() => Math.random() - 0.5).slice(0, p); if (pat.join() !== prev) break; }
    prev = pat.join();
    rows.push({ h, k, pat }); H += h;
  }
  return { name: pick(BAR_NAMES), cols, u, rows };
}

function randomBlock(s: Steer, square: boolean, pool = SQUARE): BlockRef {
  if (s.look === 'modern') return modernBlock();
  if (s.look !== 'classic' && chance(0.1)) return randomRings();
  const classic = s.look === 'classic' || (s.look === 'mixed' && chance(0.55));
  if (classic) return { preset: pick(square ? pool : PRESETS.map(p => p.id)) };
  return inventBlock(s.feel);
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
export function usableFabrics(doc: Doc, skip: string[] = []): Fab[] {
  const all = doc.fabrics.filter(f => f.id !== doc.settings.binding);
  const fs = all.filter(f => !skip.includes(f.id));
  return (fs.length >= 2 ? fs : all.length ? all : doc.fabrics).map(f => ({ id: f.id, ...look(f.color) })).sort((a, b) => b.l - a.l);
}
/** light, medium, dark and an accent. Bold: the lightest and darkest; calm: closer together */
export function randomRoles(doc: Doc, s: Steer): Roles {
  const fs = usableFabrics(doc, s.skip);
  if (fs.length < 2) { const id = fs[0]?.id ?? doc.fabrics[0].id; return { L: id, M: id, D: id, A: id }; }
  const n = fs.length, top = Math.max(1, Math.floor(n / 2));
  let L: Fab, D: Fab;
  if (s.feel === 'bold') { L = fs[0]; D = fs[n - 1]; if (chance(0.3)) [L, D] = [pick(fs.slice(0, top)), pick(fs.slice(top))]; }
  else if (s.feel === 'calm' && n > 2) { const i = Math.floor(Math.random() * (n - 1)); L = fs[i]; D = fs[Math.min(n - 1, i + pick([1, 2]))]; }
  else { L = pick(fs.slice(0, top)); D = pick(fs.slice(top)); }
  const rest = fs.filter(f => f !== L && f !== D);
  // the medium is usually the most colourful of the rest; the accent is whatever's left
  const byColour = rest.toSorted((a, b) => b.sat - a.sat);
  const M = byColour.length ? (chance(0.7) ? byColour[0] : pick(byColour)) : D;
  const others = rest.filter(f => f !== M);
  const A = others.length ? pick(others) : M;
  return { L: L.id, M: M.id, D: D.id, A: A.id };
}

/* ---------- sizes ---------- */
/** inches per grid square, so a block lands in a range */
function unitFor(s: Shape, lo: number, hi: number) {
  const n = Math.max(sumOf(s.cols), sumOf(s.rows));
  const ok = [0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6].filter(u => n * u >= lo && n * u <= hi);
  return ok.length ? pick(ok) : Math.max(0.5, half(((lo + hi) / 2) / n));
}
const sashW = (bw: number) => Math.min(3, Math.max(1.5, half(bw / 5)));
/** the odd count nearest to an exact (fractional) count, so alternating corners match */
const nearOdd = (x: number) => {
  let n = Math.max(3, 2 * Math.round((x - 1) / 2) + 1);
  if (n - x > 0.5 && n > 3) n -= 2;     // never overshoot by more than half a block; a border makes up the rest
  return n;
};
const blockSize = (i: Idea) => { const s = shapeOf(i.block); return { bw: sumOf(s.cols) * i.unit, bh: sumOf(s.rows) * i.unit }; };
/** the centre (everything inside the borders) */
function centreSize(i: Idea) {
  if (i.layout === 'bars' && i.bars) return { w: i.bars.cols * i.bars.u, h: sumOf(i.bars.rows.map(r => r.h)) };
  const { bw, bh } = blockSize(i);
  const sw = i.layout === 'sashing' ? sashW(bw) : 0;
  return { w: i.across * (bw + sw) + sw, h: i.down * (bh + sw) + sw };
}
/** how long each border unit is along the edge */
const unitLen = (k: BorderKind, w: number) => (k === 'geese' ? 2 * w : k === 'checker' || k === 'piano' ? w / 2 : w);
const WIDTHS = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6];

/** borders with real widths, inside out; adds narrow spacer borders so pieced units fit exactly */
interface Planned extends Border { w: number }
function planBorders(i: Idea): Planned[] {
  let { w: W, h: H } = centreSize(i);
  const { bw, bh } = blockSize(i);
  const base = i.layout === 'medallion' ? Math.min(W, H) / 3 : i.layout === 'bars' ? 4 : Math.min(bw, bh) / 2;
  const out: Planned[] = [];
  const add = (b: Border, w: number) => { out.push({ ...b, w }); W += 2 * w; H += 2 * w; };
  for (const b of i.borders) {
    const want = Math.min(8, Math.max(1.5, base * b.size));
    if (b.kind === 'plain') { add(b, half(Math.max(1.5, want))); continue; }
    const tries = WIDTHS.toSorted((x, y) => Math.abs(x - want) - Math.abs(y - want)).slice(0, 5);
    let done = false;
    for (const w of tries) {
      const u = unitLen(b.kind, w);
      if (fits(W, u) && fits(H, u)) { add(b, w); done = true; break; }
      // a narrow plain border first can make the edge fit, when both sides are off by the same amount
      const need = rem(u - rem(W, u), u);
      if (Math.abs(rem(u - rem(H, u), u) - need) < 1e-6) {
        let s = need / 2;
        while (s < 1) s += u / 2;
        if (s <= 3.5) { add({ kind: 'plain', a: b.b, b: b.b, corner: b.b, size: 0 }, s); add(b, w); done = true; break; }
      }
    }
    if (!done) add({ ...b, kind: 'plain', a: b.corner }, half(want));
  }
  // a final plain border brings the quilt near the size you asked for
  const t = i.target, short = Math.min(t.w - W, t.h - H) / 2;
  if (short >= 1.5) add({ kind: 'plain', a: i.plain === 'L' ? 'D' : i.plain, b: 'L', corner: 'L', size: 0 }, half(Math.min(8, short)));
  return out;
}
export function quiltSize(i: Idea) {
  let { w, h } = centreSize(i);
  for (const b of planBorders(i)) { w += 2 * b.w; h += 2 * b.w; }
  return { w, h };
}
/** fit the block count (or a medallion's centre) to the target size */
function fit(i: Idea) {
  const { bw, bh } = blockSize(i);
  if (i.layout === 'medallion' || i.layout === 'bars') { i.across = 1; i.down = 1; return; }
  const extra = i.borders.reduce((s, b) => s + 2 * Math.min(8, Math.max(1.5, Math.min(bw, bh) / 2 * b.size)), 0);
  const sw = i.layout === 'sashing' ? sashW(bw) : 0;
  const ax = (i.target.w - extra - sw) / (bw + sw), dy = (i.target.h - extra - sw) / (bh + sw);
  const alt = i.layout === 'alternate' || i.layout === 'two';
  i.across = alt ? nearOdd(ax) : Math.max(2, Math.round(ax));
  i.down = alt ? nearOdd(dy) : Math.max(2, Math.round(dy));
}

/** block size for the layout and quilt size: a big medallion centre, smaller blocks when they alternate */
function unitRange(i: Idea, s: Steer) {
  const sh = shapeOf(i.block), z = s.size;
  // rings read best big: two or three across
  if ('style' in i.block && i.layout !== 'medallion') return unitFor(sh, z === 'baby' ? 10 : 14, z === 'bed' ? 26 : 22);
  if (i.layout === 'medallion') return unitFor(sh, z === 'baby' ? 14 : 18, z === 'bed' ? 30 : 24);
  if (i.layout === 'two' || i.layout === 'alternate') return unitFor(sh, z === 'baby' ? 5 : 6, z === 'bed' ? 12 : 10);
  return unitFor(sh, z === 'baby' ? 6 : 8, z === 'bed' ? 16 : 14);
}

/* ---------- making ideas ---------- */
function randomBorders(i: Idea, s: Steer): Border[] {
  if (s.look === 'modern' || i.layout === 'bars') return chance(0.25) ? [{ kind: 'plain', a: pick(['D', 'L'] as Role[]), b: 'L', corner: 'D', size: 0.2 }] : [];
  const pieced: BorderKind[] = s.feel === 'calm' ? ['sawtooth', 'piano', 'checker'] : ['sawtooth', 'sawtooth', 'geese', 'hourglass', 'checker', 'piano', 'blocks'];
  const pr = s.feel === 'calm' ? 0.2 : s.feel === 'bold' ? 0.6 : 0.4;
  const one = (): Border => {
    const kind: BorderKind = chance(pr) ? pick(pieced) : 'plain';
    const a = pick(['D', 'M', 'A'] as Role[]), b: Role = 'L';
    return { kind, a: kind === 'plain' ? pick(['D', 'M', 'A', 'L'] as Role[]) : a, b, corner: pick(['D', 'M', 'A'] as Role[]), size: kind === 'plain' ? pick([0.35, 0.5, 0.75]) : pick([0.4, 0.5]), ring: kind === 'blocks' ? pick(RINGS) : undefined };
  };
  if (i.layout === 'medallion') {
    // rings: plain and pieced, alternating so it doesn't get busy
    const n = s.size === 'baby' ? pick([2, 3]) : s.size === 'bed' ? pick([4, 5, 6]) : pick([3, 4, 5]);
    const out: Border[] = [];
    for (let k = 0; k < n; k++) {
      const b = one();
      if (k % 2 === 0) { b.kind = 'plain'; b.size = pick([0.15, 0.2, 0.25]); b.a = pick(['D', 'M', 'A', 'L'] as Role[]); }
      else if (b.kind === 'plain') { b.kind = pick(pieced); b.size = pick([0.25, 0.33]); if (b.kind === 'blocks') b.ring = pick(RINGS); }
      else b.size = pick([0.25, 0.33]);
      out.push(b);
    }
    return out;
  }
  const n = pick(s.feel === 'calm' ? [0, 1, 1, 2] : [0, 1, 1, 2, 2, 3]);
  return Array.from({ length: n }, one);
}

export function freshIdea(doc: Doc, s: Steer): Idea {
  const layout = s.layout !== 'any' ? s.layout
    : s.look === 'modern' ? pick(['grid', 'grid', 'grid', 'sashing', 'bars', 'bars', 'two'] as const)
      : pick(['grid', 'grid', 'alternate', 'sashing', 'two', 'two', 'medallion', 'medallion', 'bars'] as const);
  const tgt = TARGET[s.size], tall = chance(0.5) ? 1 : tgt.tall;
  const square = layout === 'two' || layout === 'medallion' || layout === 'alternate';
  const block = layout === 'medallion' ? randomBlock(s, true, CENTRES) : randomBlock(s, square);
  const i: Idea = {
    block, roles: randomRoles(doc, s), layout, across: 4, down: 4, unit: 2,
    turn: (layout === 'grid' || layout === 'sashing') && chance(s.look === 'modern' ? 0.35 : 0.25),
    plain: pick(['L', 'L', 'L', 'M'] as Role[]), stones: pick(['D', 'M', 'A'] as Role[]), second: pick(['chain', 'chain', 'snowball'] as const),
    borders: [], target: { w: tgt.w, h: Math.round(tgt.w * tall) },
  };
  if (layout === 'bars') i.bars = randomBars(doc, s, i.target);
  i.unit = unitRange(i, s);
  i.borders = randomBorders(i, s);
  fit(i);
  return i;
}

/** the same idea with one or two things changed (never against the steering) */
export function vary(parent: Idea, doc: Doc, s: Steer): Idea {
  const i: Idea = structuredClone(parent);
  if (i.layout === 'bars' && i.bars) return varyBars(i, doc, s);
  const moves: (() => void)[] = [
    () => { i.roles = randomRoles(doc, s); },
    () => { const r = i.roles; i.roles = pick([{ ...r, M: r.D, D: r.M }, { ...r, M: r.A, A: r.M }, { ...r, D: r.A, A: r.D }]); },
    () => { i.borders = randomBorders(i, s); },
    () => { if (i.borders.length) { const k = Math.floor(Math.random() * i.borders.length); i.borders[k] = { ...i.borders[k], a: pick(ROLES.filter(r => r !== 'L')), corner: pick(['D', 'M', 'A'] as Role[]) }; } },
    () => { i.plain = pick(['L', 'M', 'A'] as Role[]); i.stones = pick(['D', 'M', 'A'] as Role[]); i.second = i.second === 'chain' ? 'snowball' : 'chain'; },
    () => {
      if ('style' in i.block && chance(0.75)) i.block = tweakRings(i.block);
      else if ('quarter' in i.block && chance(0.7)) i.block = tweak(i.block, s.feel);
      else if ('quarter' in i.block && chance(0.4)) i.block = { ...i.block, sym: i.block.sym === 'turn' && i.block.n === 4 ? 'mirror' : 'turn' };
      else i.block = i.layout === 'medallion' ? randomBlock(s, true, CENTRES) : randomBlock(s, i.layout !== 'grid' && i.layout !== 'sashing');
      i.unit = unitRange(i, s);
    },
  ];
  if (i.layout !== 'medallion') moves.push(() => { i.turn = !i.turn && (i.layout === 'grid' || i.layout === 'sashing'); });
  if (s.layout === 'any') moves.push(() => {
    const options = (['grid', 'alternate', 'sashing', 'two', 'medallion', 'bars'] as const).filter(l => l !== i.layout);
    i.layout = pick(options);
    if (i.layout === 'bars') { i.bars = randomBars(doc, s, i.target); i.borders = randomBorders(i, s); return; }
    const sq = sumOf(shapeOf(i.block).cols) === sumOf(shapeOf(i.block).rows);
    if ((i.layout === 'medallion' || i.layout === 'two' || i.layout === 'alternate') && !sq) i.block = { preset: pick(i.layout === 'medallion' ? CENTRES : SQUARE) };
    i.unit = unitRange(i, s);
    if (i.layout === 'medallion') i.turn = false;
    i.borders = randomBorders(i, s);
  });
  const n = chance(0.6) ? 1 : 2;
  for (let k = 0; k < n; k++) pick(moves)();
  fit(i);
  return i;
}

function tweakRings(r: Rings): Rings {
  const t = structuredClone(r);
  pick([
    () => { t.n = pick([6, 8, 10, 12].filter(n => n !== t.n)); },
    () => { [t.a, t.b] = [t.b, t.a]; },
    () => { t.style = pick((['miter', 'quarters', 'halves'] as const).filter(x => x !== t.style)); t.offset = t.style === 'miter' ? 1 : 0; },
    () => { if (t.style === 'miter') t.offset = t.offset ? 0 : 1; else t.style = t.style === 'quarters' ? 'halves' : 'quarters'; },
    () => { t.b = pick((['D', 'M', 'A'] as Role[]).filter(x => x !== t.a)); },
  ])();
  t.name = t.style === 'miter' ? (t.offset ? 'Op Art Squares' : 'Concentric Squares') : t.style === 'quarters' ? 'Twisted Squares' : 'Split Bullseye';
  return t;
}
function varyBars(i: Idea, doc: Doc, s: Steer): Idea {
  const b = i.bars!, fs = usableFabrics(doc, s.skip).map(f => f.id);
  pick([
    // swap two colours everywhere
    () => { const [x, y] = [...fs].sort(() => Math.random() - 0.5); b.rows.forEach(r => { r.pat = r.pat.map(f => (f === x ? y : f === y ? x : f)); }); },
    // re-roll a couple of rows
    () => { const fresh = randomBars(doc, s, i.target); for (let t = 0; t < 2; t++) { const k = Math.floor(Math.random() * b.rows.length); const r = fresh.rows[k % fresh.rows.length]; b.rows[k] = { ...b.rows[k], k: r.k <= b.cols && b.cols % r.k === 0 ? r.k : b.rows[k].k, pat: r.pat }; } },
    // a different rhythm in one row
    () => { const k = Math.floor(Math.random() * b.rows.length), ks = [2, 4, 8].filter(n => b.cols % n === 0); b.rows[k].k = pick(ks); },
    // reverse the row order
    () => { b.rows.reverse(); },
    // a whole new set of rows
    () => { i.bars = { ...randomBars(doc, s, i.target), name: b.name }; },
  ])();
  return i;
}

/* ---------- recipe → design ---------- */
/** the fabric right at one corner of a unit (for chain blocks that join up with it) */
function cornerColour(c: Content, at: Corner): string | null {
  switch (c.k) {
    case 'solid': return c.f;
    case 'hst': return c.corner === at ? c.a : c.b;
    case 'cnr': return c.corner === at ? c.a : c.b;
    case 'sis': case 'snow': return c.o;
    case 'goose': return c.s;
    case 'qst': return c.f[at === 'tl' || at === 'tr' ? 0 : 2];
    case 'strips': return c.dir === 'h' ? (at[0] === 't' ? c.f[0] : c.f.at(-1)!) : (at[1] === 'l' ? c.f[0] : c.f.at(-1)!);
    case 'tri3': return c.corner === at ? c.a : null;
    default: return null;
  }
}
function cellAt(s: Shape, x: number, y: number) { return s.cells.find(c => x >= c.x && x < c.x + c.cs && y >= c.y && y < c.y + c.rs); }

/** the plain partner block for a two-block quilt: background, with corners that link the main blocks */
function partner(i: Idea, main: Shape): Shape {
  const nx = main.cols.length, ny = main.rows.length;
  const at = (x: number, y: number, corner: Corner) => { const c = cellAt(main, x, y)?.c; return (c && cornerColour(c, corner)) ?? TAG('D'); };
  const tl = at(0, 0, 'tl'), tr = at(nx - 1, 0, 'tr'), br = at(nx - 1, ny - 1, 'br'), bl = at(0, ny - 1, 'bl');
  const P = TAG(i.plain);
  if (i.second === 'snowball' && tl === tr && tr === br && br === bl) {
    return { cols: main.cols, rows: main.rows, cells: [{ x: 0, y: 0, cs: nx, rs: ny, c: { k: 'snow', c: P, o: tl } }] };
  }
  // chain: the corner squares carry the main block's corner colours across, the rest is plain
  const cells: Cell[] = [];
  const corners: Record<string, string> = { [`0,0`]: tl, [`${nx - 1},0`]: tr, [`${nx - 1},${ny - 1}`]: br, [`0,${ny - 1}`]: bl };
  const mid = { x0: 1, x1: nx - 1, y0: 1, y1: ny - 1 };
  for (const key in corners) { const [x, y] = key.split(',').map(Number); cells.push({ x, y, cs: 1, rs: 1, c: { k: 'solid', f: corners[key] } }); }
  // edges between the corners and the middle, as big plain pieces
  if (nx > 2) { cells.push({ x: 1, y: 0, cs: nx - 2, rs: 1, c: { k: 'solid', f: P } }, { x: 1, y: ny - 1, cs: nx - 2, rs: 1, c: { k: 'solid', f: P } }); }
  if (ny > 2) { cells.push({ x: 0, y: 1, cs: 1, rs: ny - 2, c: { k: 'solid', f: P } }, { x: nx - 1, y: 1, cs: 1, rs: ny - 2, c: { k: 'solid', f: P } }); }
  if (nx > 2 && ny > 2) cells.push({ x: mid.x0, y: mid.y0, cs: mid.x1 - mid.x0, rs: mid.y1 - mid.y0, c: { k: 'solid', f: P } });
  return { cols: main.cols, rows: main.rows, cells };
}

/** turn a whole block a quarter anticlockwise (for side borders) */
function ccw(s: Shape): Shape {
  const W = s.cols.length;
  return { cols: [...s.rows], rows: [...s.cols].reverse(), cells: s.cells.map(c => ({ x: c.y, y: W - (c.x + c.cs), cs: c.rs, rs: c.cs, c: turnN(c.c, 3) })) };
}
/** a pieced border strip `len` long and `w` deep, its outer edge at the top */
function strip(b: Planned, len: number): Shape {
  const w = b.w, A = TAG(b.a), B = TAG(b.b);
  const n = Math.round(len / unitLen(b.kind, w));
  const row = (cells: Content[], u: number) => ({ cols: Array(cells.length).fill(u), rows: [w], cells: cells.map((c, x) => ({ x, y: 0, cs: 1, rs: 1, c })) });
  const idx = [...Array(n).keys()];
  switch (b.kind) {
    case 'sawtooth': return row(idx.map(k => ({ k: 'hst', a: A, b: B, corner: k < n / 2 ? 'bl' : 'br' })), w);
    case 'hourglass': return row(idx.map(() => ({ k: 'qst', f: [B, A, B, A] })), w);
    case 'geese': return row(idx.map(k => ({ k: 'goose', g: A, s: B, dir: k < n / 2 ? 'right' : 'left' })), 2 * w);
    case 'blocks': return row(idx.map(() => ({ k: 'inst', ref: 'ring', rot: 0, flip: false })), w);
    case 'piano': {
      const seq = pick([[A, B], [A, TAG('M'), B], [A, B, TAG('A'), B]]);
      return row(idx.map(k => ({ k: 'solid', f: seq[k % seq.length] })), w / 2);
    }
    case 'checker': return {
      cols: Array(n).fill(w / 2), rows: [w / 2, w / 2],
      cells: [0, 1].flatMap(y => idx.map(x => ({ x, y, cs: 1, rs: 1, c: { k: 'solid', f: (x + y) % 2 ? B : A } as Content }))),
    };
    default: return row([{ k: 'solid', f: A }], len);
  }
}

export function buildIdea(i: Idea, from: Doc): Doc {
  const main = shapeOf(i.block);
  const blocks: Record<string, Block> = {};
  const scaled = (id: string, name: string, s: Shape, u: number): Block => ({ id, name, cols: s.cols.map(v => v * u), rows: s.rows.map(v => v * u), cells: structuredClone(s.cells) });
  if (i.layout !== 'bars') blocks.idea = scaled('idea', blockName(i.block), main, i.unit);
  if (i.layout === 'two') blocks.partner = scaled('partner', 'Chain block', partner(i, main), i.unit);
  const bw = blocks.idea ? sumOf(blocks.idea.cols) : 1, bh = blocks.idea ? sumOf(blocks.idea.rows) : 1;
  const S = (r: Role): Content => ({ k: 'solid', f: TAG(r) });
  const turn = i.turn && Math.abs(bw - bh) < 1e-6;
  const inst = (ref: string, rot = 0): Content => ({ k: 'inst', ref, rot: rot as 0, flip: false });

  let cols: number[] = [], rows: number[] = [], cells: Cell[] = [];
  if (i.layout === 'bars' && i.bars) {
    const b = i.bars;
    cols = Array(b.cols).fill(b.u); rows = b.rows.map(r => r.h);
    b.rows.forEach((r, y) => { const span = b.cols / r.k; for (let j = 0; j < r.k; j++) cells.push({ x: j * span, y, cs: span, rs: 1, c: { k: 'solid', f: r.pat[j % r.pat.length] } }); });
  } else if (i.layout === 'sashing') {
    const sw = sashW(bw);
    for (let x = 0; x < i.across; x++) cols.push(sw, bw); cols.push(sw);
    for (let y = 0; y < i.down; y++) rows.push(sw, bh); rows.push(sw);
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < cols.length; x++)
      cells.push({ x, y, cs: 1, rs: 1, c: x % 2 && y % 2 ? inst('idea', turn && ((x >> 1) + (y >> 1)) % 2 ? 1 : 0) : x % 2 || y % 2 ? S(i.plain) : S(i.stones) });
  } else {
    cols = Array(i.across).fill(bw); rows = Array(i.down).fill(bh);
    for (let y = 0; y < i.down; y++) for (let x = 0; x < i.across; x++) {
      const other = (x + y) % 2 === 1;
      const c = i.layout === 'alternate' && other ? S(i.plain) : i.layout === 'two' && other ? inst('partner') : inst('idea', turn && other ? 1 : 0);
      cells.push({ x, y, cs: 1, rs: 1, c });
    }
  }

  // borders, inside out
  let k = 0;
  for (const b of planBorders(i)) {
    const W = sumOf(cols), H = sumOf(rows), nx = cols.length, ny = rows.length;
    cells = cells.map(c => ({ ...c, x: c.x + 1, y: c.y + 1 }));
    if (b.kind === 'plain') {
      cells.push({ x: 0, y: 0, cs: nx + 2, rs: 1, c: S(b.a) }, { x: 0, y: ny + 1, cs: nx + 2, rs: 1, c: S(b.a) },
        { x: 0, y: 1, cs: 1, rs: ny, c: S(b.a) }, { x: nx + 1, y: 1, cs: 1, rs: ny, c: S(b.a) });
    } else {
      if (b.kind === 'blocks' && b.ring && !blocks.ring) {
        const rs = presetShape(b.ring);
        blocks.ring = scaled('ring', blockName({ preset: b.ring }), rs, b.w / Math.max(sumOf(rs.cols), sumOf(rs.rows)));
      }
      const top = strip(b, W), side = ccw(strip(b, H));
      const t = `border${k}t`, s = `border${k}s`;
      blocks[t] = { id: t, name: `Border ${k + 1} (top)`, cols: top.cols, rows: top.rows, cells: top.cells };
      blocks[s] = { id: s, name: `Border ${k + 1} (side)`, cols: side.cols, rows: side.rows, cells: side.cells };
      const corner = b.kind === 'blocks' && blocks.ring ? inst('ring') : S(b.corner);
      cells.push({ x: 1, y: 0, cs: nx, rs: 1, c: inst(t) }, { x: 1, y: ny + 1, cs: nx, rs: 1, c: inst(t, 2) },
        { x: 0, y: 1, cs: 1, rs: ny, c: inst(s) }, { x: nx + 1, y: 1, cs: 1, rs: ny, c: inst(s, 2) },
        { x: 0, y: 0, cs: 1, rs: 1, c: corner }, { x: nx + 1, y: 0, cs: 1, rs: 1, c: corner },
        { x: 0, y: ny + 1, cs: 1, rs: 1, c: corner }, { x: nx + 1, y: ny + 1, cs: 1, rs: 1, c: corner });
    }
    cols = [b.w, ...cols, b.w]; rows = [b.w, ...rows, b.w];
    k++;
  }
  blocks.quilt = { id: 'quilt', name: 'Quilt', cols, rows, cells };

  const doc: Doc = {
    v: 3, root: 'quilt', name: nameOf(i),
    fabrics: structuredClone(from.fabrics),
    settings: { ...structuredClone(from.settings), anchor: null, lockQuilt: false },
    blocks, progress: {},
  };
  let json = JSON.stringify(doc);
  for (const r of ROLES) json = json.replaceAll(`"${TAG(r)}"`, JSON.stringify(i.roles[r]));
  const out: Doc = JSON.parse(json);
  // two roles can land on the same fabric: a unit that's all one fabric is just a square
  for (const b of Object.values(out.blocks)) for (const c of b.cells) {
    if (c.c.k === 'solid' || c.c.k === 'inst' || c.c.k === 'empty') continue;
    const fs = fabricsOf(c.c);
    if (fs.length && fs.every(f => f === fs[0])) c.c = { k: 'solid', f: fs[0] };
  }
  return out;
}

/* ---------- the filter ---------- */
const FEEL = { calm: { busy: 0.12, contrast: 0.2 }, balanced: { busy: 0.22, contrast: 0.27 }, bold: { busy: 0.32, contrast: 0.34 } };
let scoreCv: CanvasRenderingContext2D | null = null;
/** draw it tiny and measure: how much light/dark contrast, how busy */
export function measure(doc: Doc) {
  const N = 72;
  scoreCv ??= Object.assign(document.createElement('canvas'), { width: N, height: N }).getContext('2d', { willReadFrequently: true });
  const ctx = scoreCv!;
  ctx.clearRect(0, 0, N, N);
  const paints = Object.fromEntries(doc.fabrics.map(f => [f.id, f.color]));
  drawBlock(ctx, doc, paints, doc.root, 0, 0, N, N);
  const px = ctx.getImageData(0, 0, N, N).data, L = new Float32Array(N * N);
  for (let p = 0; p < N * N; p++) L[p] = (0.2126 * px[p * 4] + 0.7152 * px[p * 4 + 1] + 0.0722 * px[p * 4 + 2]) / 255;
  let mean = 0; for (const v of L) mean += v; mean /= L.length;
  let varc = 0; for (const v of L) varc += (v - mean) ** 2;
  let edges = 0, pairs = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = L[y * N + x];
    if (x + 1 < N) { pairs++; if (Math.abs(v - L[y * N + x + 1]) > 0.08) edges++; }
    if (y + 1 < N) { pairs++; if (Math.abs(v - L[(y + 1) * N + x]) > 0.08) edges++; }
  }
  return { contrast: Math.sqrt(varc / L.length), busy: edges / pairs, light: mean };
}
export function score(doc: Doc, feel: Steer['feel']) {
  const m = measure(doc), t = FEEL[feel];
  if (m.contrast < 0.07) return -Infinity;                    // muddy: everything the same value
  return -(Math.abs(m.busy - t.busy) * 2 + Math.abs(m.contrast - t.contrast)) - (m.light < 0.18 ? 0.3 : 0);
}
const keyOf = (i: Idea) => (i.layout === 'bars' ? 'bars:' + JSON.stringify(i.bars?.rows[0]) : 'preset' in i.block ? i.block.preset : 'style' in i.block ? `${i.block.style}${i.block.offset}${i.block.n}` : i.block.name) + '|' + i.layout;

/** many candidates, scored, then the best nine that aren't repeats of each other */
export function bestNine(doc: Doc, s: Steer, make: () => Idea, count = 9, pool = 30) {
  const all = Array.from({ length: pool }, () => { const i = make(); const d = buildIdea(i, doc); return { i, d, sc: score(d, s.feel) }; })
    .filter(x => x.sc > -Infinity).sort((a, b) => b.sc - a.sc);
  const out: typeof all = [], blocks = new Map<string, number>(), layouts = new Map<string, number>();
  for (const x of all) {
    if (out.length >= count) break;
    const bk = keyOf(x.i).split('|')[0];
    if ((blocks.get(bk) ?? 0) >= 1) continue;
    if (s.layout === 'any' && (layouts.get(x.i.layout) ?? 0) >= 3) continue;
    out.push(x); blocks.set(bk, (blocks.get(bk) ?? 0) + 1); layouts.set(x.i.layout, (layouts.get(x.i.layout) ?? 0) + 1);
  }
  // not enough distinct ones: top up with the next best
  for (const x of all) { if (out.length >= count) break; if (!out.includes(x)) out.push(x); }
  return out;
}
