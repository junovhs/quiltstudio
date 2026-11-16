import { analyse, dim, fmt } from './calc';
import { analysePieces, pieceState, remainingAnalysis } from './planning';
import type { Doc, Block } from './model';

/** Find full-width seams recursively; don't invent instructions for inset layouts. */
export function assemblyOrder(block: Block): { steps: string[]; inset: boolean } {
  const steps: string[] = []; let inset = false;
  const join = (indices: number[]): string => {
    if (indices.length <= 1) return indices.length ? (block.cells[indices[0]].label ?? `P${indices[0] + 1}`) : '';
    for (const axis of ['y', 'x'] as const) {
      const span = axis === 'y' ? 'rs' : 'cs';
      const boundaries = [...new Set(indices.flatMap(i => [block.cells[i][axis], block.cells[i][axis] + block.cells[i][span]]))].sort((a, b) => a - b);
      for (const at of boundaries.slice(1, -1)) {
        if (indices.some(i => block.cells[i][axis] < at && block.cells[i][axis] + block.cells[i][span] > at)) continue;
        const a = indices.filter(i => block.cells[i][axis] < at), b = indices.filter(i => block.cells[i][axis] >= at);
        if (!a.length || !b.length) continue;
        const left = join(a), right = join(b), name = `Assembly ${steps.length + 1}`;
        steps.push(`${name}: join ${left} ${axis === 'y' ? 'above' : 'beside'} ${right}. Match the joining edges, sew, then press.`); return name;
      }
    }
    inset = true; return indices.map(i => block.cells[i].label ?? `P${i + 1}`).join(' + ');
  };
  join(block.cells.map((_, i) => i).filter(i => block.cells[i].c.k !== 'empty'));
  return { steps, inset };
}
export function methodsFor(doc: Doc, indices: number[]) {
  const a = analysePieces(doc, indices), methods: { title: string; text: string; url?: string }[] = [];
  if (a.units.some(u => u.c.k === 'hst' && Math.abs(u.w-u.h)<.001) && doc.settings.hst === 'trim') methods.push({ title: 'Two-at-a-time half-square triangles', text: `Pair the two fabric squares right sides together. Mark one diagonal. Sew ${fmt(doc.settings.seam)} to either side, cut on the marked line, press open, then trim to the listed unfinished size. One pair makes two units; keep any spare.`, url: 'https://olfa.com/blogs/craft/how-to-make-and-trim-half-sqaure-triangles' });
  if (a.units.some(u => u.c.k === 'hst' && Math.abs(u.w-u.h)>=.001)) methods.push({ title: 'Half-rectangle triangles need a different method', text: 'These units are not square. The listed cuts are generous fabric budgets, not verified templates. Use an appropriate half-rectangle ruler or paper-piecing pattern, or adjust the unmade design to square units before cutting.' });
  if (a.units.some(u => ['goose', 'sis', 'snow', 'cnr'].includes(u.c.k))) methods.push({ title: 'Stitch and flip', text: `Place a corner square right sides together on its matching base corner. Sew the diagonal in the direction shown in your design. Check the fold before trimming the excess to a ${fmt(doc.settings.seam)} allowance, then press. Repeat for the remaining corners.`, url: 'https://modafabrics.com/inspiration-resources/bake-shop-basics-flying-geese' });
  if (a.yardage.some(y => y.cuts.some(c => c.how.includes('diagonal')))) methods.push({ title: 'Cut triangles, then assemble', text: `Cut the listed squares along the indicated diagonal(s). Arrange triangle colours as shown in the design. Join with ${fmt(doc.settings.seam)} seams, press and check the resulting unit before making the rest of the batch.` });
  if (a.units.some(u => u.c.k === 'strips')) methods.push({ title: 'Strip units', text: `Arrange strips in the design order. Sew long edges right sides together with ${fmt(doc.settings.seam)} seams, then press and measure the unit.` });
  methods.push({ title: 'Check before the next join', text: `Use ${fmt(doc.settings.seam)} seams. Lay out the pieces as shown, join matching edges and press without stretching. Measure the outside edges of the sewn panel; the next strip can follow that actual size.` });
  return methods;
}
export function planWarnings(doc: Doc) {
  const a = analyse(doc), root = doc.blocks[doc.root];
  return [...a.warnings, ...(root.cells.some(c => c.c.k === 'empty') ? ['Unfilled spaces remain in this design. Fill them before treating the plan as complete.'] : []), ...(assemblyOrder(root).inset ? ['This layout contains inset joins. A straight-row assembly order is not available; plan those joins before cutting.'] : [])];
}
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function planHtml(doc: Doc, diagram: string) {
  const a = analyse(doc), remaining = remainingAnalysis(doc), root = doc.blocks[doc.root];
  const cuts = remaining.yardage.flatMap(y => y.cuts), warnings = planWarnings(doc);
  const rows = cuts.map(c => `<tr><td>${escape(doc.fabrics.find(f => f.id === c.f)?.name ?? c.f)}</td><td>${c.qty}</td><td>${escape(dim(c.w, c.h))}</td><td>${escape(c.how)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(doc.name)} — making plan</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;padding:20px;color:#28221c}svg{max-width:100%;height:auto;max-height:480px}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #ccc;text-align:left}h2{margin-top:32px}li{margin:8px 0}@media print{body{margin:0}tr,li{break-inside:avoid}}</style><h1>${escape(doc.name ?? 'My quilt')}</h1><p>${escape(dim(a.size.w, a.size.h))} · Seam ${escape(fmt(doc.settings.seam))} · Fabric roll ${escape(fmt(doc.settings.wof))}</p><p>Snapshot ${escape(new Date().toISOString())}. Future cuts follow this version. Measure completed work before the next join.</p>${diagram}<h2>What exists</h2><ul>${root.cells.map((c, i) => c.c.k === 'empty' ? '' : `<li>${escape(c.label ?? `P${i + 1}`)}: ${pieceState(doc, i)}${doc.measurements?.find(m => m.pieceId === c.id) ? ' · outer ' + escape(dim(doc.measurements.find(m => m.pieceId === c.id)!.w, doc.measurements.find(m => m.pieceId === c.id)!.h)) : ''}</li>`).join('')}</ul><h2>Remaining cuts</h2><p>Excludes pieces marked cut, sewn or measured. Triangle cuts are pooled across remaining pieces; keep spares between batches.</p><table><tr><th>Fabric</th><th>Count</th><th>Cut size</th><th>Method</th></tr>${rows || '<tr><td colspan="4">No remaining cuts.</td></tr>'}</table><h2>Fabric for remaining cuts</h2><ul>${remaining.yardage.map(y => `<li>${escape(doc.fabrics.find(f => f.id === y.f)?.name)}: about ${y.yards} yd including 10% cutting allowance</li>`).join('')}</ul><p>Backing: ${escape(dim(a.finishing.backing.w, a.finishing.backing.h))}, about ${a.finishing.backing.yards} yd. Binding length: ${escape(fmt(a.finishing.bindingInches))}. These finishing allowances are separate from the remaining top cuts.</p><h2>Checks and assumptions</h2><ul>${warnings.map(w => `<li>${escape(w)}</li>`).join('') || '<li>No geometry warnings.</li>'}</ul><p>Camera measurements are reviewed estimates. Check a test unit before committing a batch.</p><h2>Assembly</h2><ol>${assemblyOrder(root).steps.map(s => `<li>${escape(s)}</li>`).join('')}</ol><h2>Methods</h2>${methodsFor(doc, root.cells.map((_, i) => i)).map(m => `<h3>${escape(m.title)}</h3><p>${escape(m.text)}</p>${m.url ? `<p><a href="${escape(m.url)}">Illustrated technique</a></p>` : ''}`).join('')}</html>`;
}
