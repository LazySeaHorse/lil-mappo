import { describe, expect, it } from 'vitest';
import type { AutoCamConfig, CameraKeyframe, RouteItem } from '@/store/types';
import { blendPoses, poseFromFreeCam, poseFromJumpTo, poseToFreeCam, poseToJumpTo, type CameraPose } from './cameraPose';
import { buildRig, gaussianSmooth, pathDistanceAt, sampleRig, vehicleAt } from './cameraRig';
import { getLineSegment } from './lineAnimation';
import { lngLatToMerc } from './cameraPose';
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
  const kf = (id: string, time: number): CameraKeyframe => ({
    id, time, camera: { center: [0, 0], zoom: 10, pitch: 0, bearing: 0, altitude: null }, easing: 'linear', followRoute: null,
  });
  const coords = () => corner;

  it('blends in from the previous keyframe and out to the next', () => {
    const kfs = [kf('a', 0), kf('b', 30)];
    expect(getCameraAtTime(kfs, 10.2, coords, [route])?.type).toBe('blend');
    expect(getCameraAtTime(kfs, 15, coords, [route])?.type).toBe('freeCam');
    expect(getCameraAtTime(kfs, 19.8, coords, [route])?.type).toBe('blend');
  });

  it('holds the final shot after the block when no keyframe follows', () => {
    const cam = getCameraAtTime([kf('a', 0)], 25, coords, [route]);
    expect(cam?.type).toBe('freeCam');
  });
});
