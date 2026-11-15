<script lang="ts">
  import { flip } from 'svelte/animate';
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { Plus, ImagePlus, ImageOff, Trash2, Pipette } from '@lucide/svelte';
  import { app, edit, setImage, stats } from '../lib/store.svelte';
  import { uid } from '../lib/model';
  import { yd } from '../lib/calc';
  import { supportsAnchor } from '../lib/picker.svelte';

  let editing = $state<string | null>(null);
  const ef = $derived(app.doc.fabrics.find(f => f.id === editing));
  const yards = (id: string) => stats().yardage.find(y => y.f === id)?.yards;
  let pop: HTMLElement;
  let colorInput = $state<HTMLInputElement>();

  function openEditor(e: MouseEvent, id: string) {
    e.preventDefault();
    document.querySelectorAll<HTMLElement>('[data-fab-anchor]').forEach(x => { x.style.removeProperty('anchor-name'); delete x.dataset.fabAnchor; });
    const el = e.currentTarget as HTMLElement;
    el.style.setProperty('anchor-name', '--fab'); el.dataset.fabAnchor = '';
    if (!supportsAnchor) { const r = el.getBoundingClientRect(); pop.style.left = r.left - 230 + 'px'; pop.style.top = r.top + 'px'; }
    editing = id; app.fabric = id; pop.showPopover();
  }
  function addFabric(e: MouseEvent) {
    const id = uid('f');
    const hue = Math.round(Math.random() * 360);
    edit(() => app.doc.fabrics.push({ id, name: 'Fabric', color: `oklch(70% 0.12 ${hue})`, tile: 6 }));
    app.fabric = id;
  }
  const usedAnywhere = (id: string) => JSON.stringify(app.doc.blocks).includes(`"${id}"`) || app.doc.settings.binding === id;
  function removeFabric() {
    if (!ef || usedAnywhere(ef.id)) return;
    const id = ef.id;
    pop.hidePopover();
    edit(() => { app.doc.fabrics = app.doc.fabrics.filter(f => f.id !== id); });
  }
  async function upload(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file || !ef) return;
    await setImage(ef.id, file);
    edit(() => { ef.image = true; });
  }
  async function dropImage() { if (!ef) return; await setImage(ef.id, null); edit(() => { ef.image = false; }); }
  // the colour input wants hex
  function toHex(c: string) {
    if (c.startsWith('#')) return c;
    const cv = document.createElement('canvas').getContext('2d')!; cv.fillStyle = c; return cv.fillStyle as string;
  }
</script>

<aside class="swatches">
  {#each app.doc.fabrics as f (f.id)}
    <div class="slot" animate:flip={{ duration: 350, easing: backOut }} in:scale={{ start: 0.4, duration: 450, easing: backOut }}>
      <button class="sw f-{f.id}" class:on={app.fabric === f.id}
        title={f.name + (yards(f.id) ? ` · ${yd(yards(f.id)!)}` : '')}
        onclick={() => (app.fabric = f.id)} oncontextmenu={e => openEditor(e, f.id)} ondblclick={e => openEditor(e, f.id)}></button>
    </div>
  {/each}
  <button class="sw add" title="Add fabric" onclick={addFabric}><Plus size={20} /></button>
</aside>

<div popover id="fabedit" bind:this={pop}>
  {#if ef}
    <div class="editor">
      <div class="big f-{ef.id}"></div>
      <input class="name" type="text" value={ef.name} onchange={e => edit(() => (ef.name = e.currentTarget.value))} />
      <div class="row">
        <button class="icon" title="Colour" onclick={() => colorInput?.click()}><Pipette size={18} /></button>
        <input bind:this={colorInput} class="hidden" type="color" value={toHex(ef.color)} oninput={e => (ef.color = e.currentTarget.value)} onchange={() => edit(() => {})} />
        <label class="icon btnlike" title="Use a photo of the fabric"><ImagePlus size={18} /><input class="hidden" type="file" accept="image/*" onchange={upload} /></label>
        {#if ef.image}<button class="icon" title="Remove photo" onclick={dropImage}><ImageOff size={18} /></button>{/if}
        <span class="sp"></span>
        <button class="icon" title="Delete fabric" disabled={usedAnywhere(ef.id)} onclick={removeFabric}><Trash2 size={18} /></button>
      </div>
      {#if ef.image}
        <label class="scale" title="Print scale">
          <span class="dot s"></span>
          <input type="range" min="1" max="24" step="0.5" value={ef.tile} oninput={e => (ef.tile = +e.currentTarget.value)} onchange={() => edit(() => {})} />
          <span class="dot l"></span>
        </label>
      {/if}
    </div>
  {/if}
</div>

<style>
  .swatches { grid-area: swatches; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 0; background: var(--panel); border-left: 1px solid var(--line); overflow: auto; scrollbar-width: none; }
  .sw {
    width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; flex: none;
    box-shadow: inset 0 0 0 1px oklch(0% 0 0 / 12%), 0 0 0 0 var(--panel), 0 0 0 0 var(--accent);
    transition: box-shadow .3s var(--ease), scale .4s var(--spring);
    &:hover { scale: 1.1; }
    &.on { box-shadow: inset 0 0 0 1px oklch(0% 0 0 / 12%), 0 0 0 3px var(--panel), 0 0 0 5px var(--accent); scale: 1.08; }
  }
  .add { display: grid; place-items: center; background: transparent; color: var(--muted); box-shadow: inset 0 0 0 2px var(--line);
    &:hover { color: var(--accent); box-shadow: inset 0 0 0 2px var(--accent); } }
  #fabedit { inset: auto; position-anchor: --fab; position-area: left center; position-try-fallbacks: flip-inline; margin: 0 14px; width: 220px; }
  .editor { display: grid; gap: 10px; }
  .big { height: 90px; border-radius: 10px; box-shadow: inset 0 0 0 1px oklch(0% 0 0 / 12%); transition: background-color .3s; }
  .name { border: 0; background: transparent; font-weight: 600; font-size: 14px; padding: 2px 0; }
  .row { display: flex; gap: 2px; align-items: center; } .sp { flex: 1; }
  .btnlike { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; &:hover { background: var(--sunk); } }
  .hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .scale { display: flex; align-items: center; gap: 8px; input { flex: 1; accent-color: var(--accent); } }
  .dot { border-radius: 50%; background: var(--muted); &.s { width: 6px; height: 6px; } &.l { width: 14px; height: 14px; } }
</style>
