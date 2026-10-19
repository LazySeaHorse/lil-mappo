import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODEL_SIZE_M } from '@/config/vehicles';
import { MAX_MODEL_BYTES, ModelFileError, checkModelFile, parseGlb, readModelFile, sha256Hex } from './glb';
import { glbFromJson, makeGlb } from './testGlb';

function bytesOf(path: string): ArrayBuffer {
  const buf = fs.readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('checkModelFile', () => {
  it('accepts a .glb under the size cap', () => {
    expect(() => checkModelFile({ name: 'Tower.GLB', size: 1000 })).not.toThrow();
  });

  it('refuses other file types', () => {
    for (const name of ['tower.gltf', 'tower.obj', 'tower.glb.zip', 'tower']) {
      expect(() => checkModelFile({ name, size: 1000 })).toThrow(ModelFileError);
    }
    try {
      checkModelFile({ name: 'tower.gltf', size: 1000 });
    } catch (err) {
      expect((err as ModelFileError).code).toBe('type');
    }
  });

  it('refuses files over the cap and empty files', () => {
    expect(() => checkModelFile({ name: 'big.glb', size: MAX_MODEL_BYTES + 1 })).toThrow(/50 MB/);
    expect(() => checkModelFile({ name: 'empty.glb', size: 0 })).toThrow(ModelFileError);
  });
});

describe('parseGlb', () => {
  it('measures the bounds through node transforms', () => {
    const glb = makeGlb({
      nodes: [{ mesh: 0, translation: [0, 1, 0], scale: [2, 2, 2] }],
      min: [-1, 0, -3],
      max: [1, 2, 5],
    });
    expect(parseGlb(glb).bounds).toEqual({ min: [-2, 1, -6], max: [2, 5, 10] });
  });

  it('follows child nodes and rotations', () => {
    // 90° about y turns +z into +x.
    const s = Math.SQRT1_2;
    const glb = makeGlb({
      nodes: [{ children: [1] }, { mesh: 0, rotation: [0, s, 0, s] }],
      min: [0, 0, 0],
      max: [1, 1, 4],
    });
    const { min, max } = parseGlb(glb).bounds;
    expect(max[0]).toBeCloseTo(4);
    expect(min[2]).toBeCloseTo(-1);
  });

  it('matches the built-in car model', () => {
    const { min, max } = parseGlb(bytesOf('src/assets/models/car.glb')).bounds;
    expect(max[2] - min[2]).toBeCloseTo(MODEL_SIZE_M.car.length, 1);
  });

  it('refuses a file that is not a binary glTF', () => {
    const text = new TextEncoder().encode('{"asset":{"version":"2.0"}} and more bytes to pass the header');
    expect(() => parseGlb(text.buffer)).toThrow(ModelFileError);
  });

  it('refuses a truncated file', () => {
    const glb = makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [1, 1, 1] });
    expect(() => parseGlb(glb.slice(0, glb.byteLength - 8))).toThrow(ModelFileError);
  });

  it('refuses glTF version 1', () => {
    const glb = makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [1, 1, 1] });
    new DataView(glb).setUint32(4, 1, true);
    expect(() => parseGlb(glb)).toThrow(/version/i);
  });

  it('refuses a model with no geometry', () => {
    const glb = makeGlb({ nodes: [{}], min: [0, 0, 0], max: [1, 1, 1] });
    expect(() => parseGlb(glb)).toThrow(/no 3D shapes/i);
  });

  it('refuses a model that needs files next to it', () => {
    const glb = makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [1, 1, 1], images: [{ uri: 'texture.png' }] });
    expect(() => parseGlb(glb)).toThrow(/other files/i);
  });
});

