<script lang="ts">
  import { ui } from '../lib/store.svelte';
  // light up every copy of a piece where it sits on the quilt (tracks zoom/scroll while on)
  let rects = $state<DOMRect[]>([]);
  $effect(() => {
    const items = ui.glow;
    if (!items.length) { rects = []; return; }
    let raf = 0;
    const tick = () => {
      const out: DOMRect[] = [];
      for (const g of items)
        document.querySelectorAll<HTMLElement>(`.stage .cell[data-def="${CSS.escape(g.def)}"][data-i="${g.i}"]`).forEach(el => out.push(el.getBoundingClientRect()));
      rects = out;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  });
</script>

{#each rects as r, i (i)}
  <div class="glow" style:left="{r.left}px" style:top="{r.top}px" style:width="{r.width}px" style:height="{r.height}px"></div>
{/each}

<style>
  .glow {
    position: fixed; z-index: 15; pointer-events: none; border-radius: 2px;
    box-shadow: inset 0 0 0 2.5px oklch(70% 0.2 60), 0 0 0 2px oklch(70% 0.2 60 / 45%), 0 0 14px oklch(75% 0.2 70 / 70%);
    background: oklch(85% 0.17 85 / 28%);
    animation: pulse 1.1s ease-in-out infinite alternate;
  }
  @keyframes pulse { from { opacity: .55; } to { opacity: 1; } }
</style>
