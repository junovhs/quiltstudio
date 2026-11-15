/* Printable block diagrams as SVG, drawn in real inches:
 * flat fabric colours (or pale "ink saver" tints), bold cut lines between pieces,
 * an inch grid, and the size of every row/column along the edges. */
import { sum, type Block, type Content, type Doc } from './model';
import { analyse, fmt } from './calc';

export interface PrintOpts { ink: boolean; actual: boolean; grid?: boolean; line?: string; weight?: number }

/* fabric colours → plain hex (fabric colours can be any CSS colour, e.g. oklch) */
const hexCache = new Map<string, string>();
function toHex(css: string) {
  if (hexCache.has(css)) return hexCache.get(css)!;
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  hexCache.set(css, hex);
  return hex;
}
function tint(hex: string, keep = 0.28) {
  const n = parseInt(hex.slice(1), 16), mix = (c: number) => Math.round(255 - (255 - c) * keep);
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(c => mix(c).toString(16).padStart(2, '0')).join('');
}

function fills(doc: Doc, ink: boolean) {
  const m: Record<string, string> = {};
  for (const f of doc.fabrics) { const h = toHex(f.color); m[f.id] = ink ? tint(h) : h; }
  return m;
}

const P = (pts: number[]) => pts.map(v => +v.toFixed(4)).join(' ');
const poly = (fill: string, pts: number[]) => `<polygon points="${P(pts)}" fill="${fill}"/>`;
const line = (pts: number[], cls = 'cut') => `<polyline class="${cls}" points="${P(pts)}"/>`;

/** shapes + cut lines for one piece */
function piece(c: Content, fill: Record<string, string>, x: number, y: number, w: number, h: number): { shapes: string; cuts: string } {
  const R = [x, y, x + w, y, x + w, y + h, x, y + h], mx = x + w / 2, my = y + h / 2;
  const F = (id: string) => fill[id] ?? '#ddd';
  switch (c.k) {
    case 'solid': return { shapes: poly(F(c.f), R), cuts: '' };
    case 'hst': {
      const T = { tl: [x, y, x + w, y, x, y + h], tr: [x, y, x + w, y, x + w, y + h], br: [x + w, y, x + w, y + h, x, y + h], bl: [x, y, x, y + h, x + w, y + h] }[c.corner];
      const diag = c.corner === 'tl' || c.corner === 'br' ? [x + w, y, x, y + h] : [x, y, x + w, y + h];
      return { shapes: poly(F(c.b), R) + poly(F(c.a), T), cuts: line(diag) };
    }
    case 'qst':
      return {
        shapes: poly(F(c.f[0]), [x, y, x + w, y, mx, my]) + poly(F(c.f[1]), [x + w, y, x + w, y + h, mx, my]) +
          poly(F(c.f[2]), [x, y + h, x + w, y + h, mx, my]) + poly(F(c.f[3]), [x, y, x, y + h, mx, my]),
        cuts: line([x, y, x + w, y + h]) + line([x + w, y, x, y + h]),
      };
    case 'goose': {
      const G = { up: [x, y + h, x + w, y + h, mx, y], down: [x, y, x + w, y, mx, y + h], left: [x + w, y, x + w, y + h, x, my], right: [x, y, x, y + h, x + w, my] }[c.dir];
      return { shapes: poly(F(c.s), R) + poly(F(c.g), G), cuts: line([G[0], G[1], G[4], G[5], G[2], G[3]]) };
    }
    case 'empty': return { shapes: `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>`, cuts: '' };
    default: return { shapes: '', cuts: '' };
  }
}

