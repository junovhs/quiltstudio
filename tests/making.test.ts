import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDoc, sum, type Doc } from '../src/lib/model.ts';
import { analyse, cellSize } from '../src/lib/calc.ts';
import { ensurePieceIds, setPieceState, pieceState, remainingAnalysis, recordMeasurement, addJoiningStrip, linkJoiningStrip, joinMadePieces, madeChangeError, reconcileProgress, progressEvidence, measurementIndex, expandPanel } from '../src/lib/planning.ts';
import { draftReference } from '../src/lib/reference.ts';
import { assemblyOrder, planHtml, planWarnings } from '../src/lib/making-guide.ts';

function panels(): Doc {
  const d = blankDoc(); d.settings.lockQuilt = false;
  const r = d.blocks[d.root]; r.cols = [10,10]; r.rows = [10];
  r.cells = [0,1].map(x => ({ x, y: 0, cs: 1, rs: 1, c: { k: 'solid', f: 'floral' } })); ensurePieceIds(d); return d;
}
test('cut and sewn occurrences are excluded from remaining cuts and protected from resizing', () => {
  const d = setPieceState(panels(), [0], 'cut');
  assert.equal(remainingAnalysis(d).yardage[0].cuts[0].qty, 1);
  const resized = structuredClone(d); resized.blocks[resized.root].cols[0] = 8;
  assert.match(madeChangeError(d,resized)!, /already cut/);
  const other = structuredClone(d); other.blocks[other.root].cols[1] = 8;
  assert.equal(madeChangeError(d,other),null);
  const reopened = setPieceState(d,[0],'planned'); assert.equal(remainingAnalysis(reopened).yardage[0].cuts[0].qty,2);
});
test('actual sewn measurements can replace a cut assumption without changing other cut fabric', () => {
  const d = setPieceState(panels(), [0,1], 'cut');
  const result = recordMeasurement(d,0,{w:8,h:10.5,state:'unfinished',source:'manual'});
  assert.ok(result.doc); assert.equal(pieceState(result.doc,0),'measured');
  assert.equal(cellSize(result.doc,result.doc.root,1)!.w,10);
  assert.equal(remainingAnalysis(result.doc).yardage.length,0);
  assert.ok(recordMeasurement(d,0,{w:8,h:8,state:'unfinished',source:'manual'}).error);
});
test('real inserted strip updates geometry, cuts and yardage, preserving physical pieces', () => {
  const d = recordMeasurement(panels(),0,{w:8,h:10.5,state:'unfinished',source:'manual'}).doc!;
  const result = addJoiningStrip(d,0,'top',2,'brown'); assert.ok(result.doc);
  const n=result.doc, root=n.blocks[n.root], strip=root.cells.findIndex(c=>c.id===n.nextPiece);
  assert.equal(sum(root.rows),12); assert.equal(root.cells.length,4);
  assert.equal(pieceState(n,0),'measured'); assert.equal(madeChangeError(d,n),null);
  assert.equal(cellSize(n,n.root,strip)!.w,7.5);
  const brown=remainingAnalysis(n).yardage.find(y=>y.f==='brown')!;
  assert.ok(brown.cuts.some(c=>c.w===8 && c.h===2.5)); assert.ok(brown.yards>0);
  assert.equal(n.joins![0].source,root.cells[0].id);
});
test('a measured piece remains attached to its identity when root cells reorder', () => {
  const d=recordMeasurement(panels(),0,{w:8,h:10.5,state:'unfinished',source:'manual'}).doc!;
  const n=structuredClone(d); n.blocks[n.root].cells.reverse(); ensurePieceIds(n);
  assert.equal(measurementIndex(n,n.measurements![0]),1); assert.equal(pieceState(n,1),'measured'); assert.equal(madeChangeError(d,n),null);
});
test('joining made pieces archives original checkpoints and supports measuring the next assembly', () => {
  let d=recordMeasurement(panels(),0,{w:8,h:10.5,state:'unfinished',source:'manual'}).doc!;
  d=addJoiningStrip(d,0,'top',2,'brown').doc!;
  const strip=d.blocks[d.root].cells.findIndex(c=>c.id===d.nextPiece);
  d=setPieceState(d,[strip],'sewn');
  const combined=joinMadePieces(d,0,strip); assert.ok(combined.doc);
  const n=combined.doc, assembly=n.blocks[n.root].cells.findIndex(c=>c.id===n.nextPiece);
  assert.equal(n.madeArchive!.length,2); assert.equal(n.madeArchive![0].w,8); assert.equal(pieceState(n,assembly),'sewn');
  assert.equal(n.blocks[n.root].cells.find(c=>c.id===d.blocks[d.root].cells[1].id)!.label,'P2');
  assert.equal(n.blocks[n.root].cells[assembly].label,'P5','new assemblies get new labels; surviving panels never renumber');
  assert.equal(madeChangeError(d,n),null);
  assert.ok(recordMeasurement(n,assembly,{w:8,h:12.25,state:'unfinished',source:'manual'}).doc);
  assert.ok(!remainingAnalysis(n).yardage.flatMap(y=>y.cuts).some(c=>c.f==='brown' && c.w===8));
});
test('existing neighbors become next strips and exact-size locks reject added strips', () => {
  const d=panels(); assert.ok(linkJoiningStrip(d,0,1,'right').doc?.nextPiece);
  d.settings.lockQuilt=true; assert.match(addJoiningStrip(d,0,'right',2,'brown').error!,/grow/);
});
test('quantity changes invalidate only affected legacy checkmarks', () => {
  const d=panels(); d.blocks[d.root].cells[1].c={k:'solid',f:'brown'};
  const before=analyse(d), a=before.yardage[0].cuts[0].key,b=before.yardage[1].cuts[0].key;
  d.progress={[a]:true,[b]:true}; d.progressEvidence=progressEvidence(d);
  const n=structuredClone(d); n.blocks[n.root].cells.push({...n.blocks[n.root].cells[0],id:'extra'});
  reconcileProgress(d,n); assert.equal(n.progress![a],undefined); assert.equal(n.progress![b],true);
});
test('reference drafting recovers editable solid and diagonal pieces deterministically', () => {
  const w=100,h=50,data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const red=x<50 || (x-50)+y<50;data.set(red?[200,40,40,255]:[30,80,160,255],(y*w+x)*4);}
  const d=draftReference({width:w,height:h,data},2,1,20,2,true), cells=d.blocks[d.root].cells;
  assert.equal(cells[0].c.k,'solid'); assert.equal(cells[1].c.k,'hst');
  assert.equal(sum(d.blocks[d.root].cols),20); assert.equal(sum(d.blocks[d.root].rows),10);
  assert.equal(d.fabrics.length,2); assert.ok(analyse(d).yardage.length);
  assert.throws(()=>draftReference({width:w,height:h,data},0,1,20,2,true));
});
test('making exports include current physical state, remaining counts, method assumptions and escaped names', () => {
  const d=setPieceState(panels(),[0],'cut'); d.name='<script>alert(1)</script>';
  const html=planHtml(d,'<svg></svg>'); assert.ok(html.includes('P1: cut')); assert.ok(html.includes('Remaining cuts')); assert.ok(html.includes('10½'));
  assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('Seam'));
  assert.equal(assemblyOrder(d.blocks[d.root]).steps.length,1); assert.deepEqual(planWarnings(d),[]);
});
test('planned nested panels expand into smaller batches without changing cut geometry or neighboring physical work', () => {
  for (const rot of [0,1,2,3] as const) for(const flip of [false,true]) {
    let d=panels(); d.blocks.unit={id:'unit',name:'Two strips',cols:[3,7],rows:[10],cells:[{x:0,y:0,cs:1,rs:1,c:{k:'solid',f:'brown'}},{x:1,y:0,cs:1,rs:1,c:{k:'hst',a:'floral',b:'cream',corner:'tl'}}]};
    d.blocks[d.root].cells[0].c={k:'inst',ref:'unit',rot,flip}; d=setPieceState(d,[1],'cut');
    const before=analyse(d).yardage.flatMap(y=>y.cuts).map(c=>[c.key,c.qty]).sort();
    const result=expandPanel(d,0); assert.ok(result.doc);
    assert.equal(madeChangeError(d,result.doc),null);
    const after=analyse(result.doc).yardage.flatMap(y=>y.cuts).map(c=>[c.key,c.qty]).sort(); assert.deepEqual(after,before);
    assert.equal(result.doc.blocks[d.root].cells.length,3);
  }
});
