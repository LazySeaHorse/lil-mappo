import { z } from 'zod';
import type { AnnotationStyleDefinition, SceneNode, ShadowConfig, StyleBounds, StyleRenderInput } from '../types';
import { ANNOTATION_FONTS } from '../fonts';
import { buildProgress, easeOutBack, easeOutCubic, stage } from '../motion';
import { roundedRectPoints } from '../scene/geometry';
import { circle, group, path, polyline, rect, text } from '../scene/primitives';
import { measureTextWidth } from '../scene/textMetrics';
import { boundsOf } from './shared';

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const roadSignSettingsSchema = z.object({
  signColor: z.string().default('#0B6E3B'),
  textColor: z.string().default('#FFFFFF'),
  shield: z.enum(['none', 'interstate', 'circle']).default('interstate'),
  posts: z.number().default(2),
});

export type RoadSignSettings = z.infer<typeof roadSignSettingsSchema>;

export const defaultRoadSignSettings: RoadSignSettings = {
  signColor: '#0B6E3B',
  textColor: '#FFFFFF',
  shield: 'interstate',
  posts: 2,
};

// ─── Layout Constants ─────────────────────────────────────────────────────────

const TITLE_SIZE = 26;
const SUBTITLE_SIZE = 15;
const SIGN_WEIGHT = 700;
const TITLE_SPACING = '0.02em';
const SUBTITLE_GAP = 6;

const PANEL_PAD_X = 20;
const PANEL_PAD_Y = 15;
const PANEL_RADIUS = 9;
const MIN_PANEL_WIDTH = 116;
const BORDER_INSET = 5;
const BORDER_WIDTH = 1.75;

const SHIELD_WIDTH = 36;
const SHIELD_HEIGHT = 40;
const SHIELD_GAP = 14;
const MIN_SHIELD_FONT = 9;

const POST_WIDTH = 5;
const POST_COLOR = '#8E959C';
const POST_HIGHLIGHT = '#C6CBD0';
/** Shortest post run drawn below the panel, so a sign at ground level still stands. */
const MIN_POST_HEIGHT = 34;
/** Distance from the panel's side to a post, when there are two. */
const POST_INSET = 26;

const INTERSTATE_BLUE = '#1F4FA3';
const INTERSTATE_RED = '#C8102E';

const PANEL_SHADOW: ShadowConfig = { color: 'rgba(0, 0, 0, 0.45)', blur: 10, offsetX: 0, offsetY: 3 };
const POST_SHADOW: ShadowConfig = { color: 'rgba(0, 0, 0, 0.5)', blur: 4, offsetX: 0, offsetY: 1 };

/** Entrance timeline, as overlapping windows of the 0–1 build progress. */
const POST_WINDOW = [0, 0.4] as const;
const PANEL_WINDOW = [0.3, 0.74] as const;
const BORDER_WINDOW = [0.6, 0.92] as const;
const SHIELD_WINDOW = [0.66, 0.92] as const;
const TITLE_WINDOW = [0.7, 0.94] as const;
const SUBTITLE_WINDOW = [0.8, 1] as const;
const TEXT_RISE = 6;

// ─── Layout ───────────────────────────────────────────────────────────────────

interface Layout {
  title: string;
  subtitle: string;
  hasShield: boolean;
  badge: string;
  panelWidth: number;
  panelHeight: number;
  /** Centre of the text area, in x. */
  textCenter: number;
  /** Centre of the shield, in x, relative to the origin. */
  shieldCenter: number;
  postCount: 1 | 2;
}

export function resolvePostCount(posts: number): 1 | 2 {
  return posts >= 2 ? 2 : 1;
}

function layout(input: StyleRenderInput<RoadSignSettings>): Layout {
  const { content, settings } = input;
  const title = (content.title ?? '').trim();
  const subtitle = (content.subtitle ?? '').trim();
  const badge = (content.badge ?? '').trim();
  const hasShield = settings.shield !== 'none' && badge !== '';

  const titleWidth = title ? measureTextWidth(title, TITLE_SIZE, ANNOTATION_FONTS.sign, SIGN_WEIGHT, TITLE_SPACING) : 0;
  const subtitleWidth = subtitle ? measureTextWidth(subtitle, SUBTITLE_SIZE, ANNOTATION_FONTS.sign, SIGN_WEIGHT) : 0;
  const textWidth = Math.ceil(Math.max(titleWidth, subtitleWidth));
  const textHeight = (title ? TITLE_SIZE : 0) + (subtitle ? SUBTITLE_SIZE + (title ? SUBTITLE_GAP : 0) : 0);

  const shieldSpace = hasShield ? SHIELD_WIDTH + SHIELD_GAP : 0;
  const panelWidth = Math.max(PANEL_PAD_X * 2 + shieldSpace + textWidth, MIN_PANEL_WIDTH);
  const panelHeight = PANEL_PAD_Y * 2 + Math.max(textHeight, hasShield ? SHIELD_HEIGHT : 0);
  const left = -panelWidth / 2;

  return {
    title,
    subtitle,
    hasShield,
    badge,
    panelWidth,
    panelHeight,
    textCenter: left + PANEL_PAD_X + shieldSpace + (panelWidth - PANEL_PAD_X * 2 - shieldSpace) / 2,
    shieldCenter: left + PANEL_PAD_X + SHIELD_WIDTH / 2,
    postCount: resolvePostCount(settings.posts),
  };
}

