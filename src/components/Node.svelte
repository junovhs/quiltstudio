<script lang="ts">
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { Pin } from '@lucide/svelte';
  import Node from './Node.svelte';
  import Tile from './Tile.svelte';
  import { app, ui } from '../lib/store.svelte';
  import { pieceState } from '../lib/planning';
  import { drag } from '../lib/drag.svelte';

  let { id, depth = 0, scope = false, sel = [] }: { id: string; depth?: number; scope?: boolean; sel?: number[] } = $props();
  const b = $derived(app.doc.blocks[id]);
  const anchor = $derived(app.doc.settings.anchor);
</script>

{#if b && depth < 12}
  <div class="grid" class:scope
    style:grid-template-columns={b.cols.map(v => v + 'fr').join(' ')}
    style:grid-template-rows={b.rows.map(v => v + 'fr').join(' ')}>
    {#each b.cells as cell, i}
      <div class="cell" class:sel={scope && sel.includes(i)} class:lifted={scope && drag.d?.from === i} class:ic={cell.c.k === 'inst'}
        data-def={id} data-i={i}
        style:grid-column="{cell.x + 1} / span {cell.cs}"
        style:grid-row="{cell.y + 1} / span {cell.rs}">
        {#key JSON.stringify(cell.c)}
          <div class="pop" in:scale={{ start: 0.6, duration: 420, easing: backOut }}>
            {#if cell.c.k === 'inst'}
              <div class="inst" class:odd={cell.c.rot % 2 === 1}
                style:rotate="{cell.c.rot * 90}deg" style:scale="{cell.c.flip ? -1 : 1} 1">
                <Node id={cell.c.ref} depth={depth + 1} />
              </div>
            {:else}
              <Tile c={cell.c} />
            {/if}
          </div>
        {/key}
        {#if scope && id === app.doc.root && ui.showProgress && cell.c.k !== 'empty'}
          {@const status = pieceState(app.doc, i)}
          {#if status !== 'planned' || app.doc.nextPiece === cell.id}<span class="making-mark" class:physical={status !== 'planned'} title={`${cell.label ?? `P${i + 1}`} · ${status}`}>{status === 'measured' || status === 'sewn' ? '✓' : status === 'cut' ? '✂' : '→'} {cell.label ?? `P${i + 1}`}</span>{/if}
        {/if}
        {#if anchor && anchor.def === id && anchor.i === i && (scope || app.tool === 'measure')}
          <span class="pin" title="Everything is sized from this piece"><Pin size={11} strokeWidth={2.5} /></span>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .grid {
    display: grid; width: 100%; height: 100%;
    transition: grid-template-columns .45s var(--spring), grid-template-rows .45s var(--spring);
    :global(.dragging) & { transition: none; }
  }
  .cell { position: relative; min-width: 0; min-height: 0; }
  .pop { position: absolute; inset: 0; transition: opacity .2s; }
  .lifted > .pop { opacity: .25; }
  .ic > .pop { container-type: size; }
  .inst {
    position: absolute; left: 50%; top: 50%;
    width: 100cqw; height: 100cqh; translate: -50% -50%;
    &.odd { width: 100cqh; height: 100cqw; }
  }
  /* seams + selection drawn on top, never catching clicks */
  .cell::after { content: ''; position: absolute; inset: 0; pointer-events: none; transition: box-shadow .2s; }
  :global(.seams) .cell::after { box-shadow: inset 0 0 0 .5px oklch(0% 0 0 / 22%); }
  :global(.seams) .scope > .cell::after { box-shadow: inset 0 0 0 1px oklch(0% 0 0 / 35%); }
  .scope > .cell:hover::after { box-shadow: inset 0 0 0 2px oklch(from var(--accent) l c h / 55%); }
  .scope > .cell.sel { anchor-name: --sel; }
  .scope > .cell.sel::after { box-shadow: inset 0 0 0 3px var(--accent), inset 0 0 0 9999px oklch(from var(--accent) l c h / 16%); }
  .pin {
    position: absolute; top: 50%; left: 50%; translate: -50% -50%; z-index: 2; pointer-events: none;
    display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%;
    background: var(--accent); color: white; box-shadow: 0 1px 4px oklch(0% 0 0 / 30%);
    animation: pinIn .5s var(--spring);
  }
  .making-mark { position: absolute; left: 3px; top: 3px; z-index: 2; pointer-events: none; background: #ffe1a0; color: #2a221d; padding: 3px 5px; border-radius: 4px; font-size: 11px; font-weight: 800; } .making-mark.physical { background: #c6f3df; }
  @keyframes pinIn { from { scale: 0; } }
</style>
