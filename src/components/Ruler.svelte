<script lang="ts">
  import { fmt } from '../lib/calc';
  import { begin, edit, save } from '../lib/store.svelte';
  import { insertTrack, deleteTrack, type Block } from '../lib/model';

  let { block, axis }: { block: Block; axis: 'col' | 'row' } = $props();
  const tracks = $derived(axis === 'col' ? block.cols : block.rows);
  const total = $derived(tracks.reduce((a, b) => a + b, 0));
  let el: HTMLDivElement;

  const snap = (v: number) => Math.max(0.125, Math.round(v * 8) / 8);

  function setTrack(i: number, v: number) {
    if (!(v > 0)) return;
    edit(() => { tracks[i] = snap(v); });
  }

  // drag the line between track i and i+1; the two trade size, the total stays put
  function drag(e: PointerEvent, i: number) {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const len = axis === 'col' ? el.clientWidth : el.clientHeight;
    const perIn = len / total, start = axis === 'col' ? e.clientX : e.clientY;
    const a0 = tracks[i], b0 = tracks[i + 1];
    begin();
    const move = (m: PointerEvent) => {
      const d = ((axis === 'col' ? m.clientX : m.clientY) - start) / perIn;
      const a = Math.min(snap(a0 + d), a0 + b0 - 0.125);
      tracks[i] = a; tracks[i + 1] = a0 + b0 - a;
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); save(); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }
</script>

<div class="ruler {axis}" bind:this={el}
  style:grid-template-columns={axis === 'col' ? tracks.map(v => v + 'fr').join(' ') : null}
  style:grid-template-rows={axis === 'row' ? tracks.map(v => v + 'fr').join(' ') : null}>
  {#each tracks as t, i}
    <div class="track">
      <input type="number" step="0.125" value={t} title={fmt(t)}
        onchange={e => setTrack(i, parseFloat(e.currentTarget.value))} />
      <span class="tools">
        <button class="ghost" title="Insert {axis === 'col' ? 'column' : 'row'} after" onclick={() => edit(() => insertTrack(block, axis, i + 1, t))}>+</button>
        {#if tracks.length > 1}
          <button class="ghost" title="Delete {axis === 'col' ? 'column' : 'row'}" onclick={() => edit(() => deleteTrack(block, axis, i))}>×</button>
        {/if}
      </span>
      {#if i < tracks.length - 1}
        <span class="handle" role="separator" onpointerdown={e => drag(e, i)}></span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .ruler { display: grid; position: relative; }
  .ruler.col { grid-area: top; height: 26px; }
  .ruler.row { grid-area: left; width: 30px; }
  .track {
    position: relative; display: grid; place-items: center; min-width: 0; min-height: 0;
    color: var(--muted);
    .col & { border-inline: 1px solid transparent; border-bottom: 1px solid var(--line); }
    .row & { border-right: 1px solid var(--line); }
    &:hover { color: var(--ink); background: var(--accent-soft); border-radius: 4px; }
  }
  input { border: 0; background: transparent; padding: 0 2px; font-size: 11px; color: inherit; max-width: 100%;
    .row & { writing-mode: vertical-rl; rotate: 180deg; padding: 2px 0; }
    &:focus { background: var(--panel); }
  }
  .tools {
    position: absolute; display: none; gap: 1px;
    .col & { top: -20px; }
    .row & { left: -24px; flex-direction: column; }
    .track:hover & { display: flex; }
    button { padding: 0 5px; line-height: 16px; font-size: 13px; }
  }
  .handle {
    position: absolute; z-index: 2; touch-action: none;
    .col & { right: -5px; top: 0; bottom: -8px; width: 10px; cursor: col-resize; }
    .row & { bottom: -5px; left: 0; right: -8px; height: 10px; cursor: row-resize; }
    &::after { content: ''; position: absolute; background: var(--accent); opacity: 0; transition: opacity .12s; }
    .col &::after { left: 4px; width: 2px; top: 0; bottom: 0; }
    .row &::after { top: 4px; height: 2px; left: 0; right: 0; }
    &:hover::after { opacity: 1; }
  }
</style>
