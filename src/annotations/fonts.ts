/**
 * Typefaces the annotation styles are designed around. Styles reference these
 * constants rather than repeating family names, so a face is defined once and
 * its @fontsource import in src/index.css stays in step.
 *
 * Canvas text only draws a web font once it has loaded, so styles must draw
 * with these exact family/weight pairs: collectSceneAssets picks them up from
 * the scene's text nodes and loadSceneAssets waits for them before export.
 */
export const ANNOTATION_FONTS = {
  /** Condensed display sans for labels and headlines. */
  condensed: 'Barlow Condensed',
  /** Editorial serif. */
  serif: 'Fraunces',
  /** Handwriting for hand-drawn notes. */
  handwritten: 'Caveat',
  /** Highway-sign lettering. */
  sign: 'Overpass',
} as const;
