<script lang="ts">
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { Scan } from '@lucide/svelte';
  import Node from './Node.svelte';
  import Ruler from './Ruler.svelte';
  import { app, scope, scopeId, begin, edit, save, enter, ui, rollback } from '../lib/store.svelte';
  import { startDrag } from '../lib/drag.svelte';
  import { getRegion, setRegion, snap, symTargets, uses, xformN, xformRegion, sum } from '../lib/model';

  const b = $derived(scope());
  const isRoot = $derived(app.path.length === 0);
  const W = $derived(sum(b.cols)), H = $derived(sum(b.rows));
  const bw = $derived(isRoot && app.doc.settings.binding ? app.doc.settings.bindingWidth : 0);

  let stage: HTMLDivElement;
  let flash = $state('');
  // no words: a little shake says "can't do that"
  function say() { flash = 'no'; setTimeout(() => (flash = ''), 450); }

  /* ---------- what's under a point ---------- */
  function hitEl(t: Element | null) {
    const sc = t?.closest<HTMLElement>(`.cell[data-def="${CSS.escape(scopeId())}"]`);
    const rg = t?.closest<HTMLElement>('[data-r]');
    const inner = rg?.closest<HTMLElement>('.cell');
    return {
      idx: sc ? +sc.dataset.i! : -1,
      inner: inner && rg ? { def: inner.dataset.def!, i: +inner.dataset.i!, r: rg.dataset.r! } : null,
    };
  }
  const hitAt = (x: number, y: number) => hitEl(document.elementFromPoint(x, y));

  /* ---------- editing ---------- */
  function paintAt(idx: number) {
    const br = app.brush;
    if (br.k === 'inst' && uses(app.doc, br.ref, scopeId())) { say(); return; }
    for (const t of symTargets(b, idx, app.sym)) b.cells[t.i].c = xformN(snap(br), t.ts);
  }
  function recolor(h: NonNullable<ReturnType<typeof hitEl>['inner']>) {
    const def = app.doc.blocks[h.def];
    edit(() => {
      for (const t of symTargets(def, h.i, app.sym)) {
        const c = def.cells[t.i].c;
        def.cells[t.i].c = setRegion(c, xformRegion(c, h.r, t.ts), app.fabric);
      }
    });
  }
  const toggleSel = (i: number) => (app.sel = app.sel.includes(i) ? app.sel.filter(j => j !== i) : [...app.sel, i]);

  /* ---------- zoom & pan: pinch, two-finger drag, ctrl/⌘-scroll ---------- */
  let z = $state({ s: 1, x: 0, y: 0 });
  let settling = $state(false);
  const clampS = (s: number) => Math.min(8, Math.max(1, s));
  function zoomAround(px: number, py: number, s: number) {
    s = clampS(s);
    const k = s / z.s;
    z = s === 1 ? { s: 1, x: 0, y: 0 } : { s, x: px - (px - z.x) * k, y: py - (py - z.y) * k };
  }
  function fit() { settling = true; z = { s: 1, x: 0, y: 0 }; setTimeout(() => (settling = false), 400); }
  const local = (e: { clientX: number; clientY: number }) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function wheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const p = local(e);
      zoomAround(p.x, p.y, z.s * Math.exp(-e.deltaY * 0.01));
    } else if (z.s > 1) {
      e.preventDefault();
      z = { ...z, x: z.x - e.deltaX, y: z.y - e.deltaY };
    }
  }

  /* ---------- one pointer model for mouse, pen and fingers ---------- */
  const pts = new Map<number, { x: number; y: number }>();
  let painting = false, last = -1;
  let pinch: null | { d: number; mx: number; my: number; z: typeof z } = null;
  let pan: null | { x: number; y: number; z: typeof z } = null;
  let tap: null | { idx: number; x: number; y: number; long: boolean; mod: boolean } = null;
  let longTimer: ReturnType<typeof setTimeout> | undefined;
  let lastTap = { t: 0, idx: -2 };

  function startPinch() {
    const [a, c] = [...pts.values()];
    if (painting) { painting = false; rollback(); }   // the first finger's stroke was really the start of a pinch
    tap = null; pan = null; clearTimeout(longTimer);
    const m = local({ clientX: (a.x + c.x) / 2, clientY: (a.y + c.y) / 2 });
    pinch = { d: Math.hypot(a.x - c.x, a.y - c.y), mx: m.x, my: m.y, z: { ...z } };
  }

  function down(e: PointerEvent) {
    if (e.button > 0 || (e.target as Element).closest('.ruler, button, input')) return;
    ui.palette = false;
    try { stage.setPointerCapture(e.pointerId); } catch {}
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { startPinch(); return; }
    if (pts.size > 2) return;

    const h = hitAt(e.clientX, e.clientY);
    if (e.altKey && h.inner) {   // eyedropper
      const f = getRegion(app.doc.blocks[h.inner.def].cells[h.inner.i].c, h.inner.r);
      if (f) app.fabric = f;
      return;
    }
    if (app.tool === 'paint' && h.idx >= 0) {
      begin(); painting = true; last = h.idx; paintAt(h.idx);
      return;
    }
    if (app.tool === 'recolor' && h.inner) { recolor(h.inner); return; }
    if (app.tool === 'measure' && h.inner) { ui.measure = { def: h.inner.def, i: h.inner.i, x: e.clientX, y: e.clientY }; return; }

    // select tool (or empty space with any tool): decide on release whether it was a tap, a long-press or a drag
    tap = { idx: h.idx, x: e.clientX, y: e.clientY, long: false, mod: e.shiftKey || e.metaKey || e.ctrlKey };
    if (app.tool === 'select' && h.idx >= 0) {
      longTimer = setTimeout(() => {           // long-press: add to / remove from the selection
        if (!tap) return;
        tap.long = true; navigator.vibrate?.(10);
        toggleSel(tap.idx);
      }, 430);
    }
  }

  function move(e: PointerEvent) {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const [a, c] = [...pts.values()];
      const m = local({ clientX: (a.x + c.x) / 2, clientY: (a.y + c.y) / 2 });
      const s = clampS(pinch.z.s * Math.hypot(a.x - c.x, a.y - c.y) / pinch.d);
      const k = s / pinch.z.s;
      // keep the point between the fingers under the fingers, and follow them as they move
      z = s === 1 ? { s: 1, x: 0, y: 0 } : { s, x: m.x - (pinch.mx - pinch.z.x) * k, y: m.y - (pinch.my - pinch.z.y) * k };
      return;
    }
    if (painting) {
      const { idx } = hitAt(e.clientX, e.clientY);
      if (idx >= 0 && idx !== last) { last = idx; paintAt(idx); }
      return;
    }
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) {
      clearTimeout(longTimer);
      const c = tap.idx >= 0 ? b.cells[tap.idx]?.c : null;
      if (app.tool === 'select' && c && c.k !== 'empty' && pts.size === 1 && !tap.long) {
        startDrag(e.pointerId, e.clientX, e.clientY, c, tap.idx);
        tap = null;
        return;
      }
      if (z.s > 1 || tap.idx < 0) pan = { x: e.clientX, y: e.clientY, z: { ...z } };
      tap = null;
    }
    if (pan) z = { ...pan.z, x: pan.z.x + e.clientX - pan.x, y: pan.z.y + e.clientY - pan.y };
  }

  function up(e: PointerEvent) {
    pts.delete(e.pointerId);
    clearTimeout(longTimer);
    if (pinch) { if (pts.size < 2) pinch = null; if (z.s < 1.05) fit(); tap = null; return; }
    if (painting) { painting = false; save(); return; }
    pan = null;
    if (!tap || tap.long) { tap = null; return; }
    const t = tap; tap = null;
    const now = performance.now(), dbl = now - lastTap.t < 320 && lastTap.idx === t.idx;
    lastTap = { t: now, idx: t.idx };
    if (t.idx < 0) {                       // empty space
      if (dbl && z.s > 1) fit();
      app.sel = [];
      return;
    }
    if (app.tool !== 'select') return;
    if (dbl) {                             // double-tap a block: open it
      const c = b.cells[t.idx]?.c;
      if (c?.k === 'inst') { lastTap = { t: 0, idx: -2 }; enter(c.ref); return; }
    }
    if (t.mod) toggleSel(t.idx); else app.sel = [t.idx];
  }

  // a new block or quilt starts zoomed out
  $effect(() => { scopeId(); z = { s: 1, x: 0, y: 0 }; });
