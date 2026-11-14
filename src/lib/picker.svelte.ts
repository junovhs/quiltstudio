/* One shared fabric-picker popover, anchored to whatever opened it. */
export const picker = $state({ cb: null as null | ((id: string) => void), current: null as string | null, tick: 0 });
let anchor: HTMLElement | null = null;
export const supportsAnchor = typeof CSS !== 'undefined' && CSS.supports('anchor-name: --a');

export function openPicker(el: HTMLElement, current: string | null, cb: (id: string) => void) {
  if (anchor) anchor.style.removeProperty('anchor-name');
  anchor = el;
  el.style.setProperty('anchor-name', '--pick');
  picker.cb = cb; picker.current = current; picker.tick++;
  const pop = document.getElementById('picker') as HTMLElement & { showPopover(): void };
  if (!supportsAnchor) {
    const r = el.getBoundingClientRect();
    pop.style.left = Math.min(r.left, innerWidth - 260) + 'px';
    pop.style.top = r.bottom + 6 + 'px';
  }
  pop.showPopover();
}
export function closePicker() {
  (document.getElementById('picker') as any)?.hidePopover?.();
}
