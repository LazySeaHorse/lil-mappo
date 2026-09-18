import { describe, it, expect } from 'vitest';
import { smartMonkeyActions } from '../../e2e/fuzz/smartMonkeyActions';

describe('smartMonkeyActions catalog', () => {
  it('contains valid actions with positive weights', () => {
    expect(smartMonkeyActions.length).toBeGreaterThan(10);

    for (const action of smartMonkeyActions) {
      expect(action.name).toBeTruthy();
      expect(action.category).toBeTruthy();
      expect(action.weight).toBeGreaterThan(0);
      expect(typeof action.execute).toBe('function');
    }
  });

  it('provides balanced category coverage matching Approach C specification', () => {
    const weightsByCategory: Record<string, number> = {};
    for (const action of smartMonkeyActions) {
      weightsByCategory[action.category] = (weightsByCategory[action.category] || 0) + action.weight;
    }

    expect(weightsByCategory.timeline).toBeGreaterThanOrEqual(20);
    expect(weightsByCategory.canvas).toBeGreaterThanOrEqual(20);
    expect(weightsByCategory.drafting).toBeGreaterThanOrEqual(15);
    expect(weightsByCategory.inspector).toBeGreaterThanOrEqual(15);
  });
});
