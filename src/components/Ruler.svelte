<script lang="ts">
  import { fade } from 'svelte/transition';
  import { Plus, X, Lock } from '@lucide/svelte';
  import { fmt, scaleOf } from '../lib/calc';
  import { app, begin, edit, save } from '../lib/store.svelte';
  import { insertTrack, deleteTrack, frozenTracks, type Block } from '../lib/model';

  let { block, axis }: { block: Block; axis: 'col' | 'row' } = $props();
  const tracks = $derived(axis === 'col' ? block.cols : block.rows);
  const total = $derived(tracks.reduce((a, b) => a + b, 0));
  // numbers are real quilt inches, shown only when measuring
  const k = $derived.by(() => { const s = scaleOf(app.doc, block.id); return s ? (axis === 'col' ? s.sx : s.sy) : 1; });
  const showNums = $derived(app.tool === 'measure');
  // rows/columns holding something locked can't change
  const frozen = $derived(frozenTracks(app.doc, block, axis));
  let el: HTMLDivElement;

  function setTrack(i: number, v: number) {
    if (!(v > 0) || frozen[i] || block.locked) return;   // typing changes the total: not on a locked block
    edit(() => { tracks[i] = v / k; });
  }

  // drag the line between two tracks: they trade size, the block keeps its size
  function drag(e: PointerEvent, i: number) {
    e.preventDefault();
    if (frozen[i] || frozen[i + 1]) return;
    const len = axis === 'col' ? el.clientWidth : el.clientHeight;
    const perUnit = len / total, start = axis === 'col' ? e.clientX : e.clientY;
    const a0 = tracks[i], b0 = tracks[i + 1], step = 0.125 / k;
    begin();
    document.body.classList.add('dragging');
    const move = (m: PointerEvent) => {
      const d = ((axis === 'col' ? m.clientX : m.clientY) - start) / perUnit;
      const a = Math.min(Math.max(step, Math.round((a0 + d) / step) * step), a0 + b0 - step);
      tracks[i] = a; tracks[i + 1] = a0 + b0 - a;
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      document.body.classList.remove('dragging'); save();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }
</script>

<div class="ruler {axis}" bind:this={el}
  style:grid-template-columns={axis === 'col' ? tracks.map(v => v + 'fr').join(' ') : null}
  style:grid-template-rows={axis === 'row' ? tracks.map(v => v + 'fr').join(' ') : null}>
  {#each tracks as t, i}
    <div class="track" class:frozen={frozen[i]}>
      <span class="tick"></span>
      {#if frozen[i]}<span class="lk"><Lock size={10} strokeWidth={3} /></span>{/if}
      {#if showNums}
        <input type="text" inputmode="decimal" value={fmt(t * k, '')} disabled={frozen[i]} transition:fade={{ duration: 150 }}
          onchange={e => setTrack(i, parseFloat(e.currentTarget.value.replace(',', '.')))} />
      {/if}
      <span class="tools" class:off={frozen[i] || block.locked}>
        <button title="Add" onclick={() => edit(() => insertTrack(block, axis, i + 1, t))}><Plus size={12} strokeWidth={2.5} /></button>
        {#if tracks.length > 1}<button title="Remove" onclick={() => edit(() => deleteTrack(block, axis, i))}><X size={12} strokeWidth={2.5} /></button>{/if}
      </span>
      {#if i < tracks.length - 1 && !frozen[i] && !frozen[i + 1]}<span class="handle" role="separator" onpointerdown={e => drag(e, i)}></span>{/if}
    </div>
  {/each}
</div>

<style>
  .ruler { display: grid; position: relative; transition: grid-template-columns .45s var(--spring), grid-template-rows .45s var(--spring); :global(.dragging) & { transition: none; } }
  .ruler.col { grid-area: top; height: 26px; }
  .ruler.row { grid-area: left; width: 26px; }
  @media (width < 760px) { .ruler.col { height: 20px; } .ruler.row { width: 20px; } }
  @media (pointer: coarse) {
    .col .handle { width: 28px; right: -14px; } .row .handle { height: 28px; bottom: -14px; }
    .col .handle::after { left: 13px; } .row .handle::after { top: 13px; }
  }
  @media (hover: none) { .track:focus-within .tools { opacity: 1; scale: 1; visibility: visible; } }
  .track { position: relative; display: grid; place-items: center; min-width: 0; min-height: 0; color: var(--muted); border-radius: 6px; transition: background .2s;
    &:hover { background: var(--accent-soft); color: var(--ink); } }
  .frozen .tick { background: var(--ink); opacity: .5; }
  .lk { position: absolute; display: grid; place-items: center; color: var(--muted);
    .col & { top: -2px; right: 2px; } .row & { left: 2px; bottom: 2px; } }
  .tools.off { display: none; }
  .tick { position: absolute; background: var(--line); border-radius: 2px;
    .col & { left: 3px; right: 3px; bottom: 2px; height: 3px; }
    .row & { top: 3px; bottom: 3px; right: 2px; width: 3px; }
    .track:hover & { background: var(--accent); } }
  input { width: 5ch; field-sizing: fixed; border: 0; background: transparent; text-align: center; font-size: 11.5px; font-weight: 650; color: inherit; padding: 0;
    .row & { writing-mode: vertical-rl; rotate: 180deg; width: auto; height: 5ch; }
    &:focus { background: var(--panel); outline: 2px solid var(--accent); border-radius: 4px; } }
  /* the buttons sit outside the ruler; padding on the ruler side bridges the gap so the mouse
     never leaves the hover area on the way to them, and they linger a moment before hiding */
  .tools { position: absolute; z-index: 3; display: flex; gap: 2px; opacity: 0; scale: .7; visibility: hidden;
    transition: opacity .2s .35s, scale .3s var(--spring) .35s, visibility 0s .55s;
    .col & { bottom: 100%; padding: 4px 6px 6px; } .row & { right: 100%; padding: 6px 6px 6px 4px; flex-direction: column; }
    .track:hover &, &:hover { opacity: 1; scale: 1; visibility: visible; transition: opacity .2s, scale .3s var(--spring), visibility 0s; }
    button { width: 20px; height: 20px; padding: 0; display: grid; place-items: center; border-radius: 6px; border: 0; background: var(--panel); box-shadow: var(--shadow); } }
  .handle { position: absolute; z-index: 2; touch-action: none;
    .col & { right: -6px; top: -4px; bottom: -10px; width: 12px; cursor: col-resize; }
    .row & { bottom: -6px; left: -4px; right: -10px; height: 12px; cursor: row-resize; }
    &::after { content: ''; position: absolute; background: var(--accent); border-radius: 2px; scale: 1 0; transition: scale .3s var(--spring); }
    .col &::after { left: 5px; width: 2px; top: 0; bottom: 0; }
    .row &::after { top: 5px; height: 2px; left: 0; right: 0; scale: 0 1; }
    &:hover::after { scale: 1; } }
</style>
