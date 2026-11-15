<script lang="ts">
  import { onMount } from 'svelte';
  import { Camera, X, Scissors, Check } from '@lucide/svelte';
  import { app, ui, replaceDoc, edit } from '../lib/store.svelte';
  import { parseLength, recordMeasurement, nextStrip } from '../lib/planning';
  import { cellSize, dim, fmt } from '../lib/calc';
  import Thumb from './Thumb.svelte';
  import Tile from './Tile.svelte';
  let dialog: HTMLDialogElement;
  let selected = $state<number | null>(!app.path.length && app.sel.length === 1 ? app.sel[0] : null);
  let width = $state(''), height = $state(''), pieceState = $state<'unfinished' | 'finished'>('unfinished');
  let source = $state<'camera' | 'manual'>(ui.cameraResult ? 'camera' : 'manual');
  let side = $state<'top' | 'right' | 'bottom' | 'left'>('right'), stripWidth = $state('2');
  let message = $state(''), fabric = $state(app.doc.fabrics[0]?.id ?? '');
  const root = $derived(app.doc.blocks[app.doc.root]);
  const existing = $derived(app.doc.measurements?.find(m => m.cell === selected));
  const draft = $derived.by(() => {
    const w = parseLength(width), h = parseLength(height);
    return w && h ? { w, h, state: pieceState, source } : null;
  });
  const preview = $derived(selected !== null && draft && !existing ? recordMeasurement($state.snapshot(app.doc), selected, draft) : null);
  const measured = $derived(existing ?? draft);
  const strip = $derived(measured && parseLength(stripWidth) ? nextStrip(measured, side, parseLength(stripWidth)!, app.doc.settings.seam) : null);
  function choose(i: number) {
    selected = i; message = '';
    const m = app.doc.measurements?.find(m => m.cell === i);
    if (m) { width = fmt(m.w, ''); height = fmt(m.h, ''); pieceState = m.state; source = m.source; }
    else if (ui.cameraResult) { width = String(+ui.cameraResult.w.toFixed(3)); height = String(+ui.cameraResult.h.toFixed(3)); source = 'camera'; pieceState = 'unfinished'; }
    else {
      const size = cellSize(app.doc, app.doc.root, i);
      if (size) { width = fmt(size.w + 2 * app.doc.settings.seam, ''); height = fmt(size.h + 2 * app.doc.settings.seam, ''); pieceState = 'unfinished'; }
    }
  }
  function useMeasurement() {
    if (!preview?.doc) return;
    replaceDoc(preview.doc); ui.cameraResult = null; message = 'Measurement saved. This piece is protected from later resizing.';
  }
  onMount(() => {
    dialog.showModal();
    if (ui.cameraResult) { width = String(+ui.cameraResult.w.toFixed(3)); height = String(+ui.cameraResult.h.toFixed(3)); }
    else if (selected !== null) choose(selected);
  });
  function camera() { ui.made = false; ui.camera = true; }
  function close() { ui.made = false; ui.cameraResult = null; }
</script>

