<script lang="ts">
  import { onMount } from 'svelte';
  import { X, Camera, Scissors, Check, Ruler, Download, ArrowRight, Plus, Layers } from '@lucide/svelte';
  import { app, ui, replaceDoc, edit } from '../lib/store.svelte';
  import { cellSize, dim, fmt, analyse } from '../lib/calc';
  import { parseLength, recordMeasurement, changedPieces, pieceState, setPieceState, matchingPieces, analysePieces, remainingAnalysis, addJoiningStrip, neighbours, linkJoiningStrip, joinMadePieces, measurementIndex, expandPanel, type JoinSide } from '../lib/planning';
  import { methodsFor, assemblyOrder, planWarnings, planHtml } from '../lib/making-guide';
  import { blockDiagram } from '../lib/print';
  import { thumbnail } from '../lib/render';
  import PieceMap from './PieceMap.svelte';
  let dialog: HTMLDialogElement;
  let selected = $state(-1), tab = $state<'piece' | 'remaining' | 'assembly'>('piece'), batch = $state(false), checked = $state(false);
  let width = $state(''), height = $state(''), seamState = $state<'unfinished' | 'finished'>('unfinished');
  let side = $state<JoinSide>('right'), stripWidth = $state('2'), fabric = $state(app.doc.fabrics[0]?.id ?? ''), adding = $state(false), message = $state('');
  let stripPreview = $state('');
  const root = $derived(app.doc.blocks[app.doc.root]);
  const cell = $derived(root.cells[selected]);
  const status = $derived(selected < 0 ? 'planned' : pieceState(app.doc, selected));
  const size = $derived(selected < 0 ? null : cellSize(app.doc, app.doc.root, selected));
  const measured = $derived(app.doc.measurements?.find(m => measurementIndex(app.doc, m) === selected));
  const indices = $derived(selected < 0 ? [] : batch && status === 'planned' ? matchingPieces(app.doc, selected) : [selected]);
  const cuts = $derived(analysePieces(app.doc, indices));
  const remaining = $derived(remainingAnalysis(app.doc));
  const all = $derived(analyse(app.doc));
  const warnings = $derived(planWarnings(app.doc));
  const madeCount = $derived(root.cells.filter((_, i) => ['measured', 'sewn'].includes(pieceState(app.doc, i))).length);
  const total = $derived(root.cells.filter(c => c.c.k !== 'empty').length);
  const measurement = $derived.by(() => {
    const w = parseLength(width), h = parseLength(height);
    return selected >= 0 && w && h && !measured ? recordMeasurement($state.snapshot(app.doc), selected, { w, h, state: seamState, source: ui.cameraResult ? 'camera' : 'manual' }) : null;
  });
  const join = $derived(adding && parseLength(stripWidth) ? addJoiningStrip($state.snapshot(app.doc), selected, side, parseLength(stripWidth)!, fabric) : null);
  const changes = $derived(join?.doc ? changedPieces(app.doc, join.doc) : measurement?.doc ? changedPieces(app.doc, measurement.doc) : []);
  const adjacent = $derived(selected < 0 ? [] : neighbours(app.doc, selected, side));
  const linked = $derived((app.doc.joins ?? []).filter(j => j.source === cell?.id || j.strip === cell?.id));
  const madeNeighbors = $derived((['top','right','bottom','left'] as JoinSide[]).flatMap(edge => neighbours(app.doc,selected,edge,false)).filter(i => ['sewn','measured'].includes(pieceState(app.doc,i))));
  const label = (i: number) => root.cells[i]?.label ?? `P${i + 1}`;
  $effect(() => { const doc = join?.doc; let cancelled = false; stripPreview = ''; if (doc) void thumbnail(doc, app.images, 420).then(image => { if (!cancelled) stripPreview = image; }); return () => { cancelled = true; }; });
  function choose(i: number, camera = false) {
    selected = i; tab = 'piece'; batch = checked = adding = false; message = ''; ui.activePiece = root.cells[i]?.id ?? null;
    const m = app.doc.measurements?.find(m => measurementIndex(app.doc, m) === i), s = cellSize(app.doc, app.doc.root, i);
    const dimensions = camera && ui.cameraResult ? ui.cameraResult : m ?? (s ? { w: s.w + 2 * app.doc.settings.seam, h: s.h + 2 * app.doc.settings.seam } : null);
    width = dimensions ? String(+dimensions.w.toFixed(4)) : ''; height = dimensions ? String(+dimensions.h.toFixed(4)) : ''; seamState = m?.state ?? 'unfinished';
    if (!camera) ui.cameraResult = null;
  }
  onMount(() => { dialog.showModal(); const id = ui.activePiece ?? app.doc.nextPiece; let i = root.cells.findIndex(c => c.id === id); if (i < 0) i = root.cells.findIndex((c, i) => c.c.k !== 'empty' && pieceState(app.doc, i) === 'planned'); if (i < 0) i = root.cells.findIndex(c => c.c.k !== 'empty'); if (i >= 0) choose(i, true); });
  function close() { ui.workshop = false; ui.cameraResult = null; }
  function mark(next: 'planned' | 'cut' | 'sewn') { const id = cell?.id; replaceDoc(setPieceState($state.snapshot(app.doc), indices, next)); ui.activePiece = id ?? null; checked = false; message = next === 'planned' ? 'Piece reopened for planning. Its previous physical checkpoint was removed.' : next === 'cut' ? 'Cut batch recorded. These dimensions are now protected.' : 'Sewn. Measure its outside edges before planning the next join.'; }
  function measure() { if (!measurement?.doc) return; const id = cell.id; replaceDoc(measurement.doc); ui.activePiece = id!; ui.cameraResult = null; message = 'Actual size saved. Unmade neighbors now follow this piece.'; }
  function camera() { ui.activePiece = cell?.id ?? null; ui.workshop = false; ui.camera = true; }
  function addStrip() { if (!join?.doc) return; replaceDoc(join.doc); choose(root.cells.findIndex(c => c.id === app.doc.nextPiece)); message = 'Joining strip added to the design, cutting plan and fabric estimate.'; }
  function link(i: number) { const result = linkJoiningStrip($state.snapshot(app.doc), selected, i, side); if (result.error) message = result.error; else { replaceDoc(result.doc!); choose(i); message = 'This existing strip is your next piece. Its length follows the shared edge.'; } }
  function joinMade(otherId: string) { const other = root.cells.findIndex(c => c.id === otherId); const result = joinMadePieces($state.snapshot(app.doc), selected, other); if (result.error) message = result.error; else { replaceDoc(result.doc!); choose(root.cells.findIndex(c => c.id === app.doc.nextPiece)); message = 'Assembly recorded. Measure its outside edges before adding another strip. Earlier measurements are kept in the project history.'; } }
  function expand() { const result = expandPanel($state.snapshot(app.doc), selected); if (result.doc) { replaceDoc(result.doc); choose(root.cells.findIndex(c => c.id === app.doc.nextPiece)); message = 'The design stays the same. Its smaller pieces now have their own cutting and making checkpoints.'; } else message = result.error; }
  function exportPlan() { const doc = $state.snapshot(app.doc), html = planHtml(doc, blockDiagram(doc, doc.root, { ink: false, actual: false }).svg); const url = URL.createObjectURL(new Blob([html], { type: 'text/html' })); Object.assign(document.createElement('a'), { href: url, download: 'quilt-making-plan.html' }).click(); setTimeout(() => URL.revokeObjectURL(url), 2000); message = 'Making plan downloaded. Open it to print or save as PDF; it includes current progress, remaining cuts and method notes.'; }
  const fname = (id: string) => app.doc.fabrics.find(f => f.id === id)?.name ?? id;
