<script lang="ts">
  import { fly, fade, scale } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { backOut, cubicOut } from 'svelte/easing';
  import { X, Plus, FileDown, FileUp, ImageDown, Trash2, Copy, LoaderCircle } from '@lucide/svelte';
  import Thumb from './Thumb.svelte';
  import { app, edit, projects, openProject, newProject, deleteProject, getImageBlob, setImage, ui } from '../lib/store.svelte';
  import { blankDoc, type Doc } from '../lib/model';
  import { oneSheet } from '../lib/render';

  let armed = $state<string | null>(null);   // trash needs a second tap
  let busy = $state<string | null>(null);
  const close = () => { ui.projects = false; armed = null; };
  const others = $derived(projects.list.filter(p => p.id !== projects.current));
  const safe = (s: string) => (s || 'quilt').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'quilt';

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* a .quilt file: the design + fabric photos, so it opens anywhere */
  async function saveFile() {
    busy = 'save';
    const images: Record<string, string> = {};
    for (const f of app.doc.fabrics) {
      const blob = f.image && await getImageBlob(f.id);
      if (blob) images[f.id] = await new Promise<string>(r => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(blob); });
    }
    download(new Blob([JSON.stringify({ app: 'quiltstudio', doc: $state.snapshot(app.doc), images })], { type: 'application/json' }), `${safe(app.doc.name ?? '')}.quilt`);
    busy = null;
  }
  async function openFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement, file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as { doc?: Doc; images?: Record<string, string> };
      if (data.doc?.v !== 3) throw new Error('not a quilt');
      newProject(data.doc, data.doc.name ?? file.name.replace(/\.(quilt|json)$/, ''));
      for (const [id, url] of Object.entries(data.images ?? {})) await setImage(id, await (await fetch(url)).blob());
    } catch { shake = true; setTimeout(() => (shake = false), 450); }
  }
  let shake = $state(false);
  async function picture() {
    busy = 'png';
    try { download(await oneSheet($state.snapshot(app.doc) as Doc, app.images), `${safe(app.doc.name ?? '')}.png`); }
    finally { busy = null; }
  }
  function duplicate() {
    const d = $state.snapshot(app.doc) as Doc;
    const imgs = { ...app.images };
    newProject(structuredClone(d), (d.name ?? 'Quilt') + ' 2');
    // copy photos to the new project
    Object.entries(imgs).forEach(async ([id, url]) => setImage(id, await (await fetch(url)).blob()));
  }
  function trash(id: string) {
    if (armed !== id) { armed = id; setTimeout(() => { if (armed === id) armed = null; }, 2500); return; }
    armed = null; deleteProject(id);
  }
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && ui.projects && close()} />

