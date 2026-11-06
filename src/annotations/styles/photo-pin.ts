import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import { buildProgress, easeOutBack, easeOutCubic, stage } from '../motion';
import { circle, group, image, path, rect, text } from '../scene/primitives';
import { measureTextWidth } from '../scene/textMetrics';
import { CONTENT_WINDOW, droppingPin, groundShadow, PIN_SHADOW, pinDrop, pinDropBounds } from './pinDrop';
import { boundsOf, HALO_CONTROL, haloSchema, haloShadow, SIDE_CONTROL, sideSchema } from './shared';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const photoPinSettingsSchema = z.object({
  pinColor: z.string().default('#FF5A36'),
  textColor: z.string().default('#FFFFFF'),
  showTitle: z.boolean().default(true),
  side: sideSchema,
  halo: haloSchema,
  /** Diameter of the pin's head in pixels. */
  size: z.number().default(88),
});

export type PhotoPinSettings = z.infer<typeof photoPinSettingsSchema>;

export const defaultPhotoPinSettings: PhotoPinSettings = photoPinSettingsSchema.parse({});

// ─── Layout Constants ─────────────────────────────────────────────────────────

/** How far below the head's centre the tip sits, as a share of the head's radius. */
const TIP_DEPTH = 1.75;
/** Width of the pin colour round the photo, as a share of the head's radius. */
const RIM = 0.12;

const TITLE_SIZE = 26;
const TITLE_WEIGHT = 700;
/** Space between the head and the title. */
const TITLE_GAP = 12;
const TITLE_TRAVEL = 14;

const PLACEHOLDER_FILL = '#D9DDE2';
const PLACEHOLDER_GLYPH = '#AEB4BB';

/**
 * After the pin's drop (`pinDrop.ts`) the photo pops open inside the head and
 * the title slides out last, as windows of the 0–1 build progress. The exit
 * plays it backwards.
 */
const TITLE_WINDOW = [0.66, 1] as const;

// ─── Layout ───────────────────────────────────────────────────────────────────

interface Layout {
  radius: number;
  /** Centre of the head, above the tip at the origin. */
  headY: number;
  photoRadius: number;
  direction: 1 | -1;
  title: string;
  titleWidth: number;
  src: string;
}

/** +1 when the title sits right of the head, -1 when left. Auto is right: the pin stands on the point. */
export function resolveDirection(side: PhotoPinSettings['side']): 1 | -1 {
  return side === 'left' ? -1 : 1;
}

function layout(input: StyleRenderInput<PhotoPinSettings>): Layout {
  const { content, settings } = input;
  const radius = Math.max(16, settings.size / 2);
  const title = settings.showTitle ? (content.title ?? '').trim() : '';
  return {
    radius,
    headY: -radius * TIP_DEPTH,
    photoRadius: radius * (1 - RIM),
    direction: resolveDirection(settings.side),
    title,
    titleWidth: title ? measureTextWidth(title, TITLE_SIZE, ANNOTATION_FONTS.body, TITLE_WEIGHT) : 0,
    src: (content.image ?? '').trim(),
  };
}

/** A map pin with its tip at the origin: a circle of `radius` round (0, headY) narrowing to the tip. */
export function pinPath(radius: number, headY: number): string {
  const depth = -headY;
  // Where the sides leave the circle: tangents from the tip.
  const angle = Math.acos(radius / depth);
  const x = radius * Math.sin(angle);
  const y = headY + radius * Math.cos(angle);
  const f = (n: number) => n.toFixed(2);
  return `M0 0L${f(-x)} ${f(y)}A${f(radius)} ${f(radius)} 0 1 1 ${f(x)} ${f(y)}Z`;
}

// ─── Render ───────────────────────────────────────────────────────────────────

