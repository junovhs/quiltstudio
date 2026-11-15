# ADR 003: Svelte PWA with sibling iPhone shell patterns

Status: Accepted. 2026-11-15. Related: ISS-04, ISS-08.

## Context
The user specifies an iPhone app experience delivered as a website/PWA and names the sibling dawndishsoap repository as the app-shell reference.

## Decision
Keep QuiltStudio's Svelte implementation and offline service worker. Port keyboard-aware visual viewport detection and foreground/orientation recovery from dawndishsoap. Use inline camera video, release tracks on exit/backgrounding, and retain a captured frame across interruption. Keep camera and measurement work local.

## Why and alternatives
Copying the entire sibling Next.js app introduces unrelated architecture and its push-only worker would replace needed offline behavior. Unconditionally reloading on resume can discard a measurement. The selected patterns address layout and lifecycle concerns without replacing the application.

## Consequences
Camera and photo sheets must be checked on installed iPhone Home Screen apps, including denial, resume, orientation changes and keyboard entry. Browser simulation validates UI behavior but cannot establish actual iOS camera behavior. Physical-device checks remain tracked in ISS-05.
