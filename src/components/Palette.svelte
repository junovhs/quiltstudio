<script lang="ts">
  import { flip } from 'svelte/animate';
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { MousePointer2, Paintbrush, PaintBucket, Ruler, Square, Columns2, Rows2, Grid2x2, RefreshCw, RotateCw, FlipHorizontal2, FlipVertical2, Plus, Pencil } from '@lucide/svelte';
  import Tile from './Tile.svelte';
  import Thumb from './Thumb.svelte';
  import { app, edit, openBlock, scopeId, useCount, type Tool } from '../lib/store.svelte';
  import { fabricsOf, makeKind, setRegion, snap, uid, xform, type Content, type Kind, type Sym, type Xf } from '../lib/model';
  import { openPicker } from '../lib/picker.svelte';

  const TOOLS: [Tool, typeof MousePointer2, string][] = [
    ['select', MousePointer2, 'Select  V'], ['paint', Paintbrush, 'Paint  B'], ['recolor', PaintBucket, 'Recolour  K'], ['measure', Ruler, 'Measure  M'],
  ];
  const SYMS: [Sym, typeof Square, string][] = [
    ['none', Square, 'No mirror'], ['h', Columns2, 'Mirror ↔'], ['v', Rows2, 'Mirror ↕'], ['quad', Grid2x2, 'Mirror ✚'], ['rot', RefreshCw, 'Turn ×4'],
  ];
  // the four shapes, drawn with the current fabrics
  const shape = (k: Kind): Content => makeKind(k, app.brush.k === 'inst' ? [app.fabric, 'cream'] : fabricsOf(app.brush), app.fabric);
  const KINDS: Kind[] = ['solid', 'hst', 'qst', 'goose'];

  const blocks = $derived(Object.values(app.doc.blocks).filter(b => b.id !== app.doc.root));
  const toolIndex = $derived(TOOLS.findIndex(t => t[0] === app.tool));

  function brushKind(k: Kind) {
    const c = shape(k);
    if (c.k === 'hst' && app.brush.k === 'hst') c.corner = app.brush.corner;
    app.brush = c; app.tool = 'paint';
  }
  const useBlock = (id: string) => { app.brush = { k: 'inst', ref: id, rot: 0, flip: false }; app.tool = 'paint'; };
  const brushX = (t: Xf) => (app.brush = xform(snap(app.brush), t));
  function pickRegion(e: MouseEvent) {
    const r = (e.target as HTMLElement).closest<HTMLElement>('[data-r]')?.dataset.r;
    if (!r || app.brush.k === 'inst') return;
    openPicker(e.currentTarget as HTMLElement, null, f => (app.brush = setRegion(snap(app.brush), r, f)));
  }
  function newBlock() {
    const id = uid();
    edit(() => {
      app.doc.blocks[id] = {
        id, name: 'Block', cols: [2, 2, 2], rows: [2, 2, 2],
        cells: Array.from({ length: 9 }, (_, i) => ({ x: i % 3, y: Math.floor(i / 3), cs: 1, rs: 1, c: { k: 'empty' as const } })),
      };
    });
    openBlock(id);
  }
</script>

