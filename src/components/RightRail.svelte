<script lang="ts">
  import Tile from './Tile.svelte';
  import { app, edit, enter, scope, scopeId, setImage } from '../lib/store.svelte';
  import { groupToBlock, merge, makeKind, fabricsOf, setRegion, snap, splitCell, sum, uid, xform, uses, type Kind, type Xf } from '../lib/model';
  import { openPicker, supportsAnchor } from '../lib/picker.svelte';
  import { dim } from '../lib/calc';

  const b = $derived(scope());
  const sel = $derived(app.sel.filter(i => b.cells[i]));
  const first = $derived(sel.length ? b.cells[sel[0]] : null);
  const isRoot = $derived(app.path.length === 0);
  const KINDS: [Kind, string][] = [['solid', 'Square'], ['hst', 'HST'], ['qst', 'QST'], ['goose', 'Goose'], ['empty', 'Empty']];
  const others = $derived(Object.values(app.doc.blocks).filter(x => x.id !== app.doc.root && x.id !== scopeId() && !uses(app.doc, x.id, scopeId())));

  let split = $state({ n: 2, m: 2 });

  const cellSize = (i: number) => { const c = b.cells[i]; return dim(sum(b.cols, c.x, c.cs), sum(b.rows, c.y, c.rs)); };

  function each(fn: (i: number) => void) { edit(() => sel.forEach(fn)); }
  function setKind(k: Kind) {
    each(i => { const c = b.cells[i]; c.c = makeKind(k, c.c.k === 'inst' ? [app.fabric] : fabricsOf(c.c), app.fabric); });
  }
  function setBlock(id: string) { each(i => { b.cells[i].c = { k: 'inst', ref: id, rot: 0, flip: false }; }); }
  function xf(t: Xf) { each(i => { b.cells[i].c = xform(snap(b.cells[i].c), t); }); }
  function pickRegion(e: MouseEvent) {
    const r = (e.target as HTMLElement).closest<HTMLElement>('[data-r]')?.dataset.r;
    if (!r || !first) return;
    openPicker(e.currentTarget as HTMLElement, null, f => each(i => { b.cells[i].c = setRegion(b.cells[i].c, r, f); }));
  }
  function doMerge() { edit(() => { const j = merge(b, sel); if (j != null) app.sel = [j]; }); }
  function doGroup() {
    edit(() => { const id = groupToBlock(app.doc, b, sel, 'Block ' + (Object.keys(app.doc.blocks).length)); if (id) app.sel = [b.cells.length - 1]; });
  }
  function doSplit() { if (!first) return; edit(() => splitCell(app.doc, b, sel[0], split.n, split.m, 'Split ' + split.n + '×' + split.m)); }

  /* fabrics */
  let editing = $state<string | null>(null);
  const ef = $derived(app.doc.fabrics.find(f => f.id === editing));
  let pop: HTMLElement;
  function openEditor(e: MouseEvent, id: string) {
    e.stopPropagation();
    document.querySelectorAll<HTMLElement>('[data-fab-anchor]').forEach(x => { x.style.removeProperty('anchor-name'); delete x.dataset.fabAnchor; });
    const el = e.currentTarget as HTMLElement;
    el.style.setProperty('anchor-name', '--fab'); el.dataset.fabAnchor = '';
    if (!supportsAnchor) { const r = el.getBoundingClientRect(); pop.style.left = Math.max(8, r.right - 250) + 'px'; pop.style.top = r.bottom + 6 + 'px'; }
    editing = id; pop.showPopover();
  }
  function addFabric() {
    const id = uid('f');
    edit(() => app.doc.fabrics.push({ id, name: 'New fabric', color: '#888888', tile: 6 }));
    app.fabric = id;
  }
  function usedAnywhere(id: string) { return JSON.stringify(app.doc.blocks).includes(`"${id}"`) || app.doc.settings.binding === id; }
  function removeFabric(id: string) {
    if (usedAnywhere(id)) return;
    edit(() => { app.doc.fabrics = app.doc.fabrics.filter(f => f.id !== id); });
    pop.hidePopover();
  }
  async function upload(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file || !ef) return;
    await setImage(ef.id, file);
    edit(() => { ef.image = true; });
  }
  async function dropImage() { if (!ef) return; await setImage(ef.id, null); edit(() => { ef.image = false; }); }
</script>

