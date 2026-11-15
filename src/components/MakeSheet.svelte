<script lang="ts">
  import { fly, fade, scale } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { Scissors, X, ChevronRight, TriangleAlert, Layers } from '@lucide/svelte';
  import Tile from './Tile.svelte';
  import Thumb from './Thumb.svelte';
  import { app, stats, ui } from '../lib/store.svelte';
  import { dim, fmt, yd } from '../lib/calc';

  const a = $derived(stats());
  const PX = 7; // pixels per inch: everything here is drawn to the same scale
  const px = (inches: number, max = 130) => Math.max(14, Math.min(max, inches * PX));
  const fname = (id: string) => app.doc.fabrics.find(f => f.id === id)?.name ?? '';
  const close = () => (ui.make = false);
  // blocks in the order you'd make them, each with its copies
  const blocks = $derived(a.order.map(id => {
    const us = a.uses.filter(u => u.id === id);
    return { id, n: us.reduce((s, u) => s + u.qty, 0), w: us[0]?.w ?? 1, h: us[0]?.h ?? 1 };
  }));
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && close()} />

{#if ui.make}
  <div class="scrim" transition:fade={{ duration: 200 }} onclick={close} role="presentation"></div>
  <aside class="sheet" transition:fly={{ x: 480, duration: 450, easing: cubicOut }}>
    <header>
      <span class="title"><Scissors size={18} /></span>
      <span class="size">{dim(a.size.w, a.size.h)}</span>
      {#if a.warnings.length}<span class="warn" title={a.warnings.join('\n\n')}><TriangleAlert size={17} /></span>{/if}
      <button class="icon" onclick={close}><X size={18} /></button>
    </header>

    <div class="body">
      <!-- 1 · fabric to buy -->
      <section class="buy">
        {#each a.yardage as y, i}
          <div class="yard" title={fname(y.f)} in:scale={{ start: 0.6, delay: 60 + i * 40, duration: 450, easing: backOut }}>
            <span class="dot f-{y.f}"></span><b>{yd(y.yards)}</b>
          </div>
        {/each}
        {#if app.doc.settings.binding}
          <div class="yard" title="Binding · {fmt(a.finishing.bindingInches)}"><span class="dot ring f-{app.doc.settings.binding}"></span><b>{yd(a.finishing.bindingYards)}</b></div>
        {/if}
      </section>

      <!-- 2 · cut: every piece drawn to scale -->
      <h3><Scissors size={15} /></h3>
      {#each a.yardage as y}
        <section class="cuts">
          {#each y.cuts as c, i}
            <div class="piece" in:scale={{ start: 0.7, delay: 80 + i * 30, duration: 450, easing: backOut }}
              title="{dim(c.w, c.h)}{c.trimTo ? ` → ${fmt(c.trimTo)}` : ''}">
              <div class="cut f-{c.f}" style:width="{px(c.w)}px" style:height="{px(c.h)}px">
                {#if c.shape !== 'rect'}
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                    <line x1="0" y1="100" x2="100" y2="0" />
                    {#if c.shape === 'qst'}<line x1="0" y1="0" x2="100" y2="100" />{/if}
                  </svg>
                {/if}
              </div>
              <span class="n count">{c.qty}</span>
              <span class="reveal">{dim(c.w, c.h)}{#if c.trimTo}<em> → {fmt(c.trimTo)}</em>{/if}</span>
            </div>
          {/each}
        </section>
      {/each}

      <!-- 3 · sew: small units → blocks → quilt -->
      <h3><Layers size={15} /></h3>
      <section class="flow">
        {#each a.units as u, i}
          <div class="piece" title="{dim(u.w, u.h)}" in:scale={{ start: 0.7, delay: 80 + i * 40, duration: 450, easing: backOut }}>
            <div class="unit" style:width="{px(u.w)}px" style:height="{px(u.h)}px"><Tile c={u.c} /></div>
            <span class="n count">{u.qty}</span>
            <span class="reveal">{dim(u.w, u.h)}</span>
          </div>
        {/each}
        {#each blocks as blk, i}
          <ChevronRight size={18} class="arrow" />
          <div class="piece" title="{dim(blk.w, blk.h)}" in:scale={{ start: 0.7, delay: 120 + i * 50, duration: 450, easing: backOut }}>
            <div class="unit" style:width="{px(blk.w, 110)}px" style:height="{px(blk.h, 110)}px"><Thumb id={blk.id} /></div>
            <span class="n count">{blk.n}</span>
            <span class="reveal">{dim(blk.w, blk.h)}</span>
          </div>
        {/each}
        <ChevronRight size={18} class="arrow" />
        <div class="piece final">
          <div class="unit" style:width="130px" style:height="{130 * a.size.h / a.size.w}px"><Thumb id={app.doc.root} /></div>
        </div>
      </section>
    </div>
  </aside>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 40; background: oklch(30% 0.03 50 / 25%); backdrop-filter: blur(2px); }
  .sheet { position: fixed; z-index: 41; top: 0; right: 0; bottom: 0; width: min(520px, 100vw); background: var(--panel); display: flex; flex-direction: column;
    box-shadow: -20px 0 60px oklch(30% 0.04 50 / 20%); border-radius: 20px 0 0 20px; }
  header { display: flex; align-items: center; gap: 12px; padding: 14px 14px 10px 20px; }
  .title { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: var(--accent); color: white; }
  .size { font-size: 20px; font-weight: 800; letter-spacing: -.02em; flex: 1; }
  .warn { color: var(--warn); display: grid; cursor: help; }
  .body { overflow: auto; padding: 6px 20px 30px; display: grid; gap: 16px; align-content: start; scrollbar-width: thin; }
  h3 { color: var(--muted); display: flex; align-items: center; gap: 6px; border-top: 1px solid var(--line); padding-top: 14px; }
  .buy { display: flex; flex-wrap: wrap; gap: 10px; }
  .yard { display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 6px; border-radius: 99px; background: var(--sunk); font-size: 15px; }
  .dot { width: 30px; height: 30px; border-radius: 50%; box-shadow: inset 0 0 0 1px oklch(0% 0 0 / 12%); &.ring { border-radius: 8px; } }
  .cuts, .flow { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 18px 16px; }
  .cuts + .cuts { margin-top: -4px; }
  .flow :global(.arrow) { color: var(--muted); align-self: center; }
  .piece { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .cut, .unit { position: relative; border-radius: 2px; box-shadow: inset 0 0 0 1px oklch(0% 0 0 / 12%), 0 2px 6px oklch(30% 0.04 50 / 12%); overflow: hidden; transition: scale .35s var(--spring); }
  .unit { container-type: size; }
  .piece:hover .cut, .piece:hover .unit { scale: 1.06; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; line { stroke: oklch(100% 0 0 / 85%); stroke-width: 1.5; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; } }
  .n { font-size: 17px; line-height: 1; }
  .reveal { position: absolute; bottom: calc(100% + 6px); left: 50%; translate: -50% 4px; white-space: nowrap; padding: 3px 8px; border-radius: 7px;
    background: var(--ink); color: var(--panel); font-size: 12px; font-weight: 600; opacity: 0; pointer-events: none; transition: opacity .2s, translate .3s var(--spring);
    em { font-style: normal; opacity: .7; } }
  .piece:hover .reveal { opacity: 1; translate: -50% 0; }
</style>
