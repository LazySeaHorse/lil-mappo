import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, ShadowConfig, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import { buildProgress, easeInOutCubic, easeOutBack, easeOutCubic, stage } from '../motion';
import { circle, group, image, path, polyline, rect, text } from '../scene/primitives';
import { measureTextWidth } from '../scene/textMetrics';
import { boundsOf, groundDot, HALO_SHADOW, leaderLine } from './shared';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const polaroidSettingsSchema = z.object({
  frameColor: z.string().default('#FAF7F0'),
  captionColor: z.string().default('#2B2B2B'),
  /** Degrees, clockwise. */
  rotation: z.number().default(4),
  /** Width of the photo in pixels. */
  size: z.number().default(130),
  attach: z.enum(['line', 'pin', 'tape']).default('line'),
});

export type PolaroidSettings = z.infer<typeof polaroidSettingsSchema>;

export const defaultPolaroidSettings: PolaroidSettings = {
  frameColor: '#FAF7F0',
  captionColor: '#2B2B2B',
  rotation: 4,
  size: 130,
  attach: 'line',
};

// ─── Layout Constants ─────────────────────────────────────────────────────────

/** Border around the photo on the top and sides, and the thick one below it. */
const BORDER = 9;
const BORDER_BOTTOM = 38;
const CAPTION_SIZE = 25;
const CAPTION_MIN_SIZE = 16;
const CAPTION_WEIGHT = 600;

const PHOTO_BACKING = '#ECE8DD';
const PLACEHOLDER_GREY = '#C4C8CC';
const PLACEHOLDER_GLYPH = '#A4A9AF';

const LEADER_COLOR = '#FFFFFF';
const LEADER_WIDTH = 1.5;

/** Everything the print casts onto the map. */
const PRINT_SHADOW: ShadowConfig = { color: 'rgba(0, 0, 0, 0.42)', blur: 12, offsetX: 0, offsetY: 5 };
const PIN_SHADOW: ShadowConfig = { color: 'rgba(0, 0, 0, 0.45)', blur: 3, offsetX: 1, offsetY: 2 };

// Landing
const DROP_DISTANCE = 44;
const DROP_SCALE = 0.16;
/** Extra tilt, in degrees, that the print settles out of. */
const DROP_TILT = 11;
/** How far the drop can overshoot and the reach the measure allows for. */
const DROP_REACH = 70;

/**
 * Entrance timeline as windows of the 0–1 build progress: the ground dot lands,
 * the print drops onto it and settles, the leader is pulled up to it while the
 * photo develops from a pale wash, and the caption arrives last. The exit plays
 * it backwards.
 */
const DOT_WINDOW = [0, 0.2] as const;
const APPEAR_WINDOW = [0.08, 0.3] as const;
const DROP_WINDOW = [0.08, 0.68] as const;
const LEADER_WINDOW = [0.4, 0.68] as const;
const DEVELOP_WINDOW = [0.3, 0.9] as const;
const ATTACH_WINDOW = [0.55, 0.75] as const;
const CAPTION_WINDOW = [0.78, 1] as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

interface Layout {
  photo: number;
  width: number;
  height: number;
  title: string;
  src: string;
  captionSize: number;
}

function layout(input: StyleRenderInput<PolaroidSettings>): Layout {
  const photo = Math.max(60, input.settings.size);
  const title = (input.content.title ?? '').trim();
  const room = photo - 8;
  let captionSize = CAPTION_SIZE;
  while (
    captionSize > CAPTION_MIN_SIZE
    && title
    && measureTextWidth(title, captionSize, ANNOTATION_FONTS.handwritten, CAPTION_WEIGHT) > room
  ) {
    captionSize -= 1;
  }
  return {
    photo,
    width: photo + BORDER * 2,
    height: photo + BORDER + BORDER_BOTTOM,
    title,
    src: (input.content.image ?? '').trim(),
    captionSize,
  };
}

/** Where the leader meets the bottom of the print, once it has settled at its tilt. */
export function attachPoint(height: number, rotation: number): [number, number] {
  const theta = (rotation * Math.PI) / 180;
  return [(-height / 2) * Math.sin(theta), -height / 2 + (height / 2) * Math.cos(theta)];
}

// ─── Render ───────────────────────────────────────────────────────────────────

/** Grey stand-in for a missing photo: sky, a sun and two hills. */
function placeholder(x: number, y: number, size: number, develop: number): SceneNode[] {
  const at = (u: number, v: number) => `${(x + u * size).toFixed(1)} ${(y + v * size).toFixed(1)}`;
  return [
    rect({ x, y, width: size, height: size, fill: PLACEHOLDER_GREY, opacity: develop }),
    circle({ cx: x + size * 0.7, cy: y + size * 0.3, r: size * 0.09, fill: PLACEHOLDER_GLYPH, opacity: develop }),
    path({
      d: `M${at(0, 1)}L${at(0, 0.78)}L${at(0.28, 0.5)}L${at(0.5, 0.74)}L${at(0.64, 0.6)}L${at(1, 0.9)}L${at(1, 1)}Z`,
      fill: PLACEHOLDER_GLYPH,
      opacity: develop,
    }),
  ];
}

function pin(x: number, y: number): SceneNode {
  return group({
    x,
    y,
    children: [
      circle({ cx: 0, cy: 0, r: 6, fill: '#D7263D', shadow: PIN_SHADOW }),
      circle({ cx: -1.8, cy: -1.8, r: 2, fill: 'rgba(255, 255, 255, 0.55)' }),
    ],
  });
}

