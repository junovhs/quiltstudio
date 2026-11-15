<script lang="ts">
  import { scale, fade } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { RotateCw } from '@lucide/svelte';
  import Node from './Node.svelte';
  import Tile from './Tile.svelte';
  import { app, scope, stats } from '../lib/store.svelte';
  import { drag, turn } from '../lib/drag.svelte';
  import { sum } from '../lib/model';

  const d = $derived(drag.d);

  /* how big it would be on the quilt right now (so it floats at true scale) */
  function floating(): { w: number; h: number } {
    const q = document.querySelector('.stage .quilt')?.getBoundingClientRect();
    const b = scope();
    const ppi = q ? q.width / sum(b.cols) : 8;
    const c = d!.c;
    if (c.k !== 'inst') return { w: 70, h: 70 };
    const blk = app.doc.blocks[c.ref];
    const u = stats().uses.find(u => u.id === c.ref);
    let [w, h] = u ? [u.w, u.h] : [sum(blk.cols), sum(blk.rows)];
    if (c.rot % 2) [w, h] = [h, w];
    const k = Math.min(1, 260 / Math.max(w * ppi, h * ppi));
    return { w: Math.max(40, w * ppi * k), h: Math.max(40, h * ppi * k) };
  }
  const box = $derived.by(() => {
    if (!d) return null;
    if (d.rect && d.fits) return { x: d.rect.left, y: d.rect.top, w: d.rect.width, h: d.rect.height, snapped: true };
    const f = floating();
    return { x: d.x - f.w / 2, y: d.y - f.h / 2, w: f.w, h: f.h, snapped: false };
  });
</script>

{#if d && box}
  <div class="ghost" class:fits={d.fits} class:snapped={box.snapped}
    style:left="{box.x}px" style:top="{box.y}px" style:width="{box.w}px" style:height="{box.h}px"
    in:scale={{ start: 0.6, duration: 300, easing: backOut }} out:fade={{ duration: 160 }}>
    <div class="body">
      {#if d.c.k === 'inst'}
        <div class="inst" class:odd={d.c.rot % 2 === 1} style:rotate="{d.c.rot * 90}deg" style:scale="{d.c.flip ? -1 : 1} 1"><Node id={d.c.ref} /></div>
      {:else}
        <Tile c={d.c} />
      {/if}
    </div>
  </div>
  {#if d.rect && !d.fits}
    <!-- the slot it's over, outlined red: wrong shape for this slot -->
    <div class="slot" style:left="{d.rect.left}px" style:top="{d.rect.top}px" style:width="{d.rect.width}px" style:height="{d.rect.height}px" transition:fade={{ duration: 120 }}></div>
  {/if}
  <!-- turn it while carrying: tap with another finger (or press R / scroll) -->
  <button class="turn" onpointerdown={e => { e.stopPropagation(); e.preventDefault(); turn(); }} title="Turn  R" transition:scale={{ start: 0.5, duration: 350, easing: backOut }}>
    <RotateCw size={26} />
  </button>
{/if}

<style>
  .ghost {
    position: fixed; z-index: 60; pointer-events: none;
    transition: left .08s linear, top .08s linear, width .25s var(--spring), height .25s var(--spring), rotate .3s var(--spring);
    rotate: -3deg; filter: drop-shadow(0 14px 24px oklch(30% 0.04 50 / 35%));
    &.snapped { transition: left .22s var(--spring), top .22s var(--spring), width .22s var(--spring), height .22s var(--spring), rotate .3s var(--spring); rotate: 0deg; filter: drop-shadow(0 4px 10px oklch(30% 0.04 50 / 25%)); }
  }
  .body { position: absolute; inset: 0; container-type: size; overflow: hidden; border-radius: 2px; }
  .inst { position: absolute; left: 50%; top: 50%; width: 100cqw; height: 100cqh; translate: -50% -50%; transition: rotate .3s var(--spring);
    &.odd { width: 100cqh; height: 100cqw; } }
  /* red until it fits a slot, then green */
  .ghost::after {
    content: ''; position: absolute; inset: 0; border-radius: 2px; pointer-events: none;
    background: oklch(62% 0.22 25 / 38%); box-shadow: inset 0 0 0 3px oklch(58% 0.22 25);
    transition: background .2s, box-shadow .2s;
  }
  .ghost.fits::after { background: oklch(70% 0.17 150 / 22%); box-shadow: inset 0 0 0 3px oklch(62% 0.17 150); }
  .slot { position: fixed; z-index: 59; pointer-events: none; box-shadow: inset 0 0 0 3px oklch(58% 0.22 25), 0 0 0 9999px transparent; background: oklch(62% 0.22 25 / 12%); }
  .turn {
    position: fixed; z-index: 61; left: 50%; translate: -50%; bottom: calc(var(--bars, 0px) + 22px);
    width: 64px; height: 64px; padding: 0; border: 0; border-radius: 50%; display: grid; place-items: center;
    background: var(--panel); color: var(--accent); box-shadow: 0 8px 28px oklch(30% 0.04 50 / 30%); touch-action: none;
    &:active { scale: .9; }
  }
  :global(body.dragging-piece) { cursor: grabbing; }
  :global(body.dragging-piece *) { cursor: grabbing !important; }
</style>
