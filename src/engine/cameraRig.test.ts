import { describe, expect, it } from 'vitest';
import type { AutoCamConfig, CameraKeyframe, RouteItem } from '@/store/types';
import { blendPoses, poseFromFreeCam, poseFromJumpTo, poseToFreeCam, poseToJumpTo, type CameraPose } from './cameraPose';
import { buildRig, gaussianSmooth, pathDistanceAt, sampleRig, vehicleAt } from './cameraRig';
import { getLineSegment } from './lineAnimation';
import { lngLatToMerc, metersPerMerc } from './cameraPose';
import { getCameraAtTime } from './cameraInterpolation';

const config: AutoCamConfig = {
  enabled: true, mode: 'cinematic', pitch: 65, smoothing: 0.4, distance: 500, height: 300,
  zoom: 14, lookAhead: 300, dynamics: 0.5, orbit: 0, intro: 0, outro: 0,
};

// An L-shaped route with a sharp right-angle corner, roughly 2.2 km per leg.
const corner: number[][] = [[0, 0], [0.02, 0], [0.02, 0.02]];

const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

describe('camera pose', () => {
  it('round-trips a free camera', () => {
    const pose = poseFromFreeCam([10.01, 20.0, 400], [10.0, 20.0]);
    const back = poseToFreeCam(pose);
    expect(back.position[0]).toBeCloseTo(10.01, 6);
    expect(back.position[2]).toBeCloseTo(400, 3);
  });

  it('round-trips a standard camera at any viewport height', () => {
    const j = { center: [5, 45] as [number, number], zoom: 13.2, pitch: 50, bearing: 120 };
    const back = poseToJumpTo(poseFromJumpTo(j, 640), 640);
    expect(back.zoom).toBeCloseTo(13.2, 6);
    expect(back.pitch).toBeCloseTo(50, 6);
  });

  it('stays finite blending a tight shot to a distant wide one', () => {
    const a: CameraPose = { target: [0, 40], range: 1, pitch: 45, bearing: 0 };
    const b: CameraPose = { target: [0.01, 40], range: 500000, pitch: 60, bearing: 90 };
    for (let t = 0.05; t < 1; t += 0.05) {
      const p = blendPoses(a, b, t);
      expect([p.range, ...p.target].every(Number.isFinite)).toBe(true);
    }
  });

  it('blends between exact endpoints and stays finite in between', () => {
    const a: CameraPose = { target: [0, 0], range: 500, pitch: 60, bearing: 10 };
    const b: CameraPose = { target: [0.5, 0.2], range: 800, pitch: 20, bearing: 350 };
    expect(blendPoses(a, b, 0)).toEqual(a);
    expect(blendPoses(a, b, 1)).toEqual(b);
    const mid = blendPoses(a, b, 0.5);
    expect(Number.isFinite(mid.range)).toBe(true);
    // Travelling far pulls the camera up above both endpoints.
    expect(mid.range).toBeGreaterThan(b.range);
  });
});

describe('gaussianSmooth', () => {
  it('leaves straight lines alone, including the ends', () => {
    const line = Array.from({ length: 50 }, (_, i) => i * 2);
    const out = gaussianSmooth(line, 5);
    for (let i = 0; i < line.length; i++) expect(out[i]).toBeCloseTo(line[i], 6);
  });
});