/** the whole block, recursively: returns shapes and every seam/cut line */
function drawBlock(doc: Doc, fill: Record<string, string>, id: string, x: number, y: number, w: number, h: number, depth = 0): { shapes: string; cuts: string } {
  const b = doc.blocks[id];
  if (!b || depth > 12) return { shapes: '', cuts: '' };
  const sx = w / sum(b.cols), sy = h / sum(b.rows);
  let shapes = '', cuts = '';
  for (const cell of b.cells) {
    const cx = x + sum(b.cols, 0, cell.x) * sx, cy = y + sum(b.rows, 0, cell.y) * sy;
    const cw = sum(b.cols, cell.x, cell.cs) * sx, ch = sum(b.rows, cell.y, cell.rs) * sy;
    const c = cell.c;
    if (c.k === 'inst') {
      const [iw, ih] = c.rot % 2 ? [ch, cw] : [cw, ch];
      const inner = drawBlock(doc, fill, c.ref, -iw / 2, -ih / 2, iw, ih, depth + 1);
      const t = `translate(${cx + cw / 2} ${cy + ch / 2}) rotate(${c.rot * 90})${c.flip ? ' scale(-1 1)' : ''}`;
      shapes += `<g transform="${t}">${inner.shapes}</g>`;
      cuts += `<g transform="${t}">${inner.cuts}</g>`;
    } else {
      const p = piece(c, fill, cx, cy, cw, ch);
      shapes += p.shapes; cuts += p.cuts;
    }
    cuts += `<rect class="${depth === 0 ? 'seam' : 'cut'}" x="${cx}" y="${cy}" width="${cw}" height="${ch}"/>`;
  }
  return { shapes, cuts };
}

/** real finished size of a block (where it is used in the quilt), or its design size */
export function realSize(doc: Doc, id: string, a = analyse(doc)) {
  if (id === doc.root) return { w: a.size.w, h: a.size.h };
  const u = a.uses.find(u => u.id === id);
  const b = doc.blocks[id];
  return u ? { w: u.w, h: u.h } : { w: sum(b.cols), h: sum(b.rows) };
}

const style = (line = '#1d1612', w = 1) => `
  .cut { fill: none; stroke: ${line}; stroke-width: ${1.1 * w}; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  .seam { fill: none; stroke: ${line}; stroke-width: ${2.2 * w}; vector-effect: non-scaling-stroke; }
  .edge { fill: none; stroke: ${line}; stroke-width: ${3 * w}; vector-effect: non-scaling-stroke; }
  .grid { stroke: #8a7b70; stroke-width: .5; vector-effect: non-scaling-stroke; opacity: .55; }
  .grid.major { stroke-width: .9; opacity: .7; }
  .dim { font-family: system-ui, sans-serif; font-weight: 650; fill: #3b2a20; text-anchor: middle; }
  .tick { stroke: #3b2a20; stroke-width: .8; vector-effect: non-scaling-stroke; }`;
const STYLE = style();

/**
 * One block as an SVG in real inches, with an inch grid around it and the size of
 * each row/column along the top and left. `maxW/maxH` (inches) limit it to the page.
 */
