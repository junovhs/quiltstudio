<script lang="ts">
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { RotateCw, FlipHorizontal2, FlipVertical2, Combine, Group, Trash2, Maximize2, Printer, Scissors, Lock, LockOpen, Ruler } from '@lucide/svelte';
  import Tile from './Tile.svelte';
  import { app, edit, enter, scope, scopeId, ui, rollback, tryChange, openMaking, useCount, replaceDoc } from '../lib/store.svelte';
  import { independentPiece } from '../lib/planning';
  import { pieces, whereIs, resizePiece, resizeCells, parseSize } from '../lib/sizes';
  import { cellSize, fmt } from '../lib/calc';
  import { fabricsOf, groupToBlock, makeKind, merge, mergeSame, mirrorOut, snap, xform, cellIndexAt, UNITS, type Kind, type Xf } from '../lib/model';

  const b = $derived(scope());
  const sel = $derived(app.sel.filter(i => b.cells[i]));
  const first = $derived(sel.length ? b.cells[sel[0]] : null);
  const KINDS = UNITS;

  // every change is copied to the mirrored spots when a symmetry is on
  const each = (fn: (i: number) => void) => edit(() => { sel.forEach(fn); mirrorOut(b, sel, app.sym); });
  const xf = (t: Xf) => each(i => { b.cells[i].c = xform(snap(b.cells[i].c), t); });
  const setKind = (k: Kind) => each(i => { const c = b.cells[i]; c.c = makeKind(k, c.c.k === 'inst' ? [app.fabric] : fabricsOf(c.c), app.fabric); });
  const sample = (k: Kind) => makeKind(k, first && first.c.k !== 'inst' && first.c.k !== 'empty' ? fabricsOf(first.c) : [app.fabric, 'cream'], app.fabric);
  function doMerge() {
    edit(() => {
      // keep a pinned piece pinned to the same spot (and its new size) through the join
      const a = app.doc.settings.anchor, pin = a && a.def === scopeId() ? { x: b.cells[a.i]?.x, y: b.cells[a.i]?.y } : null;
      const sameAll = sel.every(i => JSON.stringify(b.cells[i].c) === JSON.stringify(b.cells[sel[0]].c));
      if (sel.length === 1 || sameAll) mergeSame(b, sel);
      else { const j = merge(b, sel); if (j != null) app.sel = [j]; }
      if (sel.length === 1 || sameAll) app.sel = [];
      if (a && pin && pin.x != null) {
        a.i = cellIndexAt(b, pin.x, pin.y!);
        const c = cellSize(app.doc, a.def, a.i);
        if (c) a.size = Math.min(c.w, c.h);
      }
    });
  }
  function doGroup() { edit(() => { if (groupToBlock(app.doc, b, sel, 'Block')) app.sel = [b.cells.length - 1]; }); }
  const clear = () => each(i => { b.cells[i].c = { k: 'empty' }; });
  let refused = $state(false);
  function setSize(input: HTMLInputElement, cur: { w: number; h: number }) {
    const v = parseSize(input.value);
    input.value = `${fmt(cur.w, '')} × ${fmt(cur.h)}`;
    if (!v) return;
    const here = scopeId(), cells = [...sel];
    // typing a size on a locked block is your explicit choice: allow it (the lock still protects it from everything else)
    const ok = tryChange(contain => {
      const unlocked = cells.map(i => b.cells[i].c).filter(c => c.k === 'inst' && app.doc.blocks[c.ref]?.locked).map(c => (c as { ref: string }).ref);
      unlocked.forEach(id => (app.doc.blocks[id].locked = false));
      const r = resizeCells(app.doc, new Map([[here, cells]]), () => v, contain);
      unlocked.forEach(id => (app.doc.blocks[id].locked = true));
      return r;
    }, cells.map(i => `${here}:${i}`));
    if (!ok) { refused = true; setTimeout(() => (refused = false), 500); }
  }
  /** "I cut it at 5″": finished = cut − seams; every identical piece changes, locks still win */
  function iCut(text: string) {
    const cut = parseFloat(text.replace(',', '.').replace('½', '.5').replace('¼', '.25').replace('¾', '.75'));
    const fin = cut - 2 * app.doc.settings.seam;
    if (!(fin > 0)) return;
    const here = scopeId(), i = sel[0];
    const p = pieces(app.doc).find(p => (whereIs(app.doc, p).get(here) ?? []).includes(i));
    if (!p) return;
    let ok = true;
    edit(() => { ok = resizePiece(app.doc, p, fin, fin); });
    if (!ok) { rollback(); refused = true; setTimeout(() => (refused = false), 500); }
  }
</script>

