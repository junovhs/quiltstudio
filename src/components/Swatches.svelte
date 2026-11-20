<script lang="ts">
  import { flip } from 'svelte/animate';
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { Plus, ImagePlus, ImageOff, Trash2, Pipette, Palette as PaletteIcon, Shuffle } from '@lucide/svelte';
  import { PALETTES, recolour, type Palette } from '../lib/palettes';
  import { app, edit, setImage, stats } from '../lib/store.svelte';
  import { uid } from '../lib/model';
  import { yd } from '../lib/calc';
  import { supportsAnchor } from '../lib/picker.svelte';
  import { taps } from '../lib/gestures';

  let editing = $state<string | null>(null);
  const ef = $derived(app.doc.fabrics.find(f => f.id === editing));
  const yards = (id: string) => stats().yardage.find(y => y.f === id)?.yards;
  let pop: HTMLElement;
  let colorInput = $state<HTMLInputElement>();

  function openEditor(e: Event, id: string) {
    e.preventDefault?.();
    document.querySelectorAll<HTMLElement>('[data-fab-anchor]').forEach(x => { x.style.removeProperty('anchor-name'); delete x.dataset.fabAnchor; });
    const el = ((e.currentTarget ?? e.target) as HTMLElement).closest('button') as HTMLElement;
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
  /* ---------- whole-quilt colour schemes ---------- */
  const lum = (c: string) => { const n = parseInt(toHex(c).slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
  // picking the same scheme again moves the colours round one place
  let lastPal = '', turn = 0;
  function usePalette(p: Palette) {
    turn = lastPal === p.id ? turn + 1 : 0;
    lastPal = p.id;
    edit(() => recolour(app.doc, p, lum, turn));
  }
  function shuffle() {
    edit(() => {
      const cs = app.doc.fabrics.map(f => [f.color, f.name] as const);
      for (let i = cs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cs[i], cs[j]] = [cs[j], cs[i]]; }
      app.doc.fabrics.forEach((f, i) => { [f.color, f.name] = cs[i]; });
    });
    lastPal = '';
  }
  // the colour input wants hex
  function toHex(c: string) {
    if (c.startsWith('#')) return c;
    const cv = document.createElement('canvas').getContext('2d')!; cv.fillStyle = c; return cv.fillStyle as string;
  }
</script>

<aside class="swatches">
  <button class="sw scheme" title="Colour scheme: recolour the whole quilt" popovertarget="schemes"><PaletteIcon size={20} /></button>
  <span class="div"></span>
  {#each app.doc.fabrics as f (f.id)}
    <div class="slot" animate:flip={{ duration: 350, easing: backOut }} in:scale={{ start: 0.4, duration: 450, easing: backOut }}>
      <button class="sw f-{f.id}" class:on={app.fabric === f.id}
        title={f.name + (yards(f.id) ? ` · ${yd(yards(f.id)!)}` : '')}
        onclick={e => (app.fabric === f.id ? openEditor(e, f.id) : (app.fabric = f.id))}
        use:taps={{ long: e => openEditor(Object.assign(e, { currentTarget: e.target }) as unknown as Event, f.id), double: e => openEditor(Object.assign(e, { currentTarget: e.target }) as unknown as Event, f.id) }}></button>
    </div>
  {/each}
  <button class="sw add" title="Add fabric" onclick={addFabric}><Plus size={20} /></button>
</aside>

<div popover id="schemes">
  <div class="schemes">
    <div class="hd"><b>Colour scheme</b><button class="shuf" title="Swap the colours around" onclick={shuffle}><Shuffle size={15} /> Shuffle</button></div>
    <p>Recolours the whole quilt. Lights stay light, darks stay dark. Click again to rotate the colours.</p>
    {#each PALETTES as p (p.id)}
      <button class="pal" onclick={() => usePalette(p)}>
        <span class="chips">{#each p.colors as [n, c]}<i style:background={c} title={n}></i>{/each}</span>
        <span class="nm">{p.name}</span>
      </button>
    {/each}
  </div>
</div>

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
  .scheme { display: grid; place-items: center; color: var(--ink); background: conic-gradient(from 20deg, #e76f51, #f4a261, #e9c46a, #2a9d8f, #457b9d, #8d6cab, #e76f51);
    :global(svg) { background: var(--panel); border-radius: 50%; padding: 5px; box-sizing: content-box; } }
  .div { width: 24px; height: 1px; background: var(--line); flex: none; }
  #schemes { inset: auto; top: 64px; right: 84px; width: 300px; max-height: calc(100dvh - 90px); overflow-y: auto;
    @media (width < 760px) { right: 8px; left: 8px; width: auto; top: auto; bottom: calc(var(--bars, 120px) + 70px); max-height: 60dvh; } }
  .schemes { display: grid; gap: 4px;
    .hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; b { font-size: 15px; } }
    p { margin: 0 0 6px; font-size: 12.5px; color: var(--muted); }
    .shuf { display: flex; align-items: center; gap: 5px; border: 0; border-radius: 8px; padding: 5px 9px; background: var(--sunk); font-weight: 600; } }
  .pal { display: flex; align-items: center; gap: 10px; padding: 6px; border: 0; border-radius: 10px; background: transparent; text-align: left;
    &:hover { background: var(--sunk); }
    .chips { display: flex; flex: none; width: 128px; i { width: 22px; height: 22px; border-radius: 50%; margin-right: -5px; box-shadow: 0 0 0 2px var(--panel); } }
    .nm { margin-left: 8px; font-weight: 600; } }
  @media (width < 760px) { .div { width: 1px; height: 24px; } }
  .add { display: grid; place-items: center; background: transparent; color: var(--muted); box-shadow: inset 0 0 0 2px var(--line);
    &:hover { color: var(--accent); box-shadow: inset 0 0 0 2px var(--accent); } }
  @media (width < 760px) {
    .swatches { flex-direction: row; padding: 8px 12px; gap: 10px; border: 0; border-top: 1px solid var(--line); overflow: auto hidden; }
    .sw { width: 38px; height: 38px; }
    #fabedit { position-area: top span-right; margin: 10px 0; }
  }
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
