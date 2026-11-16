/* Draws the design onto a <canvas>: used for project thumbnails and the PNG one-sheet. */
import { sum, type Content, type Doc } from './model';
import { partsOf, place } from './shapes';
import { analyse, dim, fmt, yd } from './calc';
import { remainingAnalysis, pieceState } from './planning';
import { planWarnings } from './making-guide';

export type Paints = Record<string, string | CanvasPattern>;
type Ctx = CanvasRenderingContext2D;

const loadImg = (url: string) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
});

/** flat colours, or the fabric photo as a repeating pattern at real scale (ppi = pixels per inch) */
export async function paints(ctx: Ctx, doc: Doc, images: Record<string, string>, ppi: number): Promise<Paints> {
  const out: Paints = {};
  for (const f of doc.fabrics) {
    out[f.id] = f.color;
    const url = images[f.id];
    if (!url) continue;
    try {
      const img = await loadImg(url);
      const pat = ctx.createPattern(img, 'repeat');
      if (pat) { const s = (f.tile * ppi) / img.width; pat.setTransform(new DOMMatrix().scale(s)); out[f.id] = pat; }
    } catch {}
  }
  return out;
}

function poly(ctx: Ctx, p: Paints, f: string, pts: number[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = p[f] ?? '#ccc';
  ctx.fill();
}

export function drawContent(ctx: Ctx, doc: Doc, p: Paints, c: Content, x: number, y: number, w: number, h: number, depth = 0) {
  const R = [x, y, x + w, y, x + w, y + h, x, y + h];
  const mx = x + w / 2, my = y + h / 2;
  switch (c.k) {
    case 'solid': poly(ctx, p, c.f, R); break;
    case 'hst': {
      poly(ctx, p, c.b, R);
      const T = { tl: [x, y, x + w, y, x, y + h], tr: [x, y, x + w, y, x + w, y + h], br: [x + w, y, x + w, y + h, x, y + h], bl: [x, y, x, y + h, x + w, y + h] };
      poly(ctx, p, c.a, T[c.corner]);
      break;
    }
    case 'qst':
      poly(ctx, p, c.f[0], [x, y, x + w, y, mx, my]);
      poly(ctx, p, c.f[1], [x + w, y, x + w, y + h, mx, my]);
      poly(ctx, p, c.f[2], [x, y + h, x + w, y + h, mx, my]);
      poly(ctx, p, c.f[3], [x, y, x, y + h, mx, my]);
      break;
    case 'goose': {
      poly(ctx, p, c.s, R);
      const G = { up: [x, y + h, x + w, y + h, mx, y], down: [x, y, x + w, y, mx, y + h], left: [x + w, y, x + w, y + h, x, my], right: [x, y, x, y + h, x + w, my] };
      poly(ctx, p, c.g, G[c.dir]);
      break;
    }
    case 'inst': {
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate((c.rot * Math.PI) / 2);
      if (c.flip) ctx.scale(-1, 1);
      const [iw, ih] = c.rot % 2 ? [h, w] : [w, h];
      drawBlock(ctx, doc, p, c.ref, -iw / 2, -ih / 2, iw, ih, depth + 1);
      ctx.restore();
      break;
    }
    default: {
      const parts = partsOf(c);
      if (parts) { for (const pt of parts) poly(ctx, p, pt.f, place(pt.pts, x, y, w, h)); break; }
      ctx.fillStyle = '#e9e2d6'; ctx.fillRect(x, y, w, h);
    }
  }
}

export function drawBlock(ctx: Ctx, doc: Doc, p: Paints, id: string, x: number, y: number, w: number, h: number, depth = 0) {
  const b = doc.blocks[id];
  if (!b || depth > 12) return;
  const sx = w / sum(b.cols), sy = h / sum(b.rows);
  for (const cell of b.cells) {
    const cx = x + sum(b.cols, 0, cell.x) * sx, cy = y + sum(b.rows, 0, cell.y) * sy;
    const cw = sum(b.cols, cell.x, cell.cs) * sx, ch = sum(b.rows, cell.y, cell.rs) * sy;
    // a hair of overlap hides anti-aliasing gaps between pieces
    drawContent(ctx, doc, p, cell.c, cx - 0.25, cy - 0.25, cw + 0.5, ch + 0.5, depth);
  }
}

/** small picture of the whole quilt, for the project list */
export async function thumbnail(doc: Doc, images: Record<string, string>, size = 160) {
  const r = doc.blocks[doc.root];
  const W = sum(r.cols), H = sum(r.rows), s = size / Math.max(W, H);
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * s); cv.height = Math.round(H * s);
  const ctx = cv.getContext('2d')!;
  drawBlock(ctx, doc, await paints(ctx, doc, images, s), doc.root, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/webp', 0.8);
}

/* ---------------- the one-sheet ---------------- */
const INK = '#3b2a20', MUTED = '#9a8676', PAPER = '#f7f1e6', CARD = '#fffdf8', ACCENT = '#d9603b', DONE = '#2f9e5b';
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function pill(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}
function text(ctx: Ctx, s: string, x: number, y: number, size: number, color = INK, weight = 600, align: CanvasTextAlign = 'left') {
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}
function check(ctx: Ctx, cx: number, cy: number, r = 11) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = DONE; ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - r * .45, cy); ctx.lineTo(cx - r * .1, cy + r * .38); ctx.lineTo(cx + r * .5, cy - r * .35);
  ctx.strokeStyle = 'white'; ctx.lineWidth = r * .22; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}

