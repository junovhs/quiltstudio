<script lang="ts">
  import Node from './Node.svelte';
  import { app } from '../lib/store.svelte';
  import { sum } from '../lib/model';
  let { id, rot = 0, flip = false }: { id: string; rot?: number; flip?: boolean } = $props();
  const b = $derived(app.doc.blocks[id]);
  const ar = $derived(b ? sum(b.cols) / sum(b.rows) : 1);
</script>

<!-- a block drawn as large as it fits, keeping its shape -->
<div class="t">
  <div class="fit" class:odd={rot % 2 === 1} style:--ar={ar} style:rotate="{rot * 90}deg" style:scale="{flip ? -1 : 1} 1">
    <Node {id} />
  </div>
</div>

<style>
  .t { width: 100%; height: 100%; container-type: size; position: relative; }
  .fit {
    position: absolute; left: 50%; top: 50%; translate: -50% -50%;
    width: min(100cqw, 100cqh * var(--ar)); aspect-ratio: var(--ar);
    box-shadow: 0 1px 3px oklch(30% 0.04 50 / 18%);
    transition: rotate .4s var(--spring), scale .4s var(--spring);
    &.odd { width: min(100cqh, 100cqw * var(--ar)); }
  }
</style>
