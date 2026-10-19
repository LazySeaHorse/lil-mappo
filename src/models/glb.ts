import type { ModelBounds } from './modelGeometry';

/** Largest model file a user can import. */
export const MAX_MODEL_BYTES = 50 * 1024 * 1024;

/**
 * Most nodes a model may have, how deeply they may nest, and how many mesh primitives are measured
 * (a mesh counts once for every node that uses it). Real models stay far below these; the caps stop a
 * hostile file from freezing the tab while it is measured.
 */
export const MAX_MODEL_NODES = 200_000;
export const MAX_MODEL_DEPTH = 1_000;
export const MAX_MODEL_PRIMITIVES = 1_000_000;

export type ModelFileErrorCode = 'type' | 'size' | 'parse' | 'external' | 'empty' | 'complex';

/** A model file that cannot be used; `message` is short and safe to show to the user. */
export class ModelFileError extends Error {
  constructor(readonly code: ModelFileErrorCode, message: string) {
    super(message);
    this.name = 'ModelFileError';
  }
}

const MESSAGES: Record<ModelFileErrorCode, string> = {
  type: 'Pick a .glb file. Other 3D formats are not supported.',
  size: 'This model is over 50 MB. Pick a smaller .glb file.',
  parse: 'This file is not a valid .glb model.',
  external: 'This model needs other files next to it. Export it as one .glb with its textures inside.',
  empty: 'This model has no 3D shapes in it.',
  complex: 'This model is too complex to place on the map. Merge or simplify its parts, then export it again.',
};

const fail = (code: ModelFileErrorCode, message = MESSAGES[code]): never => {
  throw new ModelFileError(code, message);
};

/** Checks the name and size before anything is read. */
export function checkModelFile(file: { name: string; size: number }): void {
  if (!/\.glb$/i.test(file.name)) fail('type');
  if (file.size > MAX_MODEL_BYTES) fail('size');
  if (file.size < 20) fail('parse');
}

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;

type Mat4 = number[];

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Column-major 4x4 product a * b. */
function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function trsMatrix(rotation = [0, 0, 0, 1], scale = [1, 1, 1], translation = [0, 0, 0]): Mat4 {
  const [x, y, z, w] = rotation;
  const [sx, sy, sz] = scale;
  const [tx, ty, tz] = translation;
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

// ── Reading the JSON's shape ───────────────────────────────────────────────────
// The JSON comes from an untrusted file, so every field is checked before it is used: a field of the
// wrong type is a broken file (ModelFileError), never a TypeError.

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIndex = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

/** An optional list: missing is empty, anything but an array is a broken file. */
function list(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : fail('parse');
}

function objects(value: unknown): JsonObject[] {
  return list(value).map((entry) => (isObject(entry) ? entry : fail('parse')));
}

function optionalIndex(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  return isIndex(value) ? value : fail('parse');
}

function indices(value: unknown): number[] {
  return list(value).map((entry) => (isIndex(entry) ? entry : fail('parse')));
}

/** An optional list of finite numbers: exactly `length` of them, or at least `length` when `atLeast`. */
function numbers(value: unknown, length: number, atLeast = false): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || (atLeast ? value.length < length : value.length !== length)) return fail('parse');
  return value.map((n) => (typeof n === 'number' && Number.isFinite(n) ? n : fail('parse')));
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : fail('parse');
}

interface GltfNode {
  mesh: number | undefined;
  children: number[];
  matrix: Mat4;
}

function readNode(raw: unknown): GltfNode {
  if (!isObject(raw)) return fail('parse');
  const matrix = numbers(raw.matrix, 16);
  const trs = trsMatrix(numbers(raw.rotation, 4), numbers(raw.scale, 3), numbers(raw.translation, 3));
  return { mesh: optionalIndex(raw.mesh), children: indices(raw.children), matrix: matrix ?? trs };
}

/** The POSITION accessor of each of a mesh's primitives (primitives without one are skipped). */
function readMesh(raw: JsonObject): number[] {
  const positions: number[] = [];
  for (const primitive of objects(raw.primitives)) {
    if (primitive.attributes === undefined) continue;
    if (!isObject(primitive.attributes)) return fail('parse');
    const position = optionalIndex(primitive.attributes.POSITION);
    if (position !== undefined) positions.push(position);
  }
  return positions;
}

interface Accessor {
  min?: number[];
  max?: number[];
}

function readAccessor(raw: JsonObject): Accessor {
  return { min: numbers(raw.min, 3, true), max: numbers(raw.max, 3, true) };
}

