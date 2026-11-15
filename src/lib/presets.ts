/* Classic quilt blocks, built only from the units in model.ts.
 * Colours are roles: L light (background), M medium, D dark. They're matched to the
 * quilt's own fabrics when a block is added, so every preset arrives in your colours. */
import { xform, type Block, type Cell, type Content, type Corner, type Dir, type Doc } from './model';

export type Role = 'L' | 'M' | 'D';
/** light, medium, dark — plus an optional accent (falls back to the medium) */
export type Roles = Record<Role, string> & { A?: string };
export interface Preset { id: string; name: string; build: (r: Roles) => Pick<Block, 'cols' | 'rows' | 'cells'> }

/* ---------- tiny builders ---------- */
const S = (f: string): Content => ({ k: 'solid', f });
const H = (a: string, b: string, corner: Corner): Content => ({ k: 'hst', a, b, corner });
const Q = (t: string, r: string, b: string, l: string): Content => ({ k: 'qst', f: [t, r, b, l] });
const G = (g: string, s: string, dir: Dir): Content => ({ k: 'goose', g, s, dir });
const C = (x: number, y: number, c: Content, cs = 1, rs = 1): Cell => ({ x, y, cs, rs, c });
const turn = (c: Content, n: number) => { for (let i = 0; i < n; i++) c = xform(c, 'r'); return c; };
const even = (n: number) => Array(n).fill(1);

/** a 3×3 block that's the same all four ways round: one corner, one side (the top), a centre */
function star3(corner: Content, side: Content, centre: Content, cols = [1, 1, 1]) {
  return {
    cols, rows: cols,
    cells: [
      C(0, 0, corner), C(2, 0, turn(corner, 1)), C(2, 2, turn(corner, 2)), C(0, 2, turn(corner, 3)),
      C(1, 0, side), C(2, 1, turn(side, 1)), C(1, 2, turn(side, 2)), C(0, 1, turn(side, 3)),
      C(1, 1, centre),
    ],
  };
}
/** a checkerboard of solids */
const checker = (n: number, a: string, b: string, x0 = 0, y0 = 0) =>
  Array.from({ length: n * n }, (_, i) => C(x0 + (i % n), y0 + Math.floor(i / n), S((i % n + Math.floor(i / n)) % 2 ? b : a)));

