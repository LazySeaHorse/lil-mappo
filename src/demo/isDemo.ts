import { DEMO_FRAME_PARAM } from './protocol';

/** True only in builds made with VITE_DEMO=1 (the demo branch deployment). Prod builds tree-shake every demo path. */
export const IS_DEMO = import.meta.env.VITE_DEMO === '1';

/** The real app running inside the demo shell's iframe. */
export const IS_DEMO_FRAME =
  IS_DEMO && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has(DEMO_FRAME_PARAM);

/** The demo shell: the top-level page that hosts the frame. */
export const IS_DEMO_SHELL = IS_DEMO && !IS_DEMO_FRAME;
