<script lang="ts">
  import { onMount } from 'svelte';
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { Undo2, Redo2, Scissors, Settings, House, ChevronRight, Grid3x3, Ban, FolderOpen } from '@lucide/svelte';
  import Canvas from './components/Canvas.svelte';
  import Palette from './components/Palette.svelte';
  import Swatches from './components/Swatches.svelte';
  import ContextBar from './components/ContextBar.svelte';
  import MeasurePop from './components/MeasurePop.svelte';
  import MakeSheet from './components/MakeSheet.svelte';
  import Projects from './components/Projects.svelte';
  import Picker from './components/Picker.svelte';
  import Thumb from './components/Thumb.svelte';
  import { app, edit, undo, redo, goTo, scope, enter, loadImages, ui, stats } from './lib/store.svelte';
  import { fmt } from './lib/calc';
  import { groupToBlock, merge, snap, xform, type Xf } from './lib/model';

  /* fabric fills: flat colour, or the user's photo tiled at real scale */
  const fabricCss = $derived(app.doc.fabrics.map(f => {
    const img = app.images[f.id];
    return `.f-${f.id}{background-color:${f.color};${img ? `background-image:url(${img});background-size:calc(${f.tile} * var(--ppi)) auto;` : ''}}`;
  }).join('\n'));

  onMount(() => { loadImages(); });

  function xfSel(t: Xf) {
    const b = scope();
    if (app.tool === 'paint' || !app.sel.length) { app.brush = xform(snap(app.brush), t); return; }
    edit(() => app.sel.forEach(i => { b.cells[i].c = xform(snap(b.cells[i].c), t); }));
  }

  function key(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod || ui.make || ui.projects) return;
    const b = scope();
    switch (k) {
      case 'v': app.tool = 'select'; break;
      case 'b': app.tool = 'paint'; break;
      case 'k': app.tool = 'recolor'; break;
      case 'm': app.tool = 'measure'; break;
      case 'r': xfSel('r'); break;
      case 'f': xfSel(e.shiftKey ? 'v' : 'h'); break;
      case 'j': if (app.sel.length > 1) edit(() => { const j = merge(b, app.sel); if (j != null) app.sel = [j]; }); break;
      case 'g': if (app.sel.length) edit(() => { if (groupToBlock(app.doc, b, app.sel, 'Block')) app.sel = [b.cells.length - 1]; }); break;
      case 'enter': { const c = b.cells[app.sel[0]]?.c; if (c?.k === 'inst') enter(c.ref); break; }
      case 'delete': case 'backspace': if (app.sel.length) edit(() => app.sel.forEach(i => (b.cells[i].c = { k: 'empty' }))); break;
      case 'escape': if (ui.measure) ui.measure = null; else if (app.sel.length) app.sel = []; else if (app.path.length) goTo(app.path.length - 1); break;
      case 'a': app.sel = b.cells.map((_, i) => i); e.preventDefault(); break;
    }
  }

</script>

<svelte:window onkeydown={key} />
<svelte:head>{@html `<style>${fabricCss}</style>`}</svelte:head>