{#if ui.projects}
  <div class="scrim" transition:fade={{ duration: 200 }} onclick={close} role="presentation"></div>
  <aside class="drawer" transition:fly={{ x: -440, duration: 450, easing: cubicOut }}>
    <header>
      <input class="name" type="text" value={app.doc.name} onchange={e => edit(() => (app.doc.name = e.currentTarget.value))} />
      <button class="icon" onclick={close}><X size={18} /></button>
    </header>

    <div class="current">
      <div class="art"><Thumb id={app.doc.root} /></div>
    </div>

    <!-- the three ways out, and the way in -->
    <div class="actions" class:shake>
      <button class="act" onclick={saveFile} title="Save this quilt as a file you can keep or send">
        {#if busy === 'save'}<LoaderCircle size={24} class="spin" />{:else}<FileDown size={24} />{/if}<span>.quilt</span>
      </button>
      <label class="act" title="Open a .quilt file">
        <FileUp size={24} /><span>Open</span>
        <input type="file" accept=".quilt,.json,application/json" onchange={openFile} />
      </label>
      <button class="act" onclick={picture} title="One-sheet picture: quilt, fabric, cuts and counts">
        {#if busy === 'png'}<LoaderCircle size={24} class="spin" />{:else}<ImageDown size={24} />{/if}<span>.png</span>
      </button>
    </div>

    <div class="mine">
      <button class="card new" title="New quilt" onclick={() => newProject(blankDoc(), 'New quilt')}><Plus size={26} /></button>
      <button class="card new" title="Copy this quilt" onclick={duplicate}><Copy size={22} /></button>
      {#each others as p (p.id)}
        <div class="card" animate:flip={{ duration: 350, easing: backOut }} in:scale={{ start: 0.6, duration: 400, easing: backOut }} out:scale={{ start: 0.6, duration: 200 }}>
          <button class="open" title={p.name} onclick={() => { openProject(p.id); }}>
            {#if p.thumb}<img src={p.thumb} alt="" />{:else}<span class="blank"></span>{/if}
          </button>
          <span class="pname">{p.name}</span>
          <button class="del" class:armed={armed === p.id} title="Delete" onclick={() => trash(p.id)}><Trash2 size={14} /></button>
        </div>
      {/each}
    </div>
  </aside>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 40; background: oklch(30% 0.03 50 / 25%); backdrop-filter: blur(2px); }
  .drawer { position: fixed; z-index: 41; top: 0; left: 0; bottom: 0; width: min(380px, 100vw); background: var(--panel); display: flex; flex-direction: column; gap: 16px; padding: 14px 18px 20px;
    box-shadow: 20px 0 60px oklch(30% 0.04 50 / 20%); border-radius: 0 20px 20px 0; overflow: auto; scrollbar-width: thin; }
  header { display: flex; align-items: center; gap: 8px; }
  .name { flex: 1; border: 0; background: transparent; font-size: 22px; font-weight: 800; letter-spacing: -.02em; padding: 4px 0; border-radius: 6px;
    &:hover { background: var(--sunk); } &:focus { background: var(--sunk); outline: none; padding-inline: 6px; } }
  .current { height: 220px; padding: 10px; border-radius: 16px; background: var(--sunk); }
  .art { width: 100%; height: 100%; }
  .actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; &.shake { animation: shake .4s var(--ease); } }
  .act { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; height: 82px; border: 0; border-radius: 14px; cursor: pointer;
    background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 13px; transition: scale .35s var(--spring), background .2s;
    &:hover { background: oklch(from var(--accent) l c h / 24%); scale: 1.04; } &:active { scale: .94; }
    input { position: absolute; width: 1px; height: 1px; opacity: 0; } }
  .act :global(.spin) { animation: spin 1s linear infinite; }
  .mine { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .card { position: relative; display: flex; flex-direction: column; gap: 4px; align-items: center; }
  .new { aspect-ratio: 1; width: 100%; border: 2px dashed var(--line); border-radius: 12px; background: none; color: var(--muted); display: grid; place-items: center;
    &:hover { color: var(--accent); border-color: var(--accent); } }
  .open { width: 100%; aspect-ratio: 1; padding: 6px; border: 0; border-radius: 12px; background: var(--sunk); display: grid; place-items: center; transition: scale .35s var(--spring);
    &:hover { scale: 1.05; } img { max-width: 100%; max-height: 100%; box-shadow: 0 1px 3px oklch(30% 0.04 50 / 25%); } }
  .blank { width: 70%; aspect-ratio: 1; background: var(--line); border-radius: 4px; }
  .pname { font-size: 11.5px; color: var(--muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .del { position: absolute; top: -6px; right: -6px; width: 26px; height: 26px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--panel); box-shadow: var(--shadow); color: var(--muted);
    opacity: 0; scale: .6; transition: opacity .2s, scale .35s var(--spring), background .2s, color .2s;
    &.armed { background: oklch(58% 0.2 25); color: white; opacity: 1; scale: 1.1; } }
  .card:hover .del { opacity: 1; scale: 1; }
  @keyframes spin { to { rotate: 360deg; } }
  @keyframes shake { 20%, 60% { translate: -6px; } 40%, 80% { translate: 6px; } }
</style>
