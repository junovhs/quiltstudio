import { blankDoc, uid, type Doc, type Corner } from './model';

type RGB = [number, number, number];
const distance = (a: RGB, b: RGB) => a.reduce((n, v, i) => n + (v - b[i]) ** 2, 0);
const hex = (p: RGB) => '#' + p.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Reviewed grid interpretation, not an assertion that an inspiration image is a sewing pattern. */
export function draftReference(image: { width: number; height: number; data: Uint8ClampedArray }, cols: number, rows: number, width: number, colors: number, triangles: boolean): Doc {
  if (![cols, rows, colors].every(Number.isInteger) || cols < 1 || rows < 1 || cols > 24 || rows > 24 || colors < 2 || colors > 10 || !Number.isFinite(width) || width <= 0 || width > 1200 || image.width < cols || image.height < rows) throw new Error('Choose 1–24 rows and columns, 2–10 colours, and a positive quilt width.');
  const samples: RGB[] = [], tiles: { x: number; y: number; points: { u: number; v: number; rgb: RGB }[] }[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const points: { u: number; v: number; rgb: RGB }[] = [];
    for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) {
      const u = (i + .5) / 10, v = (j + .5) / 10;
      const px = Math.min(image.width - 1, Math.floor((x + u) / cols * image.width)), py = Math.min(image.height - 1, Math.floor((y + v) / rows * image.height));
      const offset = (py * image.width + px) * 4, alpha = image.data[offset + 3] / 255;
      const rgb = [0, 1, 2].map(c => image.data[offset + c] * alpha + 255 * (1 - alpha)) as RGB;
      points.push({ u, v, rgb }); samples.push(rgb);
    }
    tiles.push({ x, y, points });
  }
  // Deterministic farthest-point seeds avoid a palette changing every preview.
  const palette: RGB[] = [samples[0]];
  while (palette.length < colors) {
    let next = samples[0], far = 0;
    for (const sample of samples) { const d = Math.min(...palette.map(p => distance(p, sample))); if (d > far) { far = d; next = sample; } }
    if (far < 100) break; palette.push(next);
  }
  const nearest = (rgb: RGB) => palette.reduce((best, p, i) => distance(p, rgb) < distance(palette[best], rgb) ? i : best, 0);
  for (let n = 0; n < 7; n++) {
    const sums = palette.map(() => [0, 0, 0, 0]);
    for (const p of samples) { const s = sums[nearest(p)]; p.forEach((v, i) => s[i] += v); s[3]++; }
    sums.forEach((s, i) => { if (s[3]) palette[i] = s.slice(0, 3).map(v => v / s[3]) as RGB; });
  }
  const d = blankDoc(); d.name = 'My reference quilt'; d.settings.lockQuilt = false; d.settings.binding = null; d.settings.anchor = null;
  d.fabrics = palette.map((p, i) => ({ id: 'ref' + i, name: 'Colour ' + (i + 1), color: hex(p), tile: 6 }));
  const root = d.blocks[d.root]; root.cols = Array(cols).fill(width / cols); root.rows = Array(rows).fill(width / cols);
  const inside = (corner: Corner, u: number, v: number) => corner === 'tl' ? u + v < 1 : corner === 'br' ? u + v >= 1 : corner === 'tr' ? u >= v : u < v;
  root.cells = tiles.map(tile => {
    const bestColor = (points: typeof tile.points) => palette.reduce((best, p, i) => {
      const score = points.reduce((sum, v) => sum + distance(v.rgb, p), 0);
      return score < best.score ? { i, score } : best;
    }, { i: 0, score: Infinity });
    const solid = bestColor(tile.points);
    let best: { corner: Corner; a: number; b: number; score: number } | null = null;
    if (triangles) for (const corner of ['tl', 'tr'] as Corner[]) {
      const a = bestColor(tile.points.filter(p => inside(corner, p.u, p.v))), b = bestColor(tile.points.filter(p => !inside(corner, p.u, p.v)));
      const score = a.score + b.score;
      if (a.i !== b.i && score < solid.score * .72 && (!best || score < best.score)) best = { corner, a: a.i, b: b.i, score };
    }
    return { id: uid('pce'), x: tile.x, y: tile.y, cs: 1, rs: 1, c: best ? { k: 'hst' as const, a: 'ref' + best.a, b: 'ref' + best.b, corner: best.corner } : { k: 'solid' as const, f: 'ref' + solid.i } };
  });
  return d;
}
