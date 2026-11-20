<script lang="ts">
  import { scale } from 'svelte/transition';
  import { untrack } from 'svelte';
  import { backOut } from 'svelte/easing';
  import { Scan } from '@lucide/svelte';
  import Node from './Node.svelte';
  import Ruler from './Ruler.svelte';
  import { app, scope, scopeId, begin, edit, save, enter, goTo, ui, rollback } from '../lib/store.svelte';
  import { startDrag } from '../lib/drag.svelte';
  import { frameOf as frame, lines } from '../lib/fit';
  import { carveBox, getRegion, setRegion, snap, symTargets, uses, xformN, xformRegion, sum, type Box } from '../lib/model';

  const b = $derived(scope());
  // in place: the whole quilt stays on screen and only the open block's pieces are live
  const topId = $derived(app.inPlace ? app.doc.root : scopeId());
  const top = $derived(app.doc.blocks[topId] ?? b);
  const isRoot = $derived(topId === app.doc.root);
  const W = $derived(sum(top.cols)), H = $derived(sum(top.rows));
  const bw = $derived(isRoot && app.doc.settings.binding ? app.doc.settings.bindingWidth : 0);

  let stage: HTMLDivElement;
  let flash = $state('');
  // no words: a little shake says "can't do that"
  function say() { flash = 'no'; ui.notice = 'That edit does not fit the current layout or size locks. Check the selected piece and its locks, or choose a different position.'; setTimeout(() => (flash = ''), 450); }

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

  /* ---------- where things are: screen <-> the open block's own inches ----------
   * A copy of the block may sit turned or flipped inside others; each .grid knows how its copy is
   * turned (data-rot / data-flip), so compose those to map the screen back onto the block's grid. */
  const frameOf = (grid: HTMLElement) => frame(grid, W2(), H2());
  const W2 = () => sum(b.cols), H2 = () => sum(b.rows);
  const scopeGrids = () => [...stage.querySelectorAll<HTMLElement>(`.grid.scope`)];

  /* ---------- marquee: drag out a box, it snaps to the grid lines ---------- */
  let marq = $state<null | { x0: number; y0: number; x1: number; y1: number; add: boolean; box: Box | null; snapRect: { l: number; t: number; w: number; h: number } | null }>(null);
  const overlap = (r: DOMRect, x0: number, y0: number, x1: number, y1: number) =>
    Math.max(0, Math.min(r.right, Math.max(x0, x1)) - Math.max(r.left, Math.min(x0, x1))) * Math.max(0, Math.min(r.bottom, Math.max(y0, y1)) - Math.max(r.top, Math.min(y0, y1)));
  function snapIdx(L: number[], a: number, z: number) {
    const near = (v: number) => L.reduce((bi, p, i) => (Math.abs(p - v) < Math.abs(L[bi] - v) ? i : bi), 0);
    let i0 = near(Math.min(a, z)), i1 = near(Math.max(a, z));
    if (i1 <= i0) { const mid = (a + z) / 2; i0 = Math.max(0, L.findIndex(p => p > mid) - 1); if (i0 < 0 || i0 >= L.length - 1) i0 = L.length - 2; i1 = i0 + 1; }
    return [i0, i1];
  }
  function marqueeUpdate() {
    if (!marq) return;
    const { x0, y0, x1, y1 } = marq;
    const grid = scopeGrids().map(g => ({ g, o: overlap(g.getBoundingClientRect(), x0, y0, x1, y1) })).filter(v => v.o > 0).sort((p, q) => q.o - p.o)[0]?.g;
    if (!grid) { marq.box = null; marq.snapRect = null; return; }
    const f = frameOf(grid);
    const a = f.toLocal(x0, y0), z = f.toLocal(x1, y1);
    const clampX = (v: number) => Math.min(W2(), Math.max(0, v)), clampY = (v: number) => Math.min(H2(), Math.max(0, v));
    const [bx0, bx1] = snapIdx(lines(b.cols), clampX(a.x), clampX(z.x));
    const [by0, by1] = snapIdx(lines(b.rows), clampY(a.y), clampY(z.y));
    // what it will really take: pieces that can't be cut make the box grow
    const trial = carveBox(snap(b), { x0: bx0, y0: by0, x1: bx1, y1: by1 }).box;
    marq.box = trial;
    const Lc = lines(b.cols), Lr = lines(b.rows), sr = stage.getBoundingClientRect();
    const p = f.toScreen(Lc[trial.x0], Lr[trial.y0]), q = f.toScreen(Lc[trial.x1], Lr[trial.y1]);
    marq.snapRect = { l: Math.min(p.x, q.x) - sr.left, t: Math.min(p.y, q.y) - sr.top, w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) };
  }
  function marqueeEnd() {
    const m = marq; marq = null;
    if (!m?.box) { if (!m?.add) app.sel = []; return; }
    const box = m.box;
    const trial = snap(b); carveBox(trial, box);
    const pick = (cells: number[]) => (app.sel = m.add ? [...new Set([...app.sel, ...cells])] : cells);
    if (trial.cells.length === b.cells.length) pick(carveBox(b, box).cells);   // nothing to cut: just select
    else edit(() => pick(carveBox(b, box).cells));
  }

  /* ---------- zoom & pan: pinch, two-finger drag, ctrl/⌘-scroll ---------- */
  let z = $state({ s: 1, x: 0, y: 0 });
  let settling = $state(false);
  const clampS = (s: number) => Math.min(8, Math.max(1, s));
  function zoomAround(px: number, py: number, s: number) {
    s = clampS(s);
    const k = s / z.s;
    z = s === 1 ? { s: 1, x: 0, y: 0 } : { s, x: px - (px - z.x) * k, y: py - (py - z.y) * k };
  }
  /* the zoom only re-fits when YOU ask (or open another block) — never because an edit changed the
     quilt's size, otherwise a locked 20″ block would look like it grew when the quilt around it shrank */
  let fitW = $state(untrack(() => W)), fitH = $state(untrack(() => H));
  const refit = () => { fitW = W; fitH = H; };
  const offFit = $derived(Math.abs(fitW - W) > 1e-6 || Math.abs(fitH - H) > 1e-6);
  function fit() { settling = true; z = { s: 1, x: 0, y: 0 }; refit(); setTimeout(() => (settling = false), 400); }
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
  let tap: null | { idx: number; x: number; y: number; long: boolean; mod: boolean; marquee: boolean } = null;
  let spaceHeld = false;
  let longTimer: ReturnType<typeof setTimeout> | undefined;
  let lastTap = { t: 0, idx: -2 };

  function startPinch() {
    const [a, c] = [...pts.values()];
    if (painting) { painting = false; rollback(); }   // the first finger's stroke was really the start of a pinch
    tap = null; pan = null; marq = null; clearTimeout(longTimer);
    const m = local({ clientX: (a.x + c.x) / 2, clientY: (a.y + c.y) / 2 });
    pinch = { d: Math.hypot(a.x - c.x, a.y - c.y), mx: m.x, my: m.y, z: { ...z } };
  }

  function down(e: PointerEvent) {
    if (e.button > 1 || (e.target as Element).closest('.ruler, button, input')) return;
    ui.palette = false;
    try { stage.setPointerCapture(e.pointerId); } catch {}
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { startPinch(); return; }
    if (pts.size > 2) return;
    // space-drag or middle-button drag: move around
    if (e.button === 1 || spaceHeld) { e.preventDefault(); pan = { x: e.clientX, y: e.clientY, z: { ...z } }; return; }

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
    // press on a selected piece and drag = move it; press anywhere else and drag = draw a selection box
    const mod = e.shiftKey || e.metaKey || e.ctrlKey;
    tap = { idx: h.idx, x: e.clientX, y: e.clientY, long: false, mod, marquee: app.tool === 'select' && (mod || !app.sel.includes(h.idx)) };
    if (app.tool === 'select' && h.idx >= 0 && e.pointerType === 'touch') {
      longTimer = setTimeout(() => {           // long-press: add to / remove from the selection
        if (!tap) return;
        tap.long = true; navigator.vibrate?.(10);
        toggleSel(tap.idx);
      }, 430);
    }
  }

  function move(e: PointerEvent) {
    if (!pts.has(e.pointerId)) return;
    if (marq) { marq.x1 = e.clientX; marq.y1 = e.clientY; marqueeUpdate(); return; }
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
      if (tap.marquee && pts.size === 1 && !tap.long) {
        marq = { x0: tap.x, y0: tap.y, x1: e.clientX, y1: e.clientY, add: tap.mod, box: null, snapRect: null };
        tap = null; marqueeUpdate();
        return;
      }
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
    if (marq) { if (e.type === 'pointercancel') marq = null; else { marq.x1 = e.clientX; marq.y1 = e.clientY; marqueeUpdate(); marqueeEnd(); } return; }
    pan = null;
    if (!tap || tap.long) { tap = null; return; }
    const t = tap; tap = null;
    const now = performance.now(), dbl = now - lastTap.t < 320 && lastTap.idx === t.idx;
    lastTap = { t: now, idx: t.idx };
    if (t.idx < 0) {                       // empty space (or, in place, the rest of the quilt)
      if (dbl && app.inPlace && app.path.length) { lastTap = { t: 0, idx: -2 }; goTo(app.path.length - 1); return; }
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

  // a new block or quilt starts zoomed out (opening one in place keeps the view where it is)
  $effect(() => { topId; untrack(() => { z = { s: 1, x: 0, y: 0 }; refit(); }); });
  function keys(e: KeyboardEvent) {
    if (e.key !== ' ' || (e.target as HTMLElement).closest?.('input, textarea, select')) return;
    spaceHeld = e.type === 'keydown';
    if (spaceHeld) e.preventDefault();
  }
</script>

<svelte:window onkeydown={keys} onkeyup={keys} onblur={() => (spaceHeld = false)} />
<div class="stage" bind:this={stage} class:shake={flash === 'no'} class:seams={app.doc.settings.seams} class:inplace={app.inPlace && app.path.length > 0} data-tool={app.tool}
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onwheel={wheel} role="application">
  <div class="zoom" class:settling style:transform="translate({z.x}px, {z.y}px) scale({z.s})">
    <div class="frame" style:--cw={W} style:--ch={H} style:--fw={fitW} style:--fh={fitH} style:--bw={bw}>
      {#if !app.inPlace || !app.path.length}
        <Ruler block={b} axis="col" />
        <Ruler block={b} axis="row" />
      {/if}
      <div class="quilt">
        {#if bw}<div class="binding f-{app.doc.settings.binding}"></div>{/if}
        <Node id={topId} />
        {#if isRoot && app.doc.reference?.visible}<img class="tracing-reference" src={app.doc.reference.image} alt="Tracing reference" style:opacity={app.doc.reference.opacity} />{/if}
      </div>
    </div>
  </div>
  {#if marq}
    {@const sr = stage.getBoundingClientRect()}
    <div class="marq" style:left="{Math.min(marq.x0, marq.x1) - sr.left}px" style:top="{Math.min(marq.y0, marq.y1) - sr.top}px"
      style:width="{Math.abs(marq.x1 - marq.x0)}px" style:height="{Math.abs(marq.y1 - marq.y0)}px"></div>
    {#if marq.snapRect}<div class="snapbox" style:left="{marq.snapRect.l}px" style:top="{marq.snapRect.t}px" style:width="{marq.snapRect.w}px" style:height="{marq.snapRect.h}px"></div>{/if}
  {/if}
  {#if app.inPlace && app.path.length}
    <button class="done" onpointerdown={e => e.stopPropagation()} onclick={() => goTo(app.path.length - 1)} transition:scale={{ start: 0.6, duration: 300, easing: backOut }}>Done editing block</button>
  {/if}
  {#if z.s > 1.01 || offFit}
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
    --ppi: min((100cqw - 120px) / (var(--fw) + 2 * var(--bw)), (100cqh - 110px) / (var(--fh) + 2 * var(--bw)));
    display: grid; grid-template-areas: ". top" "left q";
    grid-template-columns: 30px calc(var(--ppi) * var(--cw));
    grid-template-rows: 26px calc(var(--ppi) * var(--ch));
    gap: calc(var(--bw) * var(--ppi) + 8px);
    view-transition-name: canvas;
    @media (width < 760px), (height < 500px) {
      --ppi: min((100cqw - 48px) / (var(--fw) + 2 * var(--bw)), (100cqh - 56px) / (var(--fh) + 2 * var(--bw)));
      grid-template-columns: 20px calc(var(--ppi) * var(--cw));
      grid-template-rows: 20px calc(var(--ppi) * var(--ch));
      gap: calc(var(--bw) * var(--ppi) + 4px);
      translate: -10px -8px;
    }
  }
  .quilt { grid-area: q; position: relative; box-shadow: 0 2px 4px oklch(30% 0.04 50 / 10%), 0 16px 48px oklch(30% 0.04 50 / 18%); }
  .binding { position: absolute; inset: calc(-1 * var(--bw) * var(--ppi)); }
  .tracing-reference { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
  .fit { position: absolute; right: 12px; bottom: 12px; width: 44px; height: 44px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 14px;
    background: var(--panel); box-shadow: var(--shadow); color: var(--ink); }
  .marq { position: absolute; pointer-events: none; border: 1.5px dashed var(--accent); border-radius: 2px; }
  .snapbox { position: absolute; pointer-events: none; background: oklch(from var(--accent) l c h / 18%); box-shadow: inset 0 0 0 3px var(--accent); transition: all .12s var(--ease); }
  /* in place: everything but the open block's copies fades back */
  .inplace .quilt :global(.rg), .inplace .binding { opacity: .28; filter: saturate(.4); transition: opacity .3s, filter .3s; }
  .inplace .quilt :global(.grid.scope .rg) { opacity: 1; filter: none; }
  .inplace .quilt :global(.grid.scope) { outline: 2px solid var(--accent); outline-offset: 1px; }
  .done { position: absolute; left: 50%; bottom: 14px; translate: -50%; padding: 9px 16px; border: 0; border-radius: 99px; background: var(--accent); color: white; font-weight: 700; box-shadow: var(--shadow); }
  @keyframes shake { 20%, 60% { translate: -6px; } 40%, 80% { translate: 6px; } }
</style>
