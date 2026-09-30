import type { ZodType } from 'zod';

// ─── Semantic Content ─────────────────────────────────────────────────────────

export interface AnnotationContent {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  body?: string;
  icon?: string;
  image?: string;
  badge?: string;
  metric?: {
    value: number;
    label?: string;
    unit?: string;
  };
}

// ─── Placement ────────────────────────────────────────────────────────────────

export type AnnotationBinding =
  | {
      kind: 'geographic';
      lngLat: [number, number];
      /** Visual stalk/connector height in screen pixels above ground anchor (default 0) */
      altitude: number;
    }
  | { kind: 'screen'; position: [number, number] };

export type AnchorPosition =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

// ─── Connector ────────────────────────────────────────────────────────────────

export interface ConnectorConfig {
  visible: boolean;
  style: 'dashed' | 'solid' | 'dotted';
  color: string;
  width: number;
  endDot: boolean;
  endDotRadius: number;
}

// ─── Transition ───────────────────────────────────────────────────────────────

export interface TransitionConfig {
  enter: string;
  exit: string;
  enterDuration: number;
  exitDuration: number;
}

// ─── Scene Primitives ─────────────────────────────────────────────────────────

export interface ShadowConfig {
  color: string;
  blur: number;
  offsetX?: number;
  offsetY?: number;
}

/** Stroke appearance shared by every node that can draw an outline or line. */
export interface StrokeOptions {
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
  /** Alternating dash and gap lengths in pixels. Solid when omitted. */
  dashPattern?: number[];
}

export interface ClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GroupNode {
  type: 'group';
  x?: number;
  y?: number;
  opacity?: number;
  /** Radians, clockwise, about (anchorX, anchorY). */
  rotation?: number;
  scale?: number;
  anchorX?: number;
  anchorY?: number;
  /**
   * Rectangle, in the space the children are drawn in (after this group's own
   * transform), that children are cropped to. Animate a child inside a clipped
   * group to reveal it, e.g. a title sliding up from behind a line.
   */
  clip?: ClipRect;
  children: SceneNode[];
}

export interface RectNode extends StrokeOptions {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius?: number | [number, number, number, number];
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  shadow?: ShadowConfig;
}

export interface CircleNode extends StrokeOptions {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
  /**
   * Arc drawn by the stroke, in radians clockwise from 3 o'clock (canvas
   * convention). Defaults to the full circle; use a moving `endAngle` to draw a
   * ring on. The fill always covers the whole disc.
   */
  startAngle?: number;
  endAngle?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  shadow?: ShadowConfig;
}

export interface TextNode {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight?: number;
  fill?: string;
  /** Outline (halo) colour, painted behind the fill with round joins. */
  stroke?: string;
  /** Full outline width; half of it shows outside the glyphs. Default 1. */
  strokeWidth?: number;
  align?: 'left' | 'center' | 'right';
  /** 'alphabetic' puts y on the text baseline, for aligning type to lines. Default 'top'. */
  baseline?: 'top' | 'middle' | 'alphabetic' | 'bottom';
  maxWidth?: number;
  letterSpacing?: string;
  textTransform?: 'uppercase' | 'lowercase' | 'none';
  opacity?: number;
}

export interface ImageNode {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  cornerRadius?: number;
  opacity?: number;
  objectFit?: 'cover' | 'contain' | 'fill';
}

export interface LineNode extends StrokeOptions {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth?: number;
  opacity?: number;
}

/** Connected line segments whose visible length can be animated. */
export interface PolylineNode extends StrokeOptions {
  type: 'polyline';
  points: Array<[number, number]>;
  /** Join the last point back to the first. */
  closed?: boolean;
  stroke: string;
  strokeWidth?: number;
  /** Fraction (0–1, default 1) of the total length drawn, from the first point. */
  progress?: number;
  opacity?: number;
}

export interface PathNode extends StrokeOptions {
  type: 'path';
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  shadow?: ShadowConfig;
}

export type SceneNode =
  | GroupNode
  | RectNode
  | CircleNode
  | TextNode
  | ImageNode
  | LineNode
  | PolylineNode
  | PathNode;

