<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { picker, closePicker } from '../lib/picker.svelte';
  function pick(id: string) { picker.cb?.(id); app.fabric = id; closePicker(); }
</script>

<div popover id="picker">
  <div class="grid">
    {#each app.doc.fabrics as f (f.id)}
      <button class="sw f-{f.id}" class:on={picker.current === f.id} title={f.name} onclick={() => pick(f.id)}></button>
    {/each}
  </div>
</div>

<style>
  #picker { inset: auto; position-anchor: --pick; position-area: bottom span-right; position-try-fallbacks: flip-block, flip-inline; margin: 6px; padding: 8px; }
  .grid { display: grid; grid-template-columns: repeat(5, 30px); gap: 6px; }
  .sw { width: 30px; height: 30px; padding: 0; border-radius: 7px; border: 1px solid oklch(0% 0 0 / 15%);
    &:hover { scale: 1.08; } &.on { box-shadow: 0 0 0 2px var(--accent); } transition: scale .1s; }
</style>
