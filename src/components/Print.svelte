<script lang="ts">
  import { fly, fade, scale } from 'svelte/transition';
  import { backOut, cubicOut } from 'svelte/easing';
  import { tick } from 'svelte';
  import { Printer, X, Palette, PenLine, Ruler, House, Check, Grid3x3 } from '@lucide/svelte';
  import Thumb from './Thumb.svelte';
  import { app, stats, ui, useCount } from '../lib/store.svelte';
  import { fmt } from '../lib/calc';
  import { blockDiagram, piecesOf, pieceSvg, realSize } from '../lib/print';
  import { swipeClose, isPhone } from '../lib/sheet';
  import { planWarnings } from '../lib/making-guide';
  const checks = $derived(planWarnings(app.doc));

  let ink = $state(false);
  let actual = $state(true);
  let grid = $state(true);
  // cut-line colour + thickness: dark, greys, or a colour that shows on your fabrics
  const LINES = ['#1d1612', '#6b625c', '#b9b2ac', '#d9603b', '#2b6fd6'];
  let line = $state(LINES[0]);
  let weight = $state(1);
  let printing = $state(false);

  // everything printable: the quilt, then every block in the order you'd make them
  const all = $derived([app.doc.root, ...stats().order]);
  const count = (id: string) => (id === app.doc.root ? 1 : useCount(id));
  const chosen = $derived(ui.print ?? []);
  const toggle = (id: string) => (ui.print = chosen.includes(id) ? chosen.filter(x => x !== id) : all.filter(x => x === id || chosen.includes(x)));
  const allOn = $derived(all.every(id => chosen.includes(id)));
  const close = () => (ui.print = null);

  const pages = $derived(chosen.map(id => ({
    id, n: count(id), size: realSize(app.doc, id),
    d: blockDiagram($state.snapshot(app.doc), id, { ink, actual, grid, line, weight }),
    pieces: id === app.doc.root ? [] : piecesOf(app.doc, id),
  })));

  async function go() {
    printing = true;
    await tick();
    window.print();
    printing = false;
  }
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && ui.print && close()} />

