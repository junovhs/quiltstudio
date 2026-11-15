<script lang="ts">
  import { fly, fade, scale } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { backOut, cubicOut } from 'svelte/easing';
  import { X, Plus, FileDown, FileUp, ImageDown, Trash2, Copy, LoaderCircle, Search, Cloud, CloudOff, CloudCheck, UserRound, Check } from '@lucide/svelte';
  import { cloud } from '../lib/cloud.svelte';
  import Thumb from './Thumb.svelte';
  import { app, edit, projects, fillThumbs, openProject, newProject, deleteProject, getImageBlob, setImage, ui } from '../lib/store.svelte';
  import { blankDoc, type Doc } from '../lib/model';
  import { oneSheet } from '../lib/render';
  
  let armed = $state<string | null>(null);   // trash needs a second tap
  let busy = $state<string | null>(null);
  const close = () => { ui.projects = false; armed = null; };
  let q = $state('');
  const shown = $derived(projects.list.toSorted((a, b) => b.updated - a.updated)
    .filter(p => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())));
  const ago = (t: number) => {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const inCloud = (id: string, updated: number) => (cloud.remote[id] ?? 0) >= updated;
  $effect(() => { if (ui.projects) void fillThumbs(); });
  function pick(id: string) { openProject(id); close(); }
  const safe = (s: string) => (s || 'quilt').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'quilt';

  /* on iPhone this opens the share sheet (Save Image, Messages, Files…); elsewhere it downloads */
  async function deliver(blob: Blob, name: string, type: string) {
    const file = new File([blob], name, { type });
    if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ files: [file], title: app.doc.name }); return; }
      catch (e) { if ((e as DOMException).name === 'AbortError') return; }
    }
    download(blob, name);
  }
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
    await deliver(new Blob([JSON.stringify({ app: 'quiltstudio', doc: $state.snapshot(app.doc), images })], { type: 'application/json' }), `${safe(app.doc.name ?? '')}.quilt`, 'application/json');
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
      close();
      for (const [id, url] of Object.entries(data.images ?? {})) await setImage(id, await (await fetch(url)).blob());
    } catch { shake = true; setTimeout(() => (shake = false), 450); }
  }
  let shake = $state(false);
  async function picture() {
    busy = 'png';
    try { await deliver(await oneSheet($state.snapshot(app.doc) as Doc, app.images), `${safe(app.doc.name ?? '')}.png`, 'image/png'); }
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

<svelte:window onkeydown={e => e.key === 'Escape' && ui.projects && !ui.account && close()} />

{#if ui.projects}
  <div class="mgr" transition:fly={{ y: 24, duration: 380, easing: cubicOut }} role="dialog" aria-modal="true" aria-label="My quilts">
    <header class="bar">
      <img class="logo" src="/favicon.svg" alt="" />
      <h1>My quilts <span class="num">{projects.list.length}</span></h1>
      <label class="search"><Search size={16} /><input type="search" placeholder="Find a quilt" bind:value={q} /></label>
      <button class="acct" class:in={cloud.email} class:bad={cloud.state === 'error' || cloud.state === 'offline'} onclick={() => (ui.account = true)}
        title={cloud.problem || (cloud.email ? 'Account' : 'Sign in to save your quilts to an account')}>
        {#if !cloud.email}<UserRound size={17} /><span>Sign in</span>
        {:else if cloud.state === 'syncing'}<LoaderCircle size={17} class="spin" /><span class="em">{cloud.email}</span>
        {:else if cloud.state === 'error' || cloud.state === 'offline'}<CloudOff size={17} /><span class="em">{cloud.email}</span>
        {:else}<CloudCheck size={17} /><span class="em">{cloud.email}</span>{/if}
      </button>
      <button class="icon" onclick={close} title="Back to the quilt"><X size={20} /></button>
    </header>

    <div class="body">
      <!-- the quilt that's open now -->
      <section class="now">
        <div class="art"><Thumb id={app.doc.root} /></div>
        <input class="name" type="text" value={app.doc.name} aria-label="Quilt name" onchange={e => edit(() => (app.doc.name = e.currentTarget.value))} />
        <p class="sub">Open now · {ago(projects.list.find(p => p.id === projects.current)?.updated ?? Date.now())}
          {#if cloud.email}{#if inCloud(projects.current, projects.list.find(p => p.id === projects.current)?.updated ?? 0)} · <Cloud size={12} /> saved to account{:else} · saving…{/if}{/if}</p>
        <div class="actions" class:shake>
          <button class="act" onclick={saveFile} title="Save this quilt as a file you can keep or send">
            {#if busy === 'save'}<LoaderCircle size={20} class="spin" />{:else}<FileDown size={20} />{/if}<span>.quilt file</span>
          </button>
          <label class="act" title="Open a .quilt file">
            <FileUp size={20} /><span>Open file</span>
            <input type="file" accept=".quilt,.json,application/json" onchange={openFile} />
          </label>
          <button class="act" onclick={picture} title="One-sheet picture: quilt, fabric, cuts and counts">
            {#if busy === 'png'}<LoaderCircle size={20} class="spin" />{:else}<ImageDown size={20} />{/if}<span>Picture</span>
          </button>
          <button class="act" onclick={() => { duplicate(); }} title="Make a copy of this quilt"><Copy size={20} /><span>Copy</span></button>
        </div>
        {#if !cloud.email && cloud.enabled}
          <button class="nudge" onclick={() => (ui.account = true)}><Cloud size={16} /> Sign in to keep your quilts in your account</button>
        {/if}
        {#if cloud.email && cloud.problem}<p class="problem">{cloud.problem}</p>{/if}
      </section>

      <!-- every quilt -->
      <section class="all">
        <button class="card new" onclick={() => { newProject(blankDoc(), 'New quilt'); close(); }}>
          <span class="plus"><Plus size={28} /></span><span class="pname">New quilt</span>
        </button>
        {#each shown as p (p.id)}
          <div class="card" class:cur={p.id === projects.current} animate:flip={{ duration: 350, easing: backOut }} in:scale={{ start: 0.7, duration: 380, easing: backOut }} out:scale={{ start: 0.7, duration: 200 }}>
            <button class="open" title="Open {p.name}" onclick={() => pick(p.id)}>
              {#if p.id === projects.current}<span class="live"><Thumb id={app.doc.root} /></span>{:else if p.thumb}<img src={p.thumb} alt="" />{:else}<span class="blank"></span>{/if}
              {#if p.id === projects.current}<span class="here"><Check size={12} strokeWidth={3} /> Open</span>{/if}
            </button>
            <div class="meta">
              <span class="pname" title={p.name}>{p.name}</span>
              <span class="when">{#if cloud.email && inCloud(p.id, p.updated)}<Cloud size={11} />{/if}{ago(p.updated)}</span>
            </div>
            <button class="del" class:armed={armed === p.id} title={armed === p.id ? 'Tap again to delete' : 'Delete'} onclick={() => trash(p.id)}><Trash2 size={14} /></button>
          </div>
        {/each}
        {#if !shown.length}<p class="none">No quilts called “{q}”.</p>{/if}
      </section>
    </div>
  </div>
{/if}

<style>
  .mgr { position: fixed; inset: 0; z-index: 41; display: flex; flex-direction: column; background: var(--bg); }
  .bar { display: flex; align-items: center; gap: 10px; height: calc(60px + env(safe-area-inset-top)); padding: env(safe-area-inset-top) max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left));
    background: var(--panel); border-bottom: 1px solid var(--line); flex: none; }
  .logo { width: 30px; height: 30px; }
  h1 { font-size: 19px; font-weight: 800; letter-spacing: -.02em; white-space: nowrap; }
  .num { margin-left: 4px; padding: 1px 8px; border-radius: 99px; background: var(--sunk); color: var(--muted); font-size: 13px; vertical-align: 2px; }
  .search { flex: 1; max-width: 340px; margin-left: auto; display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 38px; border-radius: 12px; background: var(--sunk); color: var(--muted);
    input { flex: 1; min-width: 0; border: 0; background: none; outline: none; color: var(--ink); }
    &:focus-within { outline: 2px solid var(--accent); } }
  .acct { display: flex; align-items: center; gap: 7px; height: 38px; max-width: 240px; padding: 0 14px; border: 0; border-radius: 99px; background: var(--accent); color: white; font-weight: 700;
    &.in { background: var(--sunk); color: var(--ink); :global(svg) { color: oklch(60% 0.13 150); flex: none; } }
    &.bad :global(svg) { color: var(--warn); }
    .em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
  .body { flex: 1; min-height: 0; overflow: auto; display: grid; grid-template-columns: 320px 1fr; gap: 28px; align-items: start;
    padding: 24px max(16px, env(safe-area-inset-right)) calc(32px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); scrollbar-width: thin; }
  .now { position: sticky; top: 0; display: grid; gap: 12px; padding: 16px; border-radius: 20px; background: var(--panel); box-shadow: var(--shadow); }
  .art { height: 240px; padding: 12px; border-radius: 14px; background: var(--sunk); }
  .name { width: 100%; border: 0; background: transparent; font-size: 21px; font-weight: 800; letter-spacing: -.02em; padding: 2px 6px; margin: 0 -6px; border-radius: 8px;
    &:hover, &:focus { background: var(--sunk); outline: none; } }
  .sub { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: -8px; color: var(--muted); font-size: 12.5px; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; &.shake { animation: shake .4s var(--ease); } }
  .act { position: relative; display: flex; align-items: center; gap: 8px; height: 46px; padding: 0 12px; border: 0; border-radius: 12px; cursor: pointer;
    background: var(--accent-soft); color: var(--accent); font-weight: 700; font-size: 13px; transition: scale .35s var(--spring), background .2s;
    &:hover { background: oklch(from var(--accent) l c h / 24%); } &:active { scale: .95; }
    input { position: absolute; width: 1px; height: 1px; opacity: 0; } }
  .nudge { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; border: 1px dashed var(--line); border-radius: 12px; background: none; color: var(--muted); font-weight: 600;
    &:hover { color: var(--accent); border-color: var(--accent); } }
  .problem { font-size: 12.5px; color: var(--warn); font-weight: 600; }
  .all { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 18px; }
  .card { position: relative; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .open, .new .plus { position: relative; width: 100%; aspect-ratio: 1; padding: 14px; border: 0; border-radius: 16px; background: var(--panel); box-shadow: var(--shadow); display: grid; place-items: center;
    transition: scale .35s var(--spring), box-shadow .2s; }
  .open:hover { scale: 1.03; box-shadow: 0 2px 4px oklch(30% 0.04 50 / 10%), 0 14px 34px oklch(30% 0.04 50 / 14%); }
  .open img { max-width: 100%; max-height: 100%; box-shadow: 0 1px 3px oklch(30% 0.04 50 / 25%); }
  .cur .open { box-shadow: 0 0 0 3px var(--accent), var(--shadow); }
  .here { position: absolute; top: 8px; left: 8px; display: flex; align-items: center; gap: 3px; padding: 2px 8px 2px 6px; border-radius: 99px; background: var(--accent); color: white; font-size: 11px; font-weight: 800; }
  .new { border: 0; background: none; padding: 0; text-align: left;
    .plus { background: none; box-shadow: none; border: 2px dashed var(--line); color: var(--muted); }
    &:hover .plus { color: var(--accent); border-color: var(--accent); scale: 1.03; } }
  .live { width: 100%; height: 100%; }
  .blank { width: 70%; aspect-ratio: 1; background: var(--line); border-radius: 4px; }
  .meta { display: grid; padding: 0 4px; }
  .pname { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .when { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); }
  .del { position: absolute; top: -7px; right: -7px; width: 28px; height: 28px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--panel); box-shadow: var(--shadow); color: var(--muted);
    opacity: 0; scale: .6; transition: opacity .2s, scale .35s var(--spring), background .2s, color .2s;
    &.armed { background: oklch(58% 0.2 25); color: white; opacity: 1; scale: 1.1; } }
  .card:hover .del, .del:focus-visible { opacity: 1; scale: 1; }
  .none { grid-column: 1 / -1; color: var(--muted); padding: 20px 0; }
  .mgr :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { to { rotate: 360deg; } }
  @keyframes shake { 20%, 60% { translate: -6px; } 40%, 80% { translate: 6px; } }
  @media (width < 760px) {
    .bar { flex-wrap: wrap; height: auto; padding-top: calc(env(safe-area-inset-top) + 10px); padding-bottom: 10px; row-gap: 8px; }
    .search { order: 5; flex-basis: 100%; max-width: none; margin: 0; }
    .acct { margin-left: auto; max-width: 160px; }
    .body { grid-template-columns: 1fr; gap: 20px; padding-top: 16px; }
    .now { position: static; }
    .art { height: 200px; }
    .all { grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .del { opacity: 1; scale: 1; }
  }
  @media (hover: none) { .del { opacity: 1; scale: 1; } }
</style>
