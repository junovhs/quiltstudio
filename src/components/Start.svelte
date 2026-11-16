<script lang="ts">
  import { onMount } from 'svelte';
  import { X, Sparkles, ImagePlus, Grid2x2, ArrowRight, FolderOpen } from '@lucide/svelte';
  import { app, ui, dismissStart, newProject } from '../lib/store.svelte';
  import { blankDoc } from '../lib/model';
  import Thumb from './Thumb.svelte';
  let dialog: HTMLDialogElement;
  onMount(() => dialog.showModal());
  function route(to: 'ideas' | 'reference' | 'projects') { dismissStart(); ui[to] = true; }
  function panels() {
    const doc = blankDoc(); doc.settings.lockQuilt = false;
    doc.blocks[doc.root].cells.forEach((c, i) => c.c = { k: 'solid', f: doc.fabrics[[0, 2, 1][i % 3]].id });
    newProject(doc, 'My first quilt'); dismissStart(); ui.resize = true;
  }
</script>
<dialog bind:this={dialog} class="work-dialog start-dialog" onclose={dismissStart}>
  <header><span class="wordmark"><img src="/favicon.svg" alt="" /> QuiltStudio</span><button class="icon" aria-label="Close welcome" onclick={dismissStart}><X /></button></header>
  <div class="hero"><div class="hero-art"><Thumb id={app.doc.root} /></div><div><p class="eyebrow">Your idea. Your hands. Your quilt.</p><h1>Design a quilt you love.<br />Make it your way.</h1><p>Explore colours, find the right size, and let the next piece fit what you actually made.</p></div></div>
  <div class="starts">
    <button onclick={() => route('ideas')}><Sparkles /><b>Find an idea</b><span>Explore quilts and colours</span><ArrowRight /></button>
    <button onclick={() => route('reference')}><ImagePlus /><b>Bring a picture</b><span>Turn a sketch or image into editable pieces</span><ArrowRight /></button>
    <button onclick={panels}><Grid2x2 /><b>Start simply</b><span>Nine panels. Any size. Make it yours.</span><ArrowRight /></button>
  </div>
  <div class="journey"><span>① Imagine</span><span>② Shape & size</span><span>③ Make & adapt</span></div>
  <footer><button class="ghost" onclick={() => route('projects')}><FolderOpen size={18} /> Open a quilt</button><button class="primary" onclick={dismissStart}>Continue this quilt <ArrowRight size={18} /></button></footer>
  <p class="local-note">Your work saves on this device. No account needed to start.</p>
</dialog>
<style>
  .start-dialog { max-width: 850px; width: min(94vw,850px); padding: 28px; }
  header { justify-content: space-between; align-items: center; }
  .wordmark { display: flex; align-items: center; gap: 9px; font-weight: 800; } .wordmark img { width: 30px; }
  .hero { display: grid; grid-template-columns: 180px 1fr; gap: 28px; align-items: center; margin: 30px 0; }
  .hero-art { width: 180px; height: 180px; rotate: -5deg; } .eyebrow { color: var(--accent); font-weight: 700; margin-bottom: 12px; }
  .hero h1 { font-size: clamp(26px,3.5vw,38px); letter-spacing: -.035em; line-height: 1.12; } .hero p:last-child { color: var(--muted); margin-top: 16px; line-height: 1.5; }
  .starts { display: grid; gap: 10px; } .starts button { display: grid; grid-template-columns: 30px 1fr 22px; text-align: left; align-items: center; gap: 3px 12px; padding: 16px; background: var(--sunk); border-radius: 14px; }
  .starts button > :first-child { grid-row: span 2; color: var(--accent); } .starts span { grid-column: 2; color: var(--muted); font-size: 13px; } .starts button > :last-child { grid-column: 3; grid-row: 1 / span 2; }
  .journey { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin: 24px 0; color: var(--muted); font-size: 13px; } footer button { display: flex; align-items: center; gap: 8px; } .local-note { font-size: 12px; text-align: center; color: var(--muted); margin-top: 16px; }
  @media(width < 600px) { .hero { grid-template-columns: 1fr; margin: 20px 0; gap: 16px; } .hero-art { display: none; } .start-dialog { padding: 20px; } footer { flex-wrap: wrap; } }
</style>
