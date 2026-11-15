<script lang="ts">
  import { fly, fade, scale } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { Scissors, X, ChevronRight, TriangleAlert, Layers, Check } from '@lucide/svelte';
  import Tile from './Tile.svelte';
  import Thumb from './Thumb.svelte';
  import { app, stats, ui, toggleDone } from '../lib/store.svelte';
  import { dim, fmt, yd } from '../lib/calc';
  import { taps } from '../lib/gestures';
  import { swipeClose, isPhone } from '../lib/sheet';

  const a = $derived(stats());
  const PX = 7; // pixels per inch: everything here is drawn to the same scale
  const px = (inches: number, max = 130) => Math.max(14, Math.min(max, inches * PX));
  const fname = (id: string) => app.doc.fabrics.find(f => f.id === id)?.name ?? '';
  const close = () => (ui.make = false);
  const done = (key: string) => !!app.doc.progress?.[key];
  // everything you can tick off, and how many are ticked
  const keys = $derived([...a.yardage.flatMap(y => y.cuts.map(c => c.key)), ...a.units.map(u => u.key), ...a.order.map(id => 'blk|' + id)]);
  const doneCount = $derived(keys.filter(done).length);
  // blocks in the order you'd make them, each with its copies
  const blocks = $derived(a.order.map(id => {
    const us = a.uses.filter(u => u.id === id);
    return { id, n: us.reduce((s, u) => s + u.qty, 0), w: us[0]?.w ?? 1, h: us[0]?.h ?? 1 };
  }));
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && close()} />

{#if ui.make}
  <div class="scrim" transition:fade={{ duration: 200 }} onclick={close} role="presentation"></div>
  <aside class="sheet" transition:fly={isPhone() ? { y: 900, duration: 480, easing: cubicOut, opacity: 1 } : { x: 480, duration: 450, easing: cubicOut }}
    use:swipeClose={{ close, axis: isPhone() ? 'y' : 'x-right' }}>
    <span class="grabber" data-grab></span>
    <header data-grab>
      <span class="title"><Scissors size={18} /></span>
      <span class="size">{dim(a.size.w, a.size.h)}</span>
      <span class="prog" title="{doneCount} / {keys.length}">
        <span class="bar"><i style:width="{keys.length ? (doneCount / keys.length) * 100 : 0}%"></i></span>
        {#if doneCount === keys.length && keys.length}<span class="all" in:scale={{ start: 0, duration: 600, easing: backOut }}><Check size={14} strokeWidth={3.5} /></span>{/if}
      </span>
      {#if a.warnings.length}<span class="warn" title={a.warnings.join('\n\n')}><TriangleAlert size={17} /></span>{/if}
      <button class="icon" onclick={close}><X size={18} /></button>
    </header>

    <div class="body">
      <button class="adaptive-entry" onclick={() => { ui.make = false; ui.made = true; }}>Made a piece? Plan the next strip →</button>
      {#if app.doc.measurements?.length}<p class="plan-reference">This is the full design reference, including pieces already measured and made. Use the next-strip helper to plan your next batch.</p>{/if}
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
            <div class="piece" class:done={done(c.key)} in:scale={{ start: 0.7, delay: 80 + i * 30, duration: 450, easing: backOut }}
              title="{dim(c.w, c.h)}{c.trimTo ? ` → ${fmt(c.trimTo)}` : ''}" use:taps={{ double: () => toggleDone(c.key) }} role="button" tabindex="-1">
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
              {#if done(c.key)}<span class="tick" in:scale={{ start: 0, duration: 500, easing: backOut }}><Check size={14} strokeWidth={3.5} /></span>{/if}
            </div>
          {/each}
        </section>
      {/each}

      <!-- 3 · sew: small units → blocks → quilt -->
      <h3><Layers size={15} /></h3>
      <section class="flow">
        {#each a.units as u, i}
          <div class="piece" class:done={done(u.key)} title="{dim(u.w, u.h)}" use:taps={{ double: () => toggleDone(u.key) }} role="button" tabindex="-1" in:scale={{ start: 0.7, delay: 80 + i * 40, duration: 450, easing: backOut }}>
            <div class="unit" style:width="{px(u.w)}px" style:height="{px(u.h)}px"><Tile c={u.c} /></div>
            <span class="n count">{u.qty}</span>
            <span class="reveal">{dim(u.w, u.h)}</span>
            {#if done(u.key)}<span class="tick" in:scale={{ start: 0, duration: 500, easing: backOut }}><Check size={14} strokeWidth={3.5} /></span>{/if}
          </div>
        {/each}
        {#each blocks as blk, i}
          <ChevronRight size={18} class="arrow" />
          <div class="piece" class:done={done('blk|' + blk.id)} title="{dim(blk.w, blk.h)}" use:taps={{ double: () => toggleDone('blk|' + blk.id) }} role="button" tabindex="-1" in:scale={{ start: 0.7, delay: 120 + i * 50, duration: 450, easing: backOut }}>
            <div class="unit" style:width="{px(blk.w, 110)}px" style:height="{px(blk.h, 110)}px"><Thumb id={blk.id} /></div>
            <span class="n count">{blk.n}</span>
            <span class="reveal">{dim(blk.w, blk.h)}</span>
            {#if done('blk|' + blk.id)}<span class="tick" in:scale={{ start: 0, duration: 500, easing: backOut }}><Check size={14} strokeWidth={3.5} /></span>{/if}
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
  .piece { cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  .piece .cut, .piece .unit, .piece .n { transition: opacity .3s, filter .3s, scale .35s var(--spring); }
  .piece.done .cut, .piece.done .unit { opacity: .45; filter: saturate(.5); }
  .piece.done .n { opacity: .4; text-decoration: line-through; }
  .tick, .all { display: grid; place-items: center; border-radius: 50%; background: oklch(62% 0.16 150); color: white; box-shadow: 0 2px 8px oklch(62% 0.16 150 / 45%); }
  .tick { position: absolute; top: -9px; right: -9px; width: 24px; height: 24px; z-index: 1; }
  .prog { display: flex; align-items: center; gap: 8px; }
  .bar { width: 90px; height: 8px; border-radius: 99px; background: var(--sunk); overflow: hidden;
    i { display: block; height: 100%; background: oklch(62% 0.16 150); border-radius: inherit; transition: width .6s var(--spring); } }
  .all { width: 22px; height: 22px; }
  .grabber { display: none; }
  @media (width < 760px) {
    .sheet { top: calc(env(safe-area-inset-top) + 28px); width: 100vw; border-radius: 22px 22px 0 0; padding-bottom: env(safe-area-inset-bottom); box-shadow: 0 -16px 50px oklch(30% 0.04 50 / 22%); }
    .grabber { display: block; align-self: center; width: 40px; height: 5px; margin-top: 8px; border-radius: 99px; background: var(--line); }
    header { padding: 6px 12px 8px 16px; touch-action: none; }
    .body { padding-inline: 16px; padding-bottom: 40px; }
    .bar { width: 64px; }
    .cuts, .flow { gap: 22px 18px; }
  }
</style>
