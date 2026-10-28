import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
  type Material,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** One turn of the preview's turntable, in milliseconds. */
const TURN_MS = 12_000;

export interface ModelPreview {
  dispose: () => void;
}

/** Frees the GPU memory of everything under `root`. */
function disposeTree(root: Group): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    for (const material of ([] as Material[]).concat(node.material)) {
      for (const value of Object.values(material)) {
        if ((value as Texture | null)?.isTexture) (value as Texture).dispose();
      }
      material.dispose();
    }
  });
}

/**
 * Draws a .glb on `canvas`, turning slowly (still when the user asks for reduced motion), seen
 * from the front and a little above, the whole model in view. The user can take the camera: drag
 * to turn it round the model, scroll or pinch to zoom, right-drag or two fingers to pan; the model
 * then stops turning. `url` is the object URL of the bytes the map loads. Loaded only when the 3D
 * model popup shows a model, as it pulls in three.js.
 */
export async function startModelPreview(canvas: HTMLCanvasElement, url: string): Promise<ModelPreview> {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  let frame = 0;
  let model: Group | null = null;
  let controls: OrbitControls | null = null;
  let observer: ResizeObserver | null = null;
  const dispose = () => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
    controls?.dispose();
    if (model) disposeTree(model);
    renderer.dispose();
    // Gives the context back now: the browser keeps only a few, and drops the oldest (the map's) past that.
    renderer.forceContextLoss();
  };

  try {
    model = (await new GLTFLoader().loadAsync(url)).scene;
  } catch (err) {
    dispose();
    throw err;
  }

  // The model turns about its own centre, standing on the ground plane like it does on the map.
  const box = new Box3().setFromObject(model);
  const center = box.getCenter(new Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  const turntable = new Group().add(model);
  const radius = box.getBoundingSphere(new Sphere()).radius || 1;
  const height = box.max.y - box.min.y;

  const scene = new Scene().add(
    turntable,
    new AmbientLight(0xffffff, 0.6),
    new HemisphereLight(0xffffff, 0x8a8a8a, 1.6),
  );
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(1, 2, 1.5);
  scene.add(sun);

  // glTF models face +z, so the camera looks at the front from a little to the side and above.
  const target = new Vector3(0, height / 2, 0);
  const toCamera = new Vector3(0.45, 0.35, 0.82).normalize();
  const camera = new PerspectiveCamera(30, 1, radius / 100, radius * 100);

  /** How far the model reaches from the axis it turns about. */
  const size = box.getSize(new Vector3());
  const reach = Math.hypot(size.x, size.z) / 2;

  /**
   * Moves the camera back just far enough for the model to fit, with a margin, at every turn: the
   * cylinder it sweeps, sampled round its top and bottom rims.
   */
  const fit = () => {
    const right = new Vector3(0, 1, 0).cross(toCamera).normalize();
    const up = toCamera.clone().cross(right);
    const tanV = Math.tan((camera.fov / 2) * (Math.PI / 180)) * 0.85;
    const tanH = tanV * camera.aspect;
    let distance = 0;
    for (let i = 0; i < 32; i++) {
      const angle = (i % 16) * (Math.PI / 8);
      const offset = new Vector3(Math.cos(angle) * reach, (i < 16 ? 1 : -1) * (height / 2), Math.sin(angle) * reach);
      const depth = offset.dot(toCamera);
      distance = Math.max(distance, depth + Math.abs(offset.dot(right)) / tanH, depth + Math.abs(offset.dot(up)) / tanV);
    }
    const fitted = distance || radius * 3;
    camera.position.copy(target).addScaledVector(toCamera, fitted);
    camera.lookAt(target);
    if (controls) controls.maxDistance = fitted * 4;
  };

  const resize = () => {
    const { clientWidth: width, clientHeight: h } = canvas;
    if (width === 0 || h === 0 || camera.aspect === width / h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, h, false);
    camera.aspect = width / h;
    camera.updateProjectionMatrix();
    fit();
  };
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // Also keeps right-clicks on the canvas from opening the browser menu.
  controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableDamping = !still;
  controls.minDistance = radius * 0.1;
  fit();

  // The model stops turning once the user takes the camera, so it stays where they put it.
  let turning = !still;
  controls.addEventListener('start', () => { turning = false; });

  // Draws only when something changed: while the model turns, and on each `change` of the
  // controls, which `update` also sends while the camera still moves (damping settling).
  const requestDraw = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const start = performance.now();
  const draw = () => {
    frame = 0;
    if (turning) {
      turntable.rotation.y = ((performance.now() - start) / TURN_MS) * Math.PI * 2;
      requestDraw();
    }
    controls?.update();
    renderer.render(scene, camera);
  };
  controls.addEventListener('change', requestDraw);
  observer = new ResizeObserver(() => {
    resize();
    requestDraw();
  });
  observer.observe(canvas);
  resize();
  draw();
  return { dispose };
}