describe('parseGlb with hostile files', () => {
  const box = { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] };

  const codeOf = (buffer: ArrayBuffer): string => {
    try {
      parseGlb(buffer);
    } catch (err) {
      if (err instanceof ModelFileError) return err.code;
      throw err;
    }
    return 'ok';
  };

  it('finds the roots of 30,000 nodes without a scene quickly', () => {
    const nodes = Array.from({ length: 30_000 }, () => ({ mesh: 0 }));
    const glb = makeGlb({ nodes, ...box, extra: { scene: undefined, scenes: undefined } });
    const started = performance.now();
    expect(parseGlb(glb).bounds).toEqual(box);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('refuses a 20,000-deep chain of nodes instead of overflowing the stack', () => {
    const nodes = Array.from({ length: 20_000 }, (_, i) => (i < 19_999 ? { children: [i + 1] } : { mesh: 0 }));
    const glb = makeGlb({ nodes, ...box });
    expect(codeOf(glb)).toBe('complex');
    expect(() => parseGlb(glb)).toThrow(/too complex/i);
  });

  it('refuses a model with more parts than it can measure', () => {
    const nodes = Array.from({ length: 250_000 }, () => ({}));
    expect(codeOf(makeGlb({ nodes, ...box }))).toBe('complex');
  });

  it('reads a node that is reached twice (or in a cycle) once', () => {
    const nodes = [{ children: [1, 1] }, { mesh: 0, children: [0] }];
    expect(parseGlb(makeGlb({ nodes, ...box, extra: { scenes: [{ nodes: [0] }] } })).bounds).toEqual(box);
  });

  it.each([
    ['a non-string version', { asset: { version: 2 } }],
    ['nodes that are not a list', { nodes: {} }],
    ['buffers that are not a list', { buffers: 'x' }],
    ['a buffer uri that is not text', { buffers: [{ uri: 5 }] }],
    ['an image uri that is not text', { images: [{ uri: {} }] }],
    ['a node that is not an object', { nodes: [7] }],
    ['children that are not a list', { nodes: [{ mesh: 0, children: 1 }] }],
    ['a child index that is not a whole number', { nodes: [{ mesh: 0, children: ['1'] }] }],
    ['a mesh index that is not a number', { nodes: [{ mesh: '0' }] }],
    ['a matrix of text', { nodes: [{ mesh: 0, matrix: Array(16).fill('1') }] }],
    ['a short rotation', { nodes: [{ mesh: 0, rotation: [0, 0, 0] }] }],
    ['a translation with NaN-like values', { nodes: [{ mesh: 0, translation: [null, 0, 0] }] }],
    ['primitives that are not a list', { meshes: [{ primitives: {} }] }],
    ['a POSITION index that is not a number', { meshes: [{ primitives: [{ attributes: { POSITION: 'a' } }] }] }],
    ['accessor bounds that are not numbers', { accessors: [{ min: 'abc', max: [1, 1, 1] }] }],
    ['scene nodes that are not a list', { scenes: [{ nodes: 0 }] }],
    ['a scene index that is not a number', { scene: 'main' }],
    ['a JSON that is a list', null],
  ])('refuses %s with a clear error', (_label, extra) => {
    const glb = extra === null ? glbFromJson([1, 2, 3]) : makeGlb({ nodes: [{ mesh: 0 }], ...box, extra });
    expect(codeOf(glb)).toBe('parse');
    expect(() => parseGlb(glb)).toThrow('This file is not a valid .glb model.');
  });
});

describe('readModelFile', () => {
  it('hashes and measures a picked file', async () => {
    const glb = makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [1, 2, 3] });
    const file = new File([glb], 'box.glb', { type: 'model/gltf-binary' });
    const read = await readModelFile(file);
    expect(read.fileName).toBe('box.glb');
    expect(read.byteSize).toBe(glb.byteLength);
    expect(read.sha256).toBe(await sha256Hex(glb));
    expect(read.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(read.bounds).toEqual({ min: [0, 0, 0], max: [1, 2, 3] });
  });

  it('checks the name and size before reading the bytes', async () => {
    let read = false;
    const file = { name: 'big.glb', size: MAX_MODEL_BYTES + 1, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } };
    await expect(readModelFile(file as unknown as File)).rejects.toThrow(ModelFileError);
    expect(read).toBe(false);
  });
});

describe('sha256Hex', () => {
  it('is the SHA-256 of the bytes in hex', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc').buffer)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
