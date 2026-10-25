import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type Object3D, type Scene } from 'three';

const three = vi.hoisted(() => ({
  render: vi.fn(),
  controls: [] as Array<{ element: unknown; target: { x: number; y: number; z: number }; listeners: Record<string, () => void>; dispose: ReturnType<typeof vi.fn> }>,
}));

vi.mock('three', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three')>()),
  WebGLRenderer: class {
    render = three.render;
    setPixelRatio() {}
    setSize() {}
    dispose() {}
    forceContextLoss() {}
  },
}));

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    async loadAsync() {
      // A model 2 wide, 4 tall and 2 deep, standing on the ground.
      const mesh = new Mesh(new BoxGeometry(2, 4, 2), new MeshBasicMaterial());
      mesh.position.y = 2;
      return { scene: new Group().add(mesh) };
    }
  },
}));

vi.mock('three/examples/jsm/controls/OrbitControls.js', async () => {
  const { Vector3 } = await vi.importActual<typeof import('three')>('three');
  return {
    OrbitControls: class {
      target = new Vector3();
      listeners: Record<string, () => void> = {};
      dispose = vi.fn();
      constructor(_camera: unknown, public element: unknown) {
        three.controls.push(this);
      }
      addEventListener(type: string, listener: () => void) { this.listeners[type] = listener; }
      update() {}
    },
  };
});

import { startModelPreview } from './modelPreview';

let frames: FrameRequestCallback[] = [];
let now = 0;

beforeEach(() => {
  three.render.mockClear();
  three.controls.length = 0;
  frames = [];
  now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Runs the next frame `ms` later. */
function nextFrame(ms: number) {
  now += ms;
  frames.shift()?.(now);
}

/** The group the model turns in, from the last frame drawn. */
const turntable = (): Object3D => (three.render.mock.lastCall![0] as Scene).children[0];

describe('startModelPreview', () => {
  it('lets the user move the camera round the middle of the model, and frees the controls with the preview', async () => {
    const canvas = document.createElement('canvas');
    const preview = await startModelPreview(canvas, 'blob:model');

    expect(three.controls).toHaveLength(1);
    const [controls] = three.controls;
    expect(controls.element).toBe(canvas);
    expect(controls.target).toMatchObject({ x: 0, y: 2, z: 0 });

    preview.dispose();
    expect(controls.dispose).toHaveBeenCalled();
  });

  it('turns the model until the user takes the camera, then leaves it where it is', async () => {
    await startModelPreview(document.createElement('canvas'), 'blob:model');
    nextFrame(1000);
    const turned = turntable().rotation.y;
    expect(turned).toBeGreaterThan(0);

    three.controls[0].listeners.start();
    nextFrame(1000);
    expect(turntable().rotation.y).toBe(turned);
  });
});
