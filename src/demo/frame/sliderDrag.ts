import { beginGesture, endGesture } from '@/store/history';
import { drag, find, warn, type DemoContext, type Target } from './actions';

/**
 * Drags a Radix slider's thumb to a value, as a hand does. The arrow keys that
 * `setSlider` steps with cannot move a logarithmic slider (SliderRow rounds
 * each value to its step, which puts the thumb back on the grid point it just
 * left), so the model Size sliders are dragged instead. The drag is one
 * gesture, one undo step; the value lands within one step of the target.
 */
export async function dragSlider(
  ctx: DemoContext,
  target: Target,
  value: number,
  { toSlider = (v) => v }: { toSlider?: (value: number) => number } = {},
): Promise<boolean> {
  const found = await find(ctx, target);
  if (!found) return false;
  const thumb = found.getAttribute('role') === 'slider' ? found : found.querySelector('[role="slider"]');
  const root = thumb?.closest('[data-slot="slider"]');
  if (!thumb || !root) {
    warn('dragSlider: no slider thumb in the target');
    return false;
  }
  const min = Number(thumb.getAttribute('aria-valuemin'));
  const max = Number(thumb.getAttribute('aria-valuemax'));
  const goal = Math.min(max, Math.max(min, toSlider(value)));
  // Radix reads the pointer across the whole track.
  const rect = root.getBoundingClientRect();
  const to = {
    x: rect.left + (max > min ? (rect.width * (goal - min)) / (max - min) : 0),
    y: rect.top + rect.height / 2,
  };
  beginGesture();
  try {
    return await drag(ctx, thumb, to);
  } finally {
    endGesture();
  }
}
