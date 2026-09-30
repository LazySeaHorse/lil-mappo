import { describe, it, expect } from 'vitest';
import type { GroupNode, PolylineNode, SceneNode, StyleRenderInput, TextNode } from '../types';
import {
  defaultLeaderLineSettings,
  leaderLineSettingsSchema,
  leaderLineStyle,
  measureLeaderLine,
  renderLeaderLine,
  type LeaderLineSettings,
} from './leader-line';
import { HALO_REACH, HALO_SHADOW } from './shared';
import { measureTextWidth } from '../scene/textMetrics';
import { measureScene } from '../scene/measure';

const GROUND = { x: -70, y: 90 };

function makeInput(overrides: Partial<StyleRenderInput<LeaderLineSettings>> = {}): StyleRenderInput<LeaderLineSettings> {
  return {
    content: { title: 'Harbour Bridge', subtitle: 'Sydney, Australia' },
    settings: { ...defaultLeaderLineSettings },
    phase: 'visible',
    phaseProgress: 1,
    ground: GROUND,
    itemTime: 3,
    playheadTime: 3,
    pixelRatio: 1,
    ...overrides,
  };
}

const enter = (progress: number, overrides: Partial<StyleRenderInput<LeaderLineSettings>> = {}) =>
  renderLeaderLine(makeInput({ phase: 'enter', phaseProgress: progress, ...overrides }));

function flatten(node: SceneNode): SceneNode[] {
  return node.type === 'group' ? [node, ...node.children.flatMap(flatten)] : [node];
}

const texts = (scene: SceneNode) => flatten(scene).filter((n): n is TextNode => n.type === 'text');
const lines = (scene: SceneNode) => flatten(scene).filter((n): n is PolylineNode => n.type === 'polyline');
const clipGroups = (scene: SceneNode) => flatten(scene).filter((n): n is GroupNode => n.type === 'group' && !!n.clip);

describe('leaderLineStyle definition', () => {
  it('is a self-animating, self-connecting label with a visible default offset', () => {
    expect(leaderLineStyle).toMatchObject({
      id: 'leader-line',
      category: 'label',
      drawsConnector: true,
      defaultOffset: [70, -90],
      defaultAltitude: 0,
      defaultTransition: { enter: 'auto', exit: 'auto', enterDuration: 1.2, exitDuration: 0.5 },
      contentSlots: ['title', 'subtitle'],
    });
  });

  it('has controls for every setting except the fixed font', () => {
    const keys = leaderLineStyle.controls.map((c) => c.key).sort();
    expect(keys).toEqual(Object.keys(defaultLeaderLineSettings).sort());
    expect(leaderLineStyle.controls.some((c) => c.type === 'font')).toBe(false);
  });

  it('fills defaults for missing settings', () => {
    expect(leaderLineSettingsSchema.parse({})).toEqual(defaultLeaderLineSettings);
    expect(leaderLineSettingsSchema.parse({ side: 'left' }).side).toBe('left');
    expect(leaderLineSettingsSchema.safeParse({ side: 'up' }).success).toBe(false);
  });
});

describe('side', () => {
  it('draws the shelf and text to the right for a point on the left, and mirrors it', () => {
    const right = renderLeaderLine(makeInput());
    const [, rightShelf] = lines(right).filter((l) => l.stroke === '#FFFFFF');
    expect(rightShelf.points[1][0]).toBeGreaterThan(0);
    expect(texts(right).every((t) => t.align === 'left' && t.x > 0)).toBe(true);

    const left = renderLeaderLine(makeInput({ ground: { x: 70, y: 90 } }));
    const [, leftShelf] = lines(left).filter((l) => l.stroke === '#FFFFFF');
    expect(leftShelf.points[1][0]).toBeLessThan(0);
    expect(texts(left).every((t) => t.align === 'right' && t.x < 0)).toBe(true);
    expect(leftShelf.points[1][0]).toBe(-rightShelf.points[1][0]);
  });
});