/** a printable/shareable picture: the quilt, fabric to buy, every cut to scale, and what to sew */
export async function oneSheet(doc: Doc, images: Record<string, string>): Promise<Blob> {
  const started = !!Object.keys(doc.making ?? {}).length || !!doc.measurements?.length;
  const a = started ? remainingAnalysis(doc) : analyse(doc);
  const W = 1800, M = 70, done = started ? {} : doc.progress ?? {};
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = 6000;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, cv.height);

  // header
  text(ctx, doc.name || 'My quilt', M, M + 40, 46, INK, 800);
  text(ctx, dim(a.size.w, a.size.h), W - M, M + 40, 34, ACCENT, 800, 'right');

  // quilt + fabric
  const Q = 760, qs = Q / Math.max(a.size.w, a.size.h);
  const qw = a.size.w * qs, qh = a.size.h * qs, qy = M + 80;
  ctx.save(); ctx.shadowColor = 'rgba(60,40,20,.25)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#000'; ctx.fillRect(M, qy, qw, qh); ctx.restore();
  const bindPx = doc.settings.binding ? Math.max(4, doc.settings.bindingWidth * qs) : 0;
  const p = await paints(ctx, doc, images, qs);
  if (bindPx) { ctx.fillStyle = p[doc.settings.binding!] ?? '#333'; ctx.fillRect(M - bindPx, qy - bindPx, qw + 2 * bindPx, qh + 2 * bindPx); }
  drawBlock(ctx, doc, p, doc.root, M, qy, qw, qh);

  const fname = (id: string) => doc.fabrics.find(f => f.id === id)?.name ?? '';
  let fx = M + Q + 90, fy = qy + 10;
  const fabRows = [...a.yardage.map(y => ({ f: y.f, label: yd(y.yards) })),
    ...(doc.settings.binding ? [{ f: doc.settings.binding, label: yd(a.finishing.bindingYards) }] : [])];
  for (const r of fabRows) {
    ctx.beginPath(); ctx.arc(fx + 34, fy + 34, 34, 0, Math.PI * 2); ctx.fillStyle = p[r.f] ?? '#ccc'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2; ctx.stroke();
    text(ctx, r.label, fx + 88, fy + 44, 34, INK, 800);
    text(ctx, fname(r.f), fx + 88, fy + 70, 18, MUTED, 500);
    fy += 96;
  }
  text(ctx, `${dim(a.finishing.backing.w, a.finishing.backing.h)}  backing · batting`, fx, fy + 30, 20, MUTED, 600);

  let y = Math.max(qy + qh, fy + 40) + 80;
  text(ctx, started ? 'Remaining cuts · already-cut and made panels excluded' : 'Whole-design cutting plan', M, y, 28, INK, 750); y += 42;
  text(ctx, `Seam ${fmt(doc.settings.seam)} · fabric roll ${fmt(doc.settings.wof)} · ${new Date().toLocaleDateString()}`, M, y, 20, MUTED, 500); y += 36;
  const completed = doc.blocks[doc.root].cells.map((c, i) => ({ c, status: pieceState(doc, i) })).filter(p => p.status !== 'planned');
  if (completed.length) { text(ctx, `Recorded: ${completed.slice(0, 12).map(p => `${p.c.label} ${p.status}`).join(' · ')}${completed.length > 12 ? ' …' : ''}`, M, y, 17, MUTED, 500); y += 34; }
  const checks = planWarnings(doc);
  text(ctx, checks.length ? `${checks.length} construction check(s): review the Sewing guide before cutting. Export the making plan for full notes.` : 'Check a test unit before repeating a batch. Camera measurements are reviewed estimates.', M, y, 18, MUTED, 500); y += 60;

  // a row-wrapping layout for pictures with ×counts
  type Item = { w: number; h: number; draw: (x: number, y: number) => void; n?: number; label?: string; done?: boolean };
  function flow(items: Item[], gap = 34) {
    let x = M, rowH = 0;
    for (const it of items) {
      if (x + it.w > W - M) { x = M; y += rowH + 70; rowH = 0; }
      it.draw(x, y);
      if (it.done) { ctx.save(); ctx.globalAlpha = .45; ctx.fillStyle = PAPER; ctx.fillRect(x - 2, y - 2, it.w + 4, it.h + 4); ctx.restore(); check(ctx, x + it.w, y, 14); }
      if (it.n != null) text(ctx, `×${it.n}`, x + it.w / 2, y + it.h + 30, 24, INK, 800, 'center');
      if (it.label) text(ctx, it.label, x + it.w / 2, y + it.h + 54, 15, MUTED, 600, 'center');
      x += Math.max(it.w, 80) + gap; rowH = Math.max(rowH, it.h);
    }
    y += rowH + 90;
  }
  function section() {
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(M, y - 40, W - 2 * M, 2);
    y += 20;
  }

  // cuts, all drawn to the same scale
  const PX = 12, cap = (v: number) => Math.max(16, Math.min(260, v * PX));
  section();
  for (const yg of a.yardage) {
    flow(yg.cuts.map(c => ({
      w: cap(c.w), h: cap(c.h), n: c.qty, done: !!done[c.key],
      label: dim(c.w, c.h) + (c.trimTo ? ` → ${fmt(c.trimTo)}` : ''),
      draw: (x: number, yy: number) => {
        ctx.fillStyle = p[c.f] ?? '#ccc'; ctx.fillRect(x, yy, cap(c.w), cap(c.h));
        ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1.5; ctx.strokeRect(x, yy, cap(c.w), cap(c.h));
        if (c.shape !== 'rect') {
          ctx.save(); ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, yy + cap(c.h)); ctx.lineTo(x + cap(c.w), yy);
          if (c.shape === 'qst') { ctx.moveTo(x, yy); ctx.lineTo(x + cap(c.w), yy + cap(c.h)); }
          ctx.stroke(); ctx.restore();
        }
      },
    })));
  }

  // sew: units, then blocks, then the quilt
  section();
  const units: Item[] = a.units.map(u => ({
    w: cap(u.w), h: cap(u.h), n: u.qty, done: !!done[u.key], label: dim(u.w, u.h),
    draw: (x, yy) => drawContent(ctx, doc, p, u.c, x, yy, cap(u.w), cap(u.h)),
  }));
  const blocks: Item[] = a.order.map(id => {
    const us = a.uses.filter(u => u.id === id), u0 = us[0];
    const n = us.reduce((s, u) => s + u.qty, 0), bw = Math.min(260, u0.w * PX), bh = bw * u0.h / u0.w;
    return { w: bw, h: bh, n, done: !!done['blk|' + id], label: dim(u0.w, u0.h), draw: (x, yy) => drawBlock(ctx, doc, p, id, x, yy, bw, bh) };
  });
  flow([...units, ...blocks]);

  // crop to what we used
  const out = document.createElement('canvas');
  out.width = W; out.height = Math.ceil(y + 20);
  out.getContext('2d')!.drawImage(cv, 0, 0);
  return new Promise(res => out.toBlob(b => res(b!), 'image/png'));
}
