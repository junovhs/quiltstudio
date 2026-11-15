import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDoc, defaultDoc, sum, type Doc } from '../src/lib/model.ts';
import { analyse, cellSize } from '../src/lib/calc.ts';
import { parseLength, resizeQuilt, recordMeasurement, nextStrip, madeChangeError } from '../src/lib/planning.ts';
import { hasOpenKeyboard } from '../src/lib/viewport.ts';

test('length entry supports feet, metric and fractional ruler values without accepting junk', () => {
  for (const [input, expected] of [['4 ft', 48], ['4′', 48], ['48 inches', 48], ['121.92 cm', 48], ['25.4 mm', 1], ['4½', 4.5], ['4 1/2', 4.5], ['1/8', .125]] as const) assert.ok(Math.abs(parseLength(input)! - expected) < 1e-9, input);
  for (const input of ['0', '-4', 'NaN', 'Infinity', '4 garbage', '1/0', '', '4 x 6']) assert.equal(parseLength(input), null, input);
});

test('whole-quilt resize updates nested dimensions and cuts while keeping seam allowance', () => {
  const d = defaultDoc(), original = JSON.stringify(d), before = analyse(d);
  const result = resizeQuilt(d, 48, 48, false); assert.ok(result.doc);
  const after = analyse(result.doc);
  assert.ok(Math.abs(after.size.w - 48) < 1e-9 && Math.abs(after.size.h - 48) < 1e-9);
  assert.equal(result.doc.settings.seam, .25);
  assert.equal(result.doc.settings.anchor, null);
  assert.equal(result.doc.settings.lockQuilt, false);
  const ratio = 48 / before.size.w;
  const unit = after.uses.find(u => u.id === before.uses[0].id)!;
  assert.ok(Math.abs(unit.w - before.uses[0].w * ratio) < 1e-8);
  assert.notDeepEqual(after.yardage, before.yardage);
  assert.equal(JSON.stringify(d), original, 'preview must not mutate source');
});

test('resizing refuses locked blocks atomically, but unused locks do not block a quilt', () => {
  const d = defaultDoc(); d.blocks.corner.locked = true;
  assert.match(resizeQuilt(d, 48, 48, true).error!, /locked/);
  assert.equal(sum(d.blocks[d.root].cols), 47);
  d.blocks.corner.locked = false;
  d.blocks.unused = { id: 'unused', name: 'unused', cols: [5], rows: [5], cells: [], locked: true };
  assert.ok(resizeQuilt(d, 48, 48, false).doc);
});

function layout(): Doc {
  const d = blankDoc(); d.settings.lockQuilt = false;
  d.blocks.unit = { id: 'unit', name: 'Block', cols: [5, 5], rows: [10], cells: [
    { x: 0, y: 0, cs: 1, rs: 1, c: { k: 'solid', f: 'floral' } },
    { x: 1, y: 0, cs: 1, rs: 1, c: { k: 'solid', f: 'cream' } },
  ] };
  d.blocks[d.root] = { id: d.root, name: 'Quilt', cols: [10, 10], rows: [10, 2], cells: [
    { x: 0, y: 0, cs: 1, rs: 1, c: { k: 'inst', ref: 'unit', rot: 0, flip: false } },
    { x: 1, y: 0, cs: 1, rs: 1, c: { k: 'inst', ref: 'unit', rot: 0, flip: false } },
    { x: 0, y: 1, cs: 1, rs: 1, c: { k: 'solid', f: 'brown' } },
    { x: 1, y: 1, cs: 1, rs: 1, c: { k: 'solid', f: 'brown' } },
  ] };
  return d;
}
const raw = (w: number, h: number) => ({ w, h, state: 'unfinished' as const, source: 'manual' as const });

test('actual occurrence isolates its shared definition and updates its future joining strip', () => {
  const d = layout(), snapshot = JSON.stringify(d);
  const result = recordMeasurement(d, 0, raw(8, 10.5)); assert.ok(result.doc);
  const n = result.doc, cells = n.blocks[n.root].cells;
  assert.equal(JSON.stringify(d), snapshot);
  assert.equal(cellSize(n, n.root, 0)!.w, 7.5, 'current outer edge includes two seam allowances');
  assert.equal(cellSize(n, n.root, 2)!.w, 7.5, 'future strip follows the same column');
  assert.equal(cellSize(n, n.root, 1)!.w, 10, 'other occurrence keeps its width');
  assert.equal(cells[1].c.k === 'inst' && cells[1].c.ref, 'unit');
  assert.notEqual(cells[0].c.k === 'inst' && cells[0].c.ref, 'unit');
  assert.deepEqual(nextStrip(n.measurements![0], 'top', 2, .25), { length: 8, width: 2.5 });
  assert.match(resizeQuilt(n, 36, 36, false).error!, /measured/);
});

test('a conflicting actual measurement cannot change an already-made neighbouring copy', () => {
  const d = layout();
  const first = recordMeasurement(d, 1, raw(10.5, 10.5)); assert.ok(first.doc);
  const snapshot = JSON.stringify(first.doc);
  const conflict = recordMeasurement(first.doc, 0, raw(8, 8));
  assert.match(conflict.error!, /already-made/);
  assert.equal(JSON.stringify(first.doc), snapshot);
  const compatible = recordMeasurement(first.doc, 0, raw(8, 10.5)); assert.ok(compatible.doc);
  assert.equal(madeChangeError(first.doc, compatible.doc), null);
});

test('made piece guards reject ordinary resizing, content changes and seam reinterpretation', () => {
  const d = recordMeasurement(layout(), 0, raw(8, 10.5)).doc!;
  for (const modify of [
    (n: Doc) => n.blocks[n.root].cols[0] += 1,
    (n: Doc) => n.blocks[n.root].cells[0].c = { k: 'empty' },
    (n: Doc) => n.settings.seam = .5,
  ]) { const n = structuredClone(d); modify(n); assert.ok(madeChangeError(d, n)); }
  const changed = structuredClone(d); changed.blocks[changed.root].cols[1] += 1;
  assert.equal(madeChangeError(d, changed), null);
});

test('next strip treats unfinished outer edges and finished measurements differently', () => {
  assert.deepEqual(nextStrip(raw(8, 6), 'right', 2, .25), { length: 6, width: 2.5 });
  assert.deepEqual(nextStrip({ w: 8, h: 6, state: 'finished' }, 'top', 2, .25), { length: 8.5, width: 2.5 });
  assert.ok(recordMeasurement(layout(), 0, raw(.25, 8)).error);
});

test('PWA resume does not mistake a stale viewport for an open keyboard', () => {
  assert.equal(hasOpenKeyboard(false, 850, 500), false);
  assert.equal(hasOpenKeyboard(true, 850, 500), true);
  assert.equal(hasOpenKeyboard(true, 850, 800), false);
  assert.equal(hasOpenKeyboard(true, 0, 0), false);
});
