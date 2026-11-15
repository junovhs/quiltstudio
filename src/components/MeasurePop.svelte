<script lang="ts">
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { Pin, PinOff, Scissors, X } from '@lucide/svelte';
  import Tile from './Tile.svelte';
  import Thumb from './Thumb.svelte';
  import { app, edit, ui } from '../lib/store.svelte';
  import { cellSize, fmt } from '../lib/calc';
  import { templateFinished } from '../lib/sizes';

  const m = $derived(ui.measure);
  const cell = $derived(m ? app.doc.blocks[m.def]?.cells[m.i] : null);
  const size = $derived(m ? cellSize(app.doc, m.def, m.i) : null);
  const pinned = $derived(!!m && app.doc.settings.anchor?.def === m.def && app.doc.settings.anchor?.i === m.i);
  const short = $derived(size ? Math.min(size.w, size.h) : 0);
  const maxT = $derived(Math.max(...app.doc.settings.templates));
  let custom = $state('');

  function pinAt(v: number) {
    if (!m || !(v > 0)) return;
    edit(() => { app.doc.settings.anchor = { def: m.def, i: m.i, size: v }; });
  }
  const unpin = () => edit(() => { app.doc.settings.anchor = null; });
  const close = () => (ui.measure = null);
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && close()} />

{#if m && cell && size}
  <div class="pop" style:left="{Math.min(m.x + 14, innerWidth - 300)}px" style:top="{Math.min(m.y - 20, innerHeight - 330)}px"
    in:scale={{ start: 0.85, duration: 380, easing: backOut }} out:scale={{ start: 0.95, duration: 120 }}>
    <button class="icon close" onclick={close}><X size={15} /></button>
    <div class="head">
      <div class="piece" style:aspect-ratio="{size.w} / {size.h}">
        {#if cell.c.k === 'inst'}<Thumb id={cell.c.ref} rot={cell.c.rot} flip={cell.c.flip} />{:else}<Tile c={cell.c} />{/if}
      </div>
      <div class="num">
        <div class="big">{fmt(size.w)}{#if Math.abs(size.w - size.h) > 1e-3}<span class="by"> × {fmt(size.h)}</span>{/if}</div>
        {#if cell.c.k === 'solid'}<div class="cut"><Scissors size={13} /> {fmt(size.w + 2 * app.doc.settings.seam)}{#if Math.abs(size.w - size.h) > 1e-3} × {fmt(size.h + 2 * app.doc.settings.seam)}{/if}</div>{/if}
      </div>
    </div>

    <!-- my template squares, drawn to scale: tap one to size everything from this piece -->
    <div class="templates">
      {#each app.doc.settings.templates as t}
        <button class="tpl" class:on={pinned && Math.abs(app.doc.settings.anchor!.size - templateFinished(app.doc, t)) < 1e-6} class:match={!pinned && Math.abs(short - templateFinished(app.doc, t)) < 1e-6}
          title="Your {fmt(t)} square → {fmt(templateFinished(app.doc, t))} finished" onclick={() => pinAt(templateFinished(app.doc, t))}>
          <span class="sq" style:--s={t / maxT}></span>
          <span class="lbl">{fmt(t, '')}</span>
        </button>
      {/each}
      <label class="tpl custom" title="Other size">
        <input type="text" inputmode="decimal" placeholder="…" bind:value={custom} onchange={() => { pinAt(parseFloat(custom.replace(',', '.'))); custom = ''; }} />
      </label>
    </div>

    <div class="foot">
      {#if pinned}
        <span class="pinned"><Pin size={14} /> {fmt(app.doc.settings.anchor!.size)}</span>
        <button class="icon" title="Unpin" onclick={unpin}><PinOff size={16} /></button>
      {:else}
        <button class="pinbtn" title="Size everything from this piece" onclick={() => pinAt(short)}><Pin size={14} /></button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .pop {
    position: fixed; z-index: 30; width: 286px; padding: 14px; border-radius: 16px; background: var(--panel);
    box-shadow: 0 2px 6px oklch(30% 0.04 50 / 12%), 0 20px 50px oklch(30% 0.04 50 / 24%);
    display: grid; gap: 14px; transform-origin: top left;
  }
  @media (width < 760px) {
    .pop { left: 8px !important; right: 8px; top: auto !important; bottom: calc(var(--bars) + 8px); width: auto; transform-origin: bottom center; }
    .tpl { padding: 6px; }
  }
  .close { position: absolute; top: 6px; right: 6px; width: 28px; height: 28px; color: var(--muted); }
  .head { display: flex; gap: 14px; align-items: center; }
  .piece { position: relative; width: 64px; max-height: 64px; flex: none; border-radius: 4px; overflow: hidden; box-shadow: var(--shadow); container-type: size; }
  .big { font-size: 30px; font-weight: 800; letter-spacing: -.03em; line-height: 1; .by { font-size: 20px; font-weight: 700; opacity: .7; } }
  .cut { display: flex; align-items: center; gap: 5px; color: var(--muted); font-size: 13px; margin-top: 6px; }
  .templates { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px; }
  .tpl {
    display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 4px; border: 0; background: none; border-radius: 8px;
    .sq { width: calc(10px + var(--s) * 30px); aspect-ratio: 1; border-radius: 3px; background: var(--sunk); box-shadow: inset 0 0 0 1.5px var(--line); transition: background .2s, box-shadow .2s; }
    .lbl { font-size: 10.5px; color: var(--muted); font-weight: 600; }
    &:hover .sq { box-shadow: inset 0 0 0 2px var(--accent); }
    &.match .sq { box-shadow: inset 0 0 0 2px var(--muted); }
    &.on .sq { background: var(--accent); box-shadow: none; } &.on .lbl { color: var(--accent); }
  }
  .custom input { width: 38px; height: 38px; text-align: center; border: 1.5px dashed var(--line); border-radius: 8px; background: none; font-weight: 600; field-sizing: fixed; }
  .foot { display: flex; align-items: center; gap: 6px; min-height: 30px; }
  .pinned { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 99px; background: var(--accent); color: white; font-weight: 700; }
  .pinbtn { display: grid; place-items: center; width: 34px; height: 30px; border-radius: 99px; border: 1.5px dashed var(--line); background: none; color: var(--muted);
    &:hover { color: var(--accent); border-color: var(--accent); } }
</style>
