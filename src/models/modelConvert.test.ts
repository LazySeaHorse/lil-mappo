import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelFileError, parseGlb, readModelFile, sha256Hex } from './glb';
import { glbFromJson } from './testGlb';

// jsdom has no WebP decoder or OffscreenCanvas; the re-encode sits behind this one function.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const webpToPng = vi.hoisted(() => vi.fn());
vi.mock('./modelImage', () => ({ webpToPng }));

beforeEach(() => {
  webpToPng.mockReset();
  webpToPng.mockResolvedValue(new Uint8Array(PNG_SIGNATURE));
});

/** A model whose two vertices are normalized SHORTs spanning -1..1 on every axis, scaled 2x by its node (as gltfpack writes them). */
function quantizedGlb(extra: Record<string, unknown> = {}): ArrayBuffer {
  const positions = new Int16Array([-32767, -32767, -32767, 32767, 32767, 32767, 0, 0]);
  return glbFromJson(
    {
      asset: { version: '2.0' },
      extensionsUsed: ['KHR_mesh_quantization'],
      extensionsRequired: ['KHR_mesh_quantization'],
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, scale: [2, 2, 2] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{
        bufferView: 0, componentType: 5122, normalized: true, count: 2, type: 'VEC3',
        min: [-32767, -32767, -32767], max: [32767, 32767, 32767],
      }],
      bufferViews: [{ buffer: 0, byteLength: 12 }],
      buffers: [{ byteLength: 12 }],
      ...extra,
    },
    new Uint8Array(positions.buffer),
  );
}

/** A float-position model with a WebP texture stored in the BIN chunk. */
function webpGlb(): ArrayBuffer {
  const bin = new Uint8Array(32);
  new Float32Array(bin.buffer, 0, 6).set([-1, 0, -1, 1, 2, 1]);
  bin.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0], 24); // not a real image: the re-encode is mocked
  return glbFromJson(
    {
      asset: { version: '2.0' },
      extensionsUsed: ['EXT_texture_webp'],
      extensionsRequired: ['EXT_texture_webp'],
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      textures: [{ extensions: { EXT_texture_webp: { source: 0 } } }],
      images: [{ bufferView: 1, mimeType: 'image/webp' }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 2, type: 'VEC3', min: [-1, 0, -1], max: [1, 2, 1] }],
      bufferViews: [{ buffer: 0, byteLength: 24 }, { buffer: 0, byteOffset: 24, byteLength: 8 }],
      buffers: [{ byteLength: 32 }],
    },
    bin,
  );
}

const fileOf = (glb: ArrayBuffer) => new File([glb], 'model.glb');

function jsonOf(glb: ArrayBuffer): Record<string, unknown> {
  const length = new DataView(glb).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, length))) as Record<string, unknown>;
}

describe('readModelFile with quantized or WebP models', () => {
  it('turns quantized positions back into floats and measures the bounds after that', async () => {
    const original = quantizedGlb();
    expect(() => parseGlb(original)).toThrow(/KHR_mesh_quantization/);
    const read = await readModelFile(fileOf(original));
    expect(read.bounds.min).toEqual([-2, -2, -2]);
    expect(read.bounds.max).toEqual([2, 2, 2]);
    const json = jsonOf(read.bytes);
    expect(json.extensionsRequired).toBeUndefined();
    expect(JSON.stringify(json.extensionsUsed ?? [])).not.toContain('KHR_mesh_quantization');
    expect((json.accessors as { componentType: number }[])[0].componentType).toBe(5126);
    expect(() => parseGlb(read.bytes)).not.toThrow();
  });

  it('keeps the original file hash and size, not the converted ones', async () => {
    const original = quantizedGlb();
    const read = await readModelFile(fileOf(original));
    expect(read.sha256).toBe(await sha256Hex(original));
    expect(read.byteSize).toBe(original.byteLength);
    expect(read.bytes.byteLength).not.toBe(original.byteLength);
    // Loading the same file again converts it again, to the same hash.
    expect((await readModelFile(fileOf(original))).sha256).toBe(read.sha256);
  });

  it('re-encodes a WebP texture as PNG and drops EXT_texture_webp', async () => {
    const read = await readModelFile(fileOf(webpGlb()));
    expect(webpToPng).toHaveBeenCalledTimes(1);
    const json = jsonOf(read.bytes);
    expect((json.images as { mimeType: string }[])[0].mimeType).toBe('image/png');
    expect(JSON.stringify(json)).not.toContain('EXT_texture_webp');
    expect(json.extensionsRequired).toBeUndefined();
    expect(read.bounds).toEqual({ min: [-1, 0, -1], max: [1, 2, 1] });
    const png = new Uint8Array(read.bytes).findIndex((_, i, all) => PNG_SIGNATURE.every((b, k) => all[i + k] === b));
    expect(png).toBeGreaterThan(0);
  });

  it('still refuses a model that also needs an extension the map cannot draw', async () => {
    const glb = quantizedGlb({ extensionsRequired: ['KHR_mesh_quantization', 'KHR_texture_basisu'] });
    const error = await readModelFile(fileOf(glb)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelFileError);
    expect((error as ModelFileError).code).toBe('unsupported');
    expect((error as ModelFileError).message).toContain('KHR_texture_basisu');
    expect(webpToPng).not.toHaveBeenCalled();
  });
});