{#if ui.print}
  <div class="scrim" transition:fade={{ duration: 200 }} onclick={close} role="presentation"></div>
  <aside class="sheet" transition:fly={isPhone() ? { y: 900, duration: 480, easing: cubicOut, opacity: 1 } : { x: 520, duration: 450, easing: cubicOut }}
    use:swipeClose={{ close, axis: isPhone() ? 'y' : 'x-right' }}>
    <span class="grabber" data-grab></span>
    <header data-grab>
      <span class="badge"><Printer size={18} /></span>
      <div class="seg" title="Colours">
        <button class:on={!ink} title="Full colour" onclick={() => (ink = false)}><Palette size={17} /></button>
        <button class:on={ink} title="Ink saver: pale colours, bold lines" onclick={() => (ink = true)}><PenLine size={17} /></button>
      </div>
      <button class="chip" class:on={actual} title="Print at real size when it fits on the page" onclick={() => (actual = !actual)}><Ruler size={16} /> 1:1</button>
      <button class="chip" class:on={grid} title="Inch grid" onclick={() => (grid = !grid)}><Grid3x3 size={16} /></button>
      <span class="sp"></span>
      <button class="icon" onclick={close}><X size={18} /></button>
    </header>

    <!-- cut lines: colour and thickness -->
    <div class="lines">
      {#each LINES as l}
        <button class="ln" class:on={line === l} style:--l={l} title="Cut line colour" onclick={() => (line = l)}><i></i></button>
      {/each}
      <span class="sp"></span>
      {#each [0.5, 1, 1.8] as w}
        <button class="wt" class:on={weight === w} title="Line thickness" onclick={() => (weight = w)}><i style:height="{w * 2.5}px"></i></button>
      {/each}
    </div>

    <!-- pick what to print -->
    <div class="pick">
      <button class="card all" class:on={allOn} title="All" onclick={() => (ui.print = allOn ? [] : [...all])}><Check size={20} /></button>
      {#each all as id (id)}
        <button class="card" class:on={chosen.includes(id)} onclick={() => toggle(id)}>
          <span class="art">{#if id === app.doc.root}<House size={22} />{:else}<Thumb {id} />{/if}</span>
          <span class="n count">{count(id)}</span>
          {#if chosen.includes(id)}<span class="tick" in:scale={{ start: 0, duration: 400, easing: backOut }}><Check size={12} strokeWidth={3.5} /></span>{/if}
        </button>
      {/each}
    </div>

    <!-- the pages, as they'll come out of the printer -->
    <div class="previews">
      <p class="print-notes">Design diagrams · seam allowance {fmt(app.doc.settings.seam)}. These include already-made pieces. Use Export making plan in Make & adapt for remaining cuts and progress.</p>
      {#if checks.length}<details><summary>{checks.length} construction checks</summary>{#each checks as note}<p>{note}</p>{/each}</details>{/if}
      {#each pages as p (p.id)}
        <div class="paper" in:scale={{ start: 0.8, duration: 400, easing: backOut }}>
          <div class="ph"><span class="count big">{p.n}</span><span class="sz">{fmt(p.size.w, '')} × {fmt(p.size.h)}</span>{#if p.d.actual}<span class="one">1:1</span>{/if}</div>
          <div class="pd">{@html p.d.svg}</div>
          {#if p.pieces.length}
            <div class="pp">{#each p.pieces as pc}<span>{@html pieceSvg(app.doc, pc.c, pc.w, pc.h, ink, 0.12, { line, weight })}<b class="count">{pc.n}</b></span>{/each}</div>
          {/if}
        </div>
      {/each}
    </div>

    <button class="go" disabled={!pages.length} onclick={go}><Printer size={20} /> <span class="count">{pages.length}</span></button>
  </aside>
{/if}

<!-- what actually prints: one block per page -->
{#if printing}
  <div id="print-root">
    <section class="page"><h1>{app.doc.name} · design diagrams</h1><p>Seam allowance {fmt(app.doc.settings.seam)}. Diagrams show finished design geometry, not seam-inclusive cutting templates. Recorded made pieces are included; do not recut them from these diagrams.</p>{#each checks as note}<p>{note}</p>{/each}<p>Camera measurements are reviewed estimates. Check a test unit before repeating a batch. The making-plan export contains current remaining cuts and physical checkpoints.</p></section>
    {#each pages as p (p.id)}
      <section class="page">
        <div class="ph"><span class="count big">{p.n}</span><span class="sz">{fmt(p.size.w, '')} × {fmt(p.size.h)}</span>{#if p.d.actual}<span class="one">1:1 · 1 square = 1″</span>{/if}</div>
        <div class="pd">{@html p.d.svg}</div>
        {#if p.pieces.length}
          <div class="pp">
            {#each p.pieces as pc}
              <span>{@html pieceSvg(app.doc, pc.c, pc.w, pc.h, ink, 0.18, { line, weight })}<b class="count">{pc.n}</b><small>{fmt(pc.w, '')} × {fmt(pc.h)}</small></span>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 40; background: oklch(30% 0.03 50 / 25%); backdrop-filter: blur(2px); }
  .sheet { position: fixed; z-index: 41; top: 0; right: 0; bottom: 0; width: min(560px, 100vw); background: var(--panel); display: flex; flex-direction: column;
    box-shadow: -20px 0 60px oklch(30% 0.04 50 / 20%); border-radius: 20px 0 0 20px; }
  header { display: flex; align-items: center; gap: 10px; padding: 14px 14px 10px 18px; }
  .badge { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: var(--accent); color: white; }
  .seg { display: flex; gap: 2px; background: var(--sunk); padding: 3px; border-radius: 11px;
    button { border: 0; background: transparent; width: 40px; height: 32px; display: grid; place-items: center; padding: 0; }
    button.on { background: var(--panel); color: var(--accent); box-shadow: var(--shadow); } }
  .chip { display: flex; align-items: center; gap: 6px; height: 38px; border-radius: 11px; border: 0; background: var(--sunk); font-weight: 700;
    &.on { background: var(--accent-soft); color: var(--accent); } }
  .sp { flex: 1; }
  .lines { display: flex; align-items: center; gap: 6px; padding: 0 18px 8px; flex: none; }
  .ln, .wt { width: 34px; height: 30px; padding: 0; border: 0; border-radius: 9px; background: var(--sunk); display: grid; place-items: center;
    &.on { box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--accent); } }
  .ln i { width: 20px; height: 4px; border-radius: 2px; background: var(--l); }
  .wt i { width: 20px; border-radius: 2px; background: var(--ink); }
  .pick { display: flex; gap: 10px; overflow-x: auto; padding: 8px 18px 14px; scrollbar-width: none; flex: none; }
  .card { position: relative; flex: none; width: 72px; height: 72px; padding: 8px; border: 0; border-radius: 14px; background: var(--sunk); opacity: .55;
    transition: opacity .2s, box-shadow .25s, scale .35s var(--spring);
    &.on { opacity: 1; box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--accent); }
    &.all { display: grid; place-items: center; color: var(--muted); &.on { color: var(--accent); } } }
  .art { display: grid; place-items: center; width: 100%; height: 100%; color: var(--muted); }
  .card .n { position: absolute; right: -4px; bottom: -6px; padding: 0 6px; border-radius: 99px; background: var(--ink); color: var(--panel); font-size: 12px; }
  .tick { position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: var(--accent); color: white; }
  .previews { flex: 1; min-height: 0; overflow: auto; padding: 14px 18px 100px; display: flex; flex-wrap: wrap; gap: 16px; align-content: flex-start; background: var(--sunk); scrollbar-width: thin; }
  .paper { width: calc(50% - 8px); flex: none; aspect-ratio: 8.5 / 11; background: white; color: #3b2a20; border-radius: 3px; box-shadow: 0 2px 10px oklch(30% 0.04 50 / 18%); padding: 6%; display: flex; flex-direction: column; gap: 4%; overflow: hidden;
    .ph { display: flex; align-items: baseline; gap: 8px; } .big { font-size: 22px; } .sz { font-weight: 700; font-size: 12px; } .one { margin-left: auto; font-size: 10px; font-weight: 700; color: #9a8676; }
    .pd { flex: 1; min-height: 0; position: relative; :global(svg) { position: absolute; inset: 0; width: 100%; height: 100%; } }
    .pp :global(svg) { max-width: 28px; max-height: 28px; width: auto; height: auto; }
    .pp { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: flex-end; span { display: flex; align-items: flex-end; gap: 2px; } b { font-size: 10px; } } }
  .go { position: absolute; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom)); translate: -50%; display: flex; align-items: center; gap: 10px; padding: 14px 26px; border: 0; border-radius: 99px;
    background: var(--accent); color: white; font-size: 17px; box-shadow: 0 8px 24px oklch(from var(--accent) l c h / 40%); &:hover { scale: 1.04; } }
  .grabber { display: none; }
  @media (width < 760px) {
    .sheet { top: calc(env(safe-area-inset-top) + 28px); width: 100vw; border-radius: 22px 22px 0 0; box-shadow: 0 -16px 50px oklch(30% 0.04 50 / 22%); }
    .grabber { display: block; align-self: center; width: 40px; height: 5px; margin-top: 8px; border-radius: 99px; background: var(--line); }
    header { touch-action: none; padding: 6px 12px 8px 16px; }
    .previews { gap: 12px; padding-inline: 14px; } .paper { width: calc(50% - 6px); }
  }

  /* ---------- paper ---------- */
  #print-root { display: none; }
  @media print {
    @page { margin: 0.4in; }
    :global(html), :global(body) { height: auto !important; overflow: visible !important; background: white !important; }
    :global(#app > :not(#print-root)), :global(body > :not(#app)) { display: none !important; }
    #print-root { display: block; color: #3b2a20; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .page { break-after: page; display: flex; flex-direction: column; align-items: center; gap: 0.18in; font-family: system-ui, sans-serif; }
    .page:last-child { break-after: auto; }
    .page .ph { align-self: stretch; display: flex; align-items: baseline; gap: 0.2in; border-bottom: 2px solid #3b2a20; padding-bottom: 0.08in; }
    .page .big { font-size: 40pt; }
    .page .sz { font-size: 18pt; font-weight: 800; }
    .page .one { margin-left: auto; font-size: 10pt; font-weight: 700; color: #7a6a5e; }
    .page .pp { align-self: stretch; display: flex; flex-wrap: wrap; gap: 0.15in 0.3in; align-items: flex-end; border-top: 1px solid #d8cdbf; padding-top: 0.12in; }
    .page .pp span { display: flex; align-items: flex-end; gap: 0.06in; }
    .page .pp b { font-size: 14pt; }
    .page .pp small { font-size: 9pt; color: #7a6a5e; font-weight: 600; }
  }
</style>
