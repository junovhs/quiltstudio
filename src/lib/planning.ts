import { analyse, cellSize } from './calc';
import { sum, uid, fillGaps, groupToBlock, cellsInBox, bbox, xformN, type Doc, type Content, type Cell, type Xf } from './model';

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
  if (changed && (doc.measurements?.length || Object.keys(doc.making ?? {}).length)) return { error: 'This quilt has cut or measured pieces. Adjust the unmade parts around them instead of scaling the whole quilt.' };
  const next = structuredClone(doc), r = next.blocks[next.root];
  r.cols = r.cols.map(v => v * width / ow); r.rows = r.rows.map(v => v * height / oh);
  if (lockedSizes(doc) !== lockedSizes(next)) return { error: 'A block has its size locked. Unlock that block before scaling the whole quilt.' };
  next.settings.lockQuilt = exact;
  // An explicitly chosen overall size replaces the earlier sizing anchor.
  next.settings.anchor = null;
  if (changed) reconcileProgress(doc, next);
  return { doc: next };
}

export interface MadeMeasurement {
  id: string;
  cell: number; // a physical occurrence in the root layout, not a shared block definition
  pieceId?: string;
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
export function independentPiece(doc: Doc, index: number): Doc {
  const next = structuredClone(doc), c = next.blocks[next.root].cells[index]?.c;
  if (c?.k === 'inst') c.ref = isolate(next, c.ref);
  return next;
}

/** Expose a planned panel's children as individual making checkpoints, preserving its drawing. */
export function expandPanel(doc: Doc, index: number): PlanResult {
  if (pieceState(doc,index) !== 'planned') return { error: 'This panel already has physical work recorded. Keep it together or explicitly reopen it before splitting its plan.' };
  const next=structuredClone(doc); ensurePieceIds(next); const root=next.blocks[next.root], parent=root.cells[index];
  if (parent?.c.k !== 'inst') return { error:'This panel is already a single unit.' };
  const instance=parent.c, block=next.blocks[instance.ref]; if(!block) return { error:'The panel definition is missing.' };
  const oldX=[0,...root.cols.map((_,i)=>sum(root.cols,0,i+1))], oldY=[0,...root.rows.map((_,i)=>sum(root.rows,0,i+1))];
  const x=oldX[parent.x],y=oldY[parent.y],w=sum(root.cols,parent.x,parent.cs),h=sum(root.rows,parent.y,parent.rs);
  const transforms: Xf[]=[...(instance.flip ? ['h' as const]:[]),...Array(instance.rot).fill('r' as Xf)];
  const point=(u:number,v:number)=> { if(instance.flip)u=1-u; for(let i=0;i<instance.rot;i++)[u,v]=[1-v,u]; return {x:x+u*w,y:y+v*h}; };
  const exposed=block.cells.map(c=> {
    const u=sum(block.cols,0,c.x)/sum(block.cols),v=sum(block.rows,0,c.y)/sum(block.rows),du=sum(block.cols,c.x,c.cs)/sum(block.cols),dv=sum(block.rows,c.y,c.rs)/sum(block.rows);
    const corners=[point(u,v),point(u+du,v),point(u+du,v+dv),point(u,v+dv)];
    return { x:Math.min(...corners.map(p=>p.x)), y:Math.min(...corners.map(p=>p.y)), X:Math.max(...corners.map(p=>p.x)), Y:Math.max(...corners.map(p=>p.y)), c:xformN(structuredClone(c.c),transforms) };
  });
  const unique=(values:number[])=> [...new Set(values.map(v=>+v.toFixed(8)))].sort((a,b)=>a-b);
  const xs=unique([...oldX,...exposed.flatMap(c=>[c.x,c.X])]),ys=unique([...oldY,...exposed.flatMap(c=>[c.y,c.Y])]);
  const ix=(value:number)=>xs.findIndex(v=>Math.abs(v-value)<1e-6),iy=(value:number)=>ys.findIndex(v=>Math.abs(v-value)<1e-6);
  root.cells=root.cells.filter((_,i)=>i!==index).map(c=>({...c,x:ix(oldX[c.x]),y:iy(oldY[c.y]),cs:ix(oldX[c.x+c.cs])-ix(oldX[c.x]),rs:iy(oldY[c.y+c.rs])-iy(oldY[c.y])}));
  const first=root.cells.length;
  root.cells.push(...exposed.map(c=>({x:ix(c.x),y:iy(c.y),cs:ix(c.X)-ix(c.x),rs:iy(c.Y)-iy(c.y),c:c.c})));
  root.cols=xs.slice(1).map((v,i)=>v-xs[i]); root.rows=ys.slice(1).map((v,i)=>v-ys[i]); ensurePieceIds(next);
  next.joins=next.joins?.filter(j=>j.source!==parent.id&&j.strip!==parent.id); next.nextPiece=root.cells[first]?.id;
  next.settings.anchor=null;
  const error=madeChangeError(doc,next); if(error)return {error}; reconcileProgress(doc,next); return {doc:next};
}

/** Atomic preview. Never commits a partially satisfied layout. */
export function recordMeasurement(doc: Doc, cell: number, m: Omit<MadeMeasurement, 'id' | 'cell' | 'at'>): PlanResult {
  doc = structuredClone(doc); ensurePieceIds(doc);
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
  next.measurements = [...(next.measurements ?? []), { ...m, cell, pieceId: r.cells[cell].id, id: uid('m'), at: Date.now() }];
  (next.making ??= {})[r.cells[cell].id!] = { state: 'sewn', fingerprint: pieceFingerprint(next, cell), at: Date.now() };
  next.settings.anchor = null;
  const physicalError = madeChangeError(doc, next);
  if (physicalError) return { error: physicalError };
  if (changed) reconcileProgress(doc, next);
  return { doc: next };
}

/** A new strip joins a raw outer edge: its cut length matches that edge. */
export function nextStrip(m: Pick<MadeMeasurement, 'w' | 'h' | 'state'>, side: 'top' | 'right' | 'bottom' | 'left', finishedWidth: number, seam: number) {
  const along = side === 'top' || side === 'bottom' ? m.w : m.h;
  return { length: along + (m.state === 'finished' ? 2 * seam : 0), width: finishedWidth + 2 * seam };
}

/** Protect measured occurrences when the ordinary canvas tools are used. */
export function madeChangeError(before: Doc, after: Doc): string | null {
  for (const made of before.measurements ?? []) {
    if (!after.measurements?.some(m => m.id === made.id)) continue;
    const ai = measurementIndex(before, made), bi = measurementIndex(after, made);
    if (ai < 0 || bi < 0 || pieceFingerprint(before, ai) !== pieceFingerprint(after, bi)) {
      return 'That would change an already-measured piece. Remove its measurement record first if you mean to revise the plan for it.';
    }
  }
  for (const [id, record] of Object.entries(after.making ?? {})) {
    const index = after.blocks[after.root].cells.findIndex(c => c.id === id);
    if (index < 0 || record.fingerprint !== pieceFingerprint(after, index)) return 'That would change fabric already cut or sewn. Reopen that piece for planning before changing it.';
  }
  return null;
}

export function measurementIndex(doc: Doc, m: MadeMeasurement) {
  return m.pieceId ? doc.blocks[doc.root].cells.findIndex(c => c.id === m.pieceId) : m.cell;
}
export function ensurePieceIds(doc: Doc) {
  const seen = new Set<string>(), labels = new Set<string>();
  doc.nextPieceNumber = Math.max(doc.nextPieceNumber ?? 1, ...doc.blocks[doc.root].cells.map(c => /^P\d+$/.test(c.label ?? '') ? Number(c.label!.slice(1)) + 1 : 1));
  for (const c of doc.blocks[doc.root].cells) {
    if (!c.id || seen.has(c.id)) c.id = uid('pce'); seen.add(c.id);
    if (!c.label || labels.has(c.label)) c.label = `P${doc.nextPieceNumber++}`; labels.add(c.label);
  }
  for (const m of doc.measurements ?? []) {
    if (!m.pieceId) m.pieceId = doc.blocks[doc.root].cells[m.cell]?.id;
    m.cell = measurementIndex(doc, m);
  }
}
export function pieceFingerprint(doc: Doc, index: number): string {
  const cell = doc.blocks[doc.root]?.cells[index]; if (!cell) return '';
  const content = (c: Content, depth = 0): unknown => {
    if (c.k !== 'inst') return c;
    const b = doc.blocks[c.ref]; if (!b || depth > 12) return null;
    return { rot: c.rot, flip: c.flip, cols: b.cols.map(v => +(v / sum(b.cols)).toFixed(8)), rows: b.rows.map(v => +(v / sum(b.rows)).toFixed(8)), cells: b.cells.map(x => ({ x: x.x, y: x.y, cs: x.cs, rs: x.rs, c: content(x.c, depth + 1) })) };
  };
  const size = cellSize(doc, doc.root, index)!;
  return JSON.stringify([+size.w.toFixed(6), +size.h.toFixed(6), doc.settings.seam, content(cell.c)]);
}
export function pieceState(doc: Doc, index: number): 'planned' | 'cut' | 'sewn' | 'measured' {
  if (doc.measurements?.some(m => measurementIndex(doc, m) === index)) return 'measured';
  return doc.making?.[doc.blocks[doc.root].cells[index]?.id ?? '']?.state ?? 'planned';
}
export function setPieceState(doc: Doc, indices: number[], state: 'planned' | 'cut' | 'sewn'): Doc {
  const next = structuredClone(doc); ensurePieceIds(next);
  for (const index of indices) {
    const c = next.blocks[next.root].cells[index]; if (!c || c.c.k === 'empty') continue;
    if (state === 'planned') {
      delete next.making?.[c.id!];
      next.measurements = next.measurements?.filter(m => measurementIndex(next, m) !== index);
    } else (next.making ??= {})[c.id!] = { state, fingerprint: pieceFingerprint(next, index), at: Date.now() };
  }
  return next;
}
export function analysePieces(doc: Doc, indices: number[]) {
  const root = doc.blocks[doc.root];
  const next = { ...doc, blocks: { ...doc.blocks, [doc.root]: { ...root, cells: root.cells.filter((_, i) => indices.includes(i)) } } };
  return analyse(next);
}
export function remainingAnalysis(doc: Doc) {
  return analysePieces(doc, doc.blocks[doc.root].cells.map((_, i) => i).filter(i => pieceState(doc, i) === 'planned'));
}
export function matchingPieces(doc: Doc, index: number) {
  const fingerprint = pieceFingerprint(doc, index);
  return doc.blocks[doc.root].cells.map((_, i) => i).filter(i => pieceState(doc, i) === 'planned' && pieceFingerprint(doc, i) === fingerprint);
}
export function progressEvidence(doc: Doc): Record<string, string> {
  const a = analyse(doc), out: Record<string, string> = {};
  for (const c of a.yardage.flatMap(y => y.cuts)) out[c.key] = `${c.qty}`;
  for (const u of a.units) out[u.key] = `${u.qty}`;
  for (const id of a.order) out['blk|' + id] = JSON.stringify([doc.blocks[id], a.uses.filter(u => u.id === id)]);
  return out;
}
export function reconcileProgress(before: Doc, after: Doc) {
  if (!Object.keys(after.progress ?? {}).length) return;
  const old = before.progressEvidence ?? progressEvidence(before), now = progressEvidence(after);
  for (const key of Object.keys(after.progress ?? {})) if (!now[key] || old[key] !== now[key]) delete after.progress![key];
  after.progressEvidence = now;
}
export type JoinSide = 'top' | 'right' | 'bottom' | 'left';
export function neighbours(doc: Doc, index: number, side: JoinSide, solidOnly = true) {
  const root = doc.blocks[doc.root], s = root.cells[index]; if (!s) return [];
  return root.cells.map((c, i) => ({ c, i })).filter(({ c, i }) => i !== index && c.c.k !== 'empty' && (!solidOnly || c.c.k === 'solid') && (
    side === 'top' ? c.y + c.rs === s.y && c.x === s.x && c.cs === s.cs :
    side === 'bottom' ? c.y === s.y + s.rs && c.x === s.x && c.cs === s.cs :
    side === 'left' ? c.x + c.cs === s.x && c.y === s.y && c.rs === s.rs : c.x === s.x + s.cs && c.y === s.y && c.rs === s.rs
  )).map(x => x.i);
}
/** Add a real strip track. Every uncovered segment is visible fabric, never a hidden hole. */
export function addJoiningStrip(doc: Doc, index: number, side: JoinSide, width: number, fabric: string): PlanResult {
  if (!Number.isFinite(width) || width <= 0 || width > 120 || !doc.fabrics.some(f => f.id === fabric)) return { error: 'Choose a positive strip width and a fabric.' };
  if (doc.settings.lockQuilt !== false) return { error: 'Let the quilt grow in Size before adding a strip.' };
  const next = structuredClone(doc); ensurePieceIds(next);
  const root = next.blocks[next.root], source = root.cells[index];
  if (!source || source.c.k === 'empty') return { error: 'Select a panel first.' };
  const horizontal = side === 'top' || side === 'bottom', p = horizontal ? 'y' : 'x', span = horizontal ? 'rs' : 'cs';
  const at = source[p] + (side === 'top' || side === 'left' ? 0 : source[span]);
  (horizontal ? root.rows : root.cols).splice(at, 0, width);
  for (const c of root.cells) { if (c[p] >= at) c[p]++; else if (c[p] + c[span] > at) c[span]++; }
  const strip: Cell = horizontal ? { id: uid('pce'), x: source.x, y: at, cs: source.cs, rs: 1, c: { k: 'solid', f: fabric } } : { id: uid('pce'), x: at, y: source.y, cs: 1, rs: source.rs, c: { k: 'solid', f: fabric } };
  root.cells.push(strip);
  const start = root.cells.length; fillGaps(root);
  for (const c of root.cells.slice(start)) if (c[p] === at) c.c = { k: 'solid', f: fabric };
  ensurePieceIds(next);
  next.joins = [...(next.joins ?? []), { source: source.id!, strip: strip.id!, side }]; next.nextPiece = strip.id;
  next.settings.anchor = null;
  const error = madeChangeError(doc, next); if (error) return { error };
  if (lockedSizes(doc) !== lockedSizes(next)) return { error: 'This strip would stretch a locked block. Choose another edge or unlock the unmade block.' };
  reconcileProgress(doc, next); return { doc: next };
}
export function linkJoiningStrip(doc: Doc, index: number, stripIndex: number, side: JoinSide): PlanResult {
  if (!neighbours(doc, index, side).includes(stripIndex)) return { error: 'Choose a rectangular strip that spans this whole edge.' };
  if (pieceState(doc, stripIndex) !== 'planned') return { error: 'This adjoining piece is already cut or made.' };
  const next = structuredClone(doc); ensurePieceIds(next); const cells = next.blocks[next.root].cells;
  next.joins = [...(next.joins ?? []).filter(j => j.strip !== cells[stripIndex].id), { source: cells[index].id!, strip: cells[stripIndex].id!, side }];
  next.nextPiece = cells[stripIndex].id; return { doc: next };
}
export function changedPieces(before: Doc, after: Doc) {
  return before.blocks[before.root].cells.map((c, i) => {
    const j = after.blocks[after.root].cells.findIndex(x => x.id === c.id);
    return j >= 0 && pieceFingerprint(before, i) !== pieceFingerprint(after, j) ? i : -1;
  }).filter(i => i >= 0);
}

/** An explicit physical join retires the separate checkpoints into an immutable history. */
export function joinMadePieces(doc: Doc, first: number, second: number): PlanResult {
  const next = structuredClone(doc); ensurePieceIds(next); const root = next.blocks[next.root];
  if (first === second || !root.cells[first] || !root.cells[second]) return { error: 'Choose two adjoining pieces.' };
  if (![first, second].every(i => ['sewn', 'measured'].includes(pieceState(next, i)))) return { error: 'Mark both pieces sewn before recording their join.' };
  const inside = cellsInBox(root, bbox(root, [first, second]));
  if (!inside || inside.length !== 2) return { error: 'These pieces do not form one complete rectangular assembly.' };
  const ids = [root.cells[first].id!, root.cells[second].id!];
  for (const i of [first, second]) {
    const c = root.cells[i], m = next.measurements?.find(m => measurementIndex(next, m) === i), size = cellSize(next, next.root, i)!;
    (next.madeArchive ??= []).push({ label: c.label!, pieceId: c.id!, w: m?.w ?? size.w + 2 * next.settings.seam, h: m?.h ?? size.h + 2 * next.settings.seam, state: m ? m.state : 'planned outer size at join', at: Date.now() });
    delete next.making?.[c.id!];
  }
  next.measurements = next.measurements?.filter(m => !ids.includes(m.pieceId!));
  const id = groupToBlock(next, root, [first, second], 'Sewn assembly'); if (!id) return { error: 'These pieces cannot be grouped.' };
  ensurePieceIds(next); const index = root.cells.length - 1, cell = root.cells[index];
  (next.making ??= {})[cell.id!] = { state: 'sewn', fingerprint: pieceFingerprint(next, index), at: Date.now() };
  next.joins = next.joins?.filter(j => !ids.includes(j.source) && !ids.includes(j.strip)); next.nextPiece = cell.id;
  reconcileProgress(doc, next); return { doc: next };
}
