/**
 * Convert hex color to rgba string with the specified alpha value.
 * Returns the original hex if it's not a valid 7+ char hex string (e.g., "#000000").
 */
export function hexToRgba(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