describe('layout', () => {
  it('runs the diagonal from the ground point to the elbow at the origin', () => {
    const [diagonal] = lines(renderLeaderLine(makeInput())).filter((l) => l.stroke === '#FFFFFF');
    expect(diagonal.points).toEqual([[-70, 90], [0, 0]]);
  });

  it('sizes the shelf to the wider of title and subtitle, plus padding', () => {
    const shelfLength = (input: StyleRenderInput<LeaderLineSettings>) => {
      const [, shelf] = lines(renderLeaderLine(input)).filter((l) => l.stroke === '#FFFFFF');
      return shelf.points[1][0];
    };
    const title = measureTextWidth('HARBOUR BRIDGE', 22, 'Barlow Condensed', 600, '0.06em');
    const subtitle = measureTextWidth('Sydney, Australia', 14, 'Barlow Condensed', 500);
    expect(shelfLength(makeInput())).toBeCloseTo(Math.ceil(Math.max(title, subtitle)) + 12, 0);

    const long = makeInput({ content: { title: 'Hi', subtitle: 'A considerably longer subtitle than the title' } });
    const short = makeInput({ content: { title: 'Hi' } });
    expect(shelfLength(long)).toBeGreaterThan(shelfLength(short));
  });

  it('sets the title in uppercase display type and the subtitle in sentence case', () => {
    const [title, subtitle] = texts(renderLeaderLine(makeInput()));
    expect(title).toMatchObject({ text: 'HARBOUR BRIDGE', fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 22, baseline: 'alphabetic' });
    expect(subtitle).toMatchObject({ text: 'Sydney, Australia', fontFamily: 'Barlow Condensed', fontWeight: 500, baseline: 'top' });
    expect(title.y).toBeLessThan(0); // title above the shelf
    expect(subtitle.y).toBeGreaterThan(0); // subtitle below it
  });

  it('omits the subtitle and the title when they are empty, keeping the line and dot', () => {
    const noSubtitle = renderLeaderLine(makeInput({ content: { title: 'Solo' } }));
    expect(texts(noSubtitle)).toHaveLength(1);

    const bare = renderLeaderLine(makeInput({ content: { title: '  ' } }));
    expect(texts(bare)).toHaveLength(0);
    expect(lines(bare).length).toBeGreaterThan(0);
  });

  it('lifts text, lines and the dot with a soft shadow unless the halo is turned off', () => {
    const shadowed = renderLeaderLine(makeInput());
    const withShadow = flatten(shadowed).filter((n) => 'shadow' in n && n.shadow);
    expect(texts(shadowed).every((t) => t.shadow && t.stroke === undefined)).toBe(true);
    expect(lines(shadowed).every((l) => l.shadow)).toBe(true);
    expect(withShadow.length).toBeGreaterThanOrEqual(6);
    expect(texts(shadowed)[0].shadow).toBe(HALO_SHADOW);
    expect(lines(shadowed)).toHaveLength(2); // no doubled underlay lines

    const flat = renderLeaderLine(makeInput({ settings: { ...defaultLeaderLineSettings, halo: false } }));
    expect(flatten(flat).some((n) => 'shadow' in n && n.shadow)).toBe(false);
  });

  it('applies the colour and width settings', () => {
    const scene = renderLeaderLine(makeInput({
      settings: { ...defaultLeaderLineSettings, lineColor: '#00ff00', textColor: '#0000ff', accentColor: '#ff00ff', lineWidth: 3 },
    }));
    expect(lines(scene).find((l) => l.stroke === '#00ff00')?.strokeWidth).toBe(3);
    expect(texts(scene).every((t) => t.fill === '#0000ff')).toBe(true);
    const circles = flatten(scene).filter((n) => n.type === 'circle');
    expect(circles.some((c) => c.type === 'circle' && c.fill === '#ff00ff')).toBe(true);
  });
});

