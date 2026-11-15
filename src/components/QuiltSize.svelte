<script lang="ts">
  import { X, Link, Unlink, Lock, LockOpen } from '@lucide/svelte';
  import { app, ui, stats, replaceDoc } from '../lib/store.svelte';
  import { parseLength, resizeQuilt } from '../lib/planning';
  import { fmt } from '../lib/calc';
  import Thumb from './Thumb.svelte';
  let width = $state(''), height = $state(''), linked = $state(true), exact = $state(false), ratio = 1;
  let initialWidth = $state(''), initialHeight = $state(''), original = $state({ w: 0, h: 0 });
  let dialog: HTMLDialogElement;
  $effect(() => {
    if (ui.resize) {
      const size = stats().size; original = { ...size };
      initialWidth = fmt(size.w, ''); initialHeight = fmt(size.h, '');
      width = initialWidth; height = initialHeight; ratio = size.h / size.w;
      exact = app.doc.settings.lockQuilt !== false; linked = true; dialog?.showModal();
    } else dialog?.close();
  });
  function change(axis: 'w' | 'h', value: string) {
    if (axis === 'w') width = value; else height = value;
    const n = parseLength(value);
    if (linked && n) { if (axis === 'w') height = String(+(n * ratio).toFixed(4)); else width = String(+(n / ratio).toFixed(4)); }
  }
  const result = $derived.by(() => {
    // Formatting the initial fields must not itself resize a measured quilt.
    const w = width === initialWidth ? original.w : parseLength(width);
    const h = height === initialHeight ? original.h : parseLength(height);
    return w && h ? resizeQuilt($state.snapshot(app.doc), w, h, exact) : { error: 'Use a size like 48, 4 ft, or 120 cm.' };
  });
  function apply() { if (result.doc) { replaceDoc(result.doc); ui.resize = false; } }
</script>

<dialog bind:this={dialog} class="work-dialog size-dialog" onclose={() => ui.resize = false}>
  <header><div><h1>Quilt size</h1><p>Same idea. Your size.</p></div><button class="icon" aria-label="Close quilt size" onclick={() => ui.resize = false}><X /></button></header>
  <div class="size-art"><Thumb id={app.doc.root} /><span class="wide">↔ {parseLength(width) ? fmt(parseLength(width)!) : '—'}</span><span class="tall">↕ {parseLength(height) ? fmt(parseLength(height)!) : '—'}</span></div>
  <div class="dimensions">
    <label>Width <input aria-label="Quilt width" type="text" value={width} oninput={e => change('w', e.currentTarget.value)} /></label>
    <button class="link" class:on={linked} aria-label="Keep proportions" aria-pressed={linked} onclick={() => { linked = !linked; if (linked) change('w', width); }}>{#if linked}<Link />{:else}<Unlink />{/if}</button>
    <label>Height <input aria-label="Quilt height" type="text" value={height} oninput={e => change('h', e.currentTarget.value)} /></label>
  </div>
  <p class="hint">Numbers are inches. You can also type 4 ft or 120 cm.</p>
  <button class="size-policy" aria-pressed={exact} onclick={() => exact = !exact}>{#if exact}<Lock size={19} /> Hold this size{:else}<LockOpen size={19} /> Let the quilt grow or shrink{/if}</button>
  <p class="hint">Seam allowance stays {fmt(app.doc.settings.seam)}. Cutting sizes and fabric estimates update.</p>
  {#if result.error}<p class="error" role="status">{result.error}</p>{/if}
  <footer><button onclick={() => ui.resize = false}>Cancel</button><button class="primary" disabled={!result.doc} onclick={apply}>Use this size</button></footer>
</dialog>

<style>
  .size-dialog { max-width: 440px; }
  .size-art { position: relative; width: 180px; height: 180px; margin: 24px auto 42px; }
  .wide { position: absolute; top: 100%; left: 0; right: 0; text-align: center; padding: 7px; font-weight: 750; }
  .tall { position: absolute; left: 100%; top: 50%; white-space: nowrap; padding: 7px; font-weight: 750; }
  .dimensions { display: grid; grid-template-columns: minmax(0,1fr) 42px minmax(0,1fr); gap: 10px; align-items: end; }
  label { display: grid; gap: 5px; font-weight: 650; }
  input { width: 100%; font-size: 22px; padding: 10px; field-sizing: fixed; }
  .link { height: 48px; display: grid; place-items: center; }
  .size-policy { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px; margin-top: 12px; }
</style>
