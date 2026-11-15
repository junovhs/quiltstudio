/** Ported from dawndishsoap's viewport-layout.ts: a resumed PWA can report a stale
 * visual viewport. Only a focused editor and a substantial reduction imply a keyboard. */
export function hasOpenKeyboard(editing: boolean, layout: number, visible: number) {
  return editing && Number.isFinite(layout) && Number.isFinite(visible) && layout > 0 && visible > 0 && layout - visible > 150 && visible < layout * .82;
}

export function installViewport() {
  const root = document.documentElement, viewport = window.visualViewport;
  const sync = () => {
    const focus = document.activeElement;
    const editing = focus instanceof HTMLElement && (focus.matches('input, textarea, select') || focus.isContentEditable);
    const open = !!viewport && hasOpenKeyboard(editing, Math.max(innerHeight, root.clientHeight), viewport.height);
    root.toggleAttribute('data-keyboard-open', open);
    if (open && viewport) {
      root.style.setProperty('--app-height', `${Math.round(viewport.height)}px`);
      root.style.setProperty('--app-offset', `${Math.round(viewport.offsetTop)}px`);
    } else { root.style.removeProperty('--app-height'); root.style.removeProperty('--app-offset'); }
  };
  const focus = () => requestAnimationFrame(sync);
  const events = ['resize', 'orientationchange', 'pageshow', 'focusin', 'focusout'];
  events.forEach(e => window.addEventListener(e, focus));
  document.addEventListener('visibilitychange', sync);
  viewport?.addEventListener('resize', sync); viewport?.addEventListener('scroll', sync); sync();
  return () => {
    events.forEach(e => window.removeEventListener(e, focus)); document.removeEventListener('visibilitychange', sync);
    viewport?.removeEventListener('resize', sync); viewport?.removeEventListener('scroll', sync);
  };
}