<nav class="dock">
  <div class="tools" style:--i={toolIndex}>
    <span class="pill"></span>
    {#each TOOLS as [t, Icon, tip]}
      <button class="icon" class:active={app.tool === t} title={tip} onclick={() => (app.tool = t)}><Icon size={19} /></button>
    {/each}
  </div>
  <hr />
  {#each SYMS as [s, Icon, tip]}
    <button class="icon sym" class:on={app.sym === s && s !== 'none'} class:off={app.sym === 'none' && s === 'none'} title={tip} onclick={() => (app.sym = s)}><Icon size={17} /></button>
  {/each}
</nav>

<aside class="palette">
  <div class="brush">
    <button class="preview" title="Brush — click a triangle to change its fabric" onclick={pickRegion}>
      {#key app.brush}
        <div class="in" in:scale={{ start: 0.7, duration: 380, easing: backOut }}>
          {#if app.brush.k === 'inst'}<Thumb id={app.brush.ref} rot={app.brush.rot} flip={app.brush.flip} />{:else}<Tile c={app.brush} />{/if}
        </div>
      {/key}
    </button>
    <div class="turns">
      <button class="icon" title="Rotate  R" onclick={() => brushX('r')}><RotateCw size={16} /></button>
      <button class="icon" title="Flip  F" onclick={() => brushX('h')}><FlipHorizontal2 size={16} /></button>
      <button class="icon" title="Flip  ⇧F" onclick={() => brushX('v')}><FlipVertical2 size={16} /></button>
    </div>
  </div>

  <div class="shapes">
    {#each KINDS as k}
      <button class="shape" class:on={app.tool === 'paint' && app.brush.k === k} title={k === 'solid' ? 'Square' : k === 'hst' ? 'Half-square triangle' : k === 'qst' ? 'Quarter-square triangle' : 'One-piece goose'} onclick={() => brushKind(k)}>
        <Tile c={shape(k)} />
      </button>
    {/each}
  </div>

  <div class="lib">
    {#each blocks as blk (blk.id)}
      {@const n = useCount(blk.id)}
      <div class="card" animate:flip={{ duration: 350, easing: backOut }} in:scale={{ start: 0.6, duration: 400, easing: backOut }}
        class:on={app.tool === 'paint' && app.brush.k === 'inst' && app.brush.ref === blk.id} class:editing={scopeId() === blk.id}>
        <button class="art" title="Paint with this block · double-click to open" onclick={() => useBlock(blk.id)} ondblclick={() => openBlock(blk.id)}>
          <Thumb id={blk.id} />
        </button>
        {#if n}<span class="badge count">{n}</span>{/if}
        <button class="open" title="Open" onclick={() => openBlock(blk.id)}><Pencil size={12} /></button>
      </div>
    {/each}
    <button class="card add" title="New block" onclick={newBlock}><Plus size={22} /></button>
  </div>
</aside>

<style>
  .dock { grid-area: dock; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 0; background: var(--panel); border-right: 1px solid var(--line); }
  .tools { position: relative; display: flex; flex-direction: column; gap: 4px;
    button { position: relative; z-index: 1; transition: color .25s; } .active { color: var(--accent-ink); }
    .pill { position: absolute; left: 0; top: 0; width: 36px; height: 36px; border-radius: 10px; background: var(--accent); corner-shape: squircle;
      translate: 0 calc(var(--i) * 40px); transition: translate .45s var(--spring); }
  }
  hr { width: 22px; border: 0; border-top: 1px solid var(--line); margin: 8px 0; }
  .sym { color: var(--muted); &.off { color: var(--ink); background: var(--sunk); } }

  .palette { grid-area: palette; display: flex; flex-direction: column; gap: 14px; padding: 14px 12px; background: var(--panel); border-right: 1px solid var(--line); min-height: 0; }
  .brush { display: flex; gap: 8px; align-items: center; }
  .preview { position: relative; width: 84px; height: 84px; padding: 0; border: 0; border-radius: 12px; overflow: hidden; background: var(--sunk); box-shadow: var(--shadow); flex: none; }
  .in { position: absolute; inset: 0; }
  .turns { display: flex; flex-direction: column; gap: 2px; }
  .shapes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .shape { position: relative; aspect-ratio: 1; padding: 0; border: 0; border-radius: 8px; overflow: hidden; background: none;
    box-shadow: 0 0 0 0 transparent; transition: box-shadow .25s, scale .35s var(--spring);
    &:hover { scale: 1.06; } &.on { box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--accent); } }
  .lib { flex: 1; overflow: hidden auto; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-content: start; scrollbar-width: thin; padding: 6px 4px 12px; margin-inline: -4px; }
  .card {
    position: relative; aspect-ratio: 1; border-radius: 12px; background: var(--sunk); display: grid; place-items: center; padding: 10px;
    transition: box-shadow .25s, background .25s, scale .35s var(--spring);
    &:hover { scale: 1.04; .open { opacity: 1; scale: 1; } }
    &.on { box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--accent); }
    &.editing { background: var(--accent-soft); }
  }
  .art { width: 100%; height: 100%; padding: 0; border: 0; background: none; display: grid; place-items: center; }
  .badge { position: absolute; right: -6px; bottom: -6px; min-width: 26px; padding: 1px 7px; border-radius: 99px; background: var(--ink); color: var(--panel); font-size: 13px; text-align: center; box-shadow: var(--shadow); }
  .open { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 7px; background: var(--panel); box-shadow: var(--shadow);
    opacity: 0; scale: .6; transition: opacity .2s, scale .35s var(--spring); }
  .add { border: 2px dashed var(--line); background: transparent; color: var(--muted); &:hover { color: var(--accent); border-color: var(--accent); } }
</style>
