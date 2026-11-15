import { analyse, cellSize } from './calc';
import { sum, uid, type Doc } from './model';

/** User-facing lengths, always converted to inches at the model boundary. */
export function parseLength(value: string): number | null {
  const text = value.trim().toLowerCase().replace(/,/g, '.');
  const parts = text.match(/^(.*?)\s*(inches|inch|in|″|"|feet|foot|ft|′|'|cm|mm)?$/);
  if (!parts) return null;
  let n = parts[1].trim();
  const fractions: Record<string, number> = { '⅛': .125, '¼': .25, '⅜': .375, '½': .5, '⅝': .625, '¾': .75, '⅞': .875 };
  let extra = 0;
  n = n.replace(/[⅛¼⅜½⅝¾⅞]/g, c => { extra += fractions[c]; return ''; }).trim();
  const mixed = n.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  const numeric = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(n) ? Number(n) : n === '' && extra ? 0 : NaN;
  let result = mixed ? Number(mixed[1] ?? 0) + Number(mixed[2]) / Number(mixed[3]) : numeric;
  result += extra;
  const unit = parts[2] ?? 'in';
  result *= /^(feet|foot|ft|′|')$/.test(unit) ? 12 : unit === 'cm' ? 1 / 2.54 : unit === 'mm' ? 1 / 25.4 : 1;
  return Number.isFinite(result) && result > 0 && result <= 1200 ? result : null;
}

export type PlanResult = { doc: Doc; error?: never } | { error: string; doc?: never };
function lockedSizes(doc: Doc) {
  return analyse(doc).uses.filter(u => doc.blocks[u.id]?.locked)
    .map(u => `${u.id}:${u.w.toFixed(5)}:${u.h.toFixed(5)}:${u.qty}`).sort().join('|');
}

export function resizeQuilt(doc: Doc, width: number, height: number, exact: boolean): PlanResult {
  if (![width, height].every(v => Number.isFinite(v) && v > 0 && v <= 1200)) return { error: 'Enter a positive quilt size.' };
  const root = doc.blocks[doc.root], ow = sum(root.cols), oh = sum(root.rows);
  const changed = Math.abs(width - ow) > 1e-6 || Math.abs(height - oh) > 1e-6;
  if (changed && doc.measurements?.length) return { error: 'This quilt has measured pieces. Adjust the unmade parts around them instead of scaling the whole quilt.' };
  const next = structuredClone(doc), r = next.blocks[next.root];
  r.cols = r.cols.map(v => v * width / ow); r.rows = r.rows.map(v => v * height / oh);
  if (lockedSizes(doc) !== lockedSizes(next)) return { error: 'A block has its size locked. Unlock that block before scaling the whole quilt.' };
  next.settings.lockQuilt = exact;
  // An explicitly chosen overall size replaces the earlier sizing anchor.
  next.settings.anchor = null;
  if (changed) next.progress = {};
  return { doc: next };
}

export interface MadeMeasurement {
  id: string;
  cell: number; // a physical occurrence in the root layout, not a shared block definition
  w: number;
  h: number;
  state: 'unfinished' | 'finished';
  source: 'camera' | 'manual';
  at: number;
}

export function measurementFinished(m: Pick<MadeMeasurement, 'w' | 'h' | 'state'>, seam: number) {
  const extra = m.state === 'unfinished' ? 2 * seam : 0;
  return { w: m.w - extra, h: m.h - extra };
}

/** Independent definitions prevent this occurrence's geometry affecting its twins. */
function isolate(doc: Doc, id: string, seen = new Map<string, string>()): string {
  if (seen.has(id)) return seen.get(id)!;
  const key = uid('made'); seen.set(id, key);
  const block = structuredClone(doc.blocks[id]); block.id = key;
  doc.blocks[key] = block;
  for (const cell of block.cells) if (cell.c.k === 'inst') cell.c.ref = isolate(doc, cell.c.ref, seen);
  return key;
}

/** Atomic preview. Never commits a partially satisfied layout. */
export function recordMeasurement(doc: Doc, cell: number, m: Omit<MadeMeasurement, 'id' | 'cell' | 'at'>): PlanResult {
  const root = doc.blocks[doc.root], target = root.cells[cell];
  if (!target || target.c.k === 'empty') return { error: 'Choose a piece or block in the whole-quilt view.' };
  if (![m.w, m.h].every(v => Number.isFinite(v) && v > 0 && v <= 1200)) return { error: 'Enter positive measurements.' };
  const fin = measurementFinished(m, doc.settings.seam);
  if (fin.w <= 0 || fin.h <= 0) return { error: 'The outer measurements must leave room for the seam allowance.' };
  if (doc.measurements?.some(x => x.cell === cell)) return { error: 'This piece already has a recorded measurement. Remove its record before correcting it.' };
  const before = cellSize(doc, doc.root, cell)!;
  const changed = Math.abs(before.w - fin.w) > 1e-6 || Math.abs(before.h - fin.h) > 1e-6;
  const next = structuredClone(doc), r = next.blocks[next.root];
  r.cols = r.cols.map((v, i) => i >= target.x && i < target.x + target.cs ? v * fin.w / before.w : v);
  r.rows = r.rows.map((v, i) => i >= target.y && i < target.y + target.rs ? v * fin.h / before.h : v);
  if (doc.settings.lockQuilt && changed) return { error: 'The quilt size is held exact. Choose a flexible overall size before fitting this measurement.' };
  if (lockedSizes(next) !== lockedSizes(doc)) return { error: 'This adjustment would resize a locked block. Unlock it or change the surrounding layout first.' };
  for (const made of doc.measurements ?? []) {
    const a = cellSize(doc, doc.root, made.cell), b = cellSize(next, next.root, made.cell);
    if (!a || !b || Math.abs(a.w - b.w) > 1e-6 || Math.abs(a.h - b.h) > 1e-6) return { error: 'Another measured piece shares this row or column. This layout cannot fit both measurements without changing already-made fabric.' };
  }
  const c = r.cells[cell].c;
  if (c.k === 'inst') c.ref = isolate(next, c.ref);
  next.measurements = [...(next.measurements ?? []), { ...m, cell, id: uid('m'), at: Date.now() }];
  next.settings.anchor = null;
  if (changed) next.progress = {};
  return { doc: next };
}

/** A new strip joins a raw outer edge: its cut length matches that edge. */
export function nextStrip(m: Pick<MadeMeasurement, 'w' | 'h' | 'state'>, side: 'top' | 'right' | 'bottom' | 'left', finishedWidth: number, seam: number) {
  const along = side === 'top' || side === 'bottom' ? m.w : m.h;
  return { length: along + (m.state === 'finished' ? 2 * seam : 0), width: finishedWidth + 2 * seam };
}

/** Protect measured occurrences when the ordinary canvas tools are used. */
export function madeChangeError(before: Doc, after: Doc): string | null {
  if (!before.measurements?.length) return null;
  const signature = (doc: Doc, index: number) => {
    const cell = doc.blocks[doc.root]?.cells[index];
    const content = (c: import('./model').Content, depth: number): unknown => {
      if (depth > 12) return null;
      if (c.k !== 'inst') return c;
      const b = doc.blocks[c.ref]; if (!b) return null;
      return { rot: c.rot, flip: c.flip, cols: b.cols.map(v => v / sum(b.cols)), rows: b.rows.map(v => v / sum(b.rows)), cells: b.cells.map(x => ({ ...x, c: content(x.c, depth + 1) })) };
    };
    return cell ? JSON.stringify(content(cell.c, 0)) : '';
  };
  for (const made of before.measurements) {
    if (!after.measurements?.some(m => m.id === made.id)) continue;
    const a = cellSize(before, before.root, made.cell), b = cellSize(after, after.root, made.cell);
    if (!a || !b || Math.abs(a.w - b.w) > 1e-6 || Math.abs(a.h - b.h) > 1e-6 || signature(before, made.cell) !== signature(after, made.cell) || before.settings.seam !== after.settings.seam) {
      return 'That would change an already-measured piece. Remove its measurement record first if you mean to revise the plan for it.';
    }
  }
  return null;
}
