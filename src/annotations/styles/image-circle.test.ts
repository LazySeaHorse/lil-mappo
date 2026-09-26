import { describe, it, expect, vi } from 'vitest';
import { imageCircleStyle, imageCircleSettingsSchema } from './image-circle';
import type { StyleRenderInput } from '../types';
import type { ImageCircleSettings } from './image-circle';
import { shadows } from '../scene/primitives';

describe('imageCircleStyle', () => {
  const baseInput: StyleRenderInput<ImageCircleSettings> = {
    content: {
      title: 'Mount Fuji',
      image: 'https://example.com/fuji.jpg',
    },
    settings: { ...imageCircleStyle.defaultSettings },
    phase: 'visible',
    phaseProgress: 1,
    itemTime: 0,
    playheadTime: 0,
    pixelRatio: 1,
  };

  it('has the correct metadata and defaults', () => {
    expect(imageCircleStyle.id).toBe('image-circle');
    expect(imageCircleStyle.version).toBe(1);
    expect(imageCircleStyle.name).toBe('Image Circle');
    expect(imageCircleStyle.description).toBe('Circular image with border and optional label');
    expect(imageCircleStyle.category).toBe('media');
    expect(imageCircleStyle.icon).toBe('image');
    expect(imageCircleStyle.contentSlots).toEqual(['title', 'image']);
    expect(imageCircleStyle.defaultConnector).toEqual({ visible: false });
  });

  it('validates settings with default values', () => {
    const parsed = imageCircleSettingsSchema.parse({});
    expect(parsed).toEqual({
      borderColor: '#ffffff',
      borderWidth: 3,
      size: 48,
      showShadow: true,
      textColor: '#f8fafc',
      fontFamily: 'Outfit',
      fontSize: 12,
      labelPosition: 'bottom',
    });
    expect(imageCircleStyle.defaultSettings).toEqual(parsed);
  });

  it('defines all required inspector controls', () => {
    expect(imageCircleStyle.controls).toEqual([
      { type: 'color', key: 'borderColor', label: 'Border color' },
      { type: 'slider', key: 'borderWidth', label: 'Border width', min: 1, max: 8, step: 0.5, unit: 'px' },
      { type: 'slider', key: 'size', label: 'Size', min: 24, max: 96, step: 2, unit: 'px' },
      { type: 'switch', key: 'showShadow', label: 'Drop shadow' },
      { type: 'color', key: 'textColor', label: 'Text color' },
      { type: 'font', key: 'fontFamily', label: 'Font' },
      {
        type: 'select',
        key: 'labelPosition',
        label: 'Label position',
        options: [
          { value: 'bottom', label: 'Bottom' },
          { value: 'right', label: 'Right' },
        ],
      },
    ]);
  });

  it('renders outer ring, image, and label text when bottom-positioned', () => {
    const scene = imageCircleStyle.render(baseInput);
    expect(scene.type).toBe('group');
    if (scene.type !== 'group') return;

    expect(scene.children.length).toBe(3);

    // 1. Outer ring circle
    const ring = scene.children[0];
    expect(ring.type).toBe('circle');
    if (ring.type === 'circle') {
      expect(ring.cx).toBe(0);
      expect(ring.cy).toBe(0);
      expect(ring.r).toBe(24); // size 48 / 2
      expect(ring.stroke).toBe('#ffffff');
      expect(ring.strokeWidth).toBe(3);
      expect(ring.shadow).toEqual(shadows.md);
      expect(ring.fill).toBeUndefined();
    }

    // 2. Image node
    const imgNode = scene.children[1];
    expect(imgNode.type).toBe('image');
    if (imgNode.type === 'image') {
      expect(imgNode.x).toBe(-24);
      expect(imgNode.y).toBe(-24);
      expect(imgNode.width).toBe(48);
      expect(imgNode.height).toBe(48);
      expect(imgNode.cornerRadius).toBe(24);
      expect(imgNode.objectFit).toBe('cover');
      expect(imgNode.src).toBe('https://example.com/fuji.jpg');
    }

    // 3. Label text (bottom)
    const label = scene.children[2];
    expect(label.type).toBe('text');
    if (label.type === 'text') {
      expect(label.x).toBe(0);
      // y = radius (24) + borderWidth (3) + GAP (8) = 35
      expect(label.y).toBe(35);
      expect(label.text).toBe('Mount Fuji');
      expect(label.align).toBe('center');
      expect(label.baseline).toBe('top');
      expect(label.fontSize).toBe(12);
      expect(label.fontFamily).toBe('Outfit');
      expect(label.fill).toBe('#f8fafc');
    }
  });

  it('renders outer ring, image, and label text when right-positioned', () => {
    const rightInput: StyleRenderInput<ImageCircleSettings> = {
      ...baseInput,
      settings: {
        ...baseInput.settings,
        labelPosition: 'right',
      },
    };
    const scene = imageCircleStyle.render(rightInput);
    if (scene.type !== 'group') return;

    expect(scene.children.length).toBe(3);

    const label = scene.children[2];
    expect(label.type).toBe('text');
    if (label.type === 'text') {
      // x = radius (24) + borderWidth (3) + GAP (8) = 35
      expect(label.x).toBe(35);
      expect(label.y).toBe(0);
      expect(label.align).toBe('left');
      expect(label.baseline).toBe('middle');
      expect(label.text).toBe('Mount Fuji');
    }
  });

  it('renders fallback circle when image is not provided', () => {
    const noImageInput: StyleRenderInput<ImageCircleSettings> = {
      ...baseInput,
      content: {
        title: 'No Image Place',
      },
    };
    const scene = imageCircleStyle.render(noImageInput);
    if (scene.type !== 'group') return;

    expect(scene.children.length).toBe(3);

    const fallback = scene.children[1];
    expect(fallback.type).toBe('circle');
    if (fallback.type === 'circle') {
      expect(fallback.cx).toBe(0);
      expect(fallback.cy).toBe(0);
      expect(fallback.r).toBe(24);
      expect(fallback.fill).toBeDefined();
    }
  });

  it('omits label text when title is not provided or empty', () => {
    const noTitleInput: StyleRenderInput<ImageCircleSettings> = {
      ...baseInput,
      content: {
        image: 'https://example.com/fuji.jpg',
      },
    };
    const scene = imageCircleStyle.render(noTitleInput);
    if (scene.type !== 'group') return;

    expect(scene.children.length).toBe(2); // ring + image
  });

  it('omits shadow when showShadow is false', () => {
    const noShadowInput: StyleRenderInput<ImageCircleSettings> = {
      ...baseInput,
      settings: {
        ...baseInput.settings,
        showShadow: false,
      },
    };
    const scene = imageCircleStyle.render(noShadowInput);
    if (scene.type !== 'group') return;

    const ring = scene.children[0];
    if (ring.type === 'circle') {
      expect(ring.shadow).toBeUndefined();
    }
  });

  it('measures dimensions accurately for bottom labelPosition', () => {
    const dims = imageCircleStyle.measure(baseInput);
    // circleOuterSize = 48 + 3 * 2 = 54
    // height = 54 + 8 (GAP) + 12 (fontSize) = 74
    expect(dims.height).toBe(74);
    // width = max(54, textWidth)
    expect(dims.width).toBeGreaterThanOrEqual(54);
  });

  it('measures dimensions accurately for right labelPosition', () => {
    const rightInput: StyleRenderInput<ImageCircleSettings> = {
      ...baseInput,
      settings: {
        ...baseInput.settings,
        labelPosition: 'right',
      },
    };
    const dims = imageCircleStyle.measure(rightInput);
    // circleOuterSize = 48 + 3 * 2 = 54
    // height = 54
    expect(dims.height).toBe(54);
    // width = 54 + 8 (GAP) + textWidth
    expect(dims.width).toBeGreaterThan(62);
  });

  it('measures dimensions accurately without title', () => {
    const noTitleInput: StyleRenderInput<ImageCircleSettings> = {
      ...baseInput,
      content: {},
    };
    const dims = imageCircleStyle.measure(noTitleInput);
    // circleOuterSize = 54
    expect(dims.width).toBe(54);
    expect(dims.height).toBe(54);
  });

  it('migrates older settings correctly', () => {
    const migrated = imageCircleStyle.migrate!(0, {
      size: 64,
      borderColor: '#ff0000',
    });
    expect(migrated).toEqual({
      borderColor: '#ff0000',
      borderWidth: 3,
      size: 64,
      showShadow: true,
      textColor: '#f8fafc',
      fontFamily: 'Outfit',
      fontSize: 12,
      labelPosition: 'bottom',
    });
  });
});
