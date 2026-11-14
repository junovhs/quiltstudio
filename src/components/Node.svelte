<script lang="ts">
  import Node from './Node.svelte';
  import Tile from './Tile.svelte';
  import { app } from '../lib/store.svelte';

  let { id, depth = 0, scope = false, sel = [] }: { id: string; depth?: number; scope?: boolean; sel?: number[] } = $props();
  const b = $derived(app.doc.blocks[id]);
</script>

{#if b && depth < 12}
  <div class="grid" class:scope
    style:grid-template-columns={b.cols.map(v => v + 'fr').join(' ')}
    style:grid-template-rows={b.rows.map(v => v + 'fr').join(' ')}>
    {#each b.cells as cell, i}
      <div class="cell" class:sel={scope && sel.includes(i)} class:ic={cell.c.k === 'inst'}
        data-def={id} data-i={i}
        style:grid-column="{cell.x + 1} / span {cell.cs}"
        style:grid-row="{cell.y + 1} / span {cell.rs}">
        {#if cell.c.k === 'inst'}
          <div class="inst" class:odd={cell.c.rot % 2 === 1}
            style:rotate="{cell.c.rot * 90}deg" style:scale="{cell.c.flip ? -1 : 1} 1">
            <Node id={cell.c.ref} depth={depth + 1} />
          </div>
        {:else}
          <Tile c={cell.c} />
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .grid { display: grid; width: 100%; height: 100%; }
  .cell { position: relative; min-width: 0; min-height: 0; }
  .ic { container-type: size; }
  .inst {
    position: absolute; left: 50%; top: 50%;
    width: 100cqw; height: 100cqh; translate: -50% -50%;
    &.odd { width: 100cqh; height: 100cqw; }
  }
  /* seams + selection drawn on top, never catching clicks */
  .cell::after { content: ''; position: absolute; inset: 0; pointer-events: none; transition: box-shadow .12s; }
  :global(.seams) .cell::after { box-shadow: inset 0 0 0 .5px oklch(0% 0 0 / 28%); }
  :global(.seams) .scope > .cell::after { box-shadow: inset 0 0 0 1px oklch(0% 0 0 / 45%); }
  .scope > .cell:hover::after { box-shadow: inset 0 0 0 2px oklch(from var(--accent) l c h / 60%); }
  .scope > .cell.sel::after { box-shadow: inset 0 0 0 2.5px var(--accent), inset 0 0 0 9999px oklch(from var(--accent) l c h / 18%); }
</style>
