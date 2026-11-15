/* Swipe-down-to-close for bottom sheets. Put it on the sheet; dragging starts from
 * any element marked [data-grab] (the handle / header). */
export function swipeClose(node: HTMLElement, opts: { close: () => void; axis?: 'y' | 'x-left' | 'x-right' }) {
  let start = 0, t0 = 0, d = 0, dragging = false, id = -1;
  const axis = () => opts.axis ?? 'y';
  const pos = (e: PointerEvent) => (axis() === 'y' ? e.clientY : e.clientX);
  const sign = () => (axis() === 'x-left' ? -1 : 1);
  const down = (e: PointerEvent) => {
    if (!(e.target as Element).closest('[data-grab]') || (e.target as Element).closest('input, button:not([data-grab])')) return;
    dragging = true; id = e.pointerId; start = pos(e); t0 = performance.now(); d = 0;
    node.setPointerCapture(e.pointerId);
    node.style.transition = 'none';
  };
  const move = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== id) return;
    d = Math.max(0, (pos(e) - start) * sign());
    node.style.translate = axis() === 'y' ? `0 ${d}px` : `${d * sign()}px 0`;
  };
  const up = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== id) return;
    dragging = false;
    const v = d / Math.max(1, performance.now() - t0);
    node.style.transition = '';
    node.style.translate = '';
    if (d > 110 || v > 0.6) opts.close();
  };
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
  return {
    update(o: typeof opts) { opts = o; },
    destroy() {
      node.removeEventListener('pointerdown', down); node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up);
    },
  };
}

/** true on phones (portrait) — used to pick slide directions */
export const isPhone = () => matchMedia('(width < 760px)').matches;
export const isCompact = () => matchMedia('(width < 760px), (height < 500px)').matches;