describe('measure', () => {
  it('covers the ground dot, the elbow, the whole shelf and the text above and below it', () => {
    const bounds = measureLeaderLine(makeInput());
    const titleWidth = measureTextWidth('HARBOUR BRIDGE', 22, 'Barlow Condensed', 600, '0.06em');

    // Ground dot with its ring, at (-70, 90).
    expect(bounds.x).toBeLessThanOrEqual(-70 - 8);
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(90 + 8);
    // Shelf and title to the right of the elbow; title above, subtitle below.
    expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(titleWidth);
    expect(bounds.y).toBeLessThanOrEqual(-22);
    const [title, subtitle] = texts(renderLeaderLine(makeInput()));
    expect(bounds.y).toBeLessThanOrEqual(title.y - 22);
    expect(subtitle.y).toBeGreaterThan(0);
  });

  it('mirrors for the left side', () => {
    const right = measureLeaderLine(makeInput());
    const left = measureLeaderLine(makeInput({ ground: { x: 70, y: 90 } }));
    expect(left.width).toBeCloseTo(right.width);
    expect(left.x + left.width).toBeCloseTo(-right.x);
  });

  it('is the finished state whatever the phase, and follows the ground point', () => {
    const settled = measureLeaderLine(makeInput());
    expect(measureLeaderLine(makeInput({ phase: 'enter', phaseProgress: 0 }))).toEqual(settled);
    expect(measureLeaderLine(makeInput({ phase: 'exit', phaseProgress: 0.7 }))).toEqual(settled);

    const higher = measureLeaderLine(makeInput({ ground: { x: -70, y: 190 } }));
    expect(higher.height).toBeGreaterThan(settled.height);
  });

  it('reserves room for a pulse ring around the ground point', () => {
    const pulsing = measureLeaderLine(makeInput({ settings: { ...defaultLeaderLineSettings, pulse: true } }));
    expect(pulsing.y + pulsing.height).toBeGreaterThanOrEqual(90 + 18);
  });
});

