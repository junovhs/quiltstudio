/* Placing a piece without stretching it.
 * A piece keeps its own proportions when it goes into a bigger slot: it takes the part of the slot
 * nearest where you dropped it (lined up with the grid where it can), and the rest of the slot
 * stays as it was, a gutter you can fill with something else. */
import { sum, type Block, type Cell, type Content, type Doc } from './model';

/* ---------- screen <-> a block's own inches ----------
 * A copy of a block may sit turned or flipped inside others; each .grid knows how its copy is
 * turned (data-rot / data-flip), so compose those to map the screen back onto the block's grid. */
type M2 = [number, number, number, number];   // [a b; c d]
const mul = (p: M2, q: M2): M2 => [p[0] * q[0] + p[1] * q[2], p[0] * q[1] + p[1] * q[3], p[2] * q[0] + p[3] * q[2], p[2] * q[1] + p[3] * q[3]];
const ROT: M2[] = [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0]];
export type Frame = ReturnType<typeof frameOf>;
export function frameOf(grid: HTMLElement, W: number, H: number) {
  const chain: HTMLElement[] = [];
  for (let g: HTMLElement | null = grid; g; g = g.parentElement?.closest<HTMLElement>('.grid') ?? null) chain.push(g);
  let m: M2 = [1, 0, 0, 1];
  for (const g of chain.reverse()) {
    m = mul(m, ROT[(+(g.dataset.rot ?? 0)) % 4]);
    if (g.dataset.flip === '1') m = mul(m, [-1, 0, 0, 1]);
  }
  const r = grid.getBoundingClientRect();
  return {
    r, m,
    /** screen point -> block inches */
    toLocal(x: number, y: number) {
      const sx = (x - r.left) / r.width - 0.5, sy = (y - r.top) / r.height - 0.5;
      return { x: (m[0] * sx + m[2] * sy + 0.5) * W, y: (m[1] * sx + m[3] * sy + 0.5) * H };
    },
    /** block inches -> screen point */
    toScreen(x: number, y: number) {
      const lx = x / W - 0.5, ly = y / H - 0.5;
      return { x: r.left + (m[0] * lx + m[1] * ly + 0.5) * r.width, y: r.top + (m[2] * lx + m[3] * ly + 0.5) * r.height };
    },
    /** a box in block inches -> a rectangle on screen */
    rectOf(x0: number, y0: number, x1: number, y1: number) {
      const p = this.toScreen(x0, y0), q = this.toScreen(x1, y1);
      return new DOMRect(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.abs(q.x - p.x), Math.abs(q.y - p.y));
    },
  };
}

export const lines = (t: number[]) => t.reduce((a, v) => [...a, a.at(-1)! + v], [0]);
const EPS = 1e-6;

/** the shape a piece wants to be (width / height) */
export function aspectOf(doc: Doc, c: Content): number | null {
  if (c.k === 'empty') return null;
  if (c.k === 'inst') {
    const b = doc.blocks[c.ref];
    if (!b) return null;
    const r = sum(b.cols) / sum(b.rows);
    return c.rot % 2 ? 1 / r : r;
  }
  if (c.k === 'goose') return c.dir === 'up' || c.dir === 'down' ? 2 : 0.5;
  return 1;
}

export interface Fit { x0: number; y0: number; x1: number; y1: number; whole: boolean }
/**
 * Where a piece of shape `a` goes in slot `i`. `near` (block inches) is where it was dropped.
 * Slots within 20% of the right shape are filled whole (no thin slivers).
 */
export function fitIn(b: Block, i: number, a: number | null, near: { x: number; y: number } | null): Fit {
  const c = b.cells[i], Lc = lines(b.cols), Lr = lines(b.rows);
  const sx0 = Lc[c.x], sx1 = Lc[c.x + c.cs], sy0 = Lr[c.y], sy1 = Lr[c.y + c.rs];
  const sw = sx1 - sx0, sh = sy1 - sy0;
  const whole = { x0: sx0, y0: sy0, x1: sx1, y1: sy1, whole: true };
  if (a == null || Math.abs(Math.log((sw / sh) / a)) < Math.log(1.2)) return whole;
  const wide = sw / sh > a;
  const [lo, hi, len, L, want] = wide ? [sx0, sx1, sh * a, Lc, near?.x] : [sy0, sy1, sw / a, Lr, near?.y];
  // starts that line up with the grid: either edge of the slot, or a grid line inside it
  const starts = [lo, hi - len, ...L.filter(v => v > lo + EPS && v < hi - EPS).flatMap(v => [v, v - len])]
    .filter(v => v >= lo - EPS && v + len <= hi + EPS);
  const target = (want ?? lo + len / 2) - len / 2;
  const s = starts.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), starts[0]);
  return wide ? { x0: s, y0: sy0, x1: s + len, y1: sy1, whole: false } : { x0: sx0, y0: s, x1: sx1, y1: s + len, whole: false };
}

/** make sure there's a grid line at `at` (block inches): split the track it falls in; pieces across it just get wider */
function lineAt(b: Block, axis: 'col' | 'row', at: number): number {
  const tracks = axis === 'col' ? b.cols : b.rows, L = lines(tracks);
  const k = L.findIndex(v => Math.abs(v - at) < EPS);
  if (k >= 0) return k;
  const i = L.findIndex(v => v > at) - 1;
  const left = at - L[i], right = L[i + 1] - at;
  tracks.splice(i, 1, left, right);
  const p = axis === 'col' ? 'x' : 'y', s = axis === 'col' ? 'cs' : 'rs';
  for (const c of b.cells) { if (c[p] > i) c[p]++; else if (c[p] + c[s] > i) c[s]++; }
  return i + 1;
}

/** put `content` into slot `i` at `fit`; the rest of the slot keeps what it had. Returns the piece's index. */
export function placeFitted(b: Block, i: number, content: Content, fit: Fit, clone: <T>(v: T) => T): number {
  if (fit.whole) { b.cells[i].c = content; return i; }
  const x0 = lineAt(b, 'col', fit.x0), x1 = lineAt(b, 'col', fit.x1);
  const y0 = lineAt(b, 'row', fit.y0), y1 = lineAt(b, 'row', fit.y1);
  // a plain fabric slot (like a band) stays that fabric around the piece; anything else leaves empty space
  const slot = b.cells[i], rest: Content = slot.c.k === 'solid' ? clone(slot.c) : { k: 'empty' };
  const { x, y, cs, rs } = slot;
  const pieces: Cell[] = [];
  // the gutters: whatever's left of the slot either side of the piece
  if (x0 > x) pieces.push({ x, y, cs: x0 - x, rs, c: clone(rest) });
  if (x + cs > x1) pieces.push({ x: x1, y, cs: x + cs - x1, rs, c: clone(rest) });
  if (y0 > y) pieces.push({ x: x0, y, cs: x1 - x0, rs: y0 - y, c: clone(rest) });
  if (y + rs > y1) pieces.push({ x: x0, y: y1, cs: x1 - x0, rs: y + rs - y1, c: clone(rest) });
  Object.assign(slot, { x: x0, y: y0, cs: x1 - x0, rs: y1 - y0, c: content });
  b.cells.push(...pieces);
  return i;
}