{#if first}
  {@const sz = cellSize(app.doc, scopeId(), sel[0])}
  {@const seam = app.doc.settings.seam}
  <div class="bar" in:scale={{ start: 0.85, duration: 380, easing: backOut }} out:scale={{ start: 0.9, duration: 140 }}>
      {#if !app.path.length && sel.length === 1}<button class="icon" title="Record made size and plan next strip" aria-label="Record made size and plan next strip" onclick={() => openMaking(sel[0])}><Ruler size={19} /></button>{/if}
      {#if sz}
        <!-- finished size in inches, cut size underneath -->
        <!-- the finished size: tap it and type what it should be ("9" = 9×9, or "9 x 8") -->
        <label class="size" class:no={refused} title="Type the size it should be">
          <input type="text" value={`${fmt(sz.w, '')} × ${fmt(sz.h)}`} onfocus={e => e.currentTarget.select()}
            onkeydown={e => e.key === 'Enter' && e.currentTarget.blur()} onchange={e => setSize(e.currentTarget, sz)} />
        </label>
        <span class="sep"></span>
      {/if}
      {#if first.c.k === 'inst' && sel.length === 1}
        {#if !app.path.length && useCount(first.c.ref) > 1}<button title="Make this copy independent before changing its design" onclick={() => replaceDoc(independentPiece($state.snapshot(app.doc), sel[0]))}>Unlink copy</button>{/if}
        <button class="icon" title="Open this block on its own" onclick={() => first.c.k === 'inst' && enter(first.c.ref, false)}><Maximize2 size={17} /></button>
        {@const blk = app.doc.blocks[first.c.ref]}
        <button class="icon" class:on={blk?.locked} title={blk?.locked ? 'Size locked' : 'Lock its size'} onclick={() => edit(() => { if (blk) blk.locked = !blk.locked; })}>
          {#if blk?.locked}<Lock size={17} />{:else}<LockOpen size={17} />{/if}
        </button>
        <button class="icon" title="Print this block" onclick={() => first.c.k === 'inst' && (ui.print = [first.c.ref])}><Printer size={17} /></button>
        <span class="sep"></span>
      {/if}
      <button class="icon" title="Rotate  R" onclick={() => xf('r')}><RotateCw size={17} /></button>
      <button class="icon" title="Flip  F" onclick={() => xf('h')}><FlipHorizontal2 size={17} /></button>
      <button class="icon" title="Flip  ⇧F" onclick={() => xf('v')}><FlipVertical2 size={17} /></button>
      <span class="sep"></span>
      {#each KINDS as [k, name]}
        <button class="kind" class:on={first.c.k === k} title={name} onclick={() => setKind(k)}><Tile c={sample(k)} /></button>
      {/each}
      <span class="sep"></span>
      {#if first.c.k !== 'inst' && first.c.k !== 'empty'}
        <button class="icon" title={sel.length > 1 ? 'Join these into bigger pieces' : 'Join with touching pieces of the same fabric'} onclick={doMerge}><Combine size={17} /></button>
      {:else if sel.length > 1}<button class="icon" title="Join into one piece" onclick={doMerge}><Combine size={17} /></button>{/if}
      {#if sel.length > 1}<button class="mk" title="Make a block from these  G" onclick={doGroup}><Group size={16} /> Make block</button>{/if}
      <button class="icon" title="Clear  ⌫" onclick={clear}><Trash2 size={17} /></button>
  </div>
{/if}

<style>
  .bar {
    position: fixed; z-index: 20;
    position-anchor: --sel; position-area: top; position-try-fallbacks: flip-block; margin-block: 12px;
    display: flex; align-items: center; gap: 2px; padding: 5px; border-radius: 14px; background: var(--panel);
    box-shadow: 0 2px 6px oklch(30% 0.04 50 / 12%), 0 14px 40px oklch(30% 0.04 50 / 20%);
    transform-origin: bottom center;
    @supports not (anchor-name: --a) { bottom: 24px; left: 50%; translate: -50%; }
    @media (width < 760px) {
      position-anchor: none; position-area: none; margin: 0; transform-origin: bottom center;
      left: 8px; right: 8px; bottom: calc(var(--bars) + 8px); top: auto; translate: none; padding: 6px; border-radius: 18px;
      .icon { width: 44px; height: 44px; } .kind { width: 36px; height: 36px; }
      overflow-x: auto; scrollbar-width: none; justify-content: flex-start;
      .icon { flex: none; } .kind { flex: none; }
    }
  }
  .cutin { display: flex; align-items: center; gap: 3px; font-size: 12px; color: var(--muted); font-weight: 700; padding: 1px 4px; border-radius: 6px; cursor: text;
    &:hover, &:focus-within { background: var(--sunk); color: var(--ink); }
    input { width: 3.2em; field-sizing: fixed; border: 0; background: none; font: inherit; color: inherit; padding: 0; text-align: right; }
    &.no { animation: shake .4s var(--ease); color: oklch(60% 0.2 25); } }
  @keyframes shake { 20%, 60% { translate: -5px; } 40%, 80% { translate: 5px; } }
  .size { display: flex; align-items: center; padding: 0 4px; flex: none; cursor: text;
    input { width: 7.2em; field-sizing: fixed; border: 2px solid transparent; border-radius: 9px; background: var(--sunk); font: inherit; font-size: 15px; font-weight: 800; text-align: center; padding: 5px 6px; color: inherit; }
    input:hover { border-color: var(--line); } input:focus { border-color: var(--accent); outline: none; background: var(--panel); }
    &.no input { animation: shake .4s var(--ease); border-color: oklch(60% 0.2 25); }
    b { font-size: 15px; font-weight: 800; letter-spacing: -.01em; }
    small { display: flex; align-items: center; gap: 3px; font-size: 11px; color: var(--muted); font-weight: 600; } }
  .mk { display: flex; align-items: center; gap: 6px; padding: 6px 10px; margin: 0 2px; border: 0; border-radius: 9px; background: var(--accent-soft); color: var(--accent); font-weight: 700; white-space: nowrap; flex: none; }
  .sep { width: 1px; height: 22px; background: var(--line); margin: 0 4px; }
  .kind { position: relative; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 7px; overflow: hidden; margin: 0 2px;
    box-shadow: 0 0 0 0 var(--accent); transition: box-shadow .25s, scale .35s var(--spring);
    &:hover { scale: 1.1; } &.on { box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--accent); } }
</style>