describe('camera rig', () => {
  it('turns the heading gradually through a sharp corner', () => {
    const rig = buildRig(corner, config)!;
    let maxStep = 0;
    for (let i = 1; i < rig.heading.length; i++) maxStep = Math.max(maxStep, Math.abs(rig.heading[i] - rig.heading[i - 1]));
    // A raw polyline snaps 90° in one step; the rig spreads it over many samples.
    expect(maxStep).toBeLessThan(5);
    expect(Math.abs(wrap(rig.heading[0] - 90))).toBeLessThan(10);
    expect(Math.abs(wrap(rig.heading[rig.heading.length - 1]))).toBeLessThan(10);
  });

  it('starts turning before the corner', () => {
    const rig = buildRig(corner, config)!;
    const before = Math.floor(((rig.total / 2) - 300) / rig.step);
    expect(rig.heading[before]).toBeLessThan(89);
  });

  it('keeps the vehicle in front of the camera', () => {
    const rig = buildRig(corner, config)!;
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      const out = sampleRig(rig, config, { u, p: u, speed: 1 });
      expect(out.type).toBe('freeCam');
      if (out.type === 'freeCam') {
        expect(out.position.every(Number.isFinite)).toBe(true);
        expect(out.position[2]).toBeGreaterThan(0);
      }
    }
  });

  it('places the vehicle where the renderer does', () => {
    const route = [[0, 0], [0.001, 0], [0.02, 0.0], [0.02, 0.02], [0.03, 0.02]];
    const rig = buildRig(route, config)!;
    for (const u of [0, 0.1, 0.37, 0.5, 0.83, 1]) {
      const seg = getLineSegment(route, 0, u);
      const [lng, lat] = seg[seg.length - 1];
      const [x, y] = lngLatToMerc(lng, lat);
      const [vx, vy] = vehicleAt(rig, u);
      expect(Math.hypot(vx - x, vy - y)).toBeLessThan(1e-9);
    }
    expect(pathDistanceAt(rig, 0)).toBe(0);
    expect(pathDistanceAt(rig, 1)).toBeCloseTo(rig.total, 6);
  });

  it('looks at the vehicle when easing has it stopped, and ahead of it at speed', () => {
    const route = [[0, 0], [0.02, 0]];
    const rig = buildRig(route, config)!;
    const dist = (u: number, speed: number) => {
      const out = sampleRig(rig, config, { u, p: u, speed, peakSpeed: 3 });
      if (out.type !== 'freeCam') throw new Error('expected a free camera');
      const [vx, vy] = vehicleAt(rig, u);
      const [lx, ly] = lngLatToMerc(out.lookAt[0], out.lookAt[1]);
      return Math.hypot(lx - vx, ly - vy) * metersPerMerc(0);
    };
    expect(dist(0.4, 0)).toBeLessThan(1);
    expect(dist(0.4, 3)).toBeGreaterThan(100);
    expect(dist(0.4, 1.5)).toBeGreaterThan(dist(0.4, 0.5));
  });

  it('is deterministic for the same progress', () => {
    const rig = buildRig(corner, config)!;
    const p = { u: 0.42, p: 0.42, speed: 1.1 };
    expect(sampleRig(rig, config, p)).toEqual(sampleRig(rig, config, p));
  });

  it('opens on a wide shot when an intro is set', () => {
    const rig = buildRig(corner, config)!;
    const plain = sampleRig(rig, config, { u: 0, p: 0, speed: 1 });
    const intro = sampleRig(rig, { ...config, intro: 1 }, { u: 0, p: 0, speed: 1 });
    if (plain.type === 'freeCam' && intro.type === 'freeCam') {
      expect(intro.position[2]).toBeGreaterThan(plain.position[2] * 2);
    }
  });

  it('leaves out the wide shots a caller asks to skip', () => {
    const rig = buildRig(corner, config)!;
    const shots = { ...config, intro: 1, outro: 1 };
    const plain = sampleRig(rig, config, { u: 0, p: 0, speed: 1 });
    expect(sampleRig(rig, shots, { u: 0, p: 0, speed: 1, skipShots: { intro: true } })).toEqual(plain);
    const end = sampleRig(rig, config, { u: 1, p: 1, speed: 1 });
    expect(sampleRig(rig, shots, { u: 1, p: 1, speed: 1, skipShots: { outro: true } })).toEqual(end);
    expect(sampleRig(rig, shots, { u: 1, p: 1, speed: 1, skipShots: { intro: true } })).not.toEqual(end);
  });

  it('returns a navigation camera as a standard camera', () => {
    const nav = { ...config, mode: 'navigation' as const };
    const rig = buildRig(corner, nav)!;
    const out = sampleRig(rig, nav, { u: 0.5, p: 0.5, speed: 1 });
    expect(out.type).toBe('jumpTo');
  });
});