// ─── Style Render Input ───────────────────────────────────────────────────────

export interface StyleRenderInput<TSettings = Record<string, unknown>> {
  content: AnnotationContent;
  settings: TSettings;

  /**
   * Current lifecycle phase. Styles only see the real phase when the callout's
   * transition is the style animation ('auto'); under any block transition
   * (fade, scale-up, …) they are always told 'visible' at progress 1 and draw
   * their finished state.
   */
  phase: 'enter' | 'visible' | 'exit';
  /** Progress within the current phase, 0–1. */
  phaseProgress: number;

  /** Seconds since this annotation's startTime — use for continuous animations. */
  itemTime: number;
  /** Absolute playhead position in seconds. */
  playheadTime: number;

  /**
   * The map point the callout is attached to, in the style's own coordinates
   * (relative to its origin, in pixels before the callout scale). The origin
   * sits at the ground point plus the callout offset, lifted by the altitude, so
   * this is where a leader line or pole must end to touch the map.
   */
  ground: { x: number; y: number };

  /** Device pixel ratio (1 for standard, 2 for retina, etc.) */
  pixelRatio: number;
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export type StyleCategory = 'label' | 'marker' | 'editorial' | 'data' | 'media' | 'sign';

/**
 * A box in a style's own coordinates, relative to its origin: (x, y) is the
 * top-left corner, so a style that grows up and to the right of its origin has
 * a negative y and a positive x.
 */
export interface StyleBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationStyleDefinition<TSettings = Record<string, unknown>> {
  id: string;
  version: number;
  name: string;
  description: string;
  category: StyleCategory;
  icon: string;

  /** Which AnnotationContent slots this style consumes. */
  contentSlots: Array<keyof AnnotationContent>;

  /** Zod schema validating style-specific settings. */
  settingsSchema: ZodType<TSettings>;
  defaultSettings: TSettings;

  /** Whether this style can sit on an elevated anchor pole (cards) or sits flush on the map (surface markers). Default true. */
  supportsAltitude?: boolean;

  /**
   * The style draws its own line to the ground point (see `ground` in the render
   * input), so the generic connector is not drawn for it and its inspector
   * section is hidden.
   */
  drawsConnector?: boolean;

  /** Default altitude in pixels for styles that support it. Default 40. */
  defaultAltitude?: number;

  /** Default [x, y] offset of the origin from the ground point, in pixels. Default [0, 0]. */
  defaultOffset?: [number, number];

  /** Default map anchor point ('center' for ripples/dots, 'bottom' for cards/pins). Default 'bottom'. */
  defaultAnchor?: AnchorPosition;

  /** Default connector config override. */
  defaultConnector?: Partial<ConnectorConfig>;

  /**
   * Default transition override. Styles that choreograph their own entrance use
   * enter/exit 'auto' (see STYLE_ANIMATION) with durations that suit the motion.
   */
  defaultTransition?: Partial<TransitionConfig>;

  /** Inspector controls generated from this definition. */
  controls: ControlDefinition[];

  /** Produce the scene tree for this style. */
  render(input: StyleRenderInput<TSettings>): SceneNode;

  /**
   * Bounds of everything this style can draw, relative to its origin.
   *
   * Used to size the canvas, so it must cover the finished state in full (it
   * is always called with phase 'visible'), including anything drawn towards
   * `input.ground`, and stay the same for the whole animation. Include stroke
   * widths and any overshoot; draw adds a margin for shadows and glow.
   */
  measure(input: StyleRenderInput<TSettings>): StyleBounds;

  /** Migrate settings from an older style version. */
  migrate?(fromVersion: number, oldSettings: unknown): TSettings;
}

// ─── Inspector Control Definitions ────────────────────────────────────────────

export type ControlDefinition =
  | { type: 'color'; key: string; label: string }
  | { type: 'slider'; key: string; label: string; min: number; max: number; step: number; unit?: string }
  | { type: 'switch'; key: string; label: string }
  | {
      type: 'select';
      key: string;
      label: string;
      options: Array<{ value: string; label: string }>;
    }
  | { type: 'font'; key: string; label: string }
  | { type: 'text-input'; key: string; label: string; placeholder?: string };
