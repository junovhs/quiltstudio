<script lang="ts">
  import { onMount } from 'svelte';
  import Canvas from './components/Canvas.svelte';
  import LeftRail from './components/LeftRail.svelte';
  import RightRail from './components/RightRail.svelte';
  import Picker from './components/Picker.svelte';
  import CutDialog from './components/CutDialog.svelte';
  import { app, edit, undo, redo, goTo, scope, loadImages, replaceDoc, getImageBlob, setImage } from './lib/store.svelte';
  import { analyse, dim, fmt, yd } from './lib/calc';
  import { defaultDoc, groupToBlock, merge, snap, xform, type Doc, type Xf } from './lib/model';

  const a = $derived(analyse(app.doc));
  let dlg = $state<HTMLDialogElement>();

  /* fabric fills: flat colour, or the user's photo tiled at real scale */
  const fabricCss = $derived(app.doc.fabrics.map(f => {
    const img = app.images[f.id];
    return `.f-${f.id}{background-color:${f.color};${img ? `background-image:url(${img});background-size:calc(${f.tile} * var(--ppi)) auto;` : ''}}`;
  }).join('\n'));

  const crumbs = $derived([app.doc.root, ...app.path].map(id => app.doc.blocks[id]?.name ?? '?'));
  const fname = (id: string) => app.doc.fabrics.find(f => f.id === id)?.name ?? id;

  onMount(() => { loadImages(); });

  function xfSel(t: Xf) {
    const b = scope();
    if (app.tool === 'paint' || !app.sel.length) { app.brush = xform(snap(app.brush), t); return; }
    edit(() => app.sel.forEach(i => { b.cells[i].c = xform(snap(b.cells[i].c), t); }));
  }

  function key(e: KeyboardEvent) {
    const tgt = e.target as HTMLElement;
    if (tgt.closest('input, select, textarea, dialog')) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod) return;
    const b = scope();
    switch (k) {
      case 'v': app.tool = 'select'; break;
      case 'b': app.tool = 'paint'; break;
      case 'k': app.tool = 'recolor'; break;
      case 'r': xfSel('r'); break;
      case 'f': xfSel(e.shiftKey ? 'v' : 'h'); break;
      case 'm': if (app.sel.length > 1) edit(() => { const j = merge(b, app.sel); if (j != null) app.sel = [j]; }); break;
      case 'g': if (app.sel.length) edit(() => { if (groupToBlock(app.doc, b, app.sel, 'Block ' + Object.keys(app.doc.blocks).length)) app.sel = [b.cells.length - 1]; }); break;
      case 'delete': case 'backspace': if (app.sel.length) edit(() => app.sel.forEach(i => (b.cells[i].c = { k: 'empty' }))); break;
      case 'escape': if (app.sel.length) app.sel = []; else if (app.path.length) goTo(app.path.length - 1); break;
      case 'a': if (e.shiftKey) break; app.sel = b.cells.map((_, i) => i); e.preventDefault(); break;
    }
  }

  /* export / import (photos embedded) */
  async function exportJson() {
    const images: Record<string, string> = {};
    for (const f of app.doc.fabrics) {
      const blob = f.image && await getImageBlob(f.id);
      if (blob) images[f.id] = await new Promise<string>(r => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(blob); });
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify({ doc: $state.snapshot(app.doc), images })], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: 'quilt.quiltstudio.json' }).click();
    URL.revokeObjectURL(url);
  }
  async function importJson(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const data = JSON.parse(await file.text()) as { doc: Doc; images?: Record<string, string> };
    if (data.doc?.v !== 3) return alert("That file isn't a QuiltStudio design.");
    for (const [id, url] of Object.entries(data.images ?? {})) await setImage(id, await (await fetch(url)).blob());
    replaceDoc(data.doc);
  }
  function startOver() { if (confirm('Replace the design with the starting quilt? (You can undo this.)')) replaceDoc(defaultDoc()); }
</script>

<svelte:window onkeydown={key} />
<svelte:head>{@html `<style>${fabricCss}</style>`}</svelte:head>

