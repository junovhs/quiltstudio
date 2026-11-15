<script lang="ts">
  import { fly, scale } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { X, Shuffle, Undo2, Check, Sparkles } from '@lucide/svelte';
  import { app, newProject, setImage, ui } from '../lib/store.svelte';
  import { buildIdea, freshIdea, vary, nameOf, type Idea } from '../lib/generate';
  import { thumbnail } from '../lib/render';
  import type { Doc } from '../lib/model';
  import { fmt } from '../lib/calc';

  interface Card { idea: Idea; doc: Doc; img: string; w: number; h: number; key: string }
  /* each step is nine cards; tapping one makes the next step from it */
  // plain (not deep-reactive) data: whole designs, replaced a step at a time
  let steps = $state.raw<{ cards: Card[]; from: number | null }[]>([]);
  let busy = $state(false);
  const now = $derived(steps.at(-1));

  const source = () => $state.snapshot(app.doc) as Doc;
  async function card(idea: Idea): Promise<Card> {
    const doc = buildIdea(idea, source());
    const r = doc.blocks[doc.root];
    const w = r.cols.reduce((a, b) => a + b, 0), h = r.rows.reduce((a, b) => a + b, 0);
    return { idea, doc, w, h, img: await thumbnail(doc, app.images, 420), key: Math.random().toString(36).slice(2) };
  }
  async function show(ideas: Idea[], from: number | null) {
    busy = true;
    try { const cards = await Promise.all(ideas.map(card)); steps = [...steps, { cards, from }]; }
    finally { busy = false; }
  }
  const fresh = () => show(Array.from({ length: 9 }, () => freshIdea(source())), null);
  /** "more like this": the pick itself first, then eight variations */
  function more(i: number) {
    if (busy || !now) return;
    const parent = now.cards[i].idea, doc = source();
    // eight variations that each look different from the pick and from each other
    const look = (x: Idea) => { const d = buildIdea(x, doc); return JSON.stringify([d.blocks.quilt, d.blocks.idea]); };
    const seen = new Set([look(parent)]), kids: Idea[] = [];
    for (let tries = 0; kids.length < 8 && tries < 60; tries++) {
      const k = vary(parent, doc), l = look(k);
      if (!seen.has(l)) { seen.add(l); kids.push(k); }
    }
    show([parent, ...kids], i);
  }
  function back() { if (steps.length > 1) steps = steps.slice(0, -1); }

  async function use(c: Card) {
    const images = { ...app.images };
    newProject(structuredClone(c.doc), nameOf(c.idea));
    // the fabric photos come along with the new quilt
    for (const [id, url] of Object.entries(images)) setImage(id, await (await fetch(url)).blob());
    ui.ideas = false;
  }
  const close = () => (ui.ideas = false);
  const layoutName = { grid: 'side by side', alternate: 'with plain squares', sashing: 'with sashing' };

  $effect(() => { if (ui.ideas && !steps.length) void fresh(); });
</script>

<svelte:window onkeydown={e => { if (!ui.ideas) return; if (e.key === 'Escape') close(); if (e.key === 'Backspace' && !(e.target as HTMLElement).closest('input')) back(); }} />

{#if ui.ideas}
  <div class="ideas" transition:fly={{ y: 24, duration: 380, easing: cubicOut }} role="dialog" aria-modal="true" aria-label="Quilt ideas">
    <header class="bar">
      <span class="ic"><Sparkles size={20} /></span>
      <h1>Ideas</h1>
      <p class="tip">{steps.length > 1 ? `Step ${steps.length}: more like your pick. Keep picking until one feels right.` : 'Tap the one you like most, even a little. You’ll get nine more like it.'}</p>
      <button class="ghost tb" onclick={back} disabled={steps.length < 2 || busy} title="Back a step"><Undo2 size={17} /> Back</button>
      <button class="ghost tb" onclick={() => { steps = []; void fresh(); }} disabled={busy} title="Nine brand-new ideas"><Shuffle size={17} /> Start over</button>
      <button class="icon" onclick={close} title="Close"><X size={20} /></button>
    </header>

    <div class="body">
      {#if now}
        {#key steps.length}
          <div class="grid" class:busy>
            {#each now.cards as c, i (c.key)}
              <div class="card" class:pick={now.from != null && i === 0} in:scale={{ start: 0.85, duration: 380, delay: i * 35, easing: backOut }}>
                <button class="art" onclick={() => more(i)} title="More like this">
                  <img src={c.img} alt={nameOf(c.idea)} style:aspect-ratio="{c.w} / {c.h}" />
                  {#if now.from != null && i === 0}<span class="badge">Your pick</span>{/if}
                </button>
                <div class="meta">
                  <div class="txt">
                    <b>{nameOf(c.idea)}</b>
                    <span>{fmt(c.w, '')} × {fmt(c.h)} · {c.idea.across * c.idea.down} blocks {layoutName[c.idea.layout]}{c.idea.borders.length ? ` · ${c.idea.borders.length} border${c.idea.borders.length > 1 ? 's' : ''}` : ''}</span>
                  </div>
                  <button class="use" onclick={() => use(c)} title="Open this as a new quilt"><Check size={15} /> Use</button>
                </div>
              </div>
            {/each}
          </div>
        {/key}
      {:else}
        <p class="wait">Dreaming up quilts…</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .ideas { position: fixed; inset: 0; z-index: 42; display: flex; flex-direction: column; background: var(--bg); }
  .bar { display: flex; align-items: center; gap: 10px; height: calc(60px + env(safe-area-inset-top)); padding: env(safe-area-inset-top) max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left));
    background: var(--panel); border-bottom: 1px solid var(--line); flex: none; }
  .ic { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); }
  h1 { font-size: 19px; font-weight: 800; letter-spacing: -.02em; }
  .tip { flex: 1; min-width: 0; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tb { display: flex; align-items: center; gap: 6px; font-weight: 700; }
  .body { flex: 1; min-height: 0; overflow: auto; padding: 20px max(16px, env(safe-area-inset-right)) calc(28px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; max-width: 1100px; margin: 0 auto; transition: opacity .2s;
    &.busy { opacity: .5; pointer-events: none; } }
  .card { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .art { position: relative; aspect-ratio: 1; padding: 14px; border: 0; border-radius: 16px; background: var(--panel); box-shadow: var(--shadow); display: grid; place-items: center; container-type: size;
    transition: scale .35s var(--spring), box-shadow .2s;
    &:hover { scale: 1.025; box-shadow: 0 0 0 2px var(--accent), 0 14px 34px oklch(30% 0.04 50 / 14%); }
    img { max-width: 100cqw; max-height: 100cqh; box-shadow: 0 1px 4px oklch(30% 0.04 50 / 28%); } }
  .pick .art { box-shadow: 0 0 0 3px var(--accent), var(--shadow); }
  .badge { position: absolute; top: 8px; left: 8px; padding: 2px 9px; border-radius: 99px; background: var(--accent); color: white; font-size: 11px; font-weight: 800; }
  .meta { display: flex; align-items: center; gap: 8px; padding: 0 4px; }
  .txt { flex: 1; min-width: 0; display: grid; b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } span { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
  .use { flex: none; display: flex; align-items: center; gap: 4px; padding: 6px 12px; border: 0; border-radius: 99px; background: var(--accent); color: white; font-weight: 700; }
  .wait { text-align: center; color: var(--muted); padding: 60px 0; }
  @media (width < 760px) {
    .tip { display: none; }
    .tb { padding: 6px 8px; }
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .art { padding: 8px; }
  }
</style>
