import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * Mapbox GL's own model-placement math, lifted out of the installed mapbox-gl bundle, so tests can
 * check how Mapbox will actually orient a model from what our renderers send it, rather than
 * trusting that a paint value or a feature property "should" reach the drawn model.
 *
 * The functions are copied verbatim from node_modules/mapbox-gl/dist/mapbox-gl-dev.js at test time.
 * Which of them each draw path calls is read from the same file (drawVectorLayerModels and
 * drawModels), and `mapboxDrawPaths` returns those source texts so tests can fail loudly if a
 * mapbox-gl upgrade changes the paths these helpers mirror.
 */

const require = createRequire(import.meta.url);
const BUNDLE = readFileSync(require.resolve('mapbox-gl/dist/mapbox-gl-dev.js'), 'utf8');

function functionSource(name: string): string {
  const start = BUNDLE.indexOf(`\nfunction ${name}(`);
  if (start < 0) throw new Error(`mapbox-gl bundle has no function ${name}`);
  let depth = 0;
  for (let k = BUNDLE.indexOf('{', start); k < BUNDLE.length; k++) {
    if (BUNDLE[k] === '{') depth++;
    else if (BUNDLE[k] === '}' && --depth === 0) return BUNDLE.slice(start, k + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function constSource(name: string): string {
  const match = new RegExp(`\\n(?:const|var|let) ${name.replace(/\$/g, '\\$')} = [^;]*;`).exec(BUNDLE);
  if (!match) throw new Error(`mapbox-gl bundle has no constant ${name}`);
  return match[0];
}

type Vec3 = [number, number, number];
type Mat = number[];

interface MapboxMath {
  rotationScaleYZFlipMatrix(out: Mat, rotation: number[], scale: number[]): void;
  getScaling(out: number[], mat: Mat): number[];
  getRotation(out: number[], mat: Mat): number[];
  getAxisAngle(outAxis: number[], q: number[]): number;
  create$2(): number[];
}

const FUNCTIONS = ['identity$3', 'rotateZ$3', 'rotateX$3', 'rotateY$3', 'scale$6', 'multiply$5', 'degToRad',
  'getScaling', 'getRotation', 'getAxisAngle', 'create$2', 'rotationScaleYZFlipMatrix'];

const math = new Function([
  ...['ARRAY_TYPE', 'EPSILON', 'DEG_TO_RAD', 'COORD_SPACE_TRANSFORM'].map(constSource),
  ...FUNCTIONS.map(functionSource),
  `return { ${FUNCTIONS.map((n) => `${JSON.stringify(n)}: ${n}`).join(', ')} };`,
].join('\n'))() as MapboxMath;

/** The source text of the two functions that draw a model layer, from a GeoJSON source or a model source. */
export function mapboxDrawPaths(): { geojson: string; modelSource: string; modelMatrix: string } {
  return {
    geojson: functionSource('drawVectorLayerModels'),
    modelSource: functionSource('drawModels'),
    modelMatrix: functionSource('calculateModelMatrix'),
  };
}

/** A GeoJSON-source model: the per-instance matrix ModelBucket.evaluate bakes when the tile is built. */
export function bucketInstanceMatrix(rotation: number[], scale: number[]): Mat {
  const out: Mat = [];
  math.rotationScaleYZFlipMatrix(out, rotation, scale);
  return out;
}

/**
 * A GeoJSON-source model on the globe (zoom below 6 in globe projection): drawVectorLayerModels
 * decomposes the baked instance matrix back into a rotation, then calculateModelMatrix rebuilds it
 * from `model.orientation + rotation`. Mirrors those two functions step for step.
 */
export function globeGeoJSONMatrix(rotation: number[], scale: number[], orientation: number[] = [0, 0, 0]): Mat {
  const instance = bucketInstanceMatrix(rotation, scale);
  const decomposed: Vec3 = [0, 0, 0];
  const decomposedScale: Vec3 = [1, 1, 1];
  const q = math.create$2();
  math.getScaling(decomposedScale, instance);
  math.getRotation(q, instance);
  math.getAxisAngle(decomposed, q);
  return modelSourceMatrix(orientation, decomposed, decomposedScale);
}

/** A model-source model, either projection: drawModels -> calculateModelMatrix with `orientation + rotation`. */
export function modelSourceMatrix(orientation: number[], rotation: number[], scale: number[]): Mat {
  const out: Mat = [];
  math.rotationScaleYZFlipMatrix(out, [0, 1, 2].map((i) => orientation[i] + rotation[i]), scale);
  return out;
}

/** The compass heading (degrees, 0..360) a rotation-scale matrix built by Mapbox turns a model to. */
export function headingOf(matrix: Mat): number {
  return ((Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI + 360) % 360;
}

interface StyleSpec {
  latest: { paint_model: Record<string, unknown> };
  expression: {
    createExpression(value: unknown, spec: unknown): {
      result: 'success' | 'error';
      value: { evaluate(globals: { zoom: number }, feature?: { type: string; properties: Record<string, unknown> }): unknown } | unknown[];
    };
  };
  validate(style: unknown): Array<{ message: string }>;
}

/** Mapbox's style spec as shipped in mapbox-gl: the real validator and expression compiler. */
export const styleSpec = require('mapbox-gl/dist/style-spec/index.cjs') as StyleSpec;

/** Evaluates a model-layer paint value as Mapbox does for one feature. */
export function evaluateModelPaint(property: string, value: unknown, properties: Record<string, unknown> = {}): number[] {
  const spec = styleSpec.latest.paint_model[property] as { default?: unknown };
  const compiled = styleSpec.expression.createExpression(value ?? spec.default, spec);
  if (compiled.result !== 'success') throw new Error(`${property}: ${JSON.stringify(compiled.value)}`);
  const evaluated = (compiled.value as { evaluate: (g: { zoom: number }, f: unknown) => unknown })
    .evaluate({ zoom: 3 }, { type: 'Point', properties });
  return evaluated as number[];
}
