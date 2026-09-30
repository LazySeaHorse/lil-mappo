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
  baseline?: 'top' | 'middle' | 'bottom';
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

  /** Current lifecycle phase. */
  phase: 'enter' | 'visible' | 'exit';
  /** Progress within the current phase, 0–1. */
  phaseProgress: number;

  /** Seconds since this annotation's startTime — use for continuous animations. */
  itemTime: number;
  /** Absolute playhead position in seconds. */
  playheadTime: number;

  /** Device pixel ratio (1 for standard, 2 for retina, etc.) */
  pixelRatio: number;
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export type StyleCategory = 'marker' | 'label' | 'card' | 'media' | 'data' | 'editorial';

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

  /** Default map anchor point ('center' for ripples/dots, 'bottom' for cards/pins). Default 'bottom'. */
  defaultAnchor?: AnchorPosition;

  /** Default connector config override. */
  defaultConnector?: Partial<ConnectorConfig>;

  /** Default transition override. */
  defaultTransition?: Partial<TransitionConfig>;

  /** Inspector controls generated from this definition. */
  controls: ControlDefinition[];

  /** Produce the scene tree for this style. */
  render(input: StyleRenderInput<TSettings>): SceneNode;

  /**
   * Measure the bounding box of this style's output.
   * Used for anchor offset calculation and OffscreenCanvas sizing.
   */
  measure(input: StyleRenderInput<TSettings>): { width: number; height: number };

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