// ─── Shield ───────────────────────────────────────────────────────────────────

/** Interstate shield centred on (0, 0), SHIELD_WIDTH by SHIELD_HEIGHT. */
const SHIELD_TOP = 'M-18 -14 Q-9 -22 0 -16 Q9 -22 18 -14';
const SHIELD_BODY = `${SHIELD_TOP} L18 6 Q18 18 0 20 Q-18 18 -18 6 Z`;
const SHIELD_BAND = `${SHIELD_TOP} L18 -6 L-18 -6 Z`;

function shieldNodes(kind: 'interstate' | 'circle', badge: string, signColor: string): SceneNode[] {
  const maxWidth = SHIELD_WIDTH - 10;
  const baseSize = 15;
  const width = measureTextWidth(badge, baseSize, ANNOTATION_FONTS.sign, SIGN_WEIGHT);
  const fontSize = width <= maxWidth ? baseSize : Math.max(MIN_SHIELD_FONT, Math.floor((baseSize * maxWidth) / width));

  if (kind === 'circle') {
    return [
      circle({ cx: 0, cy: 0, r: SHIELD_HEIGHT / 2 - 2, fill: '#FFFFFF' }),
      text({
        x: 0, y: 1, text: badge, fontSize, fontFamily: ANNOTATION_FONTS.sign, fontWeight: SIGN_WEIGHT,
        fill: signColor, align: 'center', baseline: 'middle',
      }),
    ];
  }
  return [
    path({ d: SHIELD_BODY, fill: INTERSTATE_BLUE }),
    path({ d: SHIELD_BAND, fill: INTERSTATE_RED }),
    path({ d: SHIELD_BODY, stroke: '#FFFFFF', strokeWidth: 1.75, lineJoin: 'round' }),
    text({
      x: 0, y: 8, text: badge, fontSize, fontFamily: ANNOTATION_FONTS.sign, fontWeight: SIGN_WEIGHT,
      fill: '#FFFFFF', align: 'center', baseline: 'middle',
    }),
  ];
}

// ─── Render ───────────────────────────────────────────────────────────────────