/** Grey stand-in for a missing photo: a sun over two hills, inside the head. */
function placeholder(r: number, cy: number): SceneNode[] {
  const at = (u: number, v: number) => `${(u * r).toFixed(1)} ${(cy + v * r).toFixed(1)}`;
  return [
    circle({ cx: 0, cy, r, fill: PLACEHOLDER_FILL }),
    circle({ cx: r * 0.28, cy: cy - r * 0.3, r: r * 0.14, fill: PLACEHOLDER_GLYPH }),
    path({
      d: `M${at(-0.6, 0.35)}L${at(-0.2, -0.15)}L${at(0.05, 0.15)}L${at(0.25, -0.02)}L${at(0.6, 0.35)}Z`,
      fill: PLACEHOLDER_GLYPH,
    }),
  ];
}

export function renderPhotoPin(input: StyleRenderInput<PhotoPinSettings>): SceneNode {
  const { settings, phase, phaseProgress } = input;
  const l = layout(input);
  const build = buildProgress(phase, phaseProgress);

  const drop = pinDrop(build);
  const photo = stage(build, ...CONTENT_WINDOW, (t) => easeOutBack(t, 1.4));
  const titleReveal = stage(build, ...TITLE_WINDOW, easeOutCubic);

  const pin: SceneNode[] = [
    path({ d: pinPath(l.radius, l.headY), fill: settings.pinColor, shadow: settings.halo ? PIN_SHADOW : undefined }),
  ];

  if (photo > 0) {
    const r = l.photoRadius;
    const size = r * 2;
    pin.push(group({
      scale: photo,
      anchorX: 0,
      anchorY: l.headY,
      children: l.src
        ? [
            image({ x: -r, y: l.headY - r, width: size, height: size, src: l.src, objectFit: 'cover', cornerRadius: r }),
            // A hairline where the photo meets the pin.
            circle({ cx: 0, cy: l.headY, r, stroke: 'rgba(0, 0, 0, 0.15)', strokeWidth: 1 }),
          ]
        : placeholder(r, l.headY),
    }));
  }

  const children: SceneNode[] = [...groundShadow(drop), ...droppingPin(drop, pin)];

  if (l.title && titleReveal > 0) {
    children.push(text({
      x: l.direction * (l.radius + TITLE_GAP - TITLE_TRAVEL * (1 - titleReveal)),
      y: l.headY,
      text: l.title,
      fontSize: TITLE_SIZE,
      fontFamily: ANNOTATION_FONTS.body,
      fontWeight: TITLE_WEIGHT,
      fill: settings.textColor,
      align: l.direction === 1 ? 'left' : 'right',
      baseline: 'middle',
      opacity: titleReveal,
      shadow: haloShadow(settings.halo),
    }));
  }

  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/**
 * Bounds of the finished state, with the pin measured by hand (it is a path)
 * and room for the fall, the squash and the pin's shadow.
 */
export function measurePhotoPin(input: StyleRenderInput<PhotoPinSettings>): StyleBounds {
  const l = layout(input);
  const finished = renderPhotoPin({ ...input, phase: 'visible', phaseProgress: 1 });
  return boundsOf(finished, rect(pinDropBounds(l.radius, l.headY - l.radius)));
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const photoPinStyle: AnnotationStyleDefinition<PhotoPinSettings> = {
  id: 'photo-pin',
  version: 1,
  name: 'Photo Pin',
  description: 'A map pin that drops onto the point with a photo popping open in its round head',
  category: 'media',
  icon: 'map-pinned',
  contentSlots: ['title', 'image'],
  settingsSchema: photoPinSettingsSchema,
  defaultSettings: defaultPhotoPinSettings,
  supportsAltitude: false,
  defaultAltitude: 0,
  defaultOffset: [0, 0],
  defaultAnchor: 'bottom',
  drawsConnector: false,
  defaultConnector: { visible: false },
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1.2,
    exitDuration: 0.5,
  },
  controls: [
    { type: 'color', key: 'pinColor', label: 'Pin color', role: 'accent' },
    { type: 'color', key: 'textColor', label: 'Text color' },
    { type: 'switch', key: 'showTitle', label: 'Show title' },
    HALO_CONTROL,
    SIDE_CONTROL,
    { type: 'slider', key: 'size', label: 'Size', min: 48, max: 160, step: 4, unit: 'px' },
  ],
  render: renderPhotoPin,
  measure: measurePhotoPin,
};
