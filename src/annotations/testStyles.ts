/**
 * Minimal styles for tests that need behaviour the shipped styles don't have:
 * the generic ground connector, altitude support, or a second style to switch
 * to. Not part of the app; nothing outside tests imports this.
 */

import { z } from 'zod';
import { hasStyle, registerStyle } from './registry';
import { group, rect, text } from './scene/primitives';
import type { AnnotationStyleDefinition, StyleRenderInput } from './types';

export const TEST_CARD_STYLE_ID = 'test-card';
export const TEST_FLAT_STYLE_ID = 'test-flat';

const CARD_WIDTH = 80;
const CARD_HEIGHT = 24;

const settingsSchema = z.object({ color: z.string().default('#0f172a') });
type TestSettings = z.infer<typeof settingsSchema>;

function renderCard({ content, settings }: StyleRenderInput<TestSettings>) {
  return group({
    children: [
      rect({ x: -CARD_WIDTH / 2, y: -CARD_HEIGHT, width: CARD_WIDTH, height: CARD_HEIGHT, fill: settings.color }),
      text({
        x: 0,
        y: -CARD_HEIGHT / 2,
        text: content.title,
        fontSize: 14,
        fontFamily: 'Outfit',
        fill: '#fff',
        align: 'center',
        baseline: 'middle',
      }),
    ],
  });
}

const base = {
  version: 1,
  description: 'Test style',
  category: 'label' as const,
  icon: 'square',
  contentSlots: ['title'],
  settingsSchema,
  defaultSettings: { color: '#0f172a' },
  controls: [{ type: 'color', key: 'color', label: 'Card color' }],
  render: renderCard,
  measure: () => ({ x: -CARD_WIDTH / 2, y: -CARD_HEIGHT, width: CARD_WIDTH, height: CARD_HEIGHT }),
} satisfies Partial<AnnotationStyleDefinition<TestSettings>>;

/** A card standing on its origin, joined to the ground by the generic connector. */
export const testCardStyle: AnnotationStyleDefinition<TestSettings> = {
  ...base,
  id: TEST_CARD_STYLE_ID,
  name: 'Test card',
  supportsAltitude: true,
};

/** A flat marker that sits on the map: no altitude, no connector. */
export const testFlatStyle: AnnotationStyleDefinition<TestSettings> = {
  ...base,
  id: TEST_FLAT_STYLE_ID,
  name: 'Test flat',
  supportsAltitude: false,
};

/** Registers the test styles (idempotent). */
export function registerTestStyles(): void {
  for (const style of [testCardStyle, testFlatStyle]) {
    if (!hasStyle(style.id)) registerStyle(style);
  }
}
