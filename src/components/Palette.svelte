<script lang="ts">
  import { flip } from 'svelte/animate';
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { MousePointer2, Paintbrush, PaintBucket, Ruler, Square, Columns2, Rows2, Grid2x2, RefreshCw, RotateCw, FlipHorizontal2, FlipVertical2, Plus, Pencil, Lock, BookOpen } from '@lucide/svelte';
  import Tile from './Tile.svelte';
  import Thumb from './Thumb.svelte';
  import { app, edit, openBlock, scopeId, useCount, ui, type Tool } from '../lib/store.svelte';
  import { taps } from '../lib/gestures';
  import { swipeClose } from '../lib/sheet';
  import { pickUp, placeInSelection } from '../lib/drag.svelte';
  import { fabricsOf, makeKind, setRegion, snap, uid, xform, UNITS, type Content, type Kind, type Sym, type Xf } from '../lib/model';
  import { openPicker } from '../lib/picker.svelte';

  const TOOLS: [Tool, typeof MousePointer2, string][] = [
    ['select', MousePointer2, 'Select  V'], ['paint', Paintbrush, 'Paint  B'], ['recolor', PaintBucket, 'Recolour  K'], ['measure', Ruler, 'Measure  M'],
  ];
  const SYMS: [Sym, typeof Square, string][] = [
    ['none', Square, 'No mirror'], ['h', Columns2, 'Mirror ↔'], ['v', Rows2, 'Mirror ↕'], ['quad', Grid2x2, 'Mirror ✚'], ['rot', RefreshCw, 'Turn ×4'],
  ];
  // the four shapes, drawn with the current fabrics
  const shape = (k: Kind): Content => makeKind(k, app.brush.k === 'inst' ? [app.fabric, 'cream'] : fabricsOf(app.brush), app.fabric);

  const blocks = $derived(Object.values(app.doc.blocks).filter(b => b.id !== app.doc.root));
  const toolIndex = $derived(TOOLS.findIndex(t => t[0] === app.tool));

  function brushKind(k: Kind) {
    const c = shape(k);
    if ((c.k === 'hst' || c.k === 'cnr' || c.k === 'tri3') && 'corner' in app.brush) c.corner = app.brush.corner;
    app.brush = c; app.tool = 'paint'; ui.palette = false;
  }
  // tap a block: drop it into the selected slot(s); otherwise it just becomes the current block
  const useBlock = (id: string) => {
    const c = { k: 'inst' as const, ref: id, rot: 0 as const, flip: false };
    if (!placeInSelection(c)) app.brush = c;
  };
  const inst = (id: string) => ({ k: 'inst' as const, ref: id, rot: 0 as const, flip: false });
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
  <!-- phones: the brush opens the palette sheet -->
  <button class="mbrush" class:active={ui.palette} title="Shapes & blocks" onclick={() => (ui.palette = !ui.palette)}>
    {#if app.brush.k === 'inst'}<Thumb id={app.brush.ref} rot={app.brush.rot} flip={app.brush.flip} />{:else}<Tile c={app.brush} />{/if}
  </button>
  <hr />
  {#each SYMS as [s, Icon, tip]}
    <button class="icon sym" class:on={app.sym === s && s !== 'none'} class:off={app.sym === 'none' && s === 'none'} title={tip} onclick={() => (app.sym = s)}><Icon size={17} /></button>
  {/each}
</nav>

<aside class="palette" class:sheet-open={ui.palette} use:swipeClose={{ close: () => (ui.palette = false) }}>
  <span class="grabber" data-grab onclick={() => (ui.palette = false)} role="presentation"></span>
  <div class="brush">
    <button class="preview" title="Brush — click a triangle to change its fabric" onclick={pickRegion}>
      {#key app.brush}
        <div class="in" in:scale={{ start: 0.7, duration: 380, easing: backOut }}>
          {#if app.brush.k === 'inst'}<Thumb id={app.brush.ref} rot={app.brush.rot} flip={app.brush.flip} />{:else}<Tile c={app.brush} />{/if}
        </div>
      {/key}
    </button>
    <div class="msym">
      {#each SYMS as [s, Icon, tip]}
        <button class="icon" class:on={app.sym === s} title={tip} onclick={() => (app.sym = s)}><Icon size={17} /></button>
      {/each}
    </div>
    <div class="turns">
      <button class="icon" title="Rotate  R" onclick={() => brushX('r')}><RotateCw size={16} /></button>
      <button class="icon" title="Flip  F" onclick={() => brushX('h')}><FlipHorizontal2 size={16} /></button>
      <button class="icon" title="Flip  ⇧F" onclick={() => brushX('v')}><FlipVertical2 size={16} /></button>
    </div>
  </div>

  <div class="shapes">
    {#each UNITS as [k, name]}
      <button class="shape" class:on={app.tool === 'paint' && app.brush.k === k} title={name}
        draggable="false" onpointerdown={e => pickUp(e, shape(k))} onclick={() => brushKind(k)}>
        <Tile c={shape(k)} />
      </button>
    {/each}
  </div>

  <div class="lib">
    {#each blocks as blk (blk.id)}
      {@const n = useCount(blk.id)}
      <div class="card" animate:flip={{ duration: 350, easing: backOut }} in:scale={{ start: 0.6, duration: 400, easing: backOut }}
        class:on={app.tool === 'paint' && app.brush.k === 'inst' && app.brush.ref === blk.id} class:editing={scopeId() === blk.id}>
        <button class="art" title="Drag onto the quilt · double-click to open" draggable="false" onpointerdown={e => pickUp(e, inst(blk.id))} onclick={() => useBlock(blk.id)} use:taps={{ double: () => { ui.palette = false; openBlock(blk.id); } }}>
          <Thumb id={blk.id} />
        </button>
        {#if n}{#key n}<span class="badge count" in:scale={{ start: 0.3, duration: 500, easing: backOut }}>{n}</span>{/key}{/if}
        {#if blk.locked}<span class="lockb" title="Size locked"><Lock size={11} strokeWidth={3} /></span>{/if}
        <button class="open" title="Open" onclick={() => { ui.palette = false; openBlock(blk.id); }}><Pencil size={12} /></button>
      </div>
    {/each}
    <button class="card add" title="New block" onclick={newBlock}><Plus size={22} /></button>
    <button class="card add classic" title="Classic blocks" onclick={() => (ui.classics = true)}><BookOpen size={20} /><span>Classics</span></button>
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
  .shapes { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
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
  .art { width: 100%; height: 100%; padding: 0; border: 0; background: none; display: grid; place-items: center; cursor: grab; touch-action: pan-y; -webkit-touch-callout: none; }
  .shape { cursor: grab; touch-action: pan-y; -webkit-touch-callout: none; }
  .badge { position: absolute; right: -6px; bottom: -6px; min-width: 26px; padding: 1px 7px; border-radius: 99px; background: var(--ink); color: var(--panel); font-size: 13px; text-align: center; box-shadow: var(--shadow); }
  .open { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 7px; background: var(--panel); box-shadow: var(--shadow);
    opacity: 0; scale: .6; transition: opacity .2s, scale .35s var(--spring); }
  .mbrush, .grabber, .msym { display: none; }
  @media (hover: none) { .open { opacity: 1; scale: 1; } }

  /* ---------- phones ---------- */
  @media (width < 760px) {
    .dock { flex-direction: row; justify-content: space-between; padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); border: 0; border-top: 1px solid var(--line); gap: 6px; }
    .tools { flex-direction: row; }
    .dock button.icon { width: 44px; height: 44px; }
    .tools .pill { width: 44px; height: 44px; translate: calc(var(--i) * 48px) 0; }
    .tools { gap: 4px; }
    .dock > hr, .sym { display: none; }
    .mbrush { display: block; position: relative; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 12px; overflow: hidden; background: var(--sunk);
      box-shadow: var(--shadow); container-type: size; transition: box-shadow .25s, scale .35s var(--spring);
      &.active { box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--accent); } }
    .mbrush { width: 50px; height: 50px; }
    .palette {
      position: fixed; z-index: 25; left: 0; right: 0; bottom: var(--bars-dock); max-height: 64dvh;
      border: 0; border-radius: 22px 22px 0 0; padding: 8px 16px 16px; box-shadow: 0 -12px 40px oklch(30% 0.04 50 / 18%);
      translate: 0 calc(100% + 80px); transition: translate .45s var(--spring);
      &.sheet-open { translate: 0 0; }
    }
    .grabber { display: block; align-self: center; width: 40px; height: 5px; border-radius: 99px; background: var(--line); margin-bottom: 2px; padding: 4px 0; background-clip: content-box; box-sizing: content-box; }
    .brush { flex-wrap: wrap; }
    .preview { width: 68px; height: 68px; }
    .turns { flex-direction: row; }
    .msym { display: flex; gap: 2px; background: var(--sunk); border-radius: 12px; padding: 3px; order: 3; width: 100%; justify-content: space-between;
      button { width: 100%; height: 34px; } button.on { background: var(--panel); color: var(--accent); box-shadow: var(--shadow); } }
    .shapes { gap: 10px; }
    .lib { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 12px; }
  }

  /* ---------- phones on their side ---------- */
  @media (height < 500px) and (width >= 760px) {
    .dock { padding: 6px 0; gap: 2px; overflow-y: auto; scrollbar-width: none; }
    .dock > hr, .sym { display: none; }
    .mbrush { display: block; position: relative; width: 40px; height: 40px; flex: none; padding: 0; border: 0; border-radius: 11px; overflow: hidden; background: var(--sunk); box-shadow: var(--shadow); container-type: size;
      &.active { box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--accent); } }
    .palette {
      position: fixed; z-index: 25; top: 0; bottom: 0; left: 56px; width: 300px; padding: calc(10px + env(safe-area-inset-top)) 14px 14px max(14px, env(safe-area-inset-left));
      border-radius: 0 20px 20px 0; box-shadow: 12px 0 40px oklch(30% 0.04 50 / 18%);
      translate: calc(-100% - 80px) 0; transition: translate .45s var(--spring);
      &.sheet-open { translate: 0 0; }
    }
    .msym { display: flex; gap: 2px; background: var(--sunk); border-radius: 12px; padding: 3px; order: 3; width: 100%; justify-content: space-between;
      button { width: 100%; height: 32px; } button.on { background: var(--panel); color: var(--accent); box-shadow: var(--shadow); } }
    .brush { flex-wrap: wrap; } .turns { flex-direction: row; }
  }
  .lockb { position: absolute; left: -5px; bottom: -6px; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: var(--ink); color: var(--panel); box-shadow: var(--shadow); }
  .add { border: 2px dashed var(--line); background: transparent; color: var(--muted); &:hover { color: var(--accent); border-color: var(--accent); } }
  .classic { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 11.5px; font-weight: 700; }
</style>