</script>
<dialog bind:this={dialog} class="work-dialog making-dialog" onclose={close}>
  <header><div><p class="eyebrow">{app.doc.name} · {dim(all.size.w, all.size.h)}</p><h1>Make a little. See what comes next.</h1></div><button class="icon" aria-label="Close making workspace" onclick={close}><X /></button></header>
  <div class="making-layout">
    <section class="map-panel"><PieceMap {selected} changed={changes} pick={choose} /><div class="legend"><span>□ Planned</span><span>✂ Cut</span><span>✓ Made</span><span>→ Next</span></div><p class="progress"><b>{madeCount} / {total}</b> panels made <progress value={madeCount} max={Math.max(1,total)}></progress></p><p class="hint">Select a panel on the quilt. Gold shading previews changes to unmade pieces.</p>{#if warnings.length}<button class="checks-link" onclick={() => tab = "assembly"}>{warnings.length} construction check(s) →</button>{/if}
      <div class="map-actions"><button onclick={() => { close(); ui.resize = true; }}><Ruler size={16} /> Quilt size</button><button onclick={exportPlan}><Download size={16} /> Export making plan</button><button onclick={() => { close(); ui.make = true; }}>Whole design reference</button></div>
    </section>
    <section class="work-panel"><nav class="tabs" aria-label="Making views"><button class:on={tab === 'piece'} onclick={() => tab = 'piece'}>Next batch</button><button class:on={tab === 'remaining'} onclick={() => tab = 'remaining'}>Remaining cuts</button><button class:on={tab === 'assembly'} onclick={() => tab = 'assembly'}>Sewing guide</button></nav>
    <label class="panel-picker">Panel<select aria-label="Choose panel" value={selected} onchange={e => choose(+e.currentTarget.value)}>{#each root.cells as c,i}{#if c.c.k !== 'empty'}<option value={i}>{label(i)} · {pieceState(app.doc,i)}</option>{/if}{/each}</select></label>
    {#if tab === 'piece' && cell && cell.c.k !== 'empty' && size}
      <div class="piece-heading"><h3>{label(selected)}</h3><span class="piece-status">{status}</span><button class="ghost" onclick={() => edit(() => app.doc.nextPiece = cell.id)}>Make this next →</button></div>
      <p>Finished plan: <b>{dim(size.w, size.h)}</b><br /><span class="hint">Outside size before joining: {dim(size.w + 2 * app.doc.settings.seam, size.h + 2 * app.doc.settings.seam)}</span></p>
      {#if status === 'planned' && cell.c.k === 'inst'}<button class="breakdown" onclick={expand}>Work on the pieces inside this panel</button><p class="hint">Make smaller batches while preserving this design. You can join the pieces into an assembly as you sew.</p>{/if}
      {#if status === 'planned' && matchingPieces(app.doc, selected).length > 1}<label class="check"><input type="checkbox" bind:checked={batch} /> Make all {matchingPieces(app.doc, selected).length} matching panels in this batch</label>{/if}
      {#if status === 'planned'}
        <h3 class="section-title"><Scissors size={18} /> Cut for {indices.length === 1 ? 'this panel' : `these ${indices.length} panels`}</h3>
        <div class="cut-cards">{#each cuts.yardage.flatMap(y => y.cuts) as c}<div class="cut-card"><span class="swatch f-{c.f}"></span><div><b>{c.qty} × {dim(c.w, c.h)}</b><span>{fname(c.f)}</span><small>{c.how}</small></div></div>{/each}</div>
        <p class="hint">Cut sizes include {fmt(app.doc.settings.seam)} seams. Triangle methods can make a spare; keep it for another batch.</p>
        {#if cuts.warnings.length}<div class="checks"><b>Check before cutting</b>{#each cuts.warnings as warning}<p>{warning}</p>{/each}<label class="check"><input type="checkbox" bind:checked={checked} /> I have a method for these pieces</label></div>{/if}
        <button class="primary" disabled={cuts.warnings.length > 0 && !checked} onclick={() => mark('cut')}><Check size={17} /> This batch is cut</button>
      {:else if status === 'cut'}<div class="checkpoint"><Scissors /><p>The fabric for this panel is cut. Its size is protected while you sew.</p><button class="primary" onclick={() => mark('sewn')}><Check size={17} /> Panel sewn</button></div>{/if}
      <details class="measure" open={!!ui.cameraResult || status === 'sewn'}><summary><Ruler size={17} /> {measured ? `Measured ${dim(measured.w, measured.h)}` : 'It came out a different size / record what I made'}</summary>
        {#if measured}<p class="hint">Actual measurement is protected. Reopen this piece below if you need to correct the record.</p>{:else}
        <button onclick={camera}><Camera size={17} /> Measure with camera</button><div class="dimensions"><label>Outer width<input aria-label="Actual panel width" type="text" bind:value={width} /></label><span>×</span><label>Outer height<input aria-label="Actual panel height" type="text" bind:value={height} /></label></div>
        <div class="segments"><button class:on={seamState === 'unfinished'} onclick={() => seamState = 'unfinished'}>Edges still to sew</button><button class:on={seamState === 'finished'} onclick={() => seamState = 'finished'}>Already excludes seams</button></div><p class="hint">Use the outside edges of the fabric on your table. Feet, inches and cm work.</p>
        {#if measurement?.error}<p class="error">{measurement.error}</p>{#if app.doc.settings.lockQuilt}<button onclick={() => edit(() => { app.doc.settings.lockQuilt = false; app.doc.settings.anchor = null; })}>Let the quilt grow or shrink</button>{/if}{:else if measurement?.doc}<p class="hint">{changes.length} panel(s) change size; already-made neighbors stay fixed. Review the gold highlights.</p><button class="primary" onclick={measure}>Save actual size</button>{/if}
        {/if}
      </details>
      <details class="strip" open={status === 'measured'}><summary><Plus size={17} /> Fit the next strip</summary><p class="hint">{status === 'measured' ? 'Use an existing neighbor or add fabric to this design.' : 'This uses planned dimensions. Measure your sewn panel before cutting a strip to fit.'}</p>
        <div class="sides">{#each ['top','right','bottom','left'] as JoinSide[] as edge}<button class:on={side === edge} onclick={() => { side = edge; adding = false; }}>{edge === 'top' ? '↑ Top' : edge === 'right' ? 'Right →' : edge === 'bottom' ? '↓ Bottom' : '← Left'}</button>{/each}</div>
        {#each adjacent as i}<button class="neighbor" disabled={pieceState(app.doc,i) !== 'planned'} onclick={() => link(i)}>Use adjoining {label(i)} · {dim(cellSize(app.doc, app.doc.root, i)!.w, cellSize(app.doc, app.doc.root, i)!.h)} <ArrowRight size={16} /></button>{/each}
        <div class="dimensions"><label>New strip finished width<input aria-label="New strip finished width" type="text" bind:value={stripWidth} /></label><label>Fabric<select aria-label="New strip fabric" bind:value={fabric}>{#each app.doc.fabrics as f}<option value={f.id}>{f.name}</option>{/each}</select></label></div>
        <button onclick={() => adding = true}>Preview added strip</button>
        {#if adding && join?.error}<p class="error">{join.error}</p>{#if app.doc.settings.lockQuilt}<button onclick={() => edit(() => { app.doc.settings.lockQuilt = false; app.doc.settings.anchor = null; })}>Let the quilt grow</button>{/if}{:else if adding && join?.doc}<div class="checks"><p>Adds {join.doc.blocks[join.doc.root].cells.length - root.cells.length} strip segment(s) along this grid line. {changedPieces(app.doc,join.doc).length} existing unmade panel(s) adjust.</p><p>New quilt: <b>{dim(analyse(join.doc).size.w, analyse(join.doc).size.h)}</b>. Added fabric is included in cuts and yardage.</p>{#if stripPreview}<img class="strip-preview" src={stripPreview} alt="Quilt preview with the added strip track" />{/if}<button class="primary" onclick={addStrip}>Add strip to quilt</button></div>{/if}
      </details>
      {#each linked as link}{@const otherId = link.source === cell.id ? link.strip : link.source}{@const other = root.cells.findIndex(c => c.id === otherId)}{#if other >= 0}<div class="checkpoint"><p>Joining edge: {label(selected)} ↔ {label(other)}</p><button onclick={() => choose(other)}>Show {label(other)}</button>{#if ['sewn','measured'].includes(status) && ['sewn','measured'].includes(pieceState(app.doc,other))}<button class="primary" onclick={() => joinMade(otherId)}>These pieces are joined</button>{/if}</div>{/if}{/each}
      {#if ['sewn','measured'].includes(status) && madeNeighbors.length}<details><summary>Join a made neighbor into this assembly</summary><p class="hint">Use this after sewing their matching edges together. Their earlier checkpoints stay in history.</p>{#each madeNeighbors as i}<button onclick={() => joinMade(root.cells[i].id!)}>I joined {label(selected)} and {label(i)}</button>{/each}</details>{/if}
      {#if status !== 'planned'}<details><summary>Correct progress</summary><p class="hint">Reopening removes this piece's cut/sewn checkpoint and measurement. The fabric itself does not change.</p><button onclick={() => mark('planned')}>Reopen this piece for planning</button></details>{/if}
    {:else if tab === 'piece'}<p class="hint">Select a filled panel on the quilt. Fill empty spaces in Design before making them.</p><button onclick={close}>Back to design</button>
    {:else if tab === 'remaining'}
      <h3 class="section-title">Only what still needs cutting</h3><p class="hint">Cut, sewn and measured panels are excluded. Estimates include 10% cutting allowance. Backing and binding are separate.</p>
      {#each remaining.yardage as y}<section class="fabric-batch"><h3><i class="swatch f-{y.f}"></i>{fname(y.f)} <small>≈ {y.yards} yd</small></h3>{#each y.cuts as c}<div class="remaining-row"><b>{c.qty} × {dim(c.w,c.h)}</b><span>{c.how}</span></div>{/each}</section>{/each}
      {#if !remaining.yardage.length}<div class="checkpoint"><Check /><h3>All planned top pieces are cut.</h3><p>Keep sewing and measuring as you go. Add a strip whenever the design needs one.</p></div>{/if}
      <details><summary>Backing & binding</summary><p>Backing: {dim(all.finishing.backing.w, all.finishing.backing.h)} · about {all.finishing.backing.yards} yd. Binding length: {fmt(all.finishing.bindingInches)}.</p></details>
    {:else}
      <h3 class="section-title">Lay it out, join it, measure it</h3><p class="hint">Use {fmt(app.doc.settings.seam)} seams. P numbers match the quilt map. Make a test unit before repeating an unfamiliar method.</p>
      {#if warnings.length}<div class="checks"><b>Design checks</b>{#each warnings as warning}<p>{warning}</p>{/each}</div>{/if}
      {#each methodsFor(app.doc, selected >= 0 ? [selected] : root.cells.map((_,i)=>i)) as method}<article><h3>{method.title}</h3><p>{method.text}</p>{#if method.url}<a href={method.url} target="_blank" rel="noreferrer">Illustrated technique ↗</a>{/if}</article>{/each}
      <h3 class="section-title">Whole-quilt assembly</h3><ol>{#each assemblyOrder(root).steps as step}<li>{step}</li>{/each}</ol>
      {#if app.doc.madeArchive?.length}<details><summary>{app.doc.madeArchive.length} earlier piece checkpoints</summary>{#each app.doc.madeArchive as m}<p>{m.label}: {dim(m.w,m.h)} · {m.state}</p>{/each}</details>{/if}
    {/if}
    {#if message}<p class="feedback" role="status">{message}</p>{/if}
    </section>
  </div>
</dialog>
<style>
  .strip-preview { display: block; width: 100%; max-height: 220px; object-fit: contain; margin: 12px 0; } .checks-link { margin-top: 10px; width: 100%; color: var(--warn); }
  .panel-picker { display: none; }
  .making-dialog { width: min(96vw,1100px); max-width: 1100px; } header h1 { font-size: 25px; } .eyebrow { color: var(--muted); font-size: 12px; margin-bottom: 6px; }
  .making-layout { display: grid; grid-template-columns: minmax(240px,.95fr) minmax(300px,1.1fr); gap: 26px; margin-top: 20px; } .map-panel { align-self: start; position: sticky; top: 0; } .legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; margin-top: 12px; color: var(--muted); } .progress { margin-top: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 13px; } progress { width: 100%; height: 7px; accent-color: var(--accent); }
  .map-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; } .map-actions button { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .tabs { display: flex; gap: 4px; padding: 4px; background: var(--sunk); border-radius: 11px; margin-bottom: 18px; } .tabs button { flex: 1; border: 0; font-size: 13px; } .piece-heading { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; } .piece-heading .ghost { margin-left: auto; font-size: 12px; } .piece-status { background: var(--sunk); border-radius: 20px; padding: 3px 10px; font-size: 12px; text-transform: capitalize; }
  .section-title { display: flex; gap: 8px; align-items: center; margin: 20px 0 12px; } .cut-cards { display: grid; gap: 8px; } .cut-card { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--sunk); border-radius: 10px; } .swatch { display: inline-block; flex: none; width: 30px; height: 30px; border: 1px solid var(--line); border-radius: 5px; } .cut-card div { display: grid; gap: 3px; } .cut-card span, .cut-card small { font-size: 12px; color: var(--muted); } .primary { margin-top: 12px; }
  .check { display: flex; gap: 9px; align-items: center; padding: 12px 0; font-size: 13px; } .check input { width: 20px; height: 20px; flex: none; } .checks, .checkpoint { padding: 14px; border: 1px solid var(--line); background: var(--sunk); border-radius: 12px; margin: 14px 0; } .checks p, .checkpoint p { margin: 7px 0; font-size: 13px; line-height: 1.5; }
  details { border-top: 1px solid var(--line); padding: 14px 0; margin-top: 14px; } summary { cursor: pointer; font-weight: 700; font-size: 14px; min-height: 30px; } summary :global(svg) { display: inline; vertical-align: middle; margin-right: 6px; } .measure > button { display: inline-flex; gap: 8px; align-items: center; margin-top: 10px; }
  .dimensions { display: flex; align-items: end; gap: 8px; margin: 12px 0; } .dimensions label { min-width: 0; flex: 1; display: grid; gap: 5px; font-size: 12px; } .dimensions input, select { width: 100%; field-sizing: fixed; font-size: 17px; padding: 10px; background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; } .dimensions > span { padding-bottom: 12px; } .segments, .sides { display: flex; gap: 5px; margin: 12px 0; } .segments button, .sides button { flex: 1; font-size: 12px; } .neighbor { display: flex; align-items: center; gap: 6px; width: 100%; margin: 8px 0; }
  .fabric-batch { margin-top: 18px; } .fabric-batch h3 { display: flex; align-items: center; gap: 8px; font-size: 14px; } .fabric-batch small { margin-left: auto; } .remaining-row { display: grid; gap: 4px; border-bottom: 1px solid var(--line); padding: 12px 0; font-size: 14px; } .remaining-row span { font-size: 12px; color: var(--muted); }
  article { margin: 22px 0; } article p, li { line-height: 1.6; font-size: 14px; margin-top: 8px; } article a { font-size: 13px; color: var(--accent); } ol { padding-left: 24px; } .feedback { background: var(--accent-soft); border-radius: 10px; padding: 14px; margin-top: 16px; font-size: 14px; }
  @media(width < 760px) { .making-layout { grid-template-columns: 1fr; gap: 14px; } .map-panel { position: static; } .map-panel :global(.map) { max-width: 220px; margin: auto; } .map-panel > .hint { display: none; } header h1 { font-size: 20px; } .map-actions { margin-top: 10px; gap: 5px; } .map-actions button, .checks-link { min-height: 36px; font-size: 11px; } .panel-picker { display: flex; gap: 10px; align-items: center; font-size: 13px; margin-bottom: 14px; } .panel-picker select { flex: 1; padding: 8px; min-height: 44px; } }
</style>
