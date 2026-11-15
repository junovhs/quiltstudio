<script lang="ts">
  import { slide, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { TriangleAlert, Ruler, Search, Plus, X } from '@lucide/svelte';
  import Tile from './Tile.svelte';
  import { app, edit, ui } from '../lib/store.svelte';
  import { fmt } from '../lib/calc';
  import { pieces, whereIs, resizePiece, finishedFor, type Piece } from '../lib/sizes';

  const list = $derived(pieces(app.doc));
  const seam = $derived(app.doc.settings.seam);
  const F = $derived(app.doc.settings.finishedTemplates ?? []);
  let open = $state<string | null>(null);
  let newT = $state('');

  const spots = (p: Piece) => [...whereIs(app.doc, p)].flatMap(([def, idxs]) => idxs.map(i => ({ def, i })));
  /* show me: light up every copy right here on the quilt */
  function glow(p: Piece) { ui.glow = ui.glow.length ? [] : spots(p); }
  function toggle(p: Piece) {
    open = open === p.key ? null : p.key;
    ui.glow = open ? spots(p) : [];
  }
  const isF = (t: number) => F.includes(t);
  function fix(p: Piece, t: number) {
    const v = finishedFor(p, t, seam, isF(t));
    if (v <= 0) return;
    edit(() => resizePiece(app.doc, p, v));
    ui.glow = [];
  }
  const T = $derived([...app.doc.settings.templates].sort((a, b) => a - b));
  const maxT = $derived(Math.max(...T, 1));
  function addT() { const v = parseFloat(newT.replace(',', '.')); newT = ''; if (v > 0 && !T.includes(v)) edit(() => app.doc.settings.templates.push(v)); }
  const delT = (t: number) => edit(() => (app.doc.settings.templates = app.doc.settings.templates.filter(x => x !== t)));
  // tap a template: switch between "cut size, seam included" and "finished size"
  const flipT = (t: number) => edit(() => {
    const f = app.doc.settings.finishedTemplates ?? [];
    app.doc.settings.finishedTemplates = f.includes(t) ? f.filter(x => x !== t) : [...f, t];
  });
  const SEAMS = [0.25, 0.375, 0.5];
</script>

{#if ui.sizes}
  <aside class="panel" transition:fly={{ x: 40, duration: 300, easing: cubicOut, opacity: 0 }}>
    <header>
      <span class="h"><Ruler size={16} /></span>
      <!-- seam allowance: everything here depends on it -->
      <div class="seam" title="Seam allowance">
        {#each SEAMS as s}<button class:on={Math.abs(seam - s) < 1e-6} onclick={() => edit(() => (app.doc.settings.seam = s))}>{fmt(s)}</button>{/each}
      </div>
      <span class="sp"></span>
      <button class="icon" onclick={() => { ui.sizes = false; ui.glow = []; }}><X size={17} /></button>
    </header>

    <div class="list">
      {#each list as p (p.key)}
        <div class="row {p.status}" class:open={open === p.key}>
          <button class="main" onclick={() => toggle(p)}>
            <span class="pic" style:aspect-ratio="{p.w} / {p.h}"><Tile c={p.c} /></span>
            <span class="count">{p.qty}</span>
            <b class="sz">{fmt(p.w, '')} × {fmt(p.h)}</b>
            <span class="st">
              {#if p.status === 'template'}<span class="tpl" class:fin={isF(p.template!)}><i style:--s={p.template! / maxT}></i>{fmt(p.template!)}</span>
              {:else if p.status === 'ruler'}<Ruler size={15} />
              {:else if p.status === 'near'}<span class="nsq" title="Almost square"><i></i></span>
              {:else}<TriangleAlert size={16} />{/if}
            </span>
          </button>
          {#if open === p.key}
            <div class="more" transition:slide={{ duration: 200 }}>
              <button class="find" class:on={ui.glow.length > 0} title="Show me where" onclick={() => glow(p)}><Search size={16} /></button>
              {#if p.status === 'near'}
                <button class="chip sq" title="Square it: short side grows to {fmt(p.w)}" onclick={() => edit(() => resizePiece(app.doc, p, p.w, p.w))}><span class="box"></span>{fmt(p.w)}</button>
                <button class="chip sq" title="Square it: long side shrinks to {fmt(p.h)}" onclick={() => edit(() => resizePiece(app.doc, p, p.h, p.h))}><span class="box sm"></span>{fmt(p.h)}</button>
                <span class="div"></span>
              {/if}
              {#each T as t}
                {@const v = finishedFor(p, t, seam, isF(t))}
                <button class="chip" class:on={p.template === t} class:fin={isF(t)} disabled={v <= 0}
                  title="Your {fmt(t)} {isF(t) ? 'finished-size' : 'cut-size'} square → {fmt(Math.max(v, 0))} finished" onclick={() => fix(p, t)}>
                  <i style:--s={t / maxT}></i>{fmt(t)}<small>→{fmt(Math.max(v, 0), '')}</small>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- your templates: solid = cut size (seam included), outline = finished size. Tap to switch. -->
    <div class="mine">
      {#each T as t}
        <span class="mt" class:fin={isF(t)}>
          <button class="flip" title={isF(t) ? 'Finished size (no seam). Tap: includes seam' : 'Includes seam. Tap: finished size'} onclick={() => flipT(t)}><i style:--s={t / maxT}></i>{fmt(t)}</button>
          <button class="x" title="Remove" onclick={() => delT(t)}><X size={11} /></button>
        </span>
      {/each}
      <label class="add"><Plus size={13} /><input type="text" inputmode="decimal" placeholder="″" bind:value={newT} onchange={addT} /></label>
    </div>
  </aside>
{/if}

<style>
  .panel { grid-area: sizes; display: flex; flex-direction: column; min-height: 0; background: var(--panel); border-left: 1px solid var(--line); }
  header { display: flex; align-items: center; gap: 8px; padding: 10px 10px 8px 14px; border-bottom: 1px solid var(--line); }
  .h { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: var(--accent); color: white; }
  .seam { display: flex; gap: 2px; background: var(--sunk); padding: 3px; border-radius: 10px;
    button { border: 0; background: transparent; padding: 3px 9px; font-weight: 700; font-size: 12px; border-radius: 7px; }
    button.on { background: var(--panel); color: var(--accent); box-shadow: var(--shadow); } }
  .sp { flex: 1; }
  .list { flex: 1; min-height: 0; overflow: auto; display: grid; gap: 4px; align-content: start; padding: 8px; scrollbar-width: thin; }
  .row { border-radius: 12px; transition: background .2s;
    &.odd, &.near { background: oklch(80% 0.12 70 / 18%); } &.open { background: var(--sunk); } }
  .main { width: 100%; display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 0; background: transparent; text-align: left; }
  .pic { position: relative; width: 34px; max-height: 34px; flex: none; border-radius: 3px; overflow: hidden; box-shadow: 0 0 0 1px oklch(0% 0 0 / 12%); }
  .count { width: 38px; font-size: 15px; }
  .sz { flex: 1; font-size: 15px; font-weight: 800; letter-spacing: -.01em; }
  .st { display: flex; align-items: center; color: var(--muted); .odd &, .near & { color: oklch(60% 0.16 55); } }
  .tpl, .chip, .flip { display: inline-flex; align-items: center; gap: 5px; font-weight: 700; font-size: 12px;
    i { display: inline-block; width: calc(6px + var(--s) * 12px); aspect-ratio: 1; border-radius: 2px; background: currentColor; opacity: .75; } }
  /* finished-size templates draw as an outline */
  .fin i { background: transparent; box-shadow: inset 0 0 0 2px currentColor; }
  .tpl { color: oklch(55% 0.15 150); }
  .more { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 10px 10px; }
  .find { width: 36px; height: 32px; padding: 0; display: grid; place-items: center; border-radius: 9px; background: var(--panel); color: var(--accent); border: 1.5px solid var(--accent);
    &.on { background: var(--accent); color: white; } }
  .chip { height: 32px; padding: 0 9px; border-radius: 9px; background: var(--panel); border: 1px solid var(--line);
    small { font-size: 10.5px; color: var(--muted); font-weight: 600; }
    &.on { border-color: oklch(55% 0.15 150); color: oklch(55% 0.15 150); } }
  .sq .box { width: 14px; height: 14px; border: 2px solid currentColor; border-radius: 2px; &.sm { width: 10px; height: 10px; } }
  .div { width: 1px; height: 22px; background: var(--line); align-self: center; }
  .nsq { display: grid; place-items: center; width: 22px; height: 22px; i { width: 16px; height: 13px; border: 2px dashed oklch(60% 0.16 55); border-radius: 2px; } }
  .mine { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 10px 12px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); }
  .mt { display: inline-flex; align-items: center; border-radius: 8px; background: var(--sunk);
    .flip { border: 0; background: none; padding: 5px 4px 5px 8px; }
    .x { width: 20px; height: 20px; padding: 0; border: 0; background: none; display: grid; place-items: center; color: var(--muted); } }
  .add { display: inline-flex; align-items: center; gap: 2px; padding: 0 6px; border-radius: 8px; border: 1.5px dashed var(--line); color: var(--muted);
    input { width: 3.5em; field-sizing: fixed; border: 0; background: none; padding: 4px 0; } }
  @media (width < 760px) { .panel { border-left: 0; border-top: 1px solid var(--line); max-height: 46dvh; } }
</style>
