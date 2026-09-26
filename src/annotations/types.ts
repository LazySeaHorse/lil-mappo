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
  | { kind: 'geographic'; lngLat: [number, number]; altitude: number }
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

export interface GroupNode {
  type: 'group';
  x?: number;
  y?: number;
  opacity?: number;
  rotation?: number;
  scale?: number;
  anchorX?: number;
  anchorY?: number;
  children: SceneNode[];
}

export interface RectNode {
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

export interface CircleNode {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
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

export interface LineNode {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth?: number;
  dashPattern?: number[];
  opacity?: number;
}

export interface PathNode {
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
