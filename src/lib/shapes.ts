/* Geometry for the newer units, in a 1×1 square (scaled to the cell when drawn).
 * Every drawing path (canvas, thumbnails, print) uses this, so a unit is defined once.
 * Parts are drawn in order: later parts sit on top of earlier ones. */
import type { Content, Corner } from './model';

export type Pt = [number, number];
export interface Part { r: string; f: string; pts: Pt[] }

const IDX: Record<Corner, number> = { tl: 0, tr: 1, br: 2, bl: 3 };
/** turn points a quarter clockwise, n times */
const turn = (pts: Pt[], n: number): Pt[] => pts.map(p => { let [x, y] = p; for (let i = 0; i < n; i++) [x, y] = [1 - y, x]; return [x, y]; });
const R: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
/** snowball corners: a third of the side */
export const SNOW = 1 / 3;

export function partsOf(c: Content): Part[] | null {
  switch (c.k) {
    case 'sis': return [{ r: 'o', f: c.o, pts: R }, { r: 'c', f: c.c, pts: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]] }];
    case 'snow': {
      const d = SNOW;
      return [{ r: 'o', f: c.o, pts: R }, { r: 'c', f: c.c, pts: [[d, 0], [1 - d, 0], [1, d], [1, 1 - d], [1 - d, 1], [d, 1], [0, 1 - d], [0, d]] }];
    }
    case 'cnr': return [{ r: 'b', f: c.b, pts: R }, { r: 'a', f: c.a, pts: turn([[0, 0], [0.5, 0], [0, 0.5]], IDX[c.corner]) }];
    case 'tri3': {
      const n = IDX[c.corner];
      return [
        { r: 'a', f: c.a, pts: turn([[0, 0], [1, 0], [0, 1]], n) },
        { r: 'b', f: c.b, pts: turn([[1, 0], [1, 1], [0.5, 0.5]], n) },
        { r: 'd', f: c.d, pts: turn([[1, 1], [0, 1], [0.5, 0.5]], n) },
      ];
    }
    case 'strips': {
      const k = c.f.length;
      return c.f.map((f, i) => ({
        r: String(i), f,
        pts: c.dir === 'h' ? [[0, i / k], [1, i / k], [1, (i + 1) / k], [0, (i + 1) / k]] : [[i / k, 0], [(i + 1) / k, 0], [(i + 1) / k, 1], [i / k, 1]],
      }));
    }
    default: return null;
  }
}

/** CSS clip-path for a part */
export const clip = (pts: Pt[]) => `polygon(${pts.map(([x, y]) => `${+(x * 100).toFixed(3)}% ${+(y * 100).toFixed(3)}%`).join(',')})`;
/** flat [x, y, x, y…] list placed in a box */
export const place = (pts: Pt[], x: number, y: number, w: number, h: number) => pts.flatMap(([px, py]) => [x + px * w, y + py * h]);