<div class="app">
  <header class="top">
    <div class="brand"><img src="/favicon.svg" alt="" />QuiltStudio</div>
    <nav class="crumbs">
      {#each crumbs as c, i}
        {#if i}<span class="sep">›</span>{/if}
        <button class="ghost" class:here={i === crumbs.length - 1} onclick={() => goTo(i)}>{c}</button>
      {/each}
    </nav>
    <div class="spacer"></div>
    <span class="size">{dim(a.size.w, a.size.h)}</span>
    <button class="chips" onclick={() => dlg?.showModal()} title="Open the cutting plan">
      {#each a.yardage as y}<span class="chip" title={fname(y.f)}><span class="sw f-{y.f}"></span>{yd(y.yards)}</span>{/each}
      <span class="go">Cutting plan →</span>
    </button>
    <div class="grp">
      <button class="ghost" disabled={!app.canUndo} onclick={undo} title="Undo (Ctrl+Z)">↶</button>
      <button class="ghost" disabled={!app.canRedo} onclick={redo} title="Redo (Ctrl+Shift+Z)">↷</button>
      <button class="ghost" popovertarget="settings" title="Settings">⚙</button>
    </div>
  </header>

  <LeftRail />
  <Canvas />
  <RightRail />
</div>

<div popover id="settings">
  <div class="settings">
    <label>Seam allowance <span><input type="number" step="0.125" value={app.doc.settings.seam} onchange={e => edit(() => (app.doc.settings.seam = +e.currentTarget.value || 0.25))} />″</span></label>
    <label>Usable fabric width <span><input type="number" step="1" value={app.doc.settings.wof} onchange={e => edit(() => (app.doc.settings.wof = +e.currentTarget.value || 42))} />″</span></label>
    <label>Binding fabric
      <select value={app.doc.settings.binding ?? ''} onchange={e => edit(() => (app.doc.settings.binding = e.currentTarget.value || null))}>
        <option value="">None</option>
        {#each app.doc.fabrics as f}<option value={f.id}>{f.name}</option>{/each}
      </select>
    </label>
    <label>Binding shows <span><input type="number" step="0.125" value={app.doc.settings.bindingWidth} onchange={e => edit(() => (app.doc.settings.bindingWidth = +e.currentTarget.value || 0.375))} />″</span></label>
    <label>Show seams <input type="checkbox" checked={app.doc.settings.seams} onchange={e => edit(() => (app.doc.settings.seams = e.currentTarget.checked))} /></label>
    <hr />
    <button onclick={exportJson}>Export design…</button>
    <label class="file"><span>Import design…</span><input type="file" accept=".json,application/json" onchange={importJson} /></label>
    <button onclick={startOver}>Start over</button>
    <p class="muted">Saved automatically in this browser. {fmt(a.finishing.bindingInches)} of binding.</p>
  </div>
</div>

<Picker />
<CutDialog {a} bind:dlg />

<style>
  .app {
    height: 100dvh; display: grid;
    grid-template: "top top top" 52px "left stage right" 1fr / 272px 1fr 268px;
  }
  .top { grid-area: top; display: flex; align-items: center; gap: 10px; padding: 0 12px; border-bottom: 1px solid var(--line); background: var(--panel); min-width: 0; }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; letter-spacing: -.01em; img { width: 22px; } }
  .crumbs { display: flex; align-items: center; gap: 2px; min-width: 0; margin-left: 10px;
    button { padding: 3px 7px; color: var(--muted); } .here { color: var(--ink); font-weight: 600; } .sep { color: var(--muted); } }
  .spacer { flex: 1; }
  .size { font-weight: 650; font-size: 15px; }
  .chips { display: flex; align-items: center; gap: 10px; padding: 4px 10px; border-radius: 99px; background: var(--sunk); border-color: transparent;
    &:hover { border-color: var(--line); } }
  .chip { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; white-space: nowrap; }
  .sw { width: 13px; height: 13px; border-radius: 3px; border: 1px solid oklch(0% 0 0 / 15%); }
  .go { color: var(--accent); font-size: 12.5px; font-weight: 550; white-space: nowrap; }
  .grp { display: flex; gap: 2px; button { font-size: 16px; padding: 3px 8px; } }
  #settings { inset: auto; top: 56px; right: 12px; width: 270px; }
  .settings { display: grid; gap: 9px;
    label { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    hr { border: 0; border-top: 1px solid var(--line); }
    .file input { width: 0; height: 0; opacity: 0; position: absolute; }
    .file span { border: 1px solid var(--line); border-radius: 7px; padding: 5px 9px; cursor: pointer; flex: 1; text-align: center; }
    select { border: 1px solid var(--line); border-radius: 6px; background: var(--panel); padding: 3px; }
  }
  .muted { color: var(--muted); font-size: 12px; }
  @media (max-width: 1000px) { .app { grid-template-columns: 220px 1fr 220px; } .chip { display: none; } }
  ::view-transition-old(canvas), ::view-transition-new(canvas) { animation-duration: .22s; animation-timing-function: var(--ease); }
</style>