<dialog bind:this={dialog} class="work-dialog made-dialog" onclose={close}>
  <header><div><h1>Made piece → next strip</h1><p>Work from the fabric you have.</p></div><button class="icon" aria-label="Close made piece" onclick={close}><X /></button></header>
  <div class="made-top"><p>Choose the block or panel in your quilt.</p><button onclick={camera}><Camera size={18} /> Measure photo</button></div>
  <div class="root-pieces" aria-label="Pieces in the whole quilt">
    {#each root.cells as cell, i}
      {#if cell.c.k !== 'empty'}
        {@const size = cellSize(app.doc, app.doc.root, i)}
        <button class:on={selected === i} aria-label={`Choose piece ${i + 1}, ${size ? dim(size.w, size.h) : ''}`} onclick={() => choose(i)}>
          <span class="piece-thumb">{#if cell.c.k === 'inst'}<Thumb id={cell.c.ref} rot={cell.c.rot} flip={cell.c.flip} />{:else}<Tile c={cell.c} />{/if}</span>
          <span>{i + 1}{#if app.doc.measurements?.some(m => m.cell === i)} · ✓{/if}</span>
        </button>
      {/if}
    {/each}
  </div>
  {#if selected !== null}
    <div class="measured-dimensions"><label>Outer width<input aria-label="Made piece outer width" type="text" bind:value={width} disabled={!!existing} /></label><span>×</span><label>Outer height<input aria-label="Made piece outer height" type="text" bind:value={height} disabled={!!existing} /></label></div>
    <div class="seam-state"><button class:on={pieceState === 'unfinished'} disabled={!!existing} onclick={() => pieceState = 'unfinished'}>Edges still to sew</button><button class:on={pieceState === 'finished'} disabled={!!existing} onclick={() => pieceState = 'finished'}>Finished-size measurement</button></div>
    <p class="hint">{pieceState === 'unfinished' ? `Measure the outside edges as they are now. The design reserves ${fmt(app.doc.settings.seam)} on each side for joining.` : 'Use this only if your numbers already exclude the outside joining allowances.'} Numbers are inches; feet and cm also work.</p>
    {#if existing}
      <p class="saved"><Check size={17} /> Measured piece saved · {dim(existing.w, existing.h)}</p>
      <button class="ghost" onclick={() => edit(() => { app.doc.measurements = app.doc.measurements?.filter(m => m.cell !== selected); message = 'Record removed. You can enter a corrected measurement.'; })}>Remove measurement record</button>
    {:else if preview?.error}<p class="error" role="status">{preview.error}</p>
    {:else if preview?.doc}
      <p class="hint">The quilt and unmade pieces sharing these rows or columns adjust. Existing measured pieces stay fixed. Review the result; Undo restores the previous plan.</p>
      <button class="primary save-measurement" onclick={useMeasurement}><Check size={18} /> Save actual size</button>
    {/if}
    {#if message}<p class="saved" role="status">{message}</p>{/if}
    <section class="next-batch">
      <h3><Scissors size={18} /> Next strip</h3>
      <p>Pick the edge this new strip will join.</p>
      <div class="join-picker"><button class:on={side === 'top'} style:grid-area="top" onclick={() => side = 'top'}>Top</button><button class:on={side === 'left'} style:grid-area="left" onclick={() => side = 'left'}>Left</button><div class="join-block" style:grid-area="block">{#if root.cells[selected]?.c.k === 'inst'}<Thumb id={(root.cells[selected].c as { ref: string }).ref} />{:else}<Tile c={root.cells[selected].c} />{/if}</div><button class:on={side === 'right'} style:grid-area="right" onclick={() => side = 'right'}>Right</button><button class:on={side === 'bottom'} style:grid-area="bottom" onclick={() => side = 'bottom'}>Bottom</button></div>
      <div class="strip-options"><label>Strip width after sewing<input aria-label="Strip finished width" type="text" bind:value={stripWidth} /></label><label>Fabric<select aria-label="Strip fabric" bind:value={fabric}>{#each app.doc.fabrics as f}<option value={f.id}>{f.name}</option>{/each}</select></label></div>
      {#if strip}
        <div class="strip-preview f-{fabric}"></div><strong class="cut-result">Cut 1 · {dim(strip.length, strip.width)}</strong>
        <p class="hint">{pieceState === 'unfinished' ? 'Cut length matches this current outer edge.' : 'Cut length includes both joining allowances.'} Strip width includes {fmt(app.doc.settings.seam)} on each side. This is one new strip; measure again after attaching it before planning the next side.</p>
        <p class="hint">This cutting helper does not add a strip to your drawn layout or reserve fabric from its yardage estimate.</p>
      {/if}
    </section>
  {:else}<p class="hint">Choose a piece above to enter its measured size or use the camera.</p>{/if}
  <footer><button onclick={close}>Done</button></footer>
</dialog>

<style>
  .made-dialog { max-width: 570px; }
  .made-top { display: flex; align-items: center; gap: 12px; margin: 16px 0 10px; } .made-top p { flex: 1; } .made-top button { display: flex; align-items: center; gap: 7px; }
  .root-pieces { display: flex; gap: 8px; overflow-x: auto; padding: 5px 2px 12px; } .root-pieces button { flex: none; width: 64px; padding: 5px; display: grid; gap: 5px; } .piece-thumb { display: block; width: 52px; height: 52px; position: relative; container-type: size; }
  .measured-dimensions { display: flex; align-items: end; gap: 10px; margin-top: 12px; } .measured-dimensions label { flex: 1; min-width: 0; display: grid; gap: 5px; } input { width: 100%; field-sizing: fixed; padding: 8px; font-size: 18px; } .measured-dimensions span { padding-bottom: 10px; }
  .seam-state { display: flex; gap: 6px; margin-top: 12px; } .seam-state button { flex: 1; padding: 10px 6px; }
  .save-measurement { width: 100%; justify-content: center; margin-top: 12px; } .saved { display: flex; gap: 7px; align-items: center; margin-top: 12px; color: var(--ink); }
  .next-batch { margin-top: 24px; border-top: 1px solid var(--line); padding-top: 18px; } h3 { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 18px; }
  .join-picker { display: grid; grid-template-areas: '. top .' 'left block right' '. bottom .'; grid-template-columns: 70px 90px 70px; grid-template-rows: 38px 90px 38px; gap: 6px; justify-content: center; margin: 16px 0; } .join-block { position: relative; container-type: size; }
  .strip-options { display: flex; gap: 12px; } .strip-options label { flex: 1; min-width: 0; display: grid; gap: 5px; } select { width: 100%; padding: 8px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
  .strip-preview { height: 35px; border: 1px dashed var(--ink); border-radius: 3px; margin: 18px 0 10px; } .cut-result { display: block; font-size: 24px; text-align: center; }
</style>
