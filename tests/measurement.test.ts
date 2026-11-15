import test from 'node:test';
import assert from 'node:assert/strict';
import { detectOutlines, homography, measureQuad, validQuad, type Quad } from '../src/lib/measurement.ts';
const rect = (x: number, y: number, w: number, h: number): Quad => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('two ruler marks calibrate an overhead photo in inches', () => {
  const result = measureQuad(rect(80, 180, 320, 240), { kind: 'ruler', points: [{ x: 100, y: 60 }, { x: 340, y: 60 }], length: 6 });
  close(result.w, 8); close(result.h, 6); assert.equal(result.uneven, false);
});

test('four known reference corners recover dimensions under perspective', () => {
  const world = rect(0, 0, 6, 2), screen: Quad = [{ x: 70, y: 40 }, { x: 350, y: 65 }, { x: 330, y: 155 }, { x: 95, y: 140 }];
  const project = homography(world, screen);
  const piece = rect(1, 3, 8, 6).map(project) as Quad;
  const result = measureQuad(piece, { kind: 'rectangle', points: screen, width: 6, height: 2 });
  close(result.w, 8); close(result.h, 6);
});

test('reject crossed corners, degenerate references, and zero scale', () => {
  const piece = rect(0, 0, 100, 100);
  assert.equal(validQuad([piece[0], piece[2], piece[1], piece[3]]), false);
  assert.throws(() => measureQuad(piece, { kind: 'ruler', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], length: 6 }));
  assert.throws(() => measureQuad(piece, { kind: 'rectangle', points: rect(0, 0, 100, 0), width: 6, height: 2 }));
  assert.throws(() => measureQuad(piece, { kind: 'rectangle', points: piece, width: 0, height: 2 }));
});

test('uneven opposing edges remain visible in the measurement result', () => {
  const q: Quad = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 70, y: 60 }, { x: 0, y: 60 }];
  const r = measureQuad(q, { kind: 'ruler', points: [{ x: 0, y: 0 }, { x: 60, y: 0 }], length: 6 });
  assert.equal(r.uneven, true); close(r.edges[0], 8); close(r.edges[2], 7);
});

test('outline detection separates a block and ruler and tolerates enclosed print colours', () => {
  const width = 400, height = 300, data = new Uint8ClampedArray(width * height * 4);
  const fill = (x: number, y: number, w: number, h: number, rgb: number[]) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) data.set([...rgb, 255], (yy * width + xx) * 4);
  };
  fill(0, 0, width, height, [230, 225, 220]);
  assert.equal(detectOutlines({ width, height, data }).length, 0, 'plain table has no invented outline');
  fill(50, 90, 200, 160, [40, 80, 130]); fill(65, 30, 150, 25, [170, 120, 30]);
  // A pale patch at the outside corner must not be mistaken for the table.
  fill(50, 90, 40, 40, [245, 223, 174]);
  fill(80, 110, 40, 40, [230, 225, 220]); fill(130, 140, 60, 60, [200, 70, 40]);
  const results = detectOutlines({ width, height, data }); assert.equal(results.length, 2);
  const measured = measureQuad(results[0], { kind: 'ruler', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], length: 5 });
  assert.ok(Math.abs(measured.w - 10) <= .06); assert.ok(Math.abs(measured.h - 8) <= .06);
});
