<script lang="ts">
  import { Sparkles, Pencil, Ruler, Scissors, Image, Check, ArrowRight } from '@lucide/svelte';
  import { app, ui, openMaking, edit, useCount } from '../lib/store.svelte';
  import { pieceState } from '../lib/planning';
  const root = $derived(app.doc.blocks[app.doc.root]);
  const made = $derived(root.cells.filter((_, i) => ['sewn', 'measured'].includes(pieceState(app.doc, i))).length);
  const empty = $derived(root.cells.every(c => c.c.k === 'empty'));
  const copies = $derived(app.path.length ? useCount(app.path.at(-1)!) : 0);
</script>
<div class="journey-bar">
  <nav aria-label="Your quilt journey">
    <button onclick={() => ui.start = true}><Sparkles size={17} /><span>Idea</span></button><ArrowRight size={12} />
    <button class:active={!ui.workshop} onclick={() => { ui.workshop = false; app.tool = 'select'; }}><Pencil size={17} /><span>Design</span></button><ArrowRight size={12} />
    <button onclick={() => ui.resize = true}><Ruler size={17} /><span>Size</span></button><ArrowRight size={12} />
    <button onclick={() => openMaking()}><Scissors size={17} /><span>Make & adapt</span>{#if made}<small>{made} ✓</small>{/if}</button>
  </nav>
  <div class="next-hint">{#if copies > 1}Editing all {copies} copies of this block.{:else if empty}Start with a picture or fill a panel with a shape.{:else if made}Your plan follows the pieces you make.{:else}Choose colours and shapes, then set your quilt size.{/if}</div>
  {#if app.doc.reference}<button class="reference-toggle" class:on={app.doc.reference.visible} onclick={() => edit(() => { app.doc.reference!.visible = !app.doc.reference!.visible; })} aria-label="Toggle reference overlay"><Image size={16} /><span>Reference</span></button>{:else}<button class="reference-toggle" onclick={() => ui.reference = true}><Image size={16} /><span>Bring a picture</span></button>{/if}
</div>
<style>
  .journey-bar { display: flex; align-items: center; gap: 12px; padding: 7px 14px; background: var(--panel); border-bottom: 1px solid var(--line); }
  nav { display: flex; align-items: center; gap: 4px; } nav button, .reference-toggle { display: flex; gap: 6px; align-items: center; min-height: 34px; border: 0; background: transparent; white-space: nowrap; font-size: 12px; padding: 5px 8px; } nav .active { background: var(--accent-soft); color: var(--accent); } small { padding: 2px 4px; background: var(--sunk); border-radius: 5px; }
  .next-hint { flex: 1; font-size: 12px; color: var(--muted); } .reference-toggle { margin-left: auto; } .reference-toggle.on { background: var(--accent-soft); }
  @media(width < 1050px) { .next-hint { display: none; } }
  @media(width < 760px) { .journey-bar { padding: 4px 6px; gap: 2px; flex-wrap: wrap; } nav { flex: 1; justify-content: space-between; gap: 0; } nav button { padding: 6px; gap: 4px; } .reference-toggle { display: none; } }
</style>
