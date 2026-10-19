/** Pads `bytes` with `fill` to a multiple of 4 bytes, as GLB chunks must be. */
function pad4(bytes: Uint8Array, fill: number): Uint8Array {
  const extra = (4 - (bytes.length % 4)) % 4;
  if (!extra) return bytes;
  const padded = new Uint8Array(bytes.length + extra).fill(fill);
  padded.set(bytes);
  return padded;
}

/** Builds a binary glTF for tests from any JSON (valid or not) and an optional BIN chunk. */
export function glbFromJson(json: unknown, bin?: Uint8Array): ArrayBuffer {
  const jsonBytes = pad4(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const binBytes = bin ? pad4(bin, 0) : null;
  const total = 12 + 8 + jsonBytes.length + (binBytes ? 8 + binBytes.length : 0);
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  bytes.set(jsonBytes, 20);
  if (binBytes) {
    const binStart = 20 + jsonBytes.length;
    view.setUint32(binStart, binBytes.length, true);
    view.setUint32(binStart + 4, 0x004e4942, true); // 'BIN\0'
    bytes.set(binBytes, binStart + 8);
  }
  return out;
}

/**
 * Builds a tiny binary glTF for tests: one mesh whose POSITION accessor spans `min`..`max`.
 * `extra` is merged into the JSON last (an `undefined` value removes a field).
 */
export function makeGlb({
  nodes,
  min,
  max,
  images,
  extra,
}: {
  nodes: Record<string, unknown>[];
  min: [number, number, number];
  max: [number, number, number];
  images?: { uri: string }[];
  extra?: Record<string, unknown>;
}): ArrayBuffer {
  const positions = new Float32Array([...min, ...max]);
  const children = new Set(nodes.flatMap((n) => (n.children as number[] | undefined) ?? []));
  const roots = nodes.map((_, i) => i).filter((i) => !children.has(i));
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: roots }],
    nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 2, type: 'VEC3', min, max }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    buffers: [{ byteLength: positions.byteLength }],
    ...(images ? { images } : {}),
    ...extra,
  };
  return glbFromJson(json, new Uint8Array(positions.buffer));
}
