<script lang="ts">
  import { fly, scale } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { X, Undo2, Check, Dices, Wand2, Ban } from '@lucide/svelte';
  import { app, newProject, setImage, ui } from '../lib/store.svelte';
  import { bestNine, buildIdea, freshIdea, vary, nameOf, score, DEFAULT_STEER, type Idea, type Steer } from '../lib/generate';
  import { thumbnail } from '../lib/render';
  import type { Doc } from '../lib/model';
  import { fmt } from '../lib/calc';
  import { PALETTES, withPalette } from '../lib/palettes';

  /* ---------- steering, remembered on this device ---------- */
  const KEY = 'quiltstudio.steer';
  let steer = $state<Steer>((() => { try { return { ...DEFAULT_STEER, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULT_STEER }; } })());
  $effect(() => { try { localStorage.setItem(KEY, JSON.stringify(steer)); } catch {} });
  const S = () => $state.snapshot(steer) as Steer;
  const GROUPS = [
    ['look', 'Blocks', [['classic', 'Classic'], ['mixed', 'Mixed'], ['new', 'Invented']]],
    ['layout', 'Layout', [['any', 'Any'], ['grid', 'Blocks'], ['alternate', 'Alternating'], ['sashing', 'Sashing'], ['two', 'Two-block'], ['medallion', 'Medallion']]],
    ['feel', 'Feel', [['calm', 'Calm'], ['balanced', 'Balanced'], ['bold', 'Bold']]],
    ['size', 'Size', [['baby', 'Baby'], ['throw', 'Throw'], ['bed', 'Bed']]],
  ] as const;
  function set(k: (typeof GROUPS)[number][0], v: string) { (steer as unknown as Record<string, unknown>)[k] = v; void fresh(); }
  function toggleFabric(id: string) {
    steer.skip = steer.skip.includes(id) ? steer.skip.filter(f => f !== id) : [...steer.skip, id];
    void fresh();
  }
  function setPalette(id: string | null) { steer.palette = id; steer.skip = []; void fresh(); }
  // the fabrics in play: the quilt's own, or the chosen colour preset's
  const colours = $derived(withPalette(app.doc, steer.palette));
  const fabrics = $derived(colours.fabrics.filter(f => f.id !== colours.settings.binding));
  const mine = $derived(app.doc.fabrics.filter(f => f.id !== app.doc.settings.binding));

  /* ---------- the nine ---------- */
  interface Card { idea: Idea; doc: Doc; img: string; w: number; h: number; key: string }
  let steps = $state.raw<{ cards: Card[]; from: number | null }[]>([]);
  let busy = $state(false);
  const now = $derived(steps.at(-1));
  const source = () => withPalette($state.snapshot(app.doc) as Doc, steer.palette);
  const sizeOf = (d: Doc) => { const r = d.blocks[d.root]; return { w: r.cols.reduce((a, b) => a + b, 0), h: r.rows.reduce((a, b) => a + b, 0) }; };
  async function card(idea: Idea, doc: Doc): Promise<Card> {
    return { idea, doc, ...sizeOf(doc), img: await thumbnail(doc, app.images, 420), key: Math.random().toString(36).slice(2) };
  }
  const tick = () => new Promise(r => setTimeout(r, 30));   // let the page show it's working
  async function show(list: { i: Idea; d: Doc }[], from: number | null, replace = false) {
    const cards = await Promise.all(list.map(x => card(x.i, x.d)));
    steps = replace ? [{ cards, from }] : [...steps, { cards, from }];
  }
  async function fresh() {
    if (busy) return;
    busy = true;
    try {
      await tick();
      const doc = source(), s = S();
      await show(bestNine(doc, s, () => freshIdea(doc, s)), null, true);
    } finally { busy = false; }
  }
  /** your pick first, then the eight best-looking variations that differ from it and each other */
  async function more(i: number) {
    if (busy || !now) return;
    busy = true;
    try {
      await tick();
      const doc = source(), s = S(), parent = now.cards[i];
      const look = (d: Doc) => JSON.stringify(Object.values(d.blocks).map(b => [b.cols, b.rows, b.cells]));
      const seen = new Set([look(parent.doc)]), kids: { i: Idea; d: Doc; sc: number }[] = [];
      for (let tries = 0; kids.length < 24 && tries < 80; tries++) {
        const k = vary(parent.idea, doc, s), d = buildIdea(k, doc), l = look(d), sc = score(d, s.feel);
        if (sc > -Infinity && !seen.has(l)) { seen.add(l); kids.push({ i: k, d, sc: sc + Math.random() * 0.12 }); }
      }
      kids.sort((a, b) => b.sc - a.sc);
      await show([{ i: parent.idea, d: parent.doc }, ...kids.slice(0, 8)], i);
    } finally { busy = false; }
  }
  function back() { if (steps.length > 1) steps = steps.slice(0, -1); }

  async function use(c: { idea: Idea; doc: Doc }) {
    // fabric photos only come along when the quilt uses your own fabrics
    const images = steer.palette ? {} : { ...app.images };
    newProject(structuredClone(c.doc), nameOf(c.idea));
    for (const [id, url] of Object.entries(images)) setImage(id, await (await fetch(url)).blob());
    ui.ideas = false;
  }
  /** one tap: the single best of a fresh batch, straight into a new quilt */
  async function surprise() {
    if (busy) return;
    busy = true;
    try {
      await tick();
      const doc = source(), s = S();
      const [best] = bestNine(doc, s, () => freshIdea(doc, s), 1, 24);
      if (best) await use({ idea: best.i, doc: best.d });
    } finally { busy = false; }
  }
  const close = () => (ui.ideas = false);
  const LAYOUT: Record<Idea['layout'], string> = { grid: 'blocks', alternate: 'alternating', sashing: 'sashing', two: 'two-block', medallion: 'medallion' };
  const BORDER: Record<string, string> = { sawtooth: 'sawtooth', geese: 'geese', hourglass: 'hourglass', checker: 'checkerboard', piano: 'piano keys', blocks: 'block' };
  const pieced = (i: Idea) => [...new Set(i.borders.filter(b => b.kind !== 'plain').map(b => BORDER[b.kind]))].join(', ');

  $effect(() => { if (ui.ideas && !steps.length) void fresh(); });
