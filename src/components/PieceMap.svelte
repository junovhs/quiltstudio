<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { sum } from '../lib/model';
  import { pieceState } from '../lib/planning';
  import Node from './Node.svelte';
  let { selected = -1, changed = [], pick = (_i: number) => {} }: { selected?: number; changed?: number[]; pick?: (i: number) => void } = $props();
  const root = $derived(app.doc.blocks[app.doc.root]);
</script>
<div class="map" style:aspect-ratio={`${sum(root.cols)} / ${sum(root.rows)}`}>
  <Node id={app.doc.root} />
  <div class="targets" style:grid-template-columns={root.cols.map(v => v + 'fr').join(' ')} style:grid-template-rows={root.rows.map(v => v + 'fr').join(' ')}>
    {#each root.cells as cell, i}
      {@const state = pieceState(app.doc, i)}
      <button style:grid-column={`${cell.x + 1} / span ${cell.cs}`} style:grid-row={`${cell.y + 1} / span ${cell.rs}`} class:chosen={selected === i} class:changed={changed.includes(i)} class:made={state === 'sewn' || state === 'measured'} class:cut={state === 'cut'} class:next={app.doc.nextPiece === cell.id} aria-label={`${cell.label ?? `P${i + 1}`}, ${state}${cell.c.k === 'empty' ? ', empty' : ''}`} aria-pressed={selected === i} onclick={() => pick(i)}><span>{cell.label ?? `P${i + 1}`}{state === 'measured' || state === 'sewn' ? ' ✓' : state === 'cut' ? ' ✂' : app.doc.nextPiece === cell.id ? ' →' : ''}</span></button>
    {/each}
  </div>
</div>
<style>
  .map { width: 100%; max-height: 440px; position: relative; container-type: size; background: var(--sunk); }
  .targets { position: absolute; inset: 0; display: grid; }
  button { position: relative; background: transparent; padding: 0; min-height: 0; border: 1px solid #ffffff77; border-radius: 0; min-width: 0; overflow: hidden; }
  button span { position: absolute; left: 2px; top: 2px; font-size: clamp(9px, 2cqw, 12px); font-weight: 750; padding: 2px 4px; background: #fffef2e8; color: #242019; border-radius: 3px; }
  .made { background: repeating-linear-gradient(135deg,transparent 0 8px,#16795544 8px 10px); border: 2px solid #43bc91; }
  .cut { border: 2px dashed #ffe4a4; }
  .next { box-shadow: inset 0 0 0 3px #f3c553; }
  .changed { background: #f6b63c55; }
  .chosen { box-shadow: inset 0 0 0 4px var(--accent); z-index: 1; }
  button:focus-visible { outline: 3px solid var(--ink); z-index: 2; }
</style>
