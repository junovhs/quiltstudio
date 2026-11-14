<script lang="ts">
  import Tile from './Tile.svelte';
  import Node from './Node.svelte';
  import { app, edit, openBlock, scopeId } from '../lib/store.svelte';
  import { fabricsOf, makeKind, setRegion, snap, uid, xform, type Kind, type Sym, type Xf } from '../lib/model';
  import { openPicker } from '../lib/picker.svelte';
  import { fmt } from '../lib/calc';
  import type { Tool } from '../lib/store.svelte';

  const TOOLS: [Tool, string, string, string][] = [
    ['select', 'Select', 'V', 'M5 3l13 8-6 1.5L9 19z'],
    ['paint', 'Paint', 'B', 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3'],
    ['recolor', 'Recolour', 'K', 'M12 3l7 7-7 7-7-7zM19 15s2 2.4 2 3.5a2 2 0 01-4 0c0-1.1 2-3.5 2-3.5z'],
  ];
  const SYMS: [Sym, string, string][] = [
    ['none', 'No symmetry', 'M6 6h12v12H6z'],
    ['h', 'Mirror left ↔ right', 'M12 3v18M4 8l4 4-4 4M20 8l-4 4 4 4'],
    ['v', 'Mirror top ↕ bottom', 'M3 12h18M8 4l4 4 4-4M8 20l4-4 4 4'],
    ['quad', 'Mirror both ways', 'M12 3v18M3 12h18'],
    ['rot', 'Rotate ×4 (square grids)', 'M20 12a8 8 0 11-3-6.2M20 4v4h-4'],
  ];
  const KINDS: [Kind, string][] = [['solid', 'Square'], ['hst', 'HST'], ['qst', 'QST'], ['goose', '1-piece goose']];

  const blocks = $derived(Object.values(app.doc.blocks).filter(b => b.id !== app.doc.root));

  function brushKind(k: Kind) {
    app.brush = makeKind(k, app.brush.k === 'inst' ? [app.fabric] : fabricsOf(app.brush), app.fabric);
    app.tool = 'paint';
  }
  function useBlock(id: string) { app.brush = { k: 'inst', ref: id, rot: 0, flip: false }; app.tool = 'paint'; }
  function brushX(t: Xf) { app.brush = xform(snap(app.brush), t); }
  function pickRegion(e: MouseEvent) {
    const r = (e.target as HTMLElement).closest<HTMLElement>('[data-r]')?.dataset.r;
    if (!r || app.brush.k === 'inst') return;
    openPicker(e.currentTarget as HTMLElement, null, f => { app.brush = setRegion(snap(app.brush), r, f); });
  }
  function newBlock() {
    const id = uid();
    edit(() => {
      app.doc.blocks[id] = {
        id, name: 'New block', cols: [2, 2, 2], rows: [2, 2, 2],
        cells: Array.from({ length: 9 }, (_, i) => ({ x: i % 3, y: Math.floor(i / 3), cs: 1, rs: 1, c: { k: 'empty' as const } })),
      };
    });
    openBlock(id);
  }
  const size = (id: string) => { const b = app.doc.blocks[id]; return `${fmt(b.cols.reduce((a, c) => a + c, 0), '')}×${fmt(b.rows.reduce((a, c) => a + c, 0))}`; };
</script>

<aside class="rail left">
  <section>
    <div class="seg tools">
      {#each TOOLS as [t, label, key, d]}
        <button class:on={app.tool === t} title="{label} ({key})" onclick={() => (app.tool = t)}>
          <svg viewBox="0 0 24 24"><path {d} /></svg><span>{label}</span>
        </button>
      {/each}
    </div>
  </section>

  <section>
    <h2>Symmetry</h2>
    <div class="seg">
      {#each SYMS as [s, label, d]}
        <button class:on={app.sym === s} title={label} onclick={() => (app.sym = s)}><svg viewBox="0 0 24 24"><path {d} /></svg></button>
      {/each}
    </div>
  </section>

  <section>
    <h2>Brush</h2>
    <div class="brush">
      <button class="preview" title="Click a triangle to change its fabric" onclick={pickRegion}>
        {#if app.brush.k === 'inst'}
          <div class="thumb ic" style:--r="{app.brush.rot * 90}deg" style:--s={app.brush.flip ? -1 : 1}>
            <div class="spin" class:odd={app.brush.rot % 2}><Node id={app.brush.ref} /></div>
          </div>
        {:else}
          <Tile c={app.brush} />
        {/if}
      </button>
      <div class="col">
        <div class="row">
          <button title="Rotate (R)" onclick={() => brushX('r')}>↻</button>
          <button title="Flip left/right (F)" onclick={() => brushX('h')}>⇋</button>
          <button title="Flip up/down (Shift+F)" onclick={() => brushX('v')}>⇵</button>
        </div>
        <div class="kinds">
          {#each KINDS as [k, label]}
            <button class:on={app.brush.k === k} onclick={() => brushKind(k)}>{label}</button>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <section class="grow">
    <div class="head"><h2>Blocks</h2><button class="ghost" onclick={newBlock} title="New block">+ New</button></div>
    <div class="lib">
      {#each blocks as blk (blk.id)}
        <div class="card" class:on={app.brush.k === 'inst' && app.brush.ref === blk.id} class:editing={scopeId() === blk.id}>
          <div class="artwrap">
            <button class="art" title="Click: paint with it · double-click: edit" onclick={() => useBlock(blk.id)} ondblclick={() => openBlock(blk.id)}
              style:--ar={blk.cols.reduce((a, c) => a + c, 0) / blk.rows.reduce((a, c) => a + c, 0)}>
              <Node id={blk.id} />
            </button>
          </div>
          <div class="meta">
            <span class="name">{blk.name}</span>
            <span class="dim">{size(blk.id)}</span>
          </div>
          <button class="ghost edit" title="Edit block" onclick={() => openBlock(blk.id)}>Edit</button>
        </div>
      {/each}
    </div>
  </section>
</aside>

<style>
  .rail { grid-area: left; display: flex; flex-direction: column; gap: 16px; padding: 14px; border-right: 1px solid var(--line); background: var(--panel); min-height: 0; }
  section { display: flex; flex-direction: column; gap: 8px; }
  .grow { flex: 1; min-height: 0; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .seg { display: flex; gap: 2px; background: var(--sunk); padding: 3px; border-radius: 9px;
    button { flex: 1; border: 0; background: transparent; display: grid; place-items: center; padding: 6px; }
    button.on { background: var(--panel); color: var(--accent); box-shadow: 0 1px 3px oklch(0% 0 0 / 15%); }
  }
  .tools button { display: flex; gap: 6px; justify-content: center; font-size: 12.5px; }
  .brush { display: flex; gap: 10px; }
  .preview { position: relative; width: 76px; height: 76px; padding: 0; overflow: hidden; flex: none; border-radius: 8px; }
  .thumb { position: absolute; inset: 6px; container-type: size; }
  .spin { position: absolute; left: 50%; top: 50%; width: 100cqw; height: 100cqh; translate: -50% -50%; rotate: var(--r); scale: var(--s) 1;
    &.odd { width: 100cqh; height: 100cqw; } }
  .col { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .row { display: flex; gap: 4px; button { flex: 1; padding: 3px; } }
  .kinds { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; button { font-size: 11.5px; padding: 3px 4px; white-space: nowrap; } }
  .lib { overflow: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-content: start; scrollbar-width: thin; margin-inline: -4px; padding: 2px 4px; }
  .card {
    position: relative; display: flex; flex-direction: column; gap: 4px; padding: 6px; border-radius: 9px; border: 1px solid var(--line);
    &.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
    &.editing { background: var(--accent-soft); }
    &:hover .edit { opacity: 1; }
  }
  .artwrap { height: 64px; container-type: size; display: grid; place-items: center; }
  .art { padding: 0; border: 0; border-radius: 2px; overflow: hidden; display: block; background: transparent;
    width: min(100cqw, 100cqh * var(--ar)); aspect-ratio: var(--ar);
    &:hover { outline: 2px solid var(--accent); } }
  .meta { display: flex; flex-direction: column; line-height: 1.25; }
  .name { font-size: 11.5px; font-weight: 550; text-wrap: balance; }
  .dim { font-size: 10.5px; color: var(--muted); }
  .edit { position: absolute; top: 4px; right: 4px; opacity: 0; font-size: 11px; padding: 1px 6px; background: var(--panel); }
</style>