export const PRESETS: Preset[] = [
  { id: 'nine', name: 'Nine Patch', build: ({ L, D }) => ({ cols: even(3), rows: even(3), cells: checker(3, D, L) }) },
  {
    id: 'dfour', name: 'Double Four Patch', build: ({ L, M, D }) => ({
      cols: even(4), rows: even(4),
      cells: [...checker(2, D, L), ...checker(2, D, L, 2, 2), C(2, 0, S(M), 2, 2), C(0, 2, S(M), 2, 2)],
    }),
  },
  // a dark ring round a light centre: bars next to the centre, triangles pointing in, light outer corners
  { id: 'churn', name: 'Churn Dash', build: ({ L, D }) => star3(H(D, L, 'br'), { k: 'strips', f: [L, D], dir: 'h' }, S(L)) },
  { id: 'ohio', name: 'Ohio Star', build: ({ L, M, D }) => star3(S(L), Q(L, D, L, D), S(M)) },
  { id: 'sawtooth', name: 'Sawtooth Star', build: ({ L, M, D }) => star3(S(L), G(L, D, 'down'), S(M), [1, 2, 1]) },
  { id: 'friend', name: 'Friendship Star', build: ({ L, D }) => star3(S(L), H(D, L, 'bl'), S(D)) },
  { id: 'shoofly', name: 'Shoo Fly', build: ({ L, D }) => star3(H(D, L, 'br'), S(L), S(D)) },
  {
    id: 'pinwheel', name: 'Pinwheel', build: ({ L, D }) => {
      const a = H(D, L, 'bl');
      return { cols: even(2), rows: even(2), cells: [C(0, 0, a), C(1, 0, turn(a, 1)), C(1, 1, turn(a, 2)), C(0, 1, turn(a, 3))] };
    },
  },
  {
    id: 'hourglass', name: 'Hourglass', build: ({ L, D }) => ({
      cols: even(2), rows: even(2),
      cells: [C(0, 0, Q(D, L, D, L)), C(1, 0, Q(L, D, L, D)), C(0, 1, Q(L, D, L, D)), C(1, 1, Q(D, L, D, L))],
    }),
  },
  // two dark squares, and two light ones whose dark inner corners make the knot
  {
    id: 'bowtie', name: 'Bow Tie', build: ({ L, D }) => ({
      cols: even(2), rows: even(2),
      cells: [C(0, 0, S(D)), C(1, 1, S(D)),
        C(1, 0, { k: 'cnr', a: D, b: L, corner: 'bl' }), C(0, 1, { k: 'cnr', a: D, b: L, corner: 'tr' })],
    }),
  },
  {
    id: 'rail', name: 'Rail Fence', build: ({ L, M, D }) => {
      const a: Content = { k: 'strips', f: [L, M, D], dir: 'h' }, b = turn(a, 1);
      return { cols: even(2), rows: even(2), cells: [C(0, 0, a), C(1, 0, b), C(0, 1, b), C(1, 1, a)] };
    },
  },
  // logs spiral out from the centre: light on two sides, dark on the other two
  {
    id: 'logcabin', name: 'Log Cabin', build: ({ L, M, D }) => ({
      cols: even(5), rows: even(5),
      cells: [C(2, 2, S(M)), C(2, 1, S(L)), C(3, 1, S(L), 1, 2), C(2, 3, S(D), 2, 1), C(1, 1, S(D), 1, 3),
        C(1, 0, S(L), 3, 1), C(4, 0, S(L), 1, 4), C(1, 4, S(D), 4, 1), C(0, 0, S(D), 1, 5)],
    }),
  },
  {
    id: 'courthouse', name: 'Courthouse Steps', build: ({ L, M, D }) => ({
      cols: even(5), rows: even(5),
      cells: [C(2, 2, S(M)), C(2, 1, S(L)), C(2, 3, S(L)), C(1, 1, S(D), 1, 3), C(3, 1, S(D), 1, 3),
        C(1, 0, S(L), 3, 1), C(1, 4, S(L), 3, 1), C(0, 0, S(D), 1, 5), C(4, 0, S(D), 1, 5)],
    }),
  },
  { id: 'geese', name: 'Flying Geese', build: ({ L, D }) => ({ cols: [2], rows: even(4), cells: [0, 1, 2, 3].map(y => C(0, y, G(D, L, 'up'))) }) },
  // four pairs of geese chasing each other round
  {
    id: 'dutchman', name: "Dutchman's Puzzle", build: ({ L, M, D }) => ({
      cols: even(4), rows: even(4),
      // each quadrant is the last one turned a quarter; the leading goose is dark
      cells: [C(0, 0, G(D, L, 'up'), 2, 1), C(0, 1, G(M, L, 'up'), 2, 1),
        C(3, 0, G(D, L, 'right'), 1, 2), C(2, 0, G(M, L, 'right'), 1, 2),
        C(2, 3, G(D, L, 'down'), 2, 1), C(2, 2, G(M, L, 'down'), 2, 1),
        C(0, 2, G(D, L, 'left'), 1, 2), C(1, 2, G(M, L, 'left'), 1, 2)],
    }),
  },
  {
    id: 'snowball9', name: 'Snowball & Nine Patch', build: ({ L, D }) => ({
      cols: even(6), rows: even(6),
      cells: [...checker(3, D, L), ...checker(3, D, L, 3, 3), C(3, 0, { k: 'snow', c: L, o: D }, 3, 3), C(0, 3, { k: 'snow', c: L, o: D }, 3, 3)],
    }),
  },
  // four paws (a big pad with triangle claws along its inner sides), light sashing, a small centre
  {
    id: 'bearpaw', name: "Bear's Paw", build: ({ L, M, D }) => {
      const paw = [C(0, 0, S(D), 2, 2), C(2, 0, H(D, L, 'bl')), C(2, 1, H(D, L, 'bl')), C(0, 2, H(D, L, 'tr')), C(1, 2, H(D, L, 'tr')), C(2, 2, S(L)), C(3, 0, S(L), 1, 3)];
      // a quarter turn of a cell about the middle of the 7×7 grid
      const spin = (c: Cell): Cell => ({ x: 7 - (c.y + c.rs), y: c.x, cs: c.rs, rs: c.cs, c: turn(c.c, 1) });
      const cells: Cell[] = [];
      let q = paw;
      for (let i = 0; i < 4; i++) { cells.push(...q); q = q.map(spin); }
      return { cols: even(7), rows: even(7), cells: [...cells, C(3, 3, S(M))] };
    },
  },
  // a square casting a 45° drop shadow: dark down the right, the accent along the bottom
  {
    id: 'shadow', name: 'Shadow Box', build: ({ L, M, D, A = M }) => ({
      cols: even(3), rows: even(3),
      cells: [C(0, 0, S(M), 2, 2), C(2, 0, H(D, L, 'bl')), C(2, 1, S(D)), C(0, 2, H(A, L, 'tr')), C(1, 2, S(A)), C(2, 2, H(D, A, 'tr'))],
    }),
  },
  // a window with two sills that meet at a mitred corner
  {
    id: 'attic', name: 'Attic Window', build: ({ M, D, A = M, L }) => ({
      cols: [2, 1], rows: [2, 1],
      cells: [C(0, 0, S(A === M ? L : M)), C(1, 0, S(D)), C(0, 1, S(A)), C(1, 1, H(D, A, 'tr'))],
    }),
  },
  { id: 'sis', name: 'Square in a Square', build: ({ L, D }) => ({ cols: [1], rows: [1], cells: [C(0, 0, { k: 'sis', c: D, o: L })] }) },
  // three-triangle squares turning round a centre point
  {
    id: 'kaleido', name: 'Spinning Triangles', build: ({ L, M, D }) => {
      const a: Content = { k: 'tri3', a: L, b: D, d: M, corner: 'tl' };
      return { cols: even(2), rows: even(2), cells: [C(0, 0, a), C(1, 0, turn(a, 1)), C(1, 1, turn(a, 2)), C(0, 1, turn(a, 3))] };
    },
  },
];

/* ---------- matching roles to the quilt's fabrics ---------- */
let probe: CanvasRenderingContext2D | null = null;
function look(css: string) {
  probe ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  if (!probe) return { l: 0.5, sat: 0 };
  probe.clearRect(0, 0, 1, 1); probe.fillStyle = '#808080'; probe.fillStyle = css; probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return { l: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, sat: (Math.max(r, g, b) - Math.min(r, g, b)) / 255 };
}
/** lightest fabric is the background, darkest the dark, and something in between the medium */
export function rolesFor(doc: Doc): Roles {
  const fs = doc.fabrics.filter(f => f.id !== doc.settings.binding);
  const pool = (fs.length ? fs : doc.fabrics).map(f => ({ id: f.id, ...look(f.color) })).sort((a, b) => b.l - a.l);
  const L = pool[0]?.id ?? 'cream', D = pool.at(-1)?.id ?? L;
  const mid = pool.slice(1, -1);
  // the most colourful fabric in between (usually the print the quilt is about)
  const byColour = mid.sort((a, b) => b.sat - a.sat);
  const M = byColour[0]?.id ?? D;
  return { L, M, D, A: byColour[1]?.id };
}
