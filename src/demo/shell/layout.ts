/** Stage geometry for the demo shell: pure maths, no DOM. */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Before a file loads, the stage is a 16:9 landscape. */
export const DEFAULT_ASPECT = 16 / 9;

/** The phone's screen in CSS px: the app's viewport in portrait, so it lays out as on a phone. */
export const PHONE_SCREEN = { width: 402, height: 874 };
/** The kit's pro frame adds 13 px (band + glass) around the screen at true size. */
export const PHONE_EDGE = 13;
export const PHONE_OUTER = { width: PHONE_SCREEN.width + PHONE_EDGE * 2, height: PHONE_SCREEN.height + PHONE_EDGE * 2 };

/** The kit's window bar is a fixed 38 px. */
export const BAR_HEIGHT = 38;
/** Below the iOS status bar: the app starts here on the phone. */
export const STATUS_HEIGHT = 62;

function validAspect(aspect: number): number {
  return Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_ASPECT;
}

/** The largest box of `aspect` (width / height) that fits the viewport, centred in it. */
export function fitAspect(viewWidth: number, viewHeight: number, aspect: number): Box {
  const a = validAspect(aspect);
  const vw = Math.max(0, viewWidth);
  const vh = Math.max(0, viewHeight);
  let width = vw;
  let height = vw / a;
  if (height > vh) {
    height = vh;
    width = vh * a;
  }
  return {
    left: Math.round((vw - width) / 2),
    top: Math.round((vh - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export interface StageLayout {
  portrait: boolean;
  /** The Mac window, or the phone's outer box (already scaled), in stage px. */
  app: Box;
  /** Where the Claude Code window sits when it is open, in stage px. */
  terminal: Box;
  /** Portrait only: the phone's scale from its true size (PHONE_OUTER). */
  phoneScale: number;
  /** The gutter between the stage's edge and its windows (0 in full screen). */
  margin: number;
  /** Landscape full screen: windows edge to edge, a thin divider between them, no wallpaper. */
  fullScreen: boolean;
  /** Full screen split: the black divider's width (the gap between the terminal and the app). */
  divider: number;
}

export interface LayoutOptions {
  /** macOS full screen / Split View. Landscape only: a portrait stage ignores it. */
  fullScreen?: boolean;
  /** The Claude Code window's share of the width beside the app (landscape): one of TERMINAL_SHARES. */
  terminalShare?: number;
}

/** The two splits the widget offers: Claude gets a quarter or a third of the width. */
export const SHARE_QUARTER = 0.25;
export const SHARE_THIRD = 1 / 3;
export const TERMINAL_SHARES = [SHARE_QUARTER, SHARE_THIRD] as const;
export const DEFAULT_TERMINAL_SHARE = SHARE_QUARTER;
/** Split View's divider, in stage px. */
export const DIVIDER = 3;

/** Share of the free height the Claude Code window takes above the phone. */
const TERMINAL_SHARE_PORTRAIT = 0.34;

/**
 * Where the windows sit on a stage of `width` x `height`. Landscape: the app window fills the stage
 * inside one gutter; with the AI panel open, the terminal takes the left and the app window narrows.
 * Portrait: a phone centred at the largest scale that fits; with the AI panel open, the terminal takes
 * the top and the phone shrinks into the space below.
 */
export function stageLayout(width: number, height: number, aspect: number, aiOpen: boolean, options: LayoutOptions = {}): StageLayout {
  const portrait = validAspect(aspect) < 1;
  const share = options.terminalShare !== undefined && Number.isFinite(options.terminalShare) ? Math.min(0.5, Math.max(0.1, options.terminalShare)) : DEFAULT_TERMINAL_SHARE;

  if (!portrait && options.fullScreen) {
    const w = Math.max(0, width);
    const h = Math.max(0, height);
    const termW = Math.round(Math.max(0, w - DIVIDER) * share);
    const terminal = { left: 0, top: 0, width: termW, height: h };
    const app = aiOpen ? { left: termW + DIVIDER, top: 0, width: Math.max(0, w - termW - DIVIDER), height: h } : { left: 0, top: 0, width: w, height: h };
    return { portrait, app, terminal, phoneScale: 1, margin: 0, fullScreen: true, divider: DIVIDER };
  }

  const margin = Math.round(Math.min(width, height) * 0.045);
  const innerW = Math.max(0, width - margin * 2);
  const innerH = Math.max(0, height - margin * 2);

  if (!portrait) {
    const termW = Math.round((innerW - margin) * share);
    const terminal = { left: margin, top: margin, width: termW, height: innerH };
    const app = aiOpen
      ? { left: margin * 2 + termW, top: margin, width: innerW - margin - termW, height: innerH }
      : { left: margin, top: margin, width: innerW, height: innerH };
    return { portrait, app, terminal, phoneScale: 1, margin, fullScreen: false, divider: 0 };
  }

  const termH = Math.round((innerH - margin) * TERMINAL_SHARE_PORTRAIT);
  const terminal = { left: margin, top: margin, width: innerW, height: termH };
  const area = aiOpen
    ? { left: margin, top: margin * 2 + termH, width: innerW, height: innerH - margin - termH }
    : { left: margin, top: margin, width: innerW, height: innerH };
  const phoneScale = Math.max(0, Math.min(area.width / PHONE_OUTER.width, area.height / PHONE_OUTER.height));
  const pw = PHONE_OUTER.width * phoneScale;
  const ph = PHONE_OUTER.height * phoneScale;
  const app = {
    left: Math.round(area.left + (area.width - pw) / 2),
    top: Math.round(area.top + (area.height - ph) / 2),
    width: Math.round(pw),
    height: Math.round(ph),
  };
  return { portrait, app, terminal, phoneScale, margin, fullScreen: false, divider: 0 };
}

/** The app's viewport (where the iframe is shown) in stage px. */
export function appViewportBox(layout: StageLayout): Box {
  const { app, portrait, phoneScale } = layout;
  if (!portrait) return { left: app.left, top: app.top + BAR_HEIGHT, width: app.width, height: Math.max(0, app.height - BAR_HEIGHT) };
  return {
    left: app.left + PHONE_EDGE * phoneScale,
    top: app.top + (PHONE_EDGE + STATUS_HEIGHT) * phoneScale,
    width: PHONE_SCREEN.width * phoneScale,
    height: (PHONE_SCREEN.height - STATUS_HEIGHT) * phoneScale,
  };
}

/** A box in the frame's CSS px (the iframe's own viewport), turned into stage px. */
export function frameToStage(layout: StageLayout, rect: { x: number; y: number; width: number; height: number }): Box {
  const at = appViewportBox(layout);
  const scale = layout.portrait ? layout.phoneScale : 1;
  return { left: at.left + rect.x * scale, top: at.top + rect.y * scale, width: rect.width * scale, height: rect.height * scale };
}

/**
 * Everything the auto zoom's view depends on, as one string: when it changes (window resize, full
 * screen, split, the AI panel, a device switch) a zoom view computed before is stale, so the camera
 * goes back to the whole stage.
 */
export function layoutKey(layout: StageLayout, stage: { width: number; height: number }): string {
  const { app, terminal } = layout;
  const boxKey = (b: Box) => `${b.left},${b.top},${b.width},${b.height}`;
  return [stage.width, stage.height, layout.portrait ? 'p' : 'l', layout.fullScreen ? 'f' : 'w', boxKey(app), boxKey(terminal)].join('|');
}
