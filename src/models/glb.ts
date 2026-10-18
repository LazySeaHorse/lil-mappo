import type { ModelBounds } from './modelGeometry';

/** Largest model file a user can import. */
export const MAX_MODEL_BYTES = 50 * 1024 * 1024;

export type ModelFileErrorCode = 'type' | 'size' | 'parse' | 'external' | 'empty';

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

interface GltfNode {
  mesh?: number;
  children?: number[];
  matrix?: number[];
  rotation?: number[];
  scale?: number[];
  translation?: number[];
}

interface GltfJson {
  asset?: { version?: string };
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives?: { attributes?: { POSITION?: number } }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
  buffers?: { uri?: string }[];
  images?: { uri?: string }[];
}

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

function localMatrix(node: GltfNode): Mat4 {
  if (node.matrix?.length === 16) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function readJsonChunk(buffer: ArrayBuffer): GltfJson {
  if (buffer.byteLength < 20) fail('parse');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) fail('parse');
  const version = view.getUint32(4, true);
  if (version !== 2) fail('parse', 'This .glb uses an old glTF version. Export it as glTF 2.0.');
  if (view.getUint32(8, true) !== buffer.byteLength) fail('parse');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON || 20 + jsonLength > buffer.byteLength) fail('parse');
  try {
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
    if (!json || typeof json !== 'object') fail('parse');
    return json as GltfJson;
  } catch (err) {
    if (err instanceof ModelFileError) throw err;
    return fail('parse');
  }
}

const isEmbedded = (uri: string | undefined) => uri === undefined || uri.startsWith('data:');

/**
 * Reads a binary glTF 2.0 file's structure (not its pixels) and measures its bounding box in
 * metres, through every node's transform. Mapbox draws the model; this only checks it can.
 */
export function parseGlb(buffer: ArrayBuffer): { bounds: ModelBounds } {
  const gltf = readJsonChunk(buffer);
  if (!gltf.asset?.version?.startsWith('2')) fail('parse', 'This .glb uses an old glTF version. Export it as glTF 2.0.');
  if (!(gltf.buffers ?? []).every((b) => isEmbedded(b?.uri)) || !(gltf.images ?? []).every((i) => isEmbedded(i?.uri))) {
    fail('external');
  }

  const nodes = gltf.nodes ?? [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const seen = new Set<number>();

  const visit = (index: number, parent: Mat4) => {
    const node = nodes[index];
    if (!node || seen.has(index)) return; // a cycle or a bad index is ignored, not looped on
    seen.add(index);
    const world = multiply(parent, localMatrix(node));
    const mesh = node.mesh === undefined ? undefined : gltf.meshes?.[node.mesh];
    for (const primitive of mesh?.primitives ?? []) {
      const position = primitive.attributes?.POSITION;
      if (position === undefined) continue;
      const accessor = gltf.accessors?.[position];
      if (!accessor?.min || !accessor?.max || accessor.min.length < 3 || accessor.max.length < 3) fail('parse');
      for (let corner = 0; corner < 8; corner++) {
        const v = [0, 1, 2].map((k) => (corner & (1 << k) ? accessor!.max![k] : accessor!.min![k]));
        for (let r = 0; r < 3; r++) {
          const value = world[r] * v[0] + world[4 + r] * v[1] + world[8 + r] * v[2] + world[12 + r];
          min[r] = Math.min(min[r], value);
          max[r] = Math.max(max[r], value);
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };

  const scene = gltf.scenes?.[gltf.scene ?? 0];
  const roots = scene?.nodes
    ?? nodes.map((_, i) => i).filter((i) => !nodes.some((n) => n.children?.includes(i)));
  for (const index of roots) visit(index, IDENTITY);

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
