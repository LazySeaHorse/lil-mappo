/** Builds a tiny binary glTF for tests: one mesh whose POSITION accessor spans `min`..`max`. */
export function makeGlb({
  nodes,
  min,
  max,
  images,
}: {
  nodes: Record<string, unknown>[];
  min: [number, number, number];
  max: [number, number, number];
  images?: { uri: string }[];
}): ArrayBuffer {
  const positions = new Float32Array([...min, ...max]);
  const roots = nodes.map((_, i) => i).filter((i) => !nodes.some((n) => (n.children as number[] | undefined)?.includes(i)));
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
  };
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(jsonBytes.length + jsonPad).fill(0x20);
    padded.set(jsonBytes);
    jsonBytes = padded;
  }
  const bin = new Uint8Array(positions.buffer);
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  bytes.set(jsonBytes, 20);
  const binStart = 20 + jsonBytes.length;
  view.setUint32(binStart, bin.length, true);
  view.setUint32(binStart + 4, 0x004e4942, true); // 'BIN\0'
  bytes.set(bin, binStart + 8);
  return out;
}