describe('getCameraAtTime with an auto camera', () => {
  const route = {
    kind: 'route', id: 'r1', startTime: 10, endTime: 20, easing: 'linear', autoCam: config,
  } as unknown as RouteItem;
  const kf = (id: string, time: number, zoom = 10): CameraKeyframe => ({
    id, time, camera: { center: [0, 0], zoom, pitch: 0, bearing: 0, altitude: null }, easing: 'linear', followRoute: null,
  });
  const coords = () => corner;

  it('blends in from the previous keyframe and out to the next', () => {
    const kfs = [kf('a', 0), kf('b', 30)];
    expect(getCameraAtTime(kfs, 10.2, coords, [route])?.type).toBe('blend');
    expect(getCameraAtTime(kfs, 15, coords, [route])?.type).toBe('freeCam');
    expect(getCameraAtTime(kfs, 19.8, coords, [route])?.type).toBe('blend');
  });

  describe('with an intro and outro', () => {
    const shots = (intro: number, outro: number) =>
      ({ ...route, autoCam: { ...config, intro, outro } }) as unknown as RouteItem;
    const kfs = [kf('a', 0), kf('b', 30)];

    it('eases to the neighbouring keyframe instead of the wide shot', () => {
      const plain = getCameraAtTime(kfs, 10.5, coords, [shots(0, 0)]);
      const withShots = getCameraAtTime(kfs, 10.5, coords, [shots(1, 1)]);
      if (plain?.type !== 'blend' || withShots?.type !== 'blend') throw new Error('expected blends');
      expect(withShots.to).toEqual(plain.to);
      const exitPlain = getCameraAtTime(kfs, 19.5, coords, [shots(0, 0)]);
      const exitShots = getCameraAtTime(kfs, 19.5, coords, [shots(1, 1)]);
      if (exitPlain?.type !== 'blend' || exitShots?.type !== 'blend') throw new Error('expected blends');
      expect(exitShots.from).toEqual(exitPlain.from);
    });

    it('starts and ends the move exactly on the keyframe pose', () => {
      const entry = getCameraAtTime(kfs, 0, coords, [shots(1, 1)]);
      expect(entry).toMatchObject({ type: 'blend', t: 0, from: { type: 'jumpTo', zoom: 10 } });
      const exit = getCameraAtTime(kfs, 29.999, coords, [shots(1, 1)]);
      expect(exit).toMatchObject({ type: 'blend', to: { type: 'jumpTo', zoom: 10 } });
      expect((exit as { t: number }).t).toBeCloseTo(1, 3);
    });

    it('takes longer the stronger the intro and outro are', () => {
      // A 10 s block: full strength spans 20% of it, so 2 s.
      expect(getCameraAtTime(kfs, 11.5, coords, [shots(1, 1)])?.type).toBe('blend');
      expect(getCameraAtTime(kfs, 11.5, coords, [shots(0.5, 0.5)])?.type).toBe('freeCam');
      expect(getCameraAtTime(kfs, 18.5, coords, [shots(1, 1)])?.type).toBe('blend');
      expect(getCameraAtTime(kfs, 18.5, coords, [shots(0.5, 0.5)])?.type).toBe('freeCam');
    });

    it('still opens and closes on the wide shot with no neighbouring keyframe', () => {
      const wide = getCameraAtTime([], 10, coords, [shots(1, 1)]);
      const plain = getCameraAtTime([], 10, coords, [shots(0, 0)]);
      if (wide?.type !== 'freeCam' || plain?.type !== 'freeCam') throw new Error('expected free cameras');
      expect(wide.position[2]).toBeGreaterThan(plain.position[2] * 2);
    });
  });

  describe('leading in from the previous keyframe', () => {
    const blendT = (cam: ReturnType<typeof getCameraAtTime>) => {
      if (cam?.type !== 'blend') throw new Error(`expected a blend, got ${cam?.type}`);
      return cam.t;
    };

    it('starts moving toward the block as soon as the keyframe passes', () => {
      const kfs = [kf('a', 0)];
      expect(getCameraAtTime(kfs, 0, coords, [route])).toMatchObject({ type: 'blend', t: 0, from: { type: 'jumpTo', zoom: 10 } });
      const t = blendT(getCameraAtTime(kfs, 5, coords, [route]));
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(1);
    });

    it('carries one move across the start of the block', () => {
      const kfs = [kf('a', 0)];
      const before = blendT(getCameraAtTime(kfs, 9.99, coords, [route]));
      const after = blendT(getCameraAtTime(kfs, 10.01, coords, [route]));
      expect(after).toBeGreaterThan(before);
      expect(after - before).toBeLessThan(0.01);
    });

    it('aims at the block, not a keyframe on the far side of it', () => {
      const cam = getCameraAtTime([kf('a', 0), kf('b', 30, 4)], 5, coords, [route]);
      expect(cam).toMatchObject({ type: 'blend', from: { type: 'jumpTo', zoom: 10 }, to: { type: 'freeCam' } });
    });

    it('leaves a keyframe-to-keyframe move before the block alone', () => {
      const cam = getCameraAtTime([kf('a', 0), kf('b', 6, 4)], 3, coords, [route]);
      expect(cam).toMatchObject({ type: 'jumpTo', zoom: 7 });
    });
  });

  describe('leading out to the next keyframe', () => {
    const blendT = (cam: ReturnType<typeof getCameraAtTime>) => {
      if (cam?.type !== 'blend') throw new Error(`expected a blend, got ${cam?.type}`);
      return cam.t;
    };

    it('keeps moving after the block until the keyframe arrives', () => {
      const kfs = [kf('b', 30, 4)];
      const t = blendT(getCameraAtTime(kfs, 25, coords, [route]));
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(1);
      expect(getCameraAtTime(kfs, 30, coords, [route])).toMatchObject({ type: 'jumpTo', zoom: 4 });
    });

    it('carries one move across the end of the block', () => {
      const kfs = [kf('b', 30, 4)];
      const before = blendT(getCameraAtTime(kfs, 19.99, coords, [route]));
      const after = blendT(getCameraAtTime(kfs, 20.01, coords, [route]));
      expect(after).toBeGreaterThan(before);
      expect(after - before).toBeLessThan(0.01);
    });

    it('leaves from the block, not a keyframe before it', () => {
      const cam = getCameraAtTime([kf('a', 0), kf('b', 30, 4)], 25, coords, [route]);
      expect(cam).toMatchObject({ type: 'blend', from: { type: 'freeCam' }, to: { type: 'jumpTo', zoom: 4 } });
    });

    it('leaves a keyframe-to-keyframe move after the block alone', () => {
      const cam = getCameraAtTime([kf('b', 24, 10), kf('c', 30, 4)], 27, coords, [route]);
      expect(cam).toMatchObject({ type: 'jumpTo', zoom: 7 });
    });
  });

  it('holds the final shot after the block when no keyframe follows', () => {
    const cam = getCameraAtTime([kf('a', 0)], 25, coords, [route]);
    expect(cam?.type).toBe('freeCam');
  });
});