export function renderPolaroid(input: StyleRenderInput<PolaroidSettings>): SceneNode {
  const { settings, ground, phase, phaseProgress } = input;
  const l = layout(input);
  const build = buildProgress(phase, phaseProgress);

  const dot = stage(build, ...DOT_WINDOW, easeOutBack);
  const appear = stage(build, ...APPEAR_WINDOW, easeOutCubic);
  const drop = stage(build, ...DROP_WINDOW, (t) => easeOutBack(t, 1.4));
  const leader = stage(build, ...LEADER_WINDOW, easeInOutCubic);
  const develop = stage(build, ...DEVELOP_WINDOW, easeInOutCubic);
  const attach = stage(build, ...ATTACH_WINDOW, easeOutBack);
  const caption = stage(build, ...CAPTION_WINDOW, easeOutCubic);

  const children: SceneNode[] = [];

  const [attachX, attachY] = attachPoint(l.height, settings.rotation);
  if (leader > 0) {
    children.push(leaderLine(ground, [attachX, attachY], {
      stroke: LEADER_COLOR,
      strokeWidth: LEADER_WIDTH,
      progress: leader,
      shadow: HALO_SHADOW,
    }));
  }
  if (dot > 0) children.push(groundDot(ground, dot, { fill: LEADER_COLOR, shadow: HALO_SHADOW }));

  if (appear > 0) {
    const left = -l.width / 2;
    const top = -l.height;
    const photoX = -l.photo / 2;
    const photoY = top + BORDER;

    const print: SceneNode[] = [
      rect({ x: left, y: top, width: l.width, height: l.height, cornerRadius: 2, fill: settings.frameColor, shadow: PRINT_SHADOW }),
      rect({ x: photoX, y: photoY, width: l.photo, height: l.photo, fill: PHOTO_BACKING }),
      ...(l.src
        ? [image({ x: photoX, y: photoY, width: l.photo, height: l.photo, src: l.src, objectFit: 'cover', opacity: develop })]
        : placeholder(photoX, photoY, l.photo, develop)),
      // A hairline where the photo meets the paper, as a real print has.
      rect({ x: photoX, y: photoY, width: l.photo, height: l.photo, stroke: 'rgba(0, 0, 0, 0.12)', strokeWidth: 1 }),
    ];

    if (l.title && caption > 0) {
      print.push(text({
        x: 0,
        y: top + BORDER + l.photo + BORDER_BOTTOM * 0.68,
        text: l.title,
        fontSize: l.captionSize,
        fontFamily: ANNOTATION_FONTS.handwritten,
        fontWeight: CAPTION_WEIGHT,
        fill: settings.captionColor,
        align: 'center',
        baseline: 'alphabetic',
        maxWidth: l.photo - 4,
        opacity: caption,
      }));
    }

    if (settings.attach === 'tape' && attach > 0) {
      print.push(group({
        x: 0,
        y: top + 1,
        rotation: (-5 * Math.PI) / 180,
        scale: attach,
        children: [rect({ x: -24, y: -9, width: 48, height: 18, fill: 'rgba(238, 226, 176, 0.78)', shadow: { color: 'rgba(0, 0, 0, 0.2)', blur: 2, offsetX: 0, offsetY: 1 } })],
      }));
    } else if (settings.attach === 'pin' && attach > 0) {
      print.push(group({ scale: attach, anchorX: 0, anchorY: top + 9, children: [pin(0, top + 9)] }));
    }

    const settle = 1 - drop;
    children.push(group({
      x: 0,
      y: DROP_DISTANCE * (drop - 1),
      // The print falls a little towards the viewer and tilts as it lands.
      scale: 1 + DROP_SCALE * settle,
      rotation: ((settings.rotation + DROP_TILT * settle) * Math.PI) / 180,
      anchorX: 0,
      anchorY: -l.height / 2,
      opacity: appear,
      children: print,
    }));
  }

  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/** Bounds of the finished state, with room for the drop, its overshoot and the tilt. */
export function measurePolaroid(input: StyleRenderInput<PolaroidSettings>): StyleBounds {
  const l = layout(input);
  const finished = renderPolaroid({ ...input, phase: 'visible', phaseProgress: 1 });
  const reach = rect({
    x: -l.width / 2 - DROP_REACH / 2,
    y: -l.height - DROP_REACH - 10,
    width: l.width + DROP_REACH,
    height: l.height + DROP_REACH * 1.4,
  });
  return boundsOf(finished, reach);
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const polaroidStyle: AnnotationStyleDefinition<PolaroidSettings> = {
  id: 'polaroid',
  version: 1,
  name: 'Polaroid',
  description: 'An instant photo print that drops onto the map, develops and gets a handwritten caption',
  category: 'media',
  icon: 'image',
  contentSlots: ['title', 'image'],
  settingsSchema: polaroidSettingsSchema,
  defaultSettings: defaultPolaroidSettings,
  supportsAltitude: true,
  defaultAltitude: 0,
  defaultOffset: [90, -100],
  drawsConnector: true,
  defaultConnector: { visible: false },
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1.3,
    exitDuration: 0.5,
  },
  controls: [
    { type: 'color', key: 'frameColor', label: 'Frame color' },
    { type: 'color', key: 'captionColor', label: 'Caption color' },
    { type: 'slider', key: 'rotation', label: 'Rotation', min: -15, max: 15, step: 1, unit: '°' },
    { type: 'slider', key: 'size', label: 'Photo size', min: 80, max: 220, step: 5, unit: 'px' },
    {
      type: 'select',
      key: 'attach',
      label: 'Attachment',
      options: [
        { value: 'line', label: 'Leader only' },
        { value: 'pin', label: 'Pushpin' },
        { value: 'tape', label: 'Tape' },
      ],
    },
  ],
  render: renderPolaroid,
  measure: measurePolaroid,
};
