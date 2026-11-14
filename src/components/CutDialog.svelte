<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { dim, fmt, yd, type Analysis } from '../lib/calc';
  let { a, dlg = $bindable() }: { a: Analysis; dlg?: HTMLDialogElement } = $props();
  let tab = $state<'fabric' | 'cuts' | 'order'>('fabric');
  const name = (id: string) => app.doc.fabrics.find(f => f.id === id)?.name ?? id;
  const bname = (id: string) => app.doc.blocks[id]?.name ?? id;
  const fabNames = (fs: string[]) => [...new Set(fs)].map(name).join(' / ');
</script>

<dialog bind:this={dlg} closedby="any">
  <header>
    <div class="tabs">
      <button class:on={tab === 'fabric'} onclick={() => (tab = 'fabric')}>Fabric</button>
      <button class:on={tab === 'cuts'} onclick={() => (tab = 'cuts')}>Cut list</button>
      <button class:on={tab === 'order'} onclick={() => (tab = 'order')}>Sewing order</button>
    </div>
    <span class="muted">Quilt {dim(a.size.w, a.size.h)} · seam {fmt(app.doc.settings.seam)}</span>
    <button class="ghost" onclick={() => dlg?.close()}>✕</button>
  </header>
  <div class="body">
    {#if tab === 'fabric'}
      <div class="cards">
        {#each a.yardage as y}
          <div class="card"><span class="sw f-{y.f}"></span><div><div class="muted">{name(y.f)}</div><div class="yd">{yd(y.yards)}</div></div></div>
        {/each}
        <div class="card"><div><div class="muted">Backing</div><div class="yd">{yd(a.finishing.backing.yards)}</div><div class="muted">{a.finishing.backing.panels} width{a.finishing.backing.panels > 1 ? 's' : ''}, {dim(a.finishing.backing.w, a.finishing.backing.h)}</div></div></div>
        <div class="card"><div><div class="muted">Batting</div><div class="yd">{dim(a.finishing.backing.w, a.finishing.backing.h)}</div></div></div>
        <div class="card"><div><div class="muted">Binding</div><div class="yd">{yd(a.finishing.bindingYards)}</div><div class="muted">{fmt(a.finishing.bindingInches)} long</div></div></div>
      </div>
      <p class="muted note">Strips cut across {fmt(app.doc.settings.wof)} of usable width, +10%, rounded up to ⅛ yd.</p>
    {:else if tab === 'cuts'}
      {#each a.yardage as y}
        <h3><span class="sw f-{y.f}"></span>{name(y.f)} <span class="muted">· {yd(y.yards)}</span></h3>
        <table>
          <tbody>
            {#each y.cuts as c}<tr><td class="n">{c.qty}</td><td class="d">{dim(c.w, c.h)}</td><td class="muted">{c.how}</td></tr>{/each}
          </tbody>
        </table>
      {/each}
    {:else}
      <ol>
        <li>Cut everything on the cut list.</li>
        {#each a.units as u}
          <li>Make <b>{u.qty}</b> {u.label}s, {dim(u.w, u.h)} finished ({fabNames(u.fabrics)}).</li>
        {/each}
        {#each a.order as id}
          {@const us = a.uses.filter(u => u.id === id)}
          <li>Make <b>{us.reduce((s, u) => s + u.qty, 0)}</b> × {bname(id)}: {us.map(u => dim(u.w, u.h)).join(', ')} finished.</li>
        {/each}
        <li>Assemble the quilt top row by row: {dim(a.size.w, a.size.h)} finished.</li>
        <li>Layer backing, batting and top; quilt; bind ({fmt(a.finishing.bindingInches)}).</li>
      </ol>
    {/if}
    {#if a.warnings.length}
      <div class="warns">{#each a.warnings as w}<p>⚠ {w}</p>{/each}</div>
    {/if}
  </div>
</dialog>

<style>
  header { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--line); .muted { margin-left: auto; } }
  .tabs { display: flex; gap: 2px; background: var(--sunk); padding: 3px; border-radius: 9px;
    button { border: 0; background: transparent; } button.on { background: var(--panel); box-shadow: 0 1px 3px oklch(0% 0 0 / 15%); color: var(--ink); } }
  .body { padding: 16px; overflow: auto; max-height: calc(86dvh - 60px); }
  .muted { color: var(--muted); font-size: 12.5px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
  .card { display: flex; gap: 10px; align-items: center; padding: 12px; border: 1px solid var(--line); border-radius: 10px; }
  .yd { font-size: 19px; font-weight: 650; letter-spacing: -.01em; }
  .sw { display: inline-block; width: 22px; height: 22px; border-radius: 5px; border: 1px solid oklch(0% 0 0 / 15%); flex: none; }
  h3 { display: flex; gap: 8px; align-items: center; font-size: 14px; margin: 14px 0 6px; .sw { width: 16px; height: 16px; } }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 6px; border-bottom: 1px solid var(--line); }
  .n { text-align: right; width: 3em; font-weight: 600; } .d { white-space: nowrap; width: 9em; }
  ol { padding-left: 22px; display: grid; gap: 7px; }
  .note { margin-top: 10px; }
  .warns { margin-top: 14px; padding: 10px 12px; border-radius: 8px; background: oklch(from var(--warn) l c h / 12%); color: var(--warn); font-size: 12.5px; display: grid; gap: 4px; }
</style>