</script>

<div class="stage" bind:this={stage} class:shake={flash === 'no'} class:seams={app.doc.settings.seams} data-tool={app.tool}
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onwheel={wheel} role="application">
  <div class="zoom" class:settling style:transform="translate({z.x}px, {z.y}px) scale({z.s})">
    <div class="frame" style:--cw={W} style:--ch={H} style:--bw={bw}>
      <Ruler block={b} axis="col" />
      <Ruler block={b} axis="row" />
      <div class="quilt">
        {#if bw}<div class="binding f-{app.doc.settings.binding}"></div>{/if}
        <Node id={scopeId()} scope sel={app.sel} />
      </div>
    </div>
  </div>
  {#if z.s > 1.01}
    <button class="fit" title="Fit" onpointerdown={e => e.stopPropagation()} onclick={fit} transition:scale={{ start: 0.5, duration: 350, easing: backOut }}><Scan size={20} /></button>
  {/if}
</div>

<style>
  .stage {
    grid-area: stage; container-type: size; position: relative; overflow: hidden;
    background:
      radial-gradient(circle at 1px 1px, var(--line) 1.2px, transparent 0) 0 0 / 22px 22px,
      var(--bg);
    user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: none;
    &[data-tool=paint] { cursor: crosshair; }
    &[data-tool=recolor] { cursor: cell; }
    &[data-tool=measure] { cursor: help; }
    &.shake .quilt { animation: shake .4s var(--ease); }
  }
  .zoom { position: absolute; inset: 0; display: grid; place-items: center; transform-origin: 0 0; will-change: transform;
    &.settling { transition: transform .35s var(--ease); } }
  .frame {
    --ppi: min((100cqw - 120px) / (var(--cw) + 2 * var(--bw)), (100cqh - 110px) / (var(--ch) + 2 * var(--bw)));
    display: grid; grid-template-areas: ". top" "left q";
    grid-template-columns: 30px calc(var(--ppi) * var(--cw));
    grid-template-rows: 26px calc(var(--ppi) * var(--ch));
    gap: calc(var(--bw) * var(--ppi) + 8px);
    view-transition-name: canvas;
    @media (width < 760px), (height < 500px) {
      --ppi: min((100cqw - 48px) / (var(--cw) + 2 * var(--bw)), (100cqh - 56px) / (var(--ch) + 2 * var(--bw)));
      grid-template-columns: 20px calc(var(--ppi) * var(--cw));
      grid-template-rows: 20px calc(var(--ppi) * var(--ch));
      gap: calc(var(--bw) * var(--ppi) + 4px);
      translate: -10px -8px;
    }
  }
  .quilt { grid-area: q; position: relative; box-shadow: 0 2px 4px oklch(30% 0.04 50 / 10%), 0 16px 48px oklch(30% 0.04 50 / 18%); }
  .binding { position: absolute; inset: calc(-1 * var(--bw) * var(--ppi)); }
  .fit { position: absolute; right: 12px; bottom: 12px; width: 44px; height: 44px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 14px;
    background: var(--panel); box-shadow: var(--shadow); color: var(--ink); }
  @keyframes shake { 20%, 60% { translate: -6px; } 40%, 80% { translate: 6px; } }
</style>
