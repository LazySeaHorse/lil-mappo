/**
 * Messages between the demo shell (top-level page: wallpaper, Mac/phone chrome,
 * widget, mock Claude Code window) and the demo frame (the real app, running in
 * an iframe at `/?demo-frame`). Both are the same origin; every message is
 * posted with `targetOrigin = location.origin` and checked on receipt.
 */

export const DEMO_FRAME_PARAM = 'demo-frame';
export const DEMO_MESSAGE_TAG = 'lilmappo-demo' as const;

/** How long each kind of beat takes, in ms, before the speed multiplier. */
export interface DemoTiming {
  /** Cursor travel between two targets. */
  move: number;
  /** One typed character. */
  typeChar: number;
  /** Hold after a click so the result reads. */
  afterClick: number;
  /** One inspector field edit (slider glide, color swap...). */
  inspectorEdit: number;
  /** Pause between two items or phases. */
  betweenSteps: number;
}

export const DEFAULT_TIMING: DemoTiming = {
  move: 600,
  typeChar: 55,
  afterClick: 350,
  inspectorEdit: 700,
  betweenSteps: 900,
};

export interface DemoRunSettings {
  timing: DemoTiming;
  /** Multiplies speed: 2 = everything twice as fast. */
  speed: number;
  /** Mock AI mode: the AI toggle is switched on, then scripted tool calls drive the app. */
  mockAi: boolean;
  /** The prompt shown being typed into the mock Claude Code window (mock AI mode only). */
  aiPrompt: string;
  /** The shell zooms in on the part of the app being worked on (see `shell/zoom.ts`). */
  autoZoom: boolean;
  /** The most the auto zoom magnifies the stage. */
  maxZoom: number;
  /** macOS full screen: windows edge to edge, no wallpaper (landscape only; a shell setting). */
  fullScreen: boolean;
  /** The Claude Code window's share of the width beside the app: 1/4 or 1/3 (a shell setting). */
  terminalShare: number;
}

/** A box in the frame's CSS pixels (the iframe's own viewport). */
export interface DemoRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How closely the camera should look. `work`: the region being worked on fills the view as far as
 * the max zoom allows. `wide`: a wide strip (the timeline), which only gets a gentle zoom.
 */
export type DemoFocusIntent = 'work' | 'wide';

export interface DemoMissingModel {
  modelId: string;
  name: string;
}

/** One line in the mock Claude Code transcript. */
export type DemoAiEvent =
  | { kind: 'user'; text: string }
  | { kind: 'thinking'; ms: number }
  | { kind: 'text'; text: string }
  | { kind: 'tool-start'; id: string; name: string; args: unknown }
  | { kind: 'tool-end'; id: string; ok: boolean; summary: string }
  | { kind: 'done' };

export type DemoRunState = 'empty' | 'ready' | 'running' | 'paused' | 'done';

export type ShellToFrame =
  | { type: 'load'; fileName: string; json: string }
  | { type: 'relink-model'; modelId: string; file: File }
  | { type: 'start'; settings: DemoRunSettings }
  | { type: 'pause' }
  | { type: 'resume' }
  /** Back to the empty starting state of the loaded project. */
  | { type: 'reset' }
  | { type: 'set-speed'; speed: number };

export type FrameToShell =
  | { type: 'frame-ready' }
  | {
      type: 'loaded';
      title: string;
      /** Project resolution width / height; < 1 means portrait (phone layout). */
      aspect: number;
      missingModels: DemoMissingModel[];
    }
  | { type: 'load-error'; message: string }
  | { type: 'models'; missingModels: DemoMissingModel[] }
  | { type: 'state'; state: DemoRunState }
  | { type: 'progress'; step: number; total: number; label: string }
  /** Open/close the mock Claude Code window (the app window shrinks to make room). */
  | { type: 'ai-panel'; open: boolean }
  | { type: 'ai-event'; event: DemoAiEvent }
  /** Where the run is working, for the shell's auto zoom; `rect: null` asks for the whole stage. */
  | { type: 'focus'; rect: DemoRect | null; intent: DemoFocusIntent }
  /** Cmd/Ctrl+Period pressed while the frame has focus: show or hide the widget. */
  | { type: 'toggle-widget' };

interface Envelope<T> {
  tag: typeof DEMO_MESSAGE_TAG;
  msg: T;
}

export function postDemoMessage<T extends ShellToFrame | FrameToShell>(target: Window, msg: T): void {
  const envelope: Envelope<T> = { tag: DEMO_MESSAGE_TAG, msg };
  target.postMessage(envelope, window.location.origin);
}

/** Subscribes to demo messages from the same origin; returns the unsubscribe. */
export function onDemoMessage<T extends ShellToFrame | FrameToShell>(handler: (msg: T, source: MessageEventSource | null) => void): () => void {
  const listener = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as Envelope<T> | undefined;
    if (!data || data.tag !== DEMO_MESSAGE_TAG) return;
    handler(data.msg, event.source);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
