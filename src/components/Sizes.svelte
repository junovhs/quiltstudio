<script lang="ts">
  import { slide } from 'svelte/transition';
  import { TriangleAlert, Check, Ruler, Search, Plus, X } from '@lucide/svelte';
  import Tile from './Tile.svelte';
  import { app, edit, openBlock } from '../lib/store.svelte';
  import { fmt } from '../lib/calc';
  import { pieces, whereIs, resizePiece, finishedFor, type Piece } from '../lib/sizes';

  const list = $derived(pieces(app.doc));
  const odd = $derived(list.filter(p => p.status === 'odd' || p.status === 'near'));
  const seam = $derived(app.doc.settings.seam);
  let open = $state<string | null>(null);
  let pop: HTMLElement;
  let newT = $state('');

  /* show me: open the block they're in and highlight every copy */
  function find(p: Piece) {
    const where = [...whereIs(app.doc, p)];
    if (!where.length) return;
    const [def, idxs] = where.find(([d]) => d !== app.doc.root) ?? where[0];
    pop.hidePopover();
    openBlock(def);
    setTimeout(() => (app.sel = idxs), 80);
  }
  const fix = (p: Piece, t: number) => edit(() => resizePiece(app.doc, p, finishedFor(p, t, seam)));
  // templates worth offering: ones that make it at least ½″ and not wildly bigger
  const offer = (p: Piece) => app.doc.settings.templates.filter(t => finishedFor(p, t, seam) >= 0.5);
  const T = $derived([...app.doc.settings.templates].sort((a, b) => a - b));
  const maxT = $derived(Math.max(...T, 1));
  function addT() { const v = parseFloat(newT.replace(',', '.')); newT = ''; if (v > 0 && !T.includes(v)) edit(() => app.doc.settings.templates.push(v)); }
  const delT = (t: number) => edit(() => (app.doc.settings.templates = app.doc.settings.templates.filter(x => x !== t)));
</script>

<button class="icon trig" class:bad={odd.length} popovertarget="sizes" title="Odd sizes">
  {#if odd.length}<TriangleAlert size={19} /><span class="badge">{odd.length}</span>{:else}<Check size={19} />{/if}
</button>

<div popover id="sizes" bind:this={pop}>
  <div class="list">
    {#each list as p (p.key)}
      <div class="row {p.status}" class:open={open === p.key}>
        <button class="main" onclick={() => (open = open === p.key ? null : p.key)}>
          <span class="pic" style:aspect-ratio="{p.w} / {p.h}"><Tile c={p.c} /></span>
          <span class="count">{p.qty}</span>
          <b class="sz">{fmt(p.w, '')} × {fmt(p.h)}</b>
          <span class="st">
            {#if p.status === 'template'}<span class="tpl"><i style:--s={p.template! / maxT}></i>{fmt(p.template!)}</span>
            {:else if p.status === 'ruler'}<Ruler size={15} />
            {:else if p.status === 'near'}<span class="nsq" title="Almost square — square it up?"><i></i></span>
            {:else}<TriangleAlert size={16} />{/if}
          </span>
        </button>
        {#if open === p.key}
          <div class="more" transition:slide={{ duration: 220 }}>
            <button class="find" title="Show me where" onclick={() => find(p)}><Search size={16} /></button>
            {#if p.status === 'near'}
              <!-- square it up by changing just one side -->
              <button class="chip sq" title="Square it: short side grows to {fmt(p.w)}" onclick={() => edit(() => resizePiece(app.doc, p, p.w, p.w))}><span class="box"></span>{fmt(p.w)}</button>
              <button class="chip sq" title="Square it: long side shrinks to {fmt(p.h)}" onclick={() => edit(() => resizePiece(app.doc, p, p.h, p.h))}><span class="box sm"></span>{fmt(p.h)}</button>
              <span class="div"></span>
            {/if}
            <!-- tap a template: every copy becomes that size -->
            {#each offer(p) as t}
              <button class="chip" class:on={p.template === t} title="Cut with your {fmt(t)} square → {fmt(finishedFor(p, t, seam))} finished" onclick={() => fix(p, t)}>
                <i style:--s={t / maxT}></i>{fmt(t)}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- your square templates (cut sizes, seam included) -->
  <div class="mine">
    {#each T as t}
      <span class="mt"><i style:--s={t / maxT}></i>{fmt(t)}<button title="Remove" onclick={() => delT(t)}><X size={11} /></button></span>
    {/each}
    <label class="add"><Plus size={13} /><input type="text" inputmode="decimal" placeholder="″" bind:value={newT} onchange={addT} /></label>
  </div>
</div>

<style>
  .trig { position: relative; &.bad { color: oklch(62% 0.16 55); } }
  .badge { position: absolute; top: 2px; right: 0; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 99px; background: oklch(62% 0.16 55); color: white; font-size: 10px; font-weight: 800; display: grid; place-items: center; }
  #sizes { inset: auto; top: calc(60px + env(safe-area-inset-top)); right: 12px; width: 340px; max-height: calc(100dvh - 90px); overflow: auto; padding: 10px; scrollbar-width: thin; }
  @media (width < 760px) { #sizes { left: 8px; right: 8px; width: auto; } }
  .list { display: grid; gap: 4px; }
  .row { border-radius: 12px; transition: background .2s;
    &.odd, &.near { background: oklch(80% 0.12 70 / 18%); } &.open { background: var(--sunk); } }
  .nsq { display: grid; place-items: center; width: 22px; height: 22px; i { width: 16px; height: 13px; border: 2px dashed oklch(60% 0.16 55); border-radius: 2px; } }
  .main { width: 100%; display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 0; background: transparent; text-align: left; }
  .pic { position: relative; width: 34px; max-height: 34px; flex: none; border-radius: 3px; overflow: hidden; box-shadow: 0 0 0 1px oklch(0% 0 0 / 12%); }
  .count { width: 38px; font-size: 15px; }
  .sz { flex: 1; font-size: 15px; font-weight: 800; letter-spacing: -.01em; }
  .st { display: flex; align-items: center; color: var(--muted); .odd &, .near & { color: oklch(60% 0.16 55); } }
  .tpl, .chip, .mt { display: inline-flex; align-items: center; gap: 5px; font-weight: 700; font-size: 12px;
    i { display: inline-block; width: calc(6px + var(--s) * 12px); aspect-ratio: 1; border-radius: 2px; background: currentColor; opacity: .75; } }
  .tpl { color: oklch(55% 0.15 150); }
  .more { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 10px 10px; }
  .find { width: 36px; height: 32px; padding: 0; display: grid; place-items: center; border-radius: 9px; background: var(--accent); color: white; border: 0; }
  .chip { height: 32px; padding: 0 10px; border-radius: 9px; background: var(--panel); border: 1px solid var(--line);
    &.on { border-color: oklch(55% 0.15 150); color: oklch(55% 0.15 150); } }
  .sq .box { width: 14px; height: 14px; border: 2px solid currentColor; border-radius: 2px; &.sm { width: 10px; height: 10px; } }
  .div { width: 1px; height: 22px; background: var(--line); align-self: center; }
  .mine { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
  .mt { padding: 4px 4px 4px 8px; border-radius: 8px; background: var(--sunk);
    button { width: 18px; height: 18px; padding: 0; border: 0; background: none; display: grid; place-items: center; color: var(--muted); } }
  .add { display: inline-flex; align-items: center; gap: 2px; padding: 0 6px; border-radius: 8px; border: 1.5px dashed var(--line); color: var(--muted);
    input { width: 3.5em; field-sizing: fixed; border: 0; background: none; padding: 4px 0; } }
</style>
