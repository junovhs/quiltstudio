<script lang="ts">
  import type { Content } from '../lib/model';
  let { c }: { c: Content } = $props();
  const HST = { tl: '0 0,100% 0,0 100%', tr: '0 0,100% 0,100% 100%', br: '100% 0,100% 100%,0 100%', bl: '0 0,0 100%,100% 100%' };
  const QST = ['0 0,100% 0,50% 50%', '100% 0,100% 100%,50% 50%', '0 100%,100% 100%,50% 50%', '0 0,0 100%,50% 50%'];
  const GOOSE = { up: '0 100%,100% 100%,50% 0', down: '0 0,100% 0,50% 100%', left: '100% 0,100% 100%,0 50%', right: '0 0,0 100%,100% 50%' };
</script>

{#if c.k === 'solid'}
  <div class="rg f-{c.f}" data-r="f"></div>
{:else if c.k === 'hst'}
  <div class="rg f-{c.b}" data-r="b"></div>
  <div class="rg f-{c.a}" data-r="a" style:clip-path="polygon({HST[c.corner]})"></div>
{:else if c.k === 'qst'}
  <div class="rg f-{c.f[0]}" data-r="0"></div>
  {#each [1, 2, 3] as r}
    <div class="rg f-{c.f[r]}" data-r={r} style:clip-path="polygon({QST[r]})"></div>
  {/each}
  <div class="rg f-{c.f[0]}" data-r="0" style:clip-path="polygon({QST[0]})"></div>
{:else if c.k === 'goose'}
  <div class="rg f-{c.s}" data-r="s"></div>
  <div class="rg f-{c.g}" data-r="g" style:clip-path="polygon({GOOSE[c.dir]})"></div>
{:else}
  <div class="rg empty-fill" data-r="e"></div>
{/if}
