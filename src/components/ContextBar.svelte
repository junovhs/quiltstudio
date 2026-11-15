<script lang="ts">
  import { scale, fly } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { RotateCw, FlipHorizontal2, FlipVertical2, Combine, Group, Grid2x2, Trash2, Maximize2, X, Printer, Scissors } from '@lucide/svelte';
  import Tile from './Tile.svelte';
  import { app, edit, enter, scope, scopeId, ui } from '../lib/store.svelte';
  import { cellSize, fmt } from '../lib/calc';
  import { fabricsOf, groupToBlock, makeKind, merge, snap, splitCell, xform, type Kind, type Xf } from '../lib/model';

  const b = $derived(scope());
  const sel = $derived(app.sel.filter(i => b.cells[i]));
  const first = $derived(sel.length ? b.cells[sel[0]] : null);
  let splitting = $state(false);
  const SPLITS: [number, number][] = [[2, 1], [1, 2], [2, 2], [3, 3], [4, 4]];
  const KINDS: Kind[] = ['solid', 'hst', 'qst', 'goose'];

  const each = (fn: (i: number) => void) => edit(() => sel.forEach(fn));
  const xf = (t: Xf) => each(i => { b.cells[i].c = xform(snap(b.cells[i].c), t); });
  const setKind = (k: Kind) => each(i => { const c = b.cells[i]; c.c = makeKind(k, c.c.k === 'inst' ? [app.fabric] : fabricsOf(c.c), app.fabric); });
  const sample = (k: Kind) => makeKind(k, first && first.c.k !== 'inst' && first.c.k !== 'empty' ? fabricsOf(first.c) : [app.fabric, 'cream'], app.fabric);
  function doMerge() { edit(() => { const j = merge(b, sel); if (j != null) app.sel = [j]; }); }
  function doGroup() { edit(() => { if (groupToBlock(app.doc, b, sel, 'Block')) app.sel = [b.cells.length - 1]; }); }
  function doSplit(n: number, m: number) { splitting = false; if (first) edit(() => splitCell(app.doc, b, sel[0], n, m, 'Block')); }
  const clear = () => each(i => { b.cells[i].c = { k: 'empty' }; });
</script>

{#if first}
  {@const sz = cellSize(app.doc, scopeId(), sel[0])}
  {@const seam = app.doc.settings.seam}
  <div class="bar" in:scale={{ start: 0.85, duration: 380, easing: backOut }} out:scale={{ start: 0.9, duration: 140 }}>
    {#if splitting}
      <div class="grp" in:fly={{ x: 12, duration: 250 }}>
        {#each SPLITS as [n, m]}
          <button class="icon" title="{n}×{m}" onclick={() => doSplit(n, m)}>
            <span class="glyph" style:grid-template-columns="repeat({n}, 1fr)" style:grid-template-rows="repeat({m}, 1fr)">
              {#each Array(n * m) as _}<i></i>{/each}
            </span>
          </button>
        {/each}
        <button class="icon" title="Back" onclick={() => (splitting = false)}><X size={16} /></button>
      </div>
    {:else}
      {#if sz}
        <!-- finished size in inches, cut size underneath -->
        <span class="size" title="Finished size · cut size">
          <b>{fmt(sz.w, '')} × {fmt(sz.h)}</b>
          {#if first.c.k === 'solid'}<small><Scissors size={11} /> {fmt(sz.w + 2 * seam, '')} × {fmt(sz.h + 2 * seam)}</small>{/if}
        </span>
        <span class="sep"></span>
      {/if}
      {#if first.c.k === 'inst' && sel.length === 1}
        <button class="icon" title="Open this block  ↵" onclick={() => first.c.k === 'inst' && enter(first.c.ref)}><Maximize2 size={17} /></button>
        <button class="icon" title="Print this block" onclick={() => first.c.k === 'inst' && (ui.print = [first.c.ref])}><Printer size={17} /></button>
        <span class="sep"></span>
      {/if}
      <button class="icon" title="Rotate  R" onclick={() => xf('r')}><RotateCw size={17} /></button>
      <button class="icon" title="Flip  F" onclick={() => xf('h')}><FlipHorizontal2 size={17} /></button>
      <button class="icon" title="Flip  ⇧F" onclick={() => xf('v')}><FlipVertical2 size={17} /></button>
      <span class="sep"></span>
      {#each KINDS as k}
        <button class="kind" class:on={first.c.k === k} onclick={() => setKind(k)}><Tile c={sample(k)} /></button>
      {/each}
      <span class="sep"></span>
      {#if sel.length > 1}<button class="icon" title="Join into one piece" onclick={doMerge}><Combine size={17} /></button>{/if}
      <button class="icon" title="Make a block from this  G" onclick={doGroup}><Group size={17} /></button>
      {#if sel.length === 1}<button class="icon" title="Cut into smaller pieces" onclick={() => (splitting = true)}><Grid2x2 size={17} /></button>{/if}
      <button class="icon" title="Clear  ⌫" onclick={clear}><Trash2 size={17} /></button>
    {/if}
  </div>
{/if}

<style>
  .bar {
    position: fixed; z-index: 20;
    position-anchor: --sel; position-area: top; position-try-fallbacks: flip-block; margin-block: 12px;
    display: flex; align-items: center; gap: 2px; padding: 5px; border-radius: 14px; background: var(--panel);
    box-shadow: 0 2px 6px oklch(30% 0.04 50 / 12%), 0 14px 40px oklch(30% 0.04 50 / 20%);
    transform-origin: bottom center;
    @supports not (anchor-name: --a) { bottom: 24px; left: 50%; translate: -50%; }
    @media (width < 760px) {
      position-anchor: none; position-area: none; margin: 0; transform-origin: bottom center;
      left: 8px; right: 8px; bottom: calc(var(--bars) + 8px); top: auto; translate: none; padding: 6px; border-radius: 18px;
      .icon { width: 44px; height: 44px; } .kind { width: 36px; height: 36px; }
      overflow-x: auto; scrollbar-width: none; justify-content: flex-start;
      .icon { flex: none; } .kind { flex: none; }
    }
  }
  .grp { display: flex; gap: 2px; }
  .size { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 8px; line-height: 1.15; white-space: nowrap; flex: none;
    b { font-size: 15px; font-weight: 800; letter-spacing: -.01em; }
    small { display: flex; align-items: center; gap: 3px; font-size: 11px; color: var(--muted); font-weight: 600; } }
  .sep { width: 1px; height: 22px; background: var(--line); margin: 0 4px; }
  .kind { position: relative; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 7px; overflow: hidden; margin: 0 2px;
    box-shadow: 0 0 0 0 var(--accent); transition: box-shadow .25s, scale .35s var(--spring);
    &:hover { scale: 1.1; } &.on { box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--accent); } }
  .glyph { display: grid; gap: 2px; width: 18px; height: 18px; i { background: currentColor; border-radius: 1.5px; opacity: .75; } }
</style>