</script>

<svelte:window onkeydown={e => { if (ui.ideas && e.key === 'Escape') close(); }} />

{#if ui.ideas}
  <div class="ideas" transition:fly={{ y: 24, duration: 380, easing: cubicOut }} role="dialog" aria-modal="true" aria-label="Random quilt">
    <header class="bar">
      <span class="ic"><Dices size={20} /></span>
      <h1>Random quilt</h1>
      <p class="tip">{steps.length > 1 ? `Step ${steps.length}: more like your pick.` : 'Tap the one you like most for nine more like it.'}</p>
      <button class="ghost tb" onclick={back} disabled={steps.length < 2 || busy}><Undo2 size={17} /><span>Back</span></button>
      <button class="ghost tb" onclick={surprise} disabled={busy} title="Make one quilt and open it"><Wand2 size={17} /><span>Surprise me</span></button>
      <button class="gen" onclick={fresh} disabled={busy}><Dices size={17} /> Generate</button>
      <button class="icon" onclick={close} title="Close"><X size={20} /></button>
    </header>

    <div class="steer">
      {#each GROUPS as [k, label, opts]}
        <div class="grp">
          <span class="lbl">{label}</span>
          <div class="seg">
            {#each opts as [v, name]}
              <button class:on={steer[k] === v} onclick={() => set(k, v)} disabled={busy}>{name}</button>
            {/each}
          </div>
        </div>
      {/each}
      <div class="grp">
        <span class="lbl">Fabrics</span>
        <div class="fabs">
          {#each fabrics as f (f.id)}
            <button class="sw f-{f.id}" style:background-color={f.color} class:off={steer.skip.includes(f.id)} title="{steer.skip.includes(f.id) ? 'Use' : 'Leave out'} {f.name}" onclick={() => toggleFabric(f.id)} disabled={busy}>
              {#if steer.skip.includes(f.id)}<Ban size={14} />{/if}
            </button>
          {/each}
        </div>
      </div>
      <div class="grp pals">
        <span class="lbl">Colours</span>
        <div class="palrow">
          <button class="pal" class:on={!steer.palette} onclick={() => setPalette(null)} disabled={busy} title="Your quilt's fabrics">
            <span class="strip">{#each mine as f (f.id)}<i class="f-{f.id}" style:background-color={f.color}></i>{/each}</span><span class="pn">My fabrics</span>
          </button>
          {#each PALETTES as p (p.id)}
            <button class="pal" class:on={steer.palette === p.id} onclick={() => setPalette(p.id)} disabled={busy} title={p.colors.map(c => c[0]).join(', ')}>
              <span class="strip">{#each p.colors as [, c]}<i style:background-color={c}></i>{/each}</span><span class="pn">{p.name}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>

    <div class="body">
      {#if now}
        {#key now}
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
                    <span>{fmt(c.w, '')} × {fmt(c.h)} · {LAYOUT[c.idea.layout]}{pieced(c.idea) ? ` · ${pieced(c.idea)} border` : ''}</span>
                  </div>
                  <button class="use" onclick={() => use(c)} title="Open this as a new quilt"><Check size={15} /> Use</button>
                </div>
              </div>
            {/each}
          </div>
        {/key}
      {:else}
        <p class="wait">Piecing some ideas together…</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .ideas { position: fixed; inset: 0; z-index: 42; display: flex; flex-direction: column; background: var(--bg); }
  .bar { display: flex; align-items: center; gap: 8px; height: calc(60px + env(safe-area-inset-top)); padding: env(safe-area-inset-top) max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left));
    background: var(--panel); flex: none; }
  .ic { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); }
  h1 { font-size: 19px; font-weight: 800; letter-spacing: -.02em; white-space: nowrap; }
  .tip { flex: 1; min-width: 0; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tb { display: flex; align-items: center; gap: 6px; font-weight: 700; }
  .gen { display: flex; align-items: center; gap: 7px; padding: 8px 16px; border: 0; border-radius: 99px; background: var(--accent); color: white; font-weight: 800;
    box-shadow: 0 4px 14px oklch(from var(--accent) l c h / 35%); }
  .steer { display: flex; flex-wrap: wrap; gap: 10px 22px; padding: 10px max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left)); background: var(--panel); border-bottom: 1px solid var(--line); flex: none; }
  .grp { display: flex; align-items: center; gap: 8px; }
  .lbl { font-size: 11.5px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 11px; background: var(--sunk);
    button { border: 0; background: transparent; padding: 4px 10px; border-radius: 8px; font-weight: 650; font-size: 12.5px; color: var(--muted); white-space: nowrap; }
    button.on { background: var(--panel); color: var(--ink); box-shadow: var(--shadow); } }
  .fabs { display: flex; gap: 6px; }
  .sw { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px; display: grid; place-items: center; color: white; box-shadow: inset 0 0 0 1px oklch(0% 0 0 / 15%), 0 0 0 2px var(--panel), 0 0 0 3.5px var(--accent);
    &.off { box-shadow: inset 0 0 0 1px oklch(0% 0 0 / 15%); opacity: .35; } }
  .pals { flex-basis: 100%; min-width: 0; }
  .palrow { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 3px; margin: -3px; }
  .pal { flex: none; display: flex; align-items: center; gap: 7px; padding: 4px 10px 4px 4px; border: 0; border-radius: 10px; background: var(--sunk); font-weight: 650; font-size: 12.5px; color: var(--muted);
    &.on { background: var(--panel); color: var(--ink); box-shadow: 0 0 0 2px var(--accent), var(--shadow); } }
  .strip { display: flex; width: 50px; height: 22px; border-radius: 6px; overflow: hidden; box-shadow: inset 0 0 0 1px oklch(0% 0 0 / 12%);
    i { flex: 1; } }
  .pn { white-space: nowrap; }
  .body { flex: 1; min-height: 0; overflow: auto; padding: 20px max(16px, env(safe-area-inset-right)) calc(28px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; max-width: 1100px; margin: 0 auto; transition: opacity .2s;
    &.busy { opacity: .45; pointer-events: none; } }
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
  @media (width < 900px) { .tip { display: none; } }
  @media (width < 760px) {
    .tb span { display: none; } .tb { padding: 6px 8px; }
    h1 { font-size: 17px; }
    .steer { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; gap: 16px; }
    .grp { flex: none; }
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .art { padding: 8px; }
  }
</style>
