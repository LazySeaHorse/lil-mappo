import { cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { currentLocators } from './locators';
import { testContext } from './testContext';
import { fitSpan } from './timelineActions';

/** The timeline's zoom button and ruler, as far as fitSpan sees them: the button divides the zoom, down to a floor. */
function FakeTimeline({ floor, onPress }: { floor: number; onPress: () => void }) {
  const [pixelsPerSecond, setPixelsPerSecond] = useState(60);
  return (
    <div data-walkthrough="timeline-panel">
      <button
        title="Zoom Out"
        onClick={() => {
          onPress();
          setPixelsPerSecond((value) => Math.max(floor, value / 1.25));
        }}
      />
      <div data-slot="scroll-area-viewport" />
      <svg><rect data-testid="timeline-ruler-past-end" x={10 * pixelsPerSecond} /></svg>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(floor: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
  useProjectStore.setState({ ...createTransientState(), duration: 10 });
  const presses = vi.fn();
  render(<FakeTimeline floor={floor} onPress={presses} />);
  return presses;
}

describe('fitSpan', () => {
  it('zooms out until the span fits, then stops', async () => {
    const presses = setup(1);
    // 10 s fit 400px (minus the gutter and margin) at about 34 px/s: three presses from 60.
    await fitSpan(testContext(), currentLocators(), 10);
    expect(presses.mock.calls.length).toBeGreaterThan(0);
    expect(presses.mock.calls.length).toBeLessThan(6);
  });

  it('presses nothing when the span already fits', async () => {
    const presses = setup(1);
    await fitSpan(testContext(), currentLocators(), 2);
    expect(presses).not.toHaveBeenCalled();
  });

  it('stops after one press that changes nothing, when the span can never fit', async () => {
    // The zoom is already at its floor (the whole project fits), yet the span asked for runs past the project's end.
    const presses = setup(60);
    await fitSpan(testContext(), currentLocators(), 40);
    expect(presses).toHaveBeenCalledTimes(1);
  });
});