<aside class="rail right">
  <section>
    <div class="head"><h2>Fabrics</h2><button class="ghost" onclick={addFabric}>+ Add</button></div>
    <div class="fabs">
      {#each app.doc.fabrics as f (f.id)}
        <div class="fab" class:on={app.fabric === f.id}>
          <button class="sw f-{f.id}" title="{f.name}: click to make active (recolour tool). Alt-click the quilt to pick a fabric." onclick={() => (app.fabric = f.id)}></button>
          <span class="nm">{f.name}</span>
          <button class="ghost dots" title="Edit fabric" onclick={e => openEditor(e, f.id)}>⋯</button>
        </div>
      {/each}
    </div>
  </section>

  <section class="grow">
    {#if first}
      <h2>{sel.length > 1 ? `${sel.length} cells` : 'Cell'} · {cellSize(sel[0])}</h2>
      {#if first.c.k === 'inst'}
        {@const ref = app.doc.blocks[first.c.ref]}
        <div class="instcard">
          <div><b>{ref?.name}</b></div>
          <div class="row">
            <button onclick={() => enter(first.c.k === 'inst' ? first.c.ref : '')}>Edit block ↵</button>
            <select onchange={e => setBlock(e.currentTarget.value)} value={first.c.ref}>
              <option value={first.c.ref}>Swap for…</option>
              {#each others as o}<option value={o.id}>{o.name}</option>{/each}
            </select>
          </div>
        </div>
      {:else}
        <button class="big" title="Click a triangle to change its fabric" onclick={pickRegion}><Tile c={first.c} /></button>
      {/if}
      <div class="row">
        <button title="Rotate (R)" onclick={() => xf('r')}>↻ Rotate</button>
        <button title="Flip (F)" onclick={() => xf('h')}>⇋</button>
        <button title="Flip (Shift+F)" onclick={() => xf('v')}>⇵</button>
      </div>
      <div class="kinds">
        {#each KINDS as [k, label]}<button class:on={first.c.k === k} onclick={() => setKind(k)}>{label}</button>{/each}
      </div>
      <div class="actions">
        {#if sel.length > 1}
          <button onclick={doMerge} title="Merge into one cell (M)">Merge</button>
        {/if}
        <button onclick={doGroup} title="Turn the selection into a reusable block (G)">Make block</button>
        <span class="split">
          <button onclick={doSplit} title="Split this cell into a grid (its own block)">Split</button>
          <input type="number" min="1" max="12" bind:value={split.n} /> × <input type="number" min="1" max="12" bind:value={split.m} />
        </span>
      </div>
    {:else}
      <h2>{isRoot ? 'Quilt' : 'Block'}</h2>
      {#if !isRoot}
        <input class="rename" type="text" value={b.name} onchange={e => edit(() => (b.name = e.currentTarget.value))} />
      {/if}
      <p class="size">{dim(sum(b.cols), sum(b.rows))}</p>
      <ul class="tips">
        <li><kbd>V</kbd> select · <kbd>B</kbd> paint · <kbd>K</kbd> recolour</li>
        <li>Click a block, then paint cells with it</li>
        <li>Double-click a block on the quilt to edit it; every copy updates</li>
        <li>Drag the ruler lines to resize; type to set exact inches</li>
        <li><kbd>R</kbd> rotate · <kbd>F</kbd> flip · <kbd>M</kbd> merge · <kbd>G</kbd> make block</li>
        <li><kbd>Alt</kbd>+click picks up a fabric · <kbd>Esc</kbd> back out</li>
      </ul>
    {/if}
  </section>
</aside>

<div popover id="fabedit" bind:this={pop}>
  {#if ef}
    <div class="editor">
      <input type="text" value={ef.name} onchange={e => edit(() => (ef.name = e.currentTarget.value))} />
      <label>Colour <input type="color" value={ef.color} oninput={e => (ef.color = e.currentTarget.value)} onchange={() => edit(() => {})} /></label>
      <label class="file">Photo <input type="file" accept="image/*" onchange={upload} /></label>
      {#if ef.image}
        <label>Photo repeats every <input type="number" step="0.5" min="0.5" value={ef.tile} onchange={e => edit(() => (ef.tile = +e.currentTarget.value || 6))} />″</label>
        <button onclick={dropImage}>Remove photo</button>
      {/if}
      <button disabled={usedAnywhere(ef.id)} title={usedAnywhere(ef.id) ? 'In use in the design' : ''} onclick={() => removeFabric(ef.id)}>Delete fabric</button>
    </div>
  {/if}
</div>

<style>
  .rail { grid-area: right; display: flex; flex-direction: column; gap: 18px; padding: 14px; border-left: 1px solid var(--line); background: var(--panel); min-height: 0; overflow: auto; scrollbar-width: thin; }
  section { display: flex; flex-direction: column; gap: 9px; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  .fabs { display: grid; gap: 2px; }
  .fab { display: flex; align-items: center; gap: 8px; padding: 3px; border-radius: 8px;
    &.on { background: var(--accent-soft); .sw { box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--accent); } }
    .dots { margin-left: auto; padding: 0 6px; opacity: .5; } &:hover .dots { opacity: 1; } }
  .sw { width: 26px; height: 26px; padding: 0; border-radius: 6px; border: 1px solid oklch(0% 0 0 / 15%); flex: none; }
  .nm { font-size: 12.5px; }
  .big { position: relative; width: 110px; height: 110px; padding: 0; overflow: hidden; border-radius: 8px; }
  .row { display: flex; gap: 4px; flex-wrap: wrap; button { flex: 1; } }
  .kinds { display: flex; flex-wrap: wrap; gap: 4px; button { font-size: 12px; padding: 3px 8px; } }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .split { display: inline-flex; gap: 4px; align-items: center; color: var(--muted); input { width: 3.2em; field-sizing: fixed; } }
  .instcard { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 8px; background: var(--sunk); }
  select { border: 1px solid var(--line); border-radius: 6px; background: var(--panel); padding: 4px; flex: 1; min-width: 0; }
  .rename { font-weight: 600; font-size: 15px; }
  .size { font-size: 20px; font-weight: 650; letter-spacing: -.01em; }
  .tips { padding-left: 16px; color: var(--muted); font-size: 12.5px; display: grid; gap: 5px; }
  #fabedit {
    inset: auto; position-anchor: --fab; position-area: bottom span-left; position-try-fallbacks: flip-block; margin: 6px 0; width: 240px;
  }
  .editor { display: grid; gap: 8px; label { display: flex; align-items: center; justify-content: space-between; gap: 8px; } }
  .file input { max-width: 150px; font-size: 11px; }
  input[type=color] { width: 44px; height: 26px; border: 1px solid var(--line); border-radius: 6px; padding: 1px; background: none; }
</style>