function readJsonChunk(buffer: ArrayBuffer): JsonObject {
  if (buffer.byteLength < 20) fail('parse');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) fail('parse');
  const version = view.getUint32(4, true);
  if (version !== 2) fail('parse', 'This .glb uses an old glTF version. Export it as glTF 2.0.');
  if (view.getUint32(8, true) !== buffer.byteLength) fail('parse');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON || 20 + jsonLength > buffer.byteLength) fail('parse');
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  } catch {
    return fail('parse');
  }
  return isObject(json) ? json : fail('parse');
}

const isEmbedded = (uri: string | undefined) => uri === undefined || uri.startsWith('data:');

/**
 * Reads a binary glTF 2.0 file's structure (not its pixels) and measures its bounding box in
 * metres, through every node's transform. Mapbox draws the model; this only checks it can.
 */
export function parseGlb(buffer: ArrayBuffer): { bounds: ModelBounds } {
  const gltf = readJsonChunk(buffer);
  if (gltf.asset !== undefined && !isObject(gltf.asset)) fail('parse');
  const version = optionalString(isObject(gltf.asset) ? gltf.asset.version : undefined);
  if (!version?.startsWith('2')) fail('parse', 'This .glb uses an old glTF version. Export it as glTF 2.0.');

  const uris = [...objects(gltf.buffers), ...objects(gltf.images)].map((entry) => optionalString(entry.uri));
  if (!uris.every(isEmbedded)) fail('external');

  const rawNodes = list(gltf.nodes);
  if (rawNodes.length > MAX_MODEL_NODES) fail('complex');
  const nodes = rawNodes.map(readNode);
  const meshes = objects(gltf.meshes).map(readMesh);
  const accessors = objects(gltf.accessors).map(readAccessor);
  const scenes = objects(gltf.scenes).map((scene) => indices(scene.nodes));
  const sceneIndex = optionalIndex(gltf.scene) ?? 0;

  // The scene's nodes, or (with no scene) every node that is nobody's child.
  let roots = scenes[sceneIndex];
  if (!roots) {
    const children = new Set<number>();
    for (const node of nodes) for (const child of node.children) children.add(child);
    roots = nodes.map((_, i) => i).filter((i) => !children.has(i));
  }

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  // Each node is read once: a cycle or a node with two parents (both invalid glTF) cannot loop.
  const seen = new Uint8Array(nodes.length);
  const stack = roots.map((index) => ({ index, parent: IDENTITY, depth: 1 }));
  let primitives = 0;
  while (stack.length > 0) {
    const { index, parent, depth } = stack.pop()!;
    const node = nodes[index];
    if (!node || seen[index]) continue; // a bad index is ignored
    if (depth > MAX_MODEL_DEPTH) fail('complex');
    seen[index] = 1;
    const world = multiply(parent, node.matrix);
    const positions = node.mesh === undefined ? [] : meshes[node.mesh] ?? [];
    primitives += positions.length;
    if (primitives > MAX_MODEL_PRIMITIVES) fail('complex');
    for (const position of positions) {
      const accessor = accessors[position];
      if (!accessor?.min || !accessor.max) return fail('parse');
      for (let corner = 0; corner < 8; corner++) {
        const x = corner & 1 ? accessor.max[0] : accessor.min[0];
        const y = corner & 2 ? accessor.max[1] : accessor.min[1];
        const z = corner & 4 ? accessor.max[2] : accessor.min[2];
        for (let r = 0; r < 3; r++) {
          const value = world[r] * x + world[4 + r] * y + world[8 + r] * z + world[12 + r];
          min[r] = Math.min(min[r], value);
          max[r] = Math.max(max[r], value);
        }
      }
    }
    for (const child of node.children) stack.push({ index: child, parent: world, depth: depth + 1 });
  }

  if (![...min, ...max].every(Number.isFinite)) fail('empty');
  if (max[0] - min[0] <= 0 && max[1] - min[1] <= 0 && max[2] - min[2] <= 0) fail('empty');
  return {
    bounds: {
      min: min as [number, number, number],
      max: max as [number, number, number],
    },
  };
}

/** SHA-256 of the bytes, lowercase hex. */
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ReadModel {
  bytes: ArrayBuffer;
  fileName: string;
  byteSize: number;
  sha256: string;
  bounds: ModelBounds;
}

function readBytes(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** Checks, reads, measures and hashes a picked model file. Throws ModelFileError for a file that cannot be used. */
export async function readModelFile(file: File): Promise<ReadModel> {
  checkModelFile(file);
  let bytes: ArrayBuffer;
  try {
    bytes = await readBytes(file);
  } catch {
    return fail('parse', 'This file could not be read.');
  }
  const { bounds } = parseGlb(bytes);
  return { bytes, fileName: file.name, byteSize: bytes.byteLength, sha256: await sha256Hex(bytes), bounds };
}