describe('entrance choreography', () => {
  it('draws nothing at progress 0', () => {
    const scene = enter(0);
    expect(scene).toEqual({ type: 'group', children: [] });
    expect(measureScene(scene).width).toBe(0);
  });

  it('is identical to the visible state at progress 1', () => {
    expect(enter(1)).toEqual(renderLeaderLine(makeInput()));
  });

  it('pops the dot first, with overshoot, before any line has started', () => {
    const early = enter(0.1);
    const dot = flatten(early).find((n): n is GroupNode => n.type === 'group' && n.scale !== undefined)!;
    expect(dot.scale).toBeGreaterThan(0);
    expect(lines(early)).toHaveLength(0);

    const peak = Math.max(
      ...Array.from({ length: 40 }, (_, i) => {
        const g = flatten(enter(i / 100)).find((n): n is GroupNode => n.type === 'group' && n.scale !== undefined);
        return g?.scale ?? 0;
      }),
    );
    expect(peak).toBeGreaterThan(1);
  });

  it('expands and fades a ring as the dot lands, then removes it', () => {
    const ring = (p: number) => flatten(enter(p)).find((n) => n.type === 'circle' && n.opacity !== undefined && n.opacity < 1 && n.opacity !== 0.7);
    const early = ring(0.1);
    const later = ring(0.3);
    expect(early && later && early.type === 'circle' && later.type === 'circle').toBeTruthy();
    if (early?.type === 'circle' && later?.type === 'circle') {
      expect(later.r).toBeGreaterThan(early.r);
      expect(later.opacity).toBeLessThan(early.opacity!);
    }
    expect(ring(0.6)).toBeUndefined();
  });

  it('draws the diagonal on before the shelf, and lets them overlap', () => {
    const progress = (p: number, index: number) =>
      lines(enter(p)).filter((l) => l.stroke === '#FFFFFF')[index]?.progress ?? 0;

    expect(progress(0.3, 0)).toBeGreaterThan(0);
    expect(progress(0.3, 0)).toBeLessThan(1);
    expect(progress(0.3, 1)).toBe(0);
    // Both are part-drawn at once around 0.45.
    expect(progress(0.45, 0)).toBeGreaterThan(0.5);
    expect(progress(0.45, 1)).toBeGreaterThan(0);
    expect(progress(0.45, 1)).toBeLessThan(1);
    expect(progress(0.6, 0)).toBe(1);
    expect(progress(0.9, 1)).toBe(1);
  });

  it('wipes the title up from behind the shelf through a clip, then the subtitle follows', () => {
    expect(texts(enter(0.55))).toHaveLength(0);

    const mid = enter(0.75);
    const [clip] = clipGroups(mid);
    expect(clip.clip!.y + clip.clip!.height).toBeLessThanOrEqual(0); // clipped at the shelf line
    const [inner] = clip.children as GroupNode[];
    expect(inner.y).toBeGreaterThan(0); // still below its resting place
    expect(texts(mid).filter((t) => t.baseline === 'top')).toHaveLength(0); // subtitle not yet

    const [settledClip] = clipGroups(enter(0.95));
    expect((settledClip.children[0] as GroupNode).y).toBeCloseTo(0, 1);
    const subtitle = texts(enter(0.9)).find((t) => t.baseline === 'top')!;
    expect(subtitle.opacity).toBeGreaterThan(0);
    expect(subtitle.opacity).toBeLessThan(0.85);
    expect(texts(enter(1)).find((t) => t.baseline === 'top')!.opacity).toBeCloseTo(0.85);
  });

  it('keeps the title clip wide and tall enough not to crop the finished text', () => {
    const [clip] = clipGroups(renderLeaderLine(makeInput()));
    const [title] = texts(clip);
    const box = measureScene(title);
    const shadowReach = HALO_REACH;
    expect(clip.clip!.y).toBeLessThanOrEqual(box.minY);
    expect(clip.clip!.x).toBeLessThanOrEqual(box.minX);
    expect(clip.clip!.x + clip.clip!.width).toBeGreaterThanOrEqual(box.maxX);
    expect(shadowReach).toBeGreaterThan(0);
    // Capitals sit on the baseline, so only the empty descender space is cropped.
    expect(clip.clip!.y + clip.clip!.height).toBeGreaterThanOrEqual(title.y);
  });
});

describe('exit choreography', () => {
  it('plays the entrance in reverse', () => {
    for (const p of [0, 0.2, 0.5, 0.8, 1]) {
      expect(renderLeaderLine(makeInput({ phase: 'exit', phaseProgress: p }))).toEqual(enter(1 - p));
    }
  });

  it('starts complete and ends empty', () => {
    expect(renderLeaderLine(makeInput({ phase: 'exit', phaseProgress: 0 }))).toEqual(renderLeaderLine(makeInput()));
    expect(renderLeaderLine(makeInput({ phase: 'exit', phaseProgress: 1 }))).toEqual({ type: 'group', children: [] });
  });
});

describe('visible phase', () => {
  it('is static without pulse', () => {
    expect(renderLeaderLine(makeInput({ itemTime: 3 }))).toEqual(renderLeaderLine(makeInput({ itemTime: 4.1 })));
  });

  it('pulses the ground ring over item time when enabled, and only once visible', () => {
    const settings = { ...defaultLeaderLineSettings, pulse: true };
    const still = renderLeaderLine(makeInput());
    const a = renderLeaderLine(makeInput({ settings, itemTime: 3 }));
    const b = renderLeaderLine(makeInput({ settings, itemTime: 3.6 }));

    expect(flatten(a).length).toBe(flatten(still).length + 1);
    expect(a).not.toEqual(b);
    // Repeats every period (2.4s).
    expect(renderLeaderLine(makeInput({ settings, itemTime: 2.4 }))).toEqual(renderLeaderLine(makeInput({ settings, itemTime: 0 })));
    // Not while entering.
    expect(enter(1, { settings })).toEqual(still);
  });
});
