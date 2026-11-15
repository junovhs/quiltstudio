<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { X } from '@lucide/svelte';
  import Tile from './Tile.svelte';
  import { app, edit, ui } from '../lib/store.svelte';
  import { placeInSelection } from '../lib/drag.svelte';
  import { uid, type Content } from '../lib/model';
  import { PRESETS, rolesFor, type Preset } from '../lib/presets';

  const close = () => (ui.classics = false);
  // previews in this quilt's own fabrics
  const roles = $derived(rolesFor(app.doc));
  const built = $derived(PRESETS.map(p => ({ p, b: p.build(roles) })));

  function add(p: Preset) {
    const id = uid();
    edit(() => { app.doc.blocks[id] = { id, name: p.name, ...p.build(roles) }; });
    const c: Content = { k: 'inst', ref: id, rot: 0, flip: false };
    // selected slots get it straight away; otherwise it becomes the brush
    if (!placeInSelection(c)) { app.brush = c; app.tool = 'paint'; }
    close(); ui.palette = false;
  }
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && ui.classics && close()} />

{#if ui.classics}
  <div class="back" transition:fade={{ duration: 180 }} onclick={e => e.target === e.currentTarget && close()} role="presentation">
    <div class="card" role="dialog" aria-modal="true" aria-label="Classic blocks" transition:scale={{ start: 0.94, duration: 320, easing: backOut }}>
      <header>
        <h2>Classic blocks</h2>
        <button class="icon" onclick={close} title="Close"><X size={18} /></button>
      </header>
      <p class="hint">Shown in your fabrics. Pick one to add it to your blocks{app.sel.length ? ' and drop it into the selected spots' : ', then paint it onto the quilt'}.</p>
      <div class="grid">
        {#each built as { p, b } (p.id)}
          <button class="pre" onclick={() => add(p)} title="Add {p.name}">
            <span class="art">
              <span class="blk" style:--ar={b.cols.reduce((s, v) => s + v, 0) / b.rows.reduce((s, v) => s + v, 0)}
                style:grid-template-columns={b.cols.map(v => v + 'fr').join(' ')} style:grid-template-rows={b.rows.map(v => v + 'fr').join(' ')}>
                {#each b.cells as cell}
                  <span class="cell" style:grid-column="{cell.x + 1} / span {cell.cs}" style:grid-row="{cell.y + 1} / span {cell.rs}"><Tile c={cell.c} /></span>
                {/each}
              </span>
            </span>
            <span class="name">{p.name}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .back { position: fixed; inset: 0; z-index: 55; display: grid; place-items: center; padding: 16px; background: oklch(25% 0.03 50 / 35%); backdrop-filter: blur(3px); }
  .card { width: min(760px, 100%); max-height: min(86dvh, 900px); display: flex; flex-direction: column; gap: 10px; padding: 18px 20px 20px; border-radius: 20px; background: var(--panel); box-shadow: 0 24px 70px oklch(25% 0.04 50 / 30%); }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { font-size: 20px; font-weight: 800; letter-spacing: -.02em; }
  .hint { color: var(--muted); }
  .grid { overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 14px; padding: 4px 2px 6px; scrollbar-width: thin; }
  .pre { display: flex; flex-direction: column; gap: 6px; padding: 0; border: 0; background: none; text-align: center;
    &:hover .art { scale: 1.04; box-shadow: 0 0 0 2px var(--accent), var(--shadow); } }
  .art { aspect-ratio: 1; display: grid; place-items: center; padding: 12px; container-type: size; border-radius: 14px; background: var(--sunk); transition: scale .35s var(--spring), box-shadow .2s; }
  .blk { display: grid; width: min(100cqw, 100cqh * var(--ar)); aspect-ratio: var(--ar); box-shadow: 0 1px 3px oklch(30% 0.04 50 / 25%); }
  .cell { position: relative; min-width: 0; min-height: 0; :global(.rg) { position: absolute; inset: 0; } }
  .name { font-weight: 700; font-size: 12.5px; }
  @media (width < 760px) { .grid { grid-template-columns: repeat(2, 1fr); } }
</style>
