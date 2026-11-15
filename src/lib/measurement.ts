export interface Point { x: number; y: number }
export type Quad = [Point, Point, Point, Point];
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

export function validQuad(q: Point[]): q is Quad {
  if (q.length !== 4 || q.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  const turns = q.map((p, i) => cross(p, q[(i + 1) % 4], q[(i + 2) % 4]));
  return (turns.every(v => v > 1e-8) || turns.every(v => v < -1e-8)) && q.every((p, i) => distance(p, q[(i + 1) % 4]) > 1e-4);
}

/** Four planar correspondences, solved with pivoting; no vision-library runtime. */
export function homography(from: Quad, to: Quad): (p: Point) => Point {
  if (!validQuad(from) || !validQuad(to)) throw new Error('Place four corners around a rectangle, in order.');
  const a: number[][] = [];
  from.forEach(({ x, y }, i) => {
    const { x: u, y: v } = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const n = a[col][col];
    if (Math.abs(n) < 1e-10) throw new Error('The reference is too narrow or tilted. Retake from above.');
    for (let j = col; j <= 8; j++) a[col][j] /= n;
    for (let r = 0; r < 8; r++) if (r !== col) {
      const f = a[r][col]; for (let j = col; j <= 8; j++) a[r][j] -= f * a[col][j];
    }
  }
  const h = a.map(row => row[8]);
  return p => {
    const z = h[6] * p.x + h[7] * p.y + 1;
    if (Math.abs(z) < 1e-8) throw new Error('The piece is outside the calibrated plane. Retake from above.');
    return { x: (h[0] * p.x + h[1] * p.y + h[2]) / z, y: (h[3] * p.x + h[4] * p.y + h[5]) / z };
  };
}

export type Calibration = { kind: 'ruler'; points: [Point, Point]; length: number } | { kind: 'rectangle'; points: Quad; width: number; height: number };
export function measureQuad(piece: Quad, calibration: Calibration) {
  if (!validQuad(piece)) throw new Error('Place the four piece corners around its outside edge, in order.');
  let project: (p: Point) => Point;
  if (calibration.kind === 'ruler') {
    const pixels = distance(...calibration.points);
    if (pixels < 10 || !Number.isFinite(calibration.length) || calibration.length <= 0) throw new Error('Mark two separated ruler ticks and enter their distance.');
    const scale = calibration.length / pixels;
    project = p => ({ x: p.x * scale, y: p.y * scale });
  } else {
    const { width: w, height: h } = calibration;
    if (![w, h].every(v => Number.isFinite(v) && v > 0)) throw new Error('Enter the reference rectangle dimensions.');
    project = homography(calibration.points, [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]);
  }
  const q = piece.map(project);
  const edges = q.map((p, i) => distance(p, q[(i + 1) % 4]));
  if (edges.some(v => !Number.isFinite(v) || v <= 0 || v > 1200)) throw new Error('Check the reference and corner positions.');
  return { w: (edges[0] + edges[2]) / 2, h: (edges[1] + edges[3]) / 2, edges,
    uneven: Math.max(Math.abs(edges[0] - edges[2]), Math.abs(edges[1] - edges[3])) > .125 };
}

function hull(points: Point[]): Point[] {
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) { while (out.length > 1 && cross(out.at(-2)!, out.at(-1)!, p) <= 0) out.pop(); out.push(p); }
    return out.slice(0, -1);
  };
  return [...half(points), ...half([...points].reverse())];
}

/** Contrasting-table segmentation. Returns suggestions, never an accepted measurement.
 * Flooding from the image border preserves enclosed patterned regions. A clear margin
 * is required; component separation keeps a detached ruler from joining the fabric. */
export function detectOutlines(image: { width: number; height: number; data: Uint8ClampedArray }): Quad[] {
  const { width: w, height: h, data } = image, count = w * h;
  if (w < 20 || h < 20 || count > 1_000_000) return [];
  const samples: number[][] = [[], [], []];
  for (const y of [2, h - 3]) for (const x of [2, w - 3]) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const idx = ((y + dy) * w + x + dx) * 4;
      for (let c = 0; c < 3; c++) samples[c].push(data[idx + c]);
    }
  }
  const bg = samples.map(s => s.sort((a, b) => a - b)[Math.floor(s.length / 2)]);
  const mask = new Uint8Array(count), queue = new Int32Array(count);
  const similar = (i: number) => Math.hypot(data[i * 4] - bg[0], data[i * 4 + 1] - bg[1], data[i * 4 + 2] - bg[2]) < 40;
  let head = 0, tail = 0;
  const addBg = (i: number) => { if (!mask[i] && similar(i)) { mask[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < w; x++) { addBg(x); addBg((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { addBg(y * w); addBg(y * w + w - 1); }
  const neighbours = (i: number, visit: (i: number) => void) => {
    if (i % w) visit(i - 1); if (i % w < w - 1) visit(i + 1);
    if (i >= w) visit(i - w); if (i < count - w) visit(i + w);
  };
  while (head < tail) neighbours(queue[head++], addBg);
  const found: { quad: Quad; area: number }[] = [];
  for (let start = 0; start < count; start++) {
    if (mask[start]) continue;
    head = 0; tail = 1; queue[0] = start; mask[start] = 2;
    let border = false; const boundary: Point[] = [];
    while (head < tail) {
      const i = queue[head++], x = i % w, y = Math.floor(i / w);
      if (!x || !y || x === w - 1 || y === h - 1) border = true;
      let edge = false;
      neighbours(i, n => { if (mask[n] === 1) edge = true; else if (!mask[n]) { mask[n] = 2; queue[tail++] = n; } });
      if (edge) boundary.push({ x, y });
    }
    if (border || tail < count * .015 || boundary.length < 4) continue;
    const poly = hull(boundary);
    while (poly.length > 4) {
      let best = 0, area = Infinity;
      for (let i = 0; i < poly.length; i++) {
        const a = Math.abs(cross(poly[(i + poly.length - 1) % poly.length], poly[i], poly[(i + 1) % poly.length]));
        if (a < area) { area = a; best = i; }
      }
      poly.splice(best, 1);
    }
    if (!validQuad(poly)) continue;
    const first = poly.reduce((idx, p, i) => p.x + p.y < poly[idx].x + poly[idx].y ? i : idx, 0);
    const ordered = [...poly.slice(first), ...poly.slice(0, first)] as Quad;
    found.push({ quad: ordered, area: tail });
  }
  return found.sort((a, b) => b.area - a.area).slice(0, 5).map(x => x.quad);
}
