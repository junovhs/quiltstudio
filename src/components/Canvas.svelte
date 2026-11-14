<script lang="ts">
    import Node from './Node.svelte';
  import Ruler from './Ruler.svelte';
  import { app, scope, scopeId, begin, edit, save, enter } from '../lib/store.svelte';
  import { getRegion, setRegion, snap, symTargets, uses, xformN, xformRegion, sum } from '../lib/model';

  const b = $derived(scope());
  const isRoot = $derived(app.path.length === 0);
  const W = $derived(sum(b.cols)), H = $derived(sum(b.rows));
  const bw = $derived(isRoot && app.doc.settings.binding ? app.doc.settings.bindingWidth : 0);

  let painting = false, last = -1;
  let flash = $state('');

  function hit(e: Event) {
    const t = e.target as Element;
    const sc = t.closest<HTMLElement>(`.cell[data-def="${CSS.escape(scopeId())}"]`);
    const rg = t.closest<HTMLElement>('[data-r]');
    const inner = rg?.closest<HTMLElement>('.cell');
    return {
      idx: sc ? +sc.dataset.i! : -1,
      inner: inner && rg ? { def: inner.dataset.def!, i: +inner.dataset.i!, r: rg.dataset.r! } : null,
    };
  }

  function say(msg: string) { flash = msg; setTimeout(() => (flash = ''), 2200); }

  function paintAt(idx: number) {
    const br = app.brush;
    if (br.k === 'inst' && uses(app.doc, br.ref, scopeId())) { say("A block can't contain itself."); return; }
    for (const t of symTargets(b, idx, app.sym)) b.cells[t.i].c = xformN(snap(br), t.ts);
  }

  function recolor(h: NonNullable<ReturnType<typeof hit>['inner']>) {
    const def = app.doc.blocks[h.def];
    edit(() => {
      for (const t of symTargets(def, h.i, app.sym)) {
        const c = def.cells[t.i].c;
        def.cells[t.i].c = setRegion(c, xformRegion(c, h.r, t.ts), app.fabric);
      }
    });
    if (h.def !== scopeId()) say(`Recoloured inside “${def.name}”: every copy changes.`);
  }

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    const h = hit(e);
    if (e.altKey && h.inner) {   // eyedropper
      const c = app.doc.blocks[h.inner.def].cells[h.inner.i].c;
      const f = getRegion(c, h.inner.r); if (f) app.fabric = f;
      return;
    }
    if (app.tool === 'recolor') { if (h.inner) recolor(h.inner); return; }
    if (h.idx < 0) { app.sel = []; return; }
    if (app.tool === 'paint') {
      begin(); painting = true; last = h.idx; paintAt(h.idx);
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }
    if (e.shiftKey || e.metaKey || e.ctrlKey)
      app.sel = app.sel.includes(h.idx) ? app.sel.filter(i => i !== h.idx) : [...app.sel, h.idx];
    else app.sel = [h.idx];
  }
  function move(e: PointerEvent) {
    if (!painting) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    const { idx } = hit({ target: el } as unknown as Event);
    if (idx >= 0 && idx !== last) { last = idx; paintAt(idx); }
  }
  function up() { if (painting) { painting = false; save(); } }

  function dbl(e: MouseEvent) {
    const { idx } = hit(e);
    const c = b.cells[idx]?.c;
    if (c?.k === 'inst') enter(c.ref);
  }
</script>

<div class="stage" class:seams={app.doc.settings.seams} data-tool={app.tool}
  onpointerdown={down} onpointermove={move} onpointerup={up} ondblclick={dbl} role="application">
  <div class="frame" style:--cw={W} style:--ch={H} style:--bw={bw}>
    <Ruler block={b} axis="col" />
    <Ruler block={b} axis="row" />
    <div class="quilt">
      {#if bw}<div class="binding f-{app.doc.settings.binding}"></div>{/if}
      <Node id={scopeId()} scope sel={app.sel} />
    </div>
  </div>
  {#if flash}<div class="flash">{flash}</div>{/if}
</div>

<style>
  .stage {
    grid-area: stage; container-type: size; position: relative; display: grid; place-items: center;
    background:
      radial-gradient(circle at 1px 1px, var(--line) 1px, transparent 0) 0 0 / 18px 18px,
      var(--sunk);
    user-select: none; touch-action: none;
    &[data-tool=paint] { cursor: crosshair; }
    &[data-tool=recolor] { cursor: cell; }
  }
  .frame {
    --ppi: min((100cqw - 120px) / (var(--cw) + 2 * var(--bw)), (100cqh - 110px) / (var(--ch) + 2 * var(--bw)));
    display: grid; grid-template-areas: ". top" "left q";
    grid-template-columns: 30px calc(var(--ppi) * var(--cw));
    grid-template-rows: 26px calc(var(--ppi) * var(--ch));
    gap: calc(var(--bw) * var(--ppi) + 8px);
    view-transition-name: canvas;
  }
  .quilt { grid-area: q; position: relative; box-shadow: 0 10px 40px oklch(0% 0 0 / 20%); }
  .binding { position: absolute; inset: calc(-1 * var(--bw) * var(--ppi)); }
  .flash {
    position: absolute; bottom: 16px; left: 50%; translate: -50%; padding: 6px 12px; border-radius: 99px;
    background: var(--ink); color: var(--bg); font-size: 12.5px; pointer-events: none;
    animation: pop .2s var(--ease);
  }
  @keyframes pop { from { opacity: 0; translate: -50% 6px; } }
</style>