export function renderRoadSign(input: StyleRenderInput<RoadSignSettings>): SceneNode {
  const { settings, ground, phase, phaseProgress } = input;
  const { title, subtitle, hasShield, badge, panelWidth, panelHeight, textCenter, shieldCenter, postCount } = layout(input);
  const build = buildProgress(phase, phaseProgress);

  const flip = stage(build, ...PANEL_WINDOW, (t) => easeOutBack(t, 2));
  const border = stage(build, ...BORDER_WINDOW, easeOutCubic);
  const shieldPop = stage(build, ...SHIELD_WINDOW, easeOutBack);
  const titleReveal = stage(build, ...TITLE_WINDOW, easeOutCubic);
  const subtitleReveal = stage(build, ...SUBTITLE_WINDOW, easeOutCubic);

  const children: SceneNode[] = [];

  // Posts: the connector, rising from the ground to the panel's bottom edge.
  const postXs = postCount === 2 ? [-(panelWidth / 2 - POST_INSET), panelWidth / 2 - POST_INSET] : [0];
  const footY = Math.max(ground.y, MIN_POST_HEIGHT);
  postXs.forEach((x, i) => {
    const rise = stage(build, POST_WINDOW[0] + i * 0.06, POST_WINDOW[1] + i * 0.06, easeOutCubic);
    if (rise <= 0) return;
    const from: [number, number] = [x + ground.x, footY];
    const to: [number, number] = [x, -6];
    children.push(polyline({
      points: [from, to], progress: rise, stroke: POST_COLOR, strokeWidth: POST_WIDTH, lineCap: 'butt', shadow: POST_SHADOW,
    }));
    children.push(polyline({
      points: [[from[0] - 1, from[1]], [to[0] - 1, to[1]]],
      progress: rise,
      stroke: POST_HIGHLIGHT,
      strokeWidth: 1.5,
      lineCap: 'butt',
      opacity: 0.8,
    }));
  });

  // Panel: flips up from its bottom edge, which sits on the origin.
  if (flip > 0) {
    const panel: SceneNode[] = [
      rect({
        x: -panelWidth / 2,
        y: -panelHeight,
        width: panelWidth,
        height: panelHeight,
        cornerRadius: PANEL_RADIUS,
        fill: settings.signColor,
        shadow: PANEL_SHADOW,
      }),
    ];
    if (border > 0) {
      panel.push(polyline({
        points: roundedRectPoints(
          -panelWidth / 2 + BORDER_INSET,
          -panelHeight + BORDER_INSET,
          panelWidth - BORDER_INSET * 2,
          panelHeight - BORDER_INSET * 2,
          PANEL_RADIUS - 3,
        ),
        closed: true,
        progress: border,
        stroke: settings.textColor,
        strokeWidth: BORDER_WIDTH,
        lineJoin: 'round',
      }));
    }
    children.push(group({ scaleY: flip, children: panel }));
  }

  // Text and shield land once the panel is up, and are not stretched by the flip.
  const middleY = -panelHeight / 2;
  const titleY = subtitle ? middleY - (SUBTITLE_SIZE + SUBTITLE_GAP) / 2 : middleY;
  const subtitleY = title ? titleY + (TITLE_SIZE + SUBTITLE_GAP + SUBTITLE_SIZE) / 2 : middleY;

  if (hasShield && shieldPop > 0 && settings.shield !== 'none') {
    children.push(group({
      x: shieldCenter,
      y: middleY,
      scale: shieldPop,
      children: shieldNodes(settings.shield, badge, settings.signColor),
    }));
  }

  if (title && titleReveal > 0) {
    children.push(text({
      x: textCenter,
      y: titleY + (1 - titleReveal) * TEXT_RISE,
      text: title,
      fontSize: TITLE_SIZE,
      fontFamily: ANNOTATION_FONTS.sign,
      fontWeight: SIGN_WEIGHT,
      letterSpacing: TITLE_SPACING,
      fill: settings.textColor,
      align: 'center',
      baseline: 'middle',
      opacity: titleReveal,
    }));
  }

  if (subtitle && subtitleReveal > 0) {
    children.push(text({
      x: textCenter,
      y: subtitleY + (1 - subtitleReveal) * TEXT_RISE,
      text: subtitle,
      fontSize: SUBTITLE_SIZE,
      fontFamily: ANNOTATION_FONTS.sign,
      fontWeight: SIGN_WEIGHT,
      fill: settings.textColor,
      align: 'center',
      baseline: 'middle',
      opacity: subtitleReveal * 0.92,
    }));
  }

  return group({ children });
}

// ─── Measure ──────────────────────────────────────────────────────────────────

/** Bounds of the finished state, with room for the panel's flip overshoot. */
export function measureRoadSign(input: StyleRenderInput<RoadSignSettings>): StyleBounds {
  const { panelWidth, panelHeight } = layout(input);
  const finished = renderRoadSign({ ...input, phase: 'visible', phaseProgress: 1 });
  const overshoot = panelHeight * 0.12;
  return boundsOf(finished, rect({ x: -panelWidth / 2, y: -panelHeight - overshoot, width: panelWidth, height: overshoot }));
}

// ─── Style Definition ─────────────────────────────────────────────────────────

export const roadSignStyle: AnnotationStyleDefinition<RoadSignSettings> = {
  id: 'road-sign',
  version: 1,
  name: 'Road Sign',
  description: 'A highway guide sign on posts that flips up from the ground, with an optional route shield',
  category: 'sign',
  icon: 'signpost',
  contentSlots: ['title', 'subtitle', 'badge'],
  settingsSchema: roadSignSettingsSchema,
  defaultSettings: defaultRoadSignSettings,
  supportsAltitude: true,
  defaultAltitude: 70,
  defaultOffset: [0, 0],
  drawsConnector: true,
  defaultConnector: { visible: false },
  defaultTransition: {
    enter: 'auto',
    exit: 'auto',
    enterDuration: 1.1,
    exitDuration: 0.5,
  },
  controls: [
    { type: 'color', key: 'signColor', label: 'Sign color' },
    { type: 'color', key: 'textColor', label: 'Text color' },
    {
      type: 'select',
      key: 'shield',
      label: 'Route shield',
      options: [
        { value: 'none', label: 'None' },
        { value: 'interstate', label: 'Interstate' },
        { value: 'circle', label: 'Circle' },
      ],
    },
    { type: 'slider', key: 'posts', label: 'Posts', min: 1, max: 2, step: 1 },
  ],
  render: renderRoadSign,
  measure: measureRoadSign,
};
