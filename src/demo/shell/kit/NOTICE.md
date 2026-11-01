# Stageshow kit (vendored)

`window.tsx`, `window.css`, `phone.tsx`, `phone.css` and `looks.ts` are copied from the
Stageshow kit (MIT, Copyright (c) 2026 Benji Taylor; see `LICENSE` in this folder).
`tokens.css` is the token block of the kit's `stage.css`, without the stage's own positioning.

Changes from upstream: a license header on each file; the CSS is not wrapped in
`@layer stageshow` (the app's unlayered Tailwind preflight would otherwise win over it);
`IPHONE`, `CORNER` and `superellipsePath` moved from `phone.tsx` into `phoneGeometry.ts` so the shell can clip the app's
iframe to the same screen outline.

Product and operating-system names and familiar device geometry are used as illustrations;
those names and marks remain with their owners. The Stageshow license grants no trademark rights.
