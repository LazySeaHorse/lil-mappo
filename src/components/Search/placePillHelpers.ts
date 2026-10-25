/** The part of a place name before its first comma, which is all a pill has room for. */
export const shortPlaceName = (name: string, point: [number, number]) =>
  name.split(',')[0].trim() || `${point[1].toFixed(3)}, ${point[0].toFixed(3)}`;

/** Moves the cursor to the text input of the box that holds `from`. */
export const focusPlaceBox = (from: HTMLElement) =>
  from.closest<HTMLElement>('[data-place-box]')?.querySelector('input')?.focus();
