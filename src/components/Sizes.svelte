<script lang="ts">
  import { slide, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { Search, Plus, X, SlidersHorizontal, Square } from '@lucide/svelte';
  import Tile from './Tile.svelte';
  import { app, edit, ui, rollback, tryChange } from '../lib/store.svelte';
  import { fmt } from '../lib/calc';
  import { pieces, whereIs, resizePiece, finishedFor, templateSeam, type Piece } from '../lib/sizes';

  /* Everything here speaks in YOUR GUIDES (the number written on the tool: 1, 2, 3, 4…).
     No fractions unless you open the little settings drawer. */
  const list = $derived(pieces(app.doc));
  let open = $state<string | null>(null);
  let setup = $state(false);
  let newT = $state('');

  const T = $derived([...app.doc.settings.templates].sort((a, b) => a - b));
  const maxT = $derived(Math.max(...T, 1));
  const sa = (t: number) => templateSeam(app.doc, t);
  const name = (t: number) => String(+t.toFixed(3));        // "2", "4", "4.5" — the number on the tool

  // the guide closest to this piece (by the finished square each guide makes)
  function nearest(p: Piece) {
    let best = T[0], d = Infinity;
    for (const t of T) { const v = finishedFor(app.doc, t), e = Math.abs(v - p.w) + Math.abs(v - p.h); if (e < d) { d = e; best = t; } }
    return best;
  }

  const spots = (p: Piece) => [...whereIs(app.doc, p)].flatMap(([def, idxs]) => idxs.map(i => ({ def, i })));
  function toggle(p: Piece) { open = open === p.key ? null : p.key; ui.glow = open ? spots(p) : []; }
  function glow(p: Piece) { ui.glow = ui.glow.length ? [] : spots(p); }

  let no = $state('');
  // make every copy what this guide cuts; locks win (refused = shake, nothing changes)
  function use(p: Piece, t: number) {
    const v = finishedFor(app.doc, t);
    if (v <= 0) return;
    const ok = tryChange(() => resizePiece(app.doc, p, v, v));
    if (!ok) { no = p.key; setTimeout(() => (no = ''), 500); }
  }

  function addT() { const v = parseFloat(newT.replace(',', '.')); newT = ''; if (v > 0 && !T.includes(v)) edit(() => { app.doc.settings.templates.push(v); app.doc.settings.templateSeams = { ...app.doc.settings.templateSeams, [v]: 0 }; }); }
  const delT = (t: number) => edit(() => (app.doc.settings.templates = app.doc.settings.templates.filter(x => x !== t)));
  const setSA = (t: number, v: number) => edit(() => (app.doc.settings.templateSeams = { ...(app.doc.settings.templateSeams ?? {}), [t]: v }));
</script>

{#if ui.sizes}
  <aside class="panel" transition:fly={{ x: 40, duration: 300, easing: cubicOut, opacity: 0 }}>
    <div class="list">
      {#each list as p (p.key)}
        {@const ok = p.status === 'template'}
        {@const g = ok ? p.template! : nearest(p)}
        <div class="row" class:ok class:open={open === p.key} class:no={no === p.key}>
          <button class="main" onclick={() => toggle(p)}>
            <span class="pic" style:aspect-ratio="{p.w} / {p.h}"><Tile c={p.c} /></span>
            <span class="count">{p.qty}</span>
            <span class="sp"></span>
            {#if p.status === 'near'}<span class="nsq" title="Not quite square"><i></i></span>{/if}
            <!-- green = fits that guide; orange outline = closest guide -->
            <span class="guide" class:ok title={ok ? 'Fits your ' + name(g) + ' guide' : 'Closest guide: ' + name(g)}>{name(g)}</span>
          </button>
          {#if open === p.key}
            <div class="more" transition:slide={{ duration: 200 }}>
              <button class="find" class:on={ui.glow.length > 0} title="Show me where" onclick={() => glow(p)}><Search size={18} /></button>
              {#each T as t}
                <button class="g" class:cur={ok && p.template === t} title="Use my {name(t)} guide" onclick={() => use(p, t)}>
                  <span class="sq" style:--s={t / maxT}></span><b>{name(t)}</b>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- my guides: tucked away -->
    <div class="foot">
      <button class="keep" class:on={app.doc.settings.keepSquares !== false} title="Keep perfect squares perfect (changes that would spoil one are refused)"
        onclick={() => edit(() => (app.doc.settings.keepSquares = app.doc.settings.keepSquares === false))}>
        <Square size={16} strokeWidth={2.5} /><span>{app.doc.settings.keepSquares !== false ? 'keep squares' : 'squares free'}</span>
      </button>
      <span class="sp"></span>
      <button class="icon" class:on={setup} title="My guides" onclick={() => (setup = !setup)}><SlidersHorizontal size={17} /></button>
      <button class="icon" title="Close" onclick={() => { ui.sizes = false; ui.glow = []; }}><X size={17} /></button>
    </div>
    {#if setup}
      <div class="setup" transition:slide={{ duration: 200 }}>
        {#each T as t}
          <div class="srow">
            <b>{name(t)}</b>
            <!-- does this guide include seam allowance? -->
            <div class="seg">
              {#each [0, 0.25, 0.5] as v}<button class:on={Math.abs(sa(t) - v) < 1e-6} onclick={() => setSA(t, v)}>{v === 0 ? 'no seam' : '+' + fmt(v, '')}</button>{/each}
            </div>
            <button class="x" title="Remove" onclick={() => delT(t)}><X size={13} /></button>
          </div>
        {/each}
        <label class="add"><Plus size={14} /><input type="text" inputmode="decimal" placeholder="new guide" bind:value={newT} onchange={addT} /></label>
      </div>
    {/if}
  </aside>
{/if}

<style>
  .panel { grid-area: sizes; display: flex; flex-direction: column; min-height: 0; background: var(--panel); border-left: 1px solid var(--line); }
  .list { flex: 1; min-height: 0; overflow: auto; display: grid; gap: 6px; align-content: start; padding: 10px; scrollbar-width: thin; }
  .row { border-radius: 14px; background: oklch(80% 0.12 70 / 16%); transition: background .2s;
    &.ok { background: transparent; } &.open { background: var(--sunk); }
    &.no { animation: shake .4s var(--ease); } }
  @keyframes shake { 20%, 60% { translate: -6px; } 40%, 80% { translate: 6px; } }
  .main { width: 100%; display: flex; align-items: center; gap: 12px; padding: 8px 12px; border: 0; background: transparent; }
  .pic { position: relative; width: 40px; max-height: 40px; flex: none; border-radius: 3px; overflow: hidden; box-shadow: 0 0 0 1px oklch(0% 0 0 / 12%); }
  .count { font-size: 18px; font-weight: 800; &::before { content: '×'; opacity: .45; margin-right: 1px; } }
  .sp { flex: 1; }
  /* the guide badge: one big number */
  .guide { min-width: 40px; height: 40px; padding: 0 8px; border-radius: 10px; display: grid; place-items: center; font-size: 20px; font-weight: 800;
    background: transparent; color: oklch(62% 0.16 55); box-shadow: inset 0 0 0 2.5px oklch(62% 0.16 55);
    &.ok { background: oklch(60% 0.15 150); color: white; box-shadow: none; } }
  .more { display: flex; flex-wrap: wrap; gap: 8px; padding: 2px 12px 12px; align-items: flex-end; }
  .find { width: 48px; height: 48px; padding: 0; display: grid; place-items: center; border-radius: 12px; background: var(--panel); color: var(--accent); border: 2px solid var(--accent);
    &.on { background: var(--accent); color: white; } }
  .g { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; min-width: 48px; padding: 6px 6px 4px; border-radius: 12px; border: 0; background: var(--panel);
    b { font-size: 18px; font-weight: 800; line-height: 1; }
    &.cur { background: oklch(60% 0.15 150); color: white; .sq { background: white; } } }
  .sq { display: block; width: calc(10px + var(--s) * 24px); aspect-ratio: 1; border-radius: 3px; background: currentColor; opacity: .7; }
  .nsq { display: grid; place-items: center; width: 26px; height: 26px; i { width: 18px; height: 14px; border: 2.5px dashed oklch(62% 0.16 55); border-radius: 2px; } }
  .keep { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px; border-radius: 10px; border: 2px dashed var(--line); background: none; color: var(--muted); font-weight: 700; font-size: 12px; white-space: nowrap;
    &.on { border: 2px solid oklch(60% 0.15 150); color: oklch(60% 0.15 150); } }
  .foot { display: flex; align-items: center; gap: 4px; padding: 8px 8px calc(8px + env(safe-area-inset-bottom)) 12px; border-top: 1px solid var(--line); }
  .mine { flex: 1; display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; color: var(--muted); }
  .chipg { display: flex; flex-direction: column; align-items: center; gap: 2px; font-weight: 800; font-size: 12px; .sq { width: calc(6px + var(--s) * 14px); } }
  .setup { display: grid; gap: 6px; padding: 4px 12px 12px; }
  .srow { display: flex; align-items: center; gap: 10px; b { width: 2em; font-size: 16px; } }
  .seg { flex: 1; display: flex; gap: 2px; background: var(--sunk); padding: 3px; border-radius: 10px;
    button { flex: 1; border: 0; background: transparent; padding: 4px 0; font-size: 12px; font-weight: 700; border-radius: 7px; }
    button.on { background: var(--panel); color: var(--accent); box-shadow: var(--shadow); } }
  .x { width: 26px; height: 26px; padding: 0; border: 0; background: none; display: grid; place-items: center; color: var(--muted); }
  .add { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 10px; border: 1.5px dashed var(--line); color: var(--muted);
    input { flex: 1; border: 0; background: none; } }
  @media (width < 760px) { .panel { border-left: 0; border-top: 1px solid var(--line); max-height: 46dvh; } }
</style>
