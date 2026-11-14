# QuiltStudio

A quilt designer. Everything is built from simple pieces: squares, half-square
triangles and quarter-square triangles, grouped into blocks, which are grouped into
bigger blocks, which make up the quilt. Edit a block once and every copy of it updates.
Yardage, cut list and sewing order are worked out from the design.

Live: https://quiltstudio-34v.pages.dev

```
npm install
npm run dev       # local editor
npm run deploy    # build + deploy to Cloudflare Pages (project "quiltstudio")
```

Stack: Svelte 5 + TypeScript + Vite, modern CSS (container queries, anchor positioning,
popover API, view transitions, oklch/light-dark, @property). Designs save in the browser;
fabric photos are stored in IndexedDB. Export/import from the ⚙ menu.
