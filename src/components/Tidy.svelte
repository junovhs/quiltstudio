<script lang="ts">
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { Wand2, Lock, LockOpen, House } from '@lucide/svelte';
  import Thumb from './Thumb.svelte';
  import { app, edit, stats } from '../lib/store.svelte';
  import { fmt } from '../lib/calc';
  import { tidy, untidyCount } from '../lib/tidy';

  let step = $state(0.25);
  let lockTotal = $state(true);
  const STEPS = [0.125, 0.25, 0.5, 1];
  const a = $derived(stats());
  const blocks = $derived(a.order);
  // how many rows/columns would change
  const todo = $derived(untidyCount(app.doc, step));
  let done = $state(0);

  function apply() {
    edit(() => tidy(app.doc, { step, lockTotal }));
    done++;
  }
  const toggleLock = (id: string) => edit(() => { const b = app.doc.blocks[id]; b.locked = !b.locked; });
</script>

<div popover id="tidy">
  <div class="tidy">
    <!-- step: what counts as a "normal" size -->
    <div class="steps" title="Snap to">
      {#each STEPS as s}
        <button class:on={step === s} onclick={() => (step = s)}>
          <span class="sq" style:--s={s}></span>{fmt(s)}
        </button>
      {/each}
    </div>

    <!-- keep the whole quilt the same size -->
    <button class="total" class:on={lockTotal} title="Keep the quilt's size" onclick={() => (lockTotal = !lockTotal)}>
      <House size={16} />
      <b>{fmt(a.size.w, '')} × {fmt(a.size.h)}</b>
      {#if lockTotal}<Lock size={16} />{:else}<LockOpen size={16} />{/if}
    </button>

    <!-- lock blocks you're happy with -->
    <div class="locks">
      {#each blocks as id (id)}
        {@const b = app.doc.blocks[id]}
        <button class="blk" class:locked={b.locked} title={b.locked ? 'Locked: tidy leaves it alone' : 'Tap to lock its size'} onclick={() => toggleLock(id)}>
          <span class="art"><Thumb {id} /></span>
          <span class="lk">{#if b.locked}<Lock size={11} strokeWidth={3} />{:else}<LockOpen size={11} strokeWidth={2.5} />{/if}</span>
        </button>
      {/each}
    </div>

    <button class="go" disabled={!todo} onclick={apply}>
      {#key done}<span in:scale={{ start: 0.4, duration: 500, easing: backOut }}><Wand2 size={19} /></span>{/key}
      {#if todo}<span class="n">{todo}</span>{/if}
    </button>
  </div>
</div>

<style>
  #tidy { inset: auto; top: calc(60px + env(safe-area-inset-top)); right: 12px; width: 300px; padding: 14px; }
  @media (width < 760px) { #tidy { right: 8px; left: 8px; width: auto; } }
  .tidy { display: grid; gap: 14px; }
  .steps { display: flex; gap: 2px; background: var(--sunk); padding: 3px; border-radius: 12px;
    button { flex: 1; border: 0; background: transparent; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 0 4px; font-weight: 700; font-size: 12px; }
    button.on { background: var(--panel); color: var(--accent); box-shadow: var(--shadow); }
    .sq { width: calc(6px + var(--s) * 16px); aspect-ratio: 1; border-radius: 2px; background: currentColor; opacity: .7; } }
  .total { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: 0; border-radius: 12px; background: var(--sunk); color: var(--muted);
    b { flex: 1; text-align: left; color: var(--ink); font-size: 15px; }
    &.on { background: var(--accent-soft); color: var(--accent); } }
  .locks { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .blk { position: relative; aspect-ratio: 1; padding: 6px; border: 0; border-radius: 10px; background: var(--sunk); transition: box-shadow .2s, scale .35s var(--spring);
    &.locked { box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--ink); } }
  .art { display: block; width: 100%; height: 100%; }
  .lk { position: absolute; right: -5px; bottom: -5px; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
    background: var(--panel); color: var(--muted); box-shadow: var(--shadow); transition: background .2s, color .2s;
    .locked & { background: var(--ink); color: var(--panel); } }
  .go { display: flex; align-items: center; justify-content: center; gap: 10px; height: 46px; border: 0; border-radius: 99px; background: var(--accent); color: white; font-size: 16px;
    box-shadow: 0 6px 18px oklch(from var(--accent) l c h / 35%);
    .n { min-width: 24px; padding: 0 7px; border-radius: 99px; background: oklch(100% 0 0 / 25%); font-weight: 800; font-size: 13px; } }
</style>
