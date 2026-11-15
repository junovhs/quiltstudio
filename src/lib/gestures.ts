/* Touch-friendly taps: double-tap and long-press work the same with a finger or a mouse.
 * Use as a Svelte action:  <div use:taps={{ double: fn, long: fn }}>  */
export interface TapOpts { double?: (e: PointerEvent) => void; long?: (e: PointerEvent) => void }

export function taps(node: HTMLElement, opts: TapOpts) {
  let last = 0, lx = 0, ly = 0, timer: ReturnType<typeof setTimeout> | undefined, longFired = false;
  const down = (e: PointerEvent) => {
    if (e.button > 0) return;
    longFired = false;
    if (opts.long) timer = setTimeout(() => { longFired = true; navigator.vibrate?.(12); opts.long!(e); }, 480);
    const now = performance.now();
    if (opts.double && now - last < 320 && Math.hypot(e.clientX - lx, e.clientY - ly) < 30) {
      last = 0; clearTimeout(timer); opts.double(e);
    } else { last = now; lx = e.clientX; ly = e.clientY; }
  };
  const cancel = () => clearTimeout(timer);
  const move = (e: PointerEvent) => { if (Math.hypot(e.clientX - lx, e.clientY - ly) > 10) cancel(); };
  // after a long-press, swallow the click that follows
  const click = (e: MouseEvent) => { if (longFired) { e.stopPropagation(); e.preventDefault(); longFired = false; } };
  const ctx = (e: Event) => { if (opts.long) e.preventDefault(); };
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('pointermove', move);
  node.addEventListener('click', click, true);
  node.addEventListener('contextmenu', ctx);
  return {
    update(o: TapOpts) { opts = o; },
    destroy() {
      node.removeEventListener('pointerdown', down); node.removeEventListener('pointerup', cancel);
      node.removeEventListener('pointercancel', cancel); node.removeEventListener('pointermove', move);
      node.removeEventListener('click', click, true); node.removeEventListener('contextmenu', ctx);
    },
  };
}