export function blockDiagram(doc: Doc, id: string, opts: PrintOpts, maxW = 7.2, maxH = 8) {
  const a = analyse(doc);
  const b = doc.blocks[id] as Block;
  const { w, h } = realSize(doc, id, a);
  const fill = fills(doc, opts.ink);
  const pad = 0.6;                                   // room for the size labels
  const vw = w + pad * 2, vh = h + pad * 2;
  const fitScale = Math.min(maxW / vw, maxH / vh);
  const scale = opts.actual && fitScale >= 1 ? 1 : fitScale;   // 1 = true size on paper
  const k = 1 / scale;                               // keep labels the same printed size at any scale

  // inch grid across the whole drawing, every inch; heavier every 6″
  let grid = '';
  const showGrid = opts.grid !== false;
  const step = w > 60 || h > 60 ? 2 : 1;
  for (let gx = 0; gx <= Math.ceil(w); gx += step) grid += `<line class="grid${gx % 6 === 0 ? ' major' : ''}" x1="${gx}" y1="${-pad * .5}" x2="${gx}" y2="${h + pad * .5}"/>`;
  for (let gy = 0; gy <= Math.ceil(h); gy += step) grid += `<line class="grid${gy % 6 === 0 ? ' major' : ''}" x1="${-pad * .5}" y1="${gy}" x2="${w + pad * .5}" y2="${gy}"/>`;

  // sizes of the block's own rows/columns, measured in real inches
  const sx = w / sum(b.cols), sy = h / sum(b.rows);
  let dims = '';
  let acc = 0;
  for (const c of b.cols) {
    const x0 = acc * sx, x1 = (acc + c) * sx; acc += c;
    dims += `<line class="tick" x1="${x0}" y1="${-0.12 * k}" x2="${x0}" y2="${-0.32 * k}"/><line class="tick" x1="${x1}" y1="${-0.12 * k}" x2="${x1}" y2="${-0.32 * k}"/>`;
    dims += `<text class="dim" x="${(x0 + x1) / 2}" y="${-0.17 * k}" font-size="${0.16 * k}">${fmt(c * sx)}</text>`;
  }
  acc = 0;
  for (const r of b.rows) {
    const y0 = acc * sy, y1 = (acc + r) * sy; acc += r;
    dims += `<line class="tick" x1="${-0.12 * k}" y1="${y1}" x2="${-0.32 * k}" y2="${y1}"/>`;
    dims += `<text class="dim" transform="translate(${-0.17 * k} ${(y0 + y1) / 2}) rotate(-90)" font-size="${0.16 * k}">${fmt(r * sy)}</text>`;
  }

  const body = drawBlock(doc, fill, id, 0, 0, w, h);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${vw} ${vh}" width="${vw * scale}in" height="${vh * scale}in">
<style>${style(opts.line, opts.weight)}</style>
<rect x="${-pad}" y="${-pad}" width="${vw}" height="${vh}" fill="#fff"/>
${showGrid ? grid : ''}
<g>${body.shapes}</g>
${showGrid ? `<g opacity=".35">${grid}</g>` : ''}
<g>${body.cuts}</g>
<rect class="edge" x="0" y="0" width="${w}" height="${h}"/>
${dims}
</svg>`;
  return { svg, w, h, scale, actual: scale === 1 };
}

/** the pieces that go straight into one block (sub-blocks count as one piece), with how many */
export function piecesOf(doc: Doc, id: string) {
  const a = analyse(doc);
  const b = doc.blocks[id];
  const { w, h } = realSize(doc, id, a);
  const sx = w / sum(b.cols), sy = h / sum(b.rows);
  const out = new Map<string, { c: Content; w: number; h: number; n: number }>();
  for (const cell of b.cells) {
    let cw = sum(b.cols, cell.x, cell.cs) * sx, ch = sum(b.rows, cell.y, cell.rs) * sy;
    let c = cell.c;
    if (c.k === 'inst') { if (c.rot % 2) [cw, ch] = [ch, cw]; c = { ...c, rot: 0, flip: false }; }
    else if (c.k === 'hst') c = { ...c, corner: 'tl' };
    else if (c.k === 'goose') c = { ...c, dir: 'up' };
    if (cw < ch && c.k !== 'inst') [cw, ch] = [ch, cw];
    const key = JSON.stringify(c) + `|${cw.toFixed(3)}|${ch.toFixed(3)}`;
    const e = out.get(key) ?? { c, w: cw, h: ch, n: 0 };
    e.n++; out.set(key, e);
  }
  return [...out.values()];
}

/** a small picture of one piece or sub-block, at a given print scale (inches) */
export function pieceSvg(doc: Doc, c: Content, w: number, h: number, ink: boolean, px = 0.22, o: Partial<PrintOpts> = {}) {
  const fill = fills(doc, ink);
  const body = c.k === 'inst' ? drawBlock(doc, fill, c.ref, 0, 0, w, h, 1) : piece(c, fill, 0, 0, w, h);
  const s = Math.min(px, 1.4 / Math.max(w, h));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.05 -0.05 ${w + 0.1} ${h + 0.1}" width="${(w + 0.1) * s}in" height="${(h + 0.1) * s}in">
<style>${style(o.line, o.weight)}</style>${body.shapes}${body.cuts}<rect class="seam" x="0" y="0" width="${w}" height="${h}"/></svg>`;
}