<div class="app">
  <header class="top">
    <button class="proj" title="My quilts" onclick={() => (ui.projects = true)}>
      <img class="logo" src="/favicon.svg" alt="" /><FolderOpen size={17} />
    </button>
    <nav class="crumbs">
      <button class="crumb" class:here={!app.path.length} title="Quilt" onclick={() => goTo(0)}><House size={18} /></button>
      {#each app.path as id, i (id + i)}
        <ChevronRight size={16} class="chev" />
        <button class="crumb" class:here={i === app.path.length - 1} onclick={() => goTo(i + 1)} in:scale={{ start: 0.5, duration: 400, easing: backOut }}>
          <Thumb {id} />
        </button>
      {/each}
    </nav>
    <div class="spacer"></div>
    <button class="icon" disabled={!app.canUndo} onclick={undo} title="Undo"><Undo2 size={19} /></button>
    <button class="icon" disabled={!app.canRedo} onclick={redo} title="Redo"><Redo2 size={19} /></button>
    <button class="icon seamsbtn" class:on={app.doc.settings.seams} title="Seams" onclick={() => edit(() => (app.doc.settings.seams = !app.doc.settings.seams))}><Grid3x3 size={19} /></button>
    <button class="icon" popovertarget="settings" title="Settings"><Settings size={19} /></button>
    <button class="make" onclick={() => (ui.make = true)} title="What to cut and sew">
      <Scissors size={18} />
      <span class="dots">{#each stats().yardage.slice(0, 6) as y}<i class="f-{y.f}"></i>{/each}</span>
    </button>
  </header>

  <Palette />
  <Canvas />
  <Swatches />
</div>

<ContextBar />
<MeasurePop />
<MakeSheet />
<Projects />
<Picker />

<div popover id="settings">
  <div class="settings">
    <label title="Seam allowance"><span class="glyph seam"></span><input type="text" inputmode="decimal" value={fmt(app.doc.settings.seam, '')} onchange={e => edit(() => (app.doc.settings.seam = parseFloat(e.currentTarget.value) || 0.25))} />″</label>
    <label title="Usable fabric width"><span class="glyph wof"></span><input type="text" inputmode="decimal" value={app.doc.settings.wof} onchange={e => edit(() => (app.doc.settings.wof = parseFloat(e.currentTarget.value) || 42))} />″</label>
    <div class="bind" title="Binding">
      <span class="glyph bindg"></span>
      <button class="bsw none" class:on={!app.doc.settings.binding} onclick={() => edit(() => (app.doc.settings.binding = null))}><Ban size={14} /></button>
      {#each app.doc.fabrics as f}
        <button class="bsw f-{f.id}" class:on={app.doc.settings.binding === f.id} title={f.name} onclick={() => edit(() => (app.doc.settings.binding = f.id))}></button>
      {/each}
    </div>
    <div class="hst" title="Half-square triangles">
      <button class:on={app.doc.settings.hst === 'trim'} title="Cut big, trim down" onclick={() => edit(() => (app.doc.settings.hst = 'trim'))}><Scissors size={14} /> +1″</button>
      <button class:on={app.doc.settings.hst === 'exact'} title="Cut exact" onclick={() => edit(() => (app.doc.settings.hst = 'exact'))}>+⅞″</button>
    </div>
  </div>
</div>

<style>
  .app {
    height: 100dvh; display: grid;
    grid-template: "top top top top" 56px "dock palette stage swatches" 1fr / 56px 232px 1fr 72px;
  }
  .top { grid-area: top; display: flex; align-items: center; gap: 4px; padding: 0 12px 0 14px; border-bottom: 1px solid var(--line); background: var(--panel); min-width: 0; }
  :global(:root) {
    @media (width < 760px) {
      --bars-dock: calc(66px + env(safe-area-inset-bottom));
      --bars: calc(66px + 58px + env(safe-area-inset-bottom));
    }
  }
  .app { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
  @media (height < 500px) and (width >= 760px) {
    .app { grid-template: "top top top" calc(44px + env(safe-area-inset-top)) "dock stage swatches" 1fr / calc(56px + env(safe-area-inset-left)) 1fr calc(64px + env(safe-area-inset-right)); }
    .top { padding: env(safe-area-inset-top) max(10px, env(safe-area-inset-right)) 0 max(10px, env(safe-area-inset-left)); }
    .seamsbtn, .dots { display: none; }
  }
  @media (width < 760px) {
    .app { grid-template: "top" calc(52px + env(safe-area-inset-top)) "stage" 1fr "swatches" auto "dock" auto / 100%; }
    .top { padding: env(safe-area-inset-top) max(8px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left)); gap: 0; }
    .proj { margin-right: 4px; padding-right: 6px; }
    .crumbs { margin-left: 0; overflow-x: auto; scrollbar-width: none; }
    .seamsbtn { display: none; }
    .make { margin-left: 4px; padding: 8px 12px; .dots { display: none; } }
    #settings { top: calc(56px + env(safe-area-inset-top)); right: 8px; }
  }
  .proj { display: flex; align-items: center; gap: 8px; padding: 5px 10px 5px 5px; margin-right: 14px; border: 0; border-radius: 12px; background: transparent; color: var(--muted);
    &:hover { background: var(--sunk); color: var(--ink); } }
  .logo { width: 28px; height: 28px; }
  .crumbs { display: flex; align-items: center; gap: 4px; min-width: 0; :global(.chev) { color: var(--muted); flex: none; } }
  .crumb { width: 38px; height: 38px; padding: 5px; border: 0; background: transparent; border-radius: 10px; display: grid; place-items: center; color: var(--muted);
    &:hover { background: var(--sunk); } &.here { background: var(--accent-soft); color: var(--accent); } }
  .spacer { flex: 1; }
  .make { display: flex; align-items: center; gap: 10px; margin-left: 10px; padding: 7px 12px 7px 14px; border: 0; border-radius: 99px; background: var(--accent); color: white; font-weight: 600;
    box-shadow: 0 4px 14px oklch(from var(--accent) l c h / 35%); &:hover { scale: 1.04; } }
  .dots { display: flex; i { width: 16px; height: 16px; border-radius: 50%; margin-left: -5px; box-shadow: 0 0 0 2px var(--accent); } }
  #settings { inset: auto; top: 60px; right: 12px; width: 280px; }
  .settings { display: grid; gap: 12px;
    label { display: flex; align-items: center; gap: 10px; font-weight: 600; }
    input[type=text] { width: 5ch; field-sizing: fixed; text-align: center; font-weight: 600; }
  }
  .glyph { width: 30px; height: 30px; border-radius: 7px; flex: none; position: relative; background: var(--sunk);
    &.seam::after { content: ''; position: absolute; inset: 6px; border: 2px dashed var(--muted); border-radius: 2px; }
    &.wof::after { content: ''; position: absolute; left: 4px; right: 4px; top: 13px; height: 4px; background: var(--muted); border-radius: 2px; }
    &.bindg::after { content: ''; position: absolute; inset: 5px; border: 3px solid var(--muted); border-radius: 3px; } }
  .bind { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .bsw { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; box-shadow: inset 0 0 0 1px oklch(0% 0 0 / 15%);
    &.none { display: grid; place-items: center; background: var(--sunk); color: var(--muted); }
    &.on { box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--accent); } }
  .hst { display: flex; gap: 2px; background: var(--sunk); padding: 3px; border-radius: 10px;
    button { flex: 1; border: 0; background: transparent; display: flex; gap: 6px; align-items: center; justify-content: center; font-weight: 600; }
    button.on { background: var(--panel); color: var(--accent); box-shadow: var(--shadow); } }
  .row { display: flex; align-items: center; } .sp { flex: 1; }
  .btnlike { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; &:hover { background: var(--sunk); } }
  .hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  ::view-transition-old(canvas), ::view-transition-new(canvas) { animation-duration: .35s; animation-timing-function: var(--ease); }
  ::view-transition-old(canvas) { animation-name: vt-out; }
  ::view-transition-new(canvas) { animation-name: vt-in; }
  @keyframes -global-vt-out { to { opacity: 0; scale: .92; } }
  @keyframes -global-vt-in { from { opacity: 0; scale: 1.06; } }
</style>
