<script lang="ts">
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { Pin } from '@lucide/svelte';
  import Node from './Node.svelte';
  import Tile from './Tile.svelte';
  import { app, ui, scopeId } from '../lib/store.svelte';
  import { pieceState } from '../lib/planning';
  import { drag } from '../lib/drag.svelte';
  import { symTargets } from '../lib/model';

  let { id, depth = 0, rot = 0, flip = false }: { id: string; depth?: number; rot?: number; flip?: boolean } = $props();
  const b = $derived(app.doc.blocks[id]);
  const anchor = $derived(app.doc.settings.anchor);
  // the block being edited: on its own it's the whole canvas; in place, every copy of it on the quilt
  const scope = $derived(id === scopeId());
  const sel = $derived(scope ? app.sel : []);
  // where the symmetry setting will copy edits to
  const mirrors = $derived(scope && app.sym !== 'none' && b
    ? new Set(app.sel.filter(i => b.cells[i]).flatMap(i => symTargets(b, i, app.sym).slice(1).map(t => t.i)).filter(i => !app.sel.includes(i)))
    : new Set<number>());
</script>

{#if b && depth < 12}
  <div class="grid" class:scope data-rot={rot} data-flip={flip ? 1 : 0}
    style:grid-template-columns={b.cols.map(v => v + 'fr').join(' ')}
    style:grid-template-rows={b.rows.map(v => v + 'fr').join(' ')}>
    {#each b.cells as cell, i}
      <div class="cell" class:sel={sel.includes(i)} class:mirror={mirrors.has(i)} class:lifted={scope && drag.d?.from === i} class:ic={cell.c.k === 'inst'}
        data-def={id} data-i={i}
        style:grid-column="{cell.x + 1} / span {cell.cs}"
        style:grid-row="{cell.y + 1} / span {cell.rs}">
        {#key JSON.stringify(cell.c)}
          <div class="pop" in:scale={{ start: 0.6, duration: 420, easing: backOut }}>
            {#if cell.c.k === 'inst'}
              <div class="inst" class:odd={cell.c.rot % 2 === 1}
                style:rotate="{cell.c.rot * 90}deg" style:scale="{cell.c.flip ? -1 : 1} 1">
                <Node id={cell.c.ref} depth={depth + 1} rot={cell.c.rot} flip={cell.c.flip} />
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
    {#if scope && app.sym !== 'none'}
      <div class="axes" data-sym={app.sym}><i class="ax v"></i><i class="ax h"></i><i class="ax d1"></i><i class="ax d2"></i></div>
    {/if}
  </div>
{/if}

<style>
  .grid {
    display: grid; position: relative; width: 100%; height: 100%;
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
  .scope > .cell.mirror::after { box-shadow: inset 0 0 0 2px var(--accent), inset 0 0 0 9999px oklch(from var(--accent) l c h / 8%); outline: 2px dashed var(--panel); outline-offset: -5px; }
  /* symmetry: the mirror lines across the block being edited */
  .axes { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
  .ax { position: absolute; display: none; background: repeating-linear-gradient(var(--dir, 90deg), var(--accent) 0 6px, transparent 6px 11px); opacity: .9; }
  .ax.v { left: calc(50% - 1px); top: -6px; bottom: -6px; width: 2px; --dir: 180deg; }
  .ax.h { top: calc(50% - 1px); left: -6px; right: -6px; height: 2px; }
  .ax.d1, .ax.d2 { left: 50%; top: 50%; width: 141%; height: 2px; translate: -50% -50%; }
  .ax.d1 { rotate: 45deg; } .ax.d2 { rotate: -45deg; }
  [data-sym=h] .v, [data-sym=v] .h, [data-sym=quad] .v, [data-sym=quad] .h, [data-sym=rot] .v, [data-sym=rot] .h, [data-sym=rot] .d1, [data-sym=rot] .d2 { display: block; }
  [data-sym=rot] .ax { opacity: .45; }
  .pin {
    position: absolute; top: 50%; left: 50%; translate: -50% -50%; z-index: 2; pointer-events: none;
    display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%;
    background: var(--accent); color: white; box-shadow: 0 1px 4px oklch(0% 0 0 / 30%);
    animation: pinIn .5s var(--spring);
  }
  .making-mark { position: absolute; left: 3px; top: 3px; z-index: 2; pointer-events: none; background: #ffe1a0; color: #2a221d; padding: 3px 5px; border-radius: 4px; font-size: 11px; font-weight: 800; } .making-mark.physical { background: #c6f3df; }
  @keyframes pinIn { from { scale: 0; } }
</style>
